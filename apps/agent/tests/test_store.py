"""Durable runtime store on real PostgreSQL with the real roles (plan Task 4). Two-process cases use separate OS
processes and connections. Synthetic rows only; each test removes what it created. Skipped without
LIFE_AGENT_TEST_STORE_DSN (runtime role); split/role cases also need LIFE_AGENT_TEST_STORE_MIGRATOR_DSN and
LIFE_AGENT_TEST_ADMIN_DSN (local owner)."""
import multiprocessing
import threading
import time
import uuid

import pytest

from life_agent import contracts
from life_agent.config import load_env
from life_agent.core_client import CoreError
from life_agent.graph import build_graph
from life_agent.store import (BudgetExhausted, EventConflict, PgRuntimeStore, StaleWriter, copy_runtime_data,
                              execute_attempt, migrate)

import store_procs
from fakes import (FakeCore, FakeRetrieval, ManualClock, ScriptedModel, answer_citing, config, draft, reply,
                   retrieval_status, run_request, tool)

ENV = load_env()
DSN = ENV.get("LIFE_AGENT_TEST_STORE_DSN")
MIGRATOR = ENV.get("LIFE_AGENT_TEST_STORE_MIGRATOR_DSN")
ADMIN = ENV.get("LIFE_AGENT_TEST_ADMIN_DSN")
pytestmark = pytest.mark.skipif(not DSN, reason="store test database DSN not configured")
CAPS = {"retrieval_calls": 3, "core_read_requests": 4, "model_calls": 8, "model_tokens": 1000}
RESULT = {"response_type": "ANSWER", "message": "Thông tin tham khảo.", "citations": [], "actions": []}


class Ids:
    """Fresh synthetic ids per test and cleanup of every row they touch."""

    def __init__(self):
        self.tag = uuid.uuid4().hex[:8]
        self.conversation = str(uuid.uuid4())
        self.requests: list[dict] = []

    def request(self, name="m1", attempt="a1", text="Thời gian chờ là bao lâu?", conversation=None):
        req = run_request(f"{self.tag}-{name}", text, conversation_id=conversation or self.conversation, attempt=attempt)
        self.requests.append(req)
        return req

    def cleanup(self, store):
        attempts = list({r["attempt_id"] for r in self.requests} | getattr(self, "extra_attempts", set()))
        messages = list({r["message_id"] for r in self.requests})
        threads = list({f"conv:{r['conversation_id']}" for r in self.requests} | {f"conv:{self.conversation}"})
        with store.transaction() as cur:
            for sql, values in (
                    ("DELETE FROM agent_runtime.outbound_events WHERE attempt_id = ANY(%s::uuid[])", attempts),
                    ("DELETE FROM agent_runtime.attempt_sequences WHERE attempt_id = ANY(%s::uuid[])", attempts),
                    ("DELETE FROM agent_runtime.reservations WHERE message_id = ANY(%s::uuid[])", messages),
                    ("DELETE FROM agent_runtime.ledgers WHERE message_id = ANY(%s::uuid[])", messages),
                    ("DELETE FROM agent_runtime.checkpoint_writes WHERE thread_id = ANY(%s)", threads),
                    ("DELETE FROM agent_runtime.checkpoint_blobs WHERE thread_id = ANY(%s)", threads),
                    ("DELETE FROM agent_runtime.checkpoints WHERE thread_id = ANY(%s)", threads),
                    ("DELETE FROM agent_runtime.run_receipts WHERE attempt_id = ANY(%s::uuid[]) OR thread_id = ANY(%s)",
                     None),
                    ("DELETE FROM agent_runtime.thread_owners WHERE thread_id = ANY(%s)", threads)):
                cur.execute(sql, (attempts, threads) if values is None else (values,))


@pytest.fixture
def store():
    s = PgRuntimeStore(DSN)
    yield s
    s.close()


@pytest.fixture
def ids(store):
    created = Ids()
    yield created
    created.cleanup(store)


def revocation(req, reason="RETRY"):
    return {"schema_version": "agent-v1", "run_id": req["run_id"], "attempt_id": req["attempt_id"],
            "conversation_id": req["conversation_id"], "reason": reason, "requested_at": "2026-11-06T00:00:00Z"}


def head(store, thread_id):
    with store.transaction() as cur:
        cur.execute("SELECT checkpoint_id, writer_attempt_id::text FROM agent_runtime.checkpoints WHERE thread_id = %s "
                    "ORDER BY checkpoint_id DESC LIMIT 1", (thread_id,))
        return cur.fetchone()


def build(core=None, retrieval=None, model=None):
    return lambda runtime, saver: build_graph(runtime, core or FakeCore(), retrieval or FakeRetrieval(), model,
                                              config(), clock=ManualClock(), checkpointer=saver)


# ---------------------------------------------------------------------------------------------- receipts

def test_receipt_is_durable_idempotent_and_detects_conflicts(store, ids):
    req = ids.request()
    assert store.accept_run(req)["outcome"] == "ACCEPTED"
    assert store.accept_run(req)["outcome"] == "DUPLICATE"
    changed = {**req, "message_text": "Nội dung khác"}
    ack = store.accept_run(changed)
    assert (ack["outcome"], ack["reason"]) == ("CONFLICT", "PAYLOAD_MISMATCH")
    assert contracts.is_valid("DurableAck", ack)


def test_revoke_before_dispatch_leaves_tombstone(store, ids):
    req = ids.request()
    ack = store.revoke(revocation(req, "STAFF_TAKEOVER"))
    assert ack["outcome"] == "REVOKED" and contracts.is_valid("RevocationAck", ack)
    late = store.accept_run(req)
    assert (late["outcome"], late["reason"]) == ("IGNORED_STALE", "ATTEMPT_NOT_CURRENT")
    with pytest.raises(StaleWriter):
        store.claim_execution(req["run_id"], req["attempt_id"], worker_id="w", lease_seconds=30)


def test_new_attempt_fences_previous_owner_and_second_claim_fences_first(store, ids):
    a = ids.request(attempt="a1")
    store.accept_run(a)
    lease_a = store.claim_execution(a["run_id"], a["attempt_id"], worker_id="w1", lease_seconds=0)
    lease_a2 = store.claim_execution(a["run_id"], a["attempt_id"], worker_id="w2", lease_seconds=30)  # w1 lease expired
    with pytest.raises(StaleWriter):
        store.open_message(lease_a, a["message_id"], CAPS)
    store.open_message(lease_a2, a["message_id"], CAPS)
    b = ids.request(attempt="a2")
    store.accept_run(b)  # a new attempt on the thread takes ownership
    with pytest.raises(StaleWriter):
        store.reserve(lease_a2, a["message_id"], "model_calls", "model-1")
    assert store.receipt(a["attempt_id"])["status"] == "REVOKED"


# ---------------------------------------------------------------------------------------------- fencing

def test_stale_process_cannot_publish_checkpoint_after_revoke_ack(store, ids):
    a = ids.request(attempt="a1")
    store.accept_run(a)
    thread_id = f"conv:{a['conversation_id']}"
    ctx = multiprocessing.get_context("spawn")
    paused, resume, results = ctx.Event(), ctx.Event(), ctx.Queue()
    writer_a = ctx.Process(target=store_procs.paused_writer,
                           args=(DSN, a["run_id"], a["attempt_id"], thread_id, paused, resume, results))
    writer_a.start()
    try:
        assert paused.wait(30), "writer A never reached its pause point"
        ack = store.revoke(revocation(a))
        assert ack["outcome"] == "REVOKED"
        b = ids.request(attempt="a2")
        assert store.accept_run(b)["outcome"] == "ACCEPTED"
        lease_b = store.claim_execution(b["run_id"], b["attempt_id"], worker_id="writer-b", lease_seconds=30)
        store_procs.tiny_graph(store.checkpointer(lease_b)).invoke(
            {"n": 10}, {"configurable": {"thread_id": thread_id}}, durability="sync")
        published = head(store, thread_id)
        resume.set()  # writer A reconnects and tries to save
        assert results.get(timeout=30) == "STALE_WRITER"
    finally:
        resume.set()
        writer_a.join(30)
    assert head(store, thread_id) == published
    assert published[1] == b["attempt_id"]


def test_revoke_waits_for_an_inflight_write_then_fences_the_writer(store, ids):
    a = ids.request()
    store.accept_run(a)
    thread_id = f"conv:{a['conversation_id']}"
    writer = PgRuntimeStore(DSN)
    lease = writer.claim_execution(a["run_id"], a["attempt_id"], worker_id="w", lease_seconds=30)
    locked, release = threading.Event(), threading.Event()

    def hold(**_):
        locked.set()
        release.wait(10)

    writer.hooks["checkpoint_write_locked"] = hold
    graph = store_procs.tiny_graph(writer.checkpointer(lease))
    errors = []
    first = threading.Thread(target=lambda: _invoke(graph, thread_id, errors))
    first.start()
    assert locked.wait(10)
    revoked: dict = {}
    revoker = threading.Thread(target=lambda: revoked.update(ack=PgRuntimeStore(DSN).revoke(revocation(a)),
                                                             at=time.monotonic()))
    started = time.monotonic()
    revoker.start()
    revoker.join(0.5)
    assert revoker.is_alive(), "revoke must wait for the write that already holds the fence"
    writer.hooks.clear()
    release.set()
    first.join(10)
    revoker.join(10)
    assert revoked["ack"]["outcome"] == "REVOKED" and revoked["at"] - started >= 0.5
    # the in-flight step committed before the linearization point; anything after it is refused
    assert errors and isinstance(errors[0], StaleWriter)  # the later checkpoint of the same invoke
    with pytest.raises(StaleWriter):
        writer.renew_lease(lease, 30)
    writer.close()


def _invoke(graph, thread_id, errors):
    try:
        graph.invoke({"n": 0}, {"configurable": {"thread_id": thread_id}}, durability="sync")
    except BaseException as error:  # StaleWriter is a BaseException
        errors.append(error)


# ---------------------------------------------------------------------------------------------- ledger

def test_core_budget_survives_crash_after_send_before_checkpoint(store, ids, tmp_path):
    a = ids.request(attempt="a1")
    store.accept_run(a)
    counter = tmp_path / "sent"
    ctx = multiprocessing.get_context("spawn")
    crash = ctx.Process(target=store_procs.crashing_business_reads, args=(DSN, a["run_id"], a["attempt_id"], str(counter)))
    crash.start()
    crash.join(60)
    assert crash.exitcode == 17 and counter.read_text() == "4"
    assert store.usage(a["message_id"])["core_read_requests"] == 4
    store.revoke(revocation(a))
    b = ids.request(attempt="a2")
    store.accept_run(b)

    class Transport(FakeCore):
        sent = 0

        def list_contracts(self, ctx, *, timeout):
            Transport.sent += 1
            raise CoreError("TIMEOUT")

    model = ScriptedModel([reply(tool("list_contracts")), reply(draft("Chưa đọc được danh sách hợp đồng."))])
    event = execute_attempt(store, b["run_id"], b["attempt_id"], build(core=Transport(), model=model),
                            worker_id="w-b", lease_seconds=30)
    assert event["kind"] == "RESULT"
    assert Transport.sent == 0 and counter.read_text() == "4"  # BudgetExhausted before any new send
    assert store.usage(b["message_id"])["core_read_requests"] == 4


def test_retrieval_errors_spend_shared_budget(store, ids):
    a = ids.request()
    store.accept_run(a)
    retrieval = FakeRetrieval({f"q{i}": retrieval_status("ERROR", error="SEARCH_UNAVAILABLE") for i in range(1, 5)})
    model = ScriptedModel([reply(tool("retrieve_public", query=f"q{i}")) for i in range(1, 5)] +
                          [reply(draft("Chưa truy xuất được tài liệu."))])
    event = execute_attempt(store, a["run_id"], a["attempt_id"], build(retrieval=retrieval, model=model),
                            worker_id="w", lease_seconds=30)
    assert event["kind"] == "RESULT"
    assert len(retrieval.calls) == 3 and store.usage(a["message_id"])["retrieval_calls"] == 3


def test_token_reservations_survive_replay(store, ids):
    a = ids.request(attempt="a1")
    store.accept_run(a)
    lease = store.claim_execution(a["run_id"], a["attempt_id"], worker_id="w", lease_seconds=30)
    store.open_message(lease, a["message_id"], CAPS)  # caps for this fixture only
    for op, amount in (("summary-1", 300), ("model-1", 400), ("repair-1", 250)):
        store.reserve(lease, a["message_id"], "model_tokens", op, amount)
    store.settle(lease, a["message_id"], "model_tokens", "summary-1", 120)  # usage known: settled down
    # crash: model-1 and repair-1 usage never reported
    store.revoke(revocation(a))
    b = ids.request(attempt="a2")
    store.accept_run(b)
    lease_b = store.claim_execution(b["run_id"], b["attempt_id"], worker_id="w", lease_seconds=30)
    store.open_message(lease_b, b["message_id"], {"model_tokens": 999999})  # an existing ledger keeps its cap
    assert store.reserve(lease_b, b["message_id"], "model_tokens", "model-1", 400).amount == 400  # replay, no grant
    assert store.usage(b["message_id"])["model_tokens"] == 770
    with pytest.raises(BudgetExhausted):
        store.reserve(lease_b, b["message_id"], "model_tokens", "model-2", 300)
    assert store.usage(b["message_id"])["model_tokens"] == 770


# ---------------------------------------------------------------------------------------------- final record

class Crash(BaseException):
    pass


def test_final_record_is_atomic_and_a_finalized_attempt_is_never_rerun(store, ids):
    a = ids.request()
    store.accept_run(a)
    first_model = ScriptedModel([answer_citing("Bản trả lời trước crash.")])

    def boom(**_):
        raise Crash()

    store.hooks["before_final_commit"] = boom
    with pytest.raises(Crash):
        execute_attempt(store, a["run_id"], a["attempt_id"], build(model=first_model), worker_id="w", lease_seconds=0)
    store.hooks.clear()
    assert store.receipt(a["attempt_id"])["status"] == "ACCEPTED"  # rolled back: no partial final record
    assert all(e["attempt_id"] != a["attempt_id"] for e in store.pending_events())
    second = ScriptedModel([answer_citing("Bản trả lời sau khởi động lại.")])
    event = execute_attempt(store, a["run_id"], a["attempt_id"], build(model=second), worker_id="w2", lease_seconds=0)
    assert event["kind"] == "RESULT" and event["sequence"] == 1
    third = ScriptedModel([])
    again = execute_attempt(store, a["run_id"], a["attempt_id"], build(model=third), worker_id="w3", lease_seconds=0)
    assert again == event and third.contexts == []  # stored event returned, graph not run
    assert store.accept_run(a)["outcome"] == "DUPLICATE"


def test_sequence_is_unique_with_concurrent_progress_writers(store, ids):
    a = ids.request()
    store.accept_run(a)
    lease = store.claim_execution(a["run_id"], a["attempt_id"], worker_id="w", lease_seconds=30)
    sequences, lock = [], threading.Lock()

    def writer():
        own = PgRuntimeStore(DSN)
        for _ in range(5):
            event = own.persist_progress(lease, "LOOKING_UP")
            with lock:
                sequences.append(event["sequence"])
        own.close()

    threads = [threading.Thread(target=writer) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(30)
    final = store.persist_final(lease, {"result": RESULT})
    assert sorted(sequences) == list(range(1, 21)) and final["sequence"] == 21


def test_event_id_reuse_with_other_payload_conflicts_and_acks_stop_delivery(store, ids):
    a = ids.request()
    store.accept_run(a)
    lease = store.claim_execution(a["run_id"], a["attempt_id"], worker_id="w", lease_seconds=30)
    event = store.persist_final(lease, {"result": RESULT})
    with store.transaction() as cur:
        store.insert_event(cur, event)  # same content: no-op
    with pytest.raises(EventConflict):
        with store.transaction() as cur:
            store.insert_event(cur, {**event, "payload": {"result": {**RESULT, "message": "khác"}}})
    pending = [e["event_id"] for e in store.pending_events()]
    assert event["event_id"] in pending
    store.ack_event(event["event_id"], {"outcome": "REJECTED"})
    store.ack_event(event["event_id"], {"outcome": "DUPLICATE"})
    assert event["event_id"] not in [e["event_id"] for e in store.pending_events()]
    assert (a["run_id"], a["attempt_id"]) not in store.recoverable()


# ---------------------------------------------------------------------------------------------- roles / split

def test_runtime_role_cannot_read_business_write_rag_or_change_schema():
    import psycopg

    with psycopg.connect(DSN, autocommit=True) as conn:
        for sql in ("SELECT 1 FROM business.users LIMIT 1", "UPDATE rag.rag_knowledge_chunks SET content = content WHERE false",
                    "CREATE TABLE agent_runtime.not_allowed (id int)", "SELECT 1 FROM agent_runtime.schema_migrations"):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                conn.execute(sql)


@pytest.mark.skipif(not (ADMIN and MIGRATOR), reason="admin/migrator DSNs not configured")
def test_core_role_cannot_read_checkpoints():
    import psycopg

    with psycopg.connect(ADMIN, autocommit=True) as conn:
        conn.execute("SET ROLE core_runtime")
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute("SELECT 1 FROM agent_runtime.checkpoints LIMIT 1")


@pytest.mark.skipif(not (ADMIN and MIGRATOR), reason="admin/migrator DSNs not configured")
def test_split_target_is_built_by_migrations_and_restores_a_thread(store, ids):
    import psycopg
    from psycopg.conninfo import conninfo_to_dict, make_conninfo

    a = ids.request()
    store.accept_run(a)
    model = ScriptedModel([answer_citing("Trả lời mẫu cho thread được tách.")])
    event = execute_attempt(store, a["run_id"], a["attempt_id"], build(model=model), worker_id="w", lease_seconds=0)
    thread_id = f"conv:{a['conversation_id']}"
    target_db = f"agent_split_{ids.tag}"
    with psycopg.connect(ADMIN, autocommit=True) as admin:
        admin.execute(f'CREATE DATABASE "{target_db}"')
    try:
        target_admin = make_conninfo(ADMIN, dbname=target_db)
        with psycopg.connect(target_admin, autocommit=True) as conn:  # same steps as bootstrap-database.mjs
            conn.execute(f'GRANT CONNECT ON DATABASE "{target_db}" TO agent_migrator, agent_runtime')
            conn.execute("CREATE SCHEMA agent_runtime AUTHORIZATION agent_migrator")
            conn.execute("GRANT USAGE ON SCHEMA agent_runtime TO agent_runtime")
            conn.execute("ALTER DEFAULT PRIVILEGES FOR ROLE agent_migrator IN SCHEMA agent_runtime "
                         "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO agent_runtime")
            assert conn.execute("SELECT count(*) FROM pg_namespace WHERE nspname IN ('business', 'rag')").fetchone()[0] == 0
        assert migrate(make_conninfo(MIGRATOR, dbname=target_db)) == ["001_durable_runtime"]
        source_admin = make_conninfo(ADMIN, dbname=conninfo_to_dict(DSN).get("dbname", "life_insurance"))
        counts = copy_runtime_data(source_admin, target_admin)
        assert counts["checkpoints"] >= 1 and counts["outbound_events"] >= 1
        target = PgRuntimeStore(make_conninfo(DSN, dbname=target_db))
        target.fence_after_restore()
        restored = target.checkpointer(None).get_tuple({"configurable": {"thread_id": thread_id}})
        original = store.checkpointer(None).get_tuple({"configurable": {"thread_id": thread_id}})
        assert restored.checkpoint["channel_values"] == original.checkpoint["channel_values"]
        assert target.final_event(a["attempt_id"]) == event
        target.close()
    finally:
        with psycopg.connect(ADMIN, autocommit=True) as admin:
            admin.execute(f'DROP DATABASE IF EXISTS "{target_db}" WITH (FORCE)')
