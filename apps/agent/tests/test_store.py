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
from life_agent.store import (BudgetExhausted, CheckpointConflict, EventConflict, PgRuntimeStore, StaleWriter, copy_runtime_data,
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


@pytest.mark.parametrize("wrong_field", ["run_id", "conversation_id"])
def test_revoke_rejects_mismatched_known_receipt_without_fencing(store, ids, wrong_field):
    req = ids.request()
    store.accept_run(req)
    lease = store.claim_execution(req["run_id"], req["attempt_id"], worker_id="w", lease_seconds=30)
    wrong = {**revocation(req), wrong_field: str(uuid.uuid4())}
    ack = store.revoke(wrong)
    assert contracts.is_valid("RevocationAck", ack)
    assert (ack["outcome"], ack["reason"]) == ("REJECTED", "PAYLOAD_MISMATCH")
    assert store.receipt(req["attempt_id"])["status"] == "ACCEPTED"
    assert store.persist_progress(lease, "LOOKING_UP")["attempt_id"] == req["attempt_id"]


def test_revoke_tombstone_matches_thread_and_echoes_control_run(store, ids):
    req = ids.request()
    assert store.revoke(revocation(req))["outcome"] == "REVOKED"
    repeated = {**revocation(req), "run_id": str(uuid.uuid4())}
    ack = store.revoke(repeated)
    assert ack["outcome"] == "ALREADY_REVOKED" and ack["run_id"] == repeated["run_id"]
    wrong = {**repeated, "conversation_id": str(uuid.uuid4())}
    ack = store.revoke(wrong)
    assert contracts.is_valid("RevocationAck", ack)
    assert (ack["outcome"], ack["reason"]) == ("REJECTED", "PAYLOAD_MISMATCH")
    assert store.receipt(req["attempt_id"])["run_id"] is None
    assert store.accept_run(req)["outcome"] == "IGNORED_STALE"


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


def _wait_for_block_or_completion(observer, pid, completed):
    """Wait for a real PostgreSQL lock wait or completion, never infer locking from sleep alone."""
    until = time.monotonic() + 10
    while time.monotonic() < until:
        with observer.transaction() as cur:
            cur.execute("SELECT cardinality(pg_blocking_pids(%s)) > 0", (pid,))
            if cur.fetchone()[0] or completed.is_set():
                return
        completed.wait(0.01)
    raise AssertionError("operation neither blocked in PostgreSQL nor completed")


def test_renew_and_revoke_do_not_deadlock(store, ids):
    req = ids.request()
    store.accept_run(req)
    lease = store.claim_execution(req["run_id"], req["attempt_id"], worker_id="w", lease_seconds=30)
    renewal, revoker = PgRuntimeStore(DSN), PgRuntimeStore(DSN)
    fenced, release, completed = threading.Event(), threading.Event(), threading.Event()
    errors, outcomes = [], []
    original_fence = renewal.fence

    def pause_after_fence(cur, current):
        original_fence(cur, current)
        fenced.set()
        assert release.wait(10)

    renewal.fence = pause_after_fence

    def renew():
        try:
            renewal.renew_lease(lease, 60)
        except BaseException as error:
            errors.append(error)

    def revoke():
        try:
            outcomes.append(revoker.revoke(revocation(req))["outcome"])
        except BaseException as error:
            errors.append(error)
        finally:
            completed.set()

    renewal.connection().execute("SET statement_timeout = '8s'")
    revoker.connection().execute("SET statement_timeout = '8s'")
    first, second = threading.Thread(target=renew), threading.Thread(target=revoke)
    try:
        first.start()
        assert fenced.wait(10)
        second.start()
        _wait_for_block_or_completion(store, revoker.connection().info.backend_pid, completed)
    finally:
        release.set()
        first.join(12)
        if second.ident is not None:
            second.join(12)
        renewal.close()
        revoker.close()
    assert not first.is_alive() and not second.is_alive()
    assert not errors, [type(error).__name__ for error in errors]
    assert outcomes == ["REVOKED"]
    with pytest.raises(StaleWriter):
        store.persist_progress(lease, "LOOKING_UP")


@pytest.mark.parametrize("existing_head", [False, True])
def test_checkpoint_head_compare_and_swap_is_atomic(store, ids, existing_head):
    from langgraph.checkpoint.base import empty_checkpoint

    req = ids.request()
    store.accept_run(req)
    lease = store.claim_execution(req["run_id"], req["attempt_id"], worker_id="w", lease_seconds=30)
    initial = {"configurable": {"thread_id": lease.thread_id}}
    if existing_head:
        initial = store.checkpointer(lease).put(initial, {**empty_checkpoint(), "id": "001"}, {}, {})
    first_store, second_store = PgRuntimeStore(DSN), PgRuntimeStore(DSN)
    locked, release, completed = threading.Event(), threading.Event(), threading.Event()
    results = []

    def pause(**_):
        locked.set()
        assert release.wait(10)

    first_store.hooks["checkpoint_write_locked"] = pause

    def save(own, checkpoint_id, done=None):
        try:
            own.checkpointer(lease).put(initial, {**empty_checkpoint(), "id": checkpoint_id}, {}, {})
            results.append((checkpoint_id, "SAVED"))
        except BaseException as error:
            results.append((checkpoint_id, type(error)))
        finally:
            if done is not None:
                done.set()

    second_store.connection().execute("SET statement_timeout = '8s'")
    first = threading.Thread(target=save, args=(first_store, "002"))
    second = threading.Thread(target=save, args=(second_store, "003", completed))
    try:
        first.start()
        assert locked.wait(10)
        second.start()
        _wait_for_block_or_completion(store, second_store.connection().info.backend_pid, completed)
    finally:
        release.set()
        first.join(12)
        if second.ident is not None:
            second.join(12)
        first_store.close()
        second_store.close()
    assert sorted(results, key=lambda item: item[0]) == [("002", "SAVED"), ("003", CheckpointConflict)]
    with store.transaction() as cur:
        cur.execute("SELECT checkpoint_id FROM agent_runtime.checkpoints WHERE thread_id = %s ORDER BY checkpoint_id",
                    (lease.thread_id,))
        assert [row[0] for row in cur.fetchall()] == (["001", "002"] if existing_head else ["002"])


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


def test_progress_and_final_do_not_deadlock_on_receipt_foreign_keys(store, ids):
    req = ids.request()
    store.accept_run(req)
    lease = store.claim_execution(req["run_id"], req["attempt_id"], worker_id="w", lease_seconds=30)
    store.persist_progress(lease, "LOOKING_UP")  # Existing sequence row: later UPDATE holds no receipt FK lock.
    progress, finalizer = PgRuntimeStore(DSN), PgRuntimeStore(DSN)
    sequence_locked, release, completed = threading.Event(), threading.Event(), threading.Event()
    errors, events = [], []
    original_insert = progress.insert_event

    def pause_before_event_insert(cur, event):
        sequence_locked.set()
        assert release.wait(10)
        original_insert(cur, event)

    progress.insert_event = pause_before_event_insert

    def emit_progress():
        try:
            events.append(progress.persist_progress(lease, "LOOKING_UP"))
        except BaseException as error:
            errors.append(error)

    def finalize():
        try:
            events.append(finalizer.persist_final(lease, {"result": RESULT}))
        except BaseException as error:
            errors.append(error)
        finally:
            completed.set()

    progress.connection().execute("SET statement_timeout = '8s'")
    finalizer.connection().execute("SET statement_timeout = '8s'")
    first, second = threading.Thread(target=emit_progress), threading.Thread(target=finalize)
    try:
        first.start()
        assert sequence_locked.wait(10)
        second.start()
        _wait_for_block_or_completion(store, finalizer.connection().info.backend_pid, completed)
    finally:
        release.set()
        first.join(12)
        if second.ident is not None:
            second.join(12)
        progress.close()
        finalizer.close()
    assert not first.is_alive() and not second.is_alive()
    assert not errors, [type(error).__name__ for error in errors]
    assert sorted((event["sequence"], event["kind"]) for event in events) == [(2, "PROGRESS"), (3, "RESULT")]


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
    ack = {"run_id": a["run_id"], "attempt_id": a["attempt_id"], "event_id": event["event_id"], "reason": None}
    store.ack_event(event["event_id"], {**ack, "outcome": "REJECTED", "reason": "UNKNOWN_RUN"})
    assert event["event_id"] in [e["event_id"] for e in store.pending_events()]
    store.ack_event(event["event_id"], {**ack, "outcome": "DUPLICATE"})
    assert event["event_id"] not in [e["event_id"] for e in store.pending_events()]
    assert (a["run_id"], a["attempt_id"]) not in store.recoverable()


@pytest.mark.parametrize("mutation", ["run_id", "attempt_id", "event_id", "missing_ids", "reason", "outcome"])
def test_ack_must_be_valid_and_match_the_stored_event(store, ids, mutation):
    req = ids.request()
    store.accept_run(req)
    lease = store.claim_execution(req["run_id"], req["attempt_id"], worker_id="w", lease_seconds=30)
    event = store.persist_final(lease, {"result": RESULT})
    ack = {"outcome": "ACCEPTED", "run_id": req["run_id"], "attempt_id": req["attempt_id"],
           "event_id": event["event_id"], "reason": None}
    if mutation in ("run_id", "attempt_id", "event_id"):
        ack[mutation] = str(uuid.uuid4())
        assert contracts.is_valid("DurableAck", ack)
    elif mutation == "missing_ids":
        ack = {"outcome": "DUPLICATE"}
    elif mutation == "reason":
        ack["reason"] = "UNKNOWN_RUN"
    else:
        ack["outcome"] = "UNKNOWN"
    store.ack_event(event["event_id"], ack)
    assert event["event_id"] in [e["event_id"] for e in store.pending_events()]


# ---------------------------------------------------------------------------------------------- roles / split

@pytest.mark.skipif(not (ADMIN and MIGRATOR), reason="admin/migrator DSNs not configured")
def test_bootstrap_keeps_migration_metadata_private_before_and_after_migrate(ids):
    from pathlib import Path

    import psycopg
    from psycopg.conninfo import make_conninfo

    grants = (Path(__file__).resolve().parents[2] / "core/scripts/agent-runtime-grants.sql").read_text(encoding="utf-8")
    target_db = f"agent_grants_{ids.tag}"
    with psycopg.connect(ADMIN, autocommit=True) as admin:
        admin.execute(f'CREATE DATABASE "{target_db}"')
    try:
        target_admin = make_conninfo(ADMIN, dbname=target_db)
        target_migrator = make_conninfo(MIGRATOR, dbname=target_db)
        target_runtime = make_conninfo(DSN, dbname=target_db)
        with psycopg.connect(target_admin, autocommit=True) as admin:
            admin.execute(grants)  # First bootstrap precedes migrations: metadata table does not exist yet.
        assert migrate(target_migrator) == ["001_durable_runtime"]

        def assert_metadata_denied(runtime):
            for sql in ("SELECT 1 FROM agent_runtime.schema_migrations",
                        "UPDATE agent_runtime.schema_migrations SET sha256 = sha256 WHERE false",
                        "DELETE FROM agent_runtime.schema_migrations WHERE false",
                        "INSERT INTO agent_runtime.schema_migrations (version, sha256) VALUES ('runtime-probe', repeat('0', 64))"):
                with pytest.raises(psycopg.errors.InsufficientPrivilege):
                    runtime.execute(sql)

        with psycopg.connect(target_runtime, autocommit=True) as runtime:
            assert_metadata_denied(runtime)  # migrate itself already revokes the default DML grant.
            with psycopg.connect(target_admin, autocommit=True) as admin:
                admin.execute(grants)  # Starting the stack again must not restore metadata access.
            assert_metadata_denied(runtime)
            message_id = str(uuid.uuid4())
            runtime.execute("INSERT INTO agent_runtime.ledgers (message_id, kind, cap) VALUES (%s, 'model_calls', 2)",
                            (message_id,))
            runtime.execute("UPDATE agent_runtime.ledgers SET used = 1 WHERE message_id = %s", (message_id,))
            assert runtime.execute("SELECT used FROM agent_runtime.ledgers WHERE message_id = %s", (message_id,)).fetchone() == (1,)
            runtime.execute("DELETE FROM agent_runtime.ledgers WHERE message_id = %s", (message_id,))
            with psycopg.connect(target_migrator, autocommit=True) as migrator:
                migrator.execute("CREATE TABLE agent_runtime.bootstrap_grant_probe (id integer PRIMARY KEY)")
            runtime.execute("INSERT INTO agent_runtime.bootstrap_grant_probe VALUES (1)")  # Future tables retain DML defaults.
            runtime.execute("UPDATE agent_runtime.bootstrap_grant_probe SET id = 2 WHERE id = 1")
            assert runtime.execute("SELECT id FROM agent_runtime.bootstrap_grant_probe").fetchall() == [(2,)]
            runtime.execute("DELETE FROM agent_runtime.bootstrap_grant_probe")
            with psycopg.connect(target_admin, autocommit=True) as admin:
                admin.execute(grants)
            assert_metadata_denied(runtime)
    finally:
        with psycopg.connect(ADMIN, autocommit=True) as admin:
            admin.execute(f'DROP DATABASE IF EXISTS "{target_db}" WITH (FORCE)')


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
