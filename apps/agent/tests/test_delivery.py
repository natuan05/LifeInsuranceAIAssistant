"""HTTP/HMAC, durable ACK and redelivery across restarts (plan Task 6, Agent side; contracts/agent-v1.md 12.8-12.12).

Core is a double here: it applies events with the dedup rules of 12.3 (event id + content hash, stale attempts) but
proves nothing about Core's own transaction, permissions or HMAC code (Task 6 Core part, after Task 3). Secrets are
random per test run; the fixed keys in contracts/fixtures/hmac-v1.json are published test vectors only.
DB cases need LIFE_AGENT_TEST_STORE_DSN (runtime role) and are skipped without it.
"""
import copy
import json
import secrets
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

from life_agent import contracts
from life_agent.config import load_env
from life_agent.core_client import CoreError, HttpCoreClient
from life_agent.http import (AgentService, DeliveryPolicy, HttpEventTransport, TransportError, Worker, create_app,
                             deliver_pending)
from life_agent.signing import (AuthFailed, Keyring, MemoryNonces, ReplayRejected, b64url, sign, string_to_sign,
                                verify)
from life_agent.store import PgRuntimeStore, sha256_json

from fakes import FakeCore, FakeRetrieval, ManualClock, ScriptedModel, config, draft, reply, tool

ENV = load_env()
DSN = ENV.get("LIFE_AGENT_TEST_STORE_DSN")
needs_db = pytest.mark.skipif(not DSN, reason="store test database DSN not configured")
VECTORS = json.loads((Path(contracts.contracts_dir()) / "fixtures" / "hmac-v1.json").read_text(encoding="utf-8"))
NOW = 1_793_900_000.0
RESULT = {"response_type": "ANSWER", "message": "Thông tin tham khảo (synthetic).", "citations": [], "actions": []}


def keyring(key_id="c2a-1", **extra) -> Keyring:
    return Keyring(key_id, {key_id: secrets.token_bytes(32), **extra})


def signed(ring, method, target, payload, *, now=NOW, nonce=None):
    body = payload if isinstance(payload, bytes) else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    return sign(ring, method, target, body, now=now, nonce=nonce), body


# ---------------------------------------------------------------------------------------------- HMAC profile

def vector_request(change=None):
    change = change or {}
    valid = VECTORS["valid"]
    return (change.get("method", valid["method"]), change.get("target", valid["target"]),
            {**valid["headers"], **change.get("headers", {})}, change.get("body_utf8", valid["body_utf8"]).encode("utf-8"),
            change.get("now", VECTORS["now"]))


def vector_ring():
    return Keyring.from_config("test-c2a-1", VECTORS["keys"])


def test_shared_vectors_verify_and_every_change_is_refused():
    method, target, headers, body, now = vector_request()
    assert string_to_sign(method, target, headers["X-LI-Timestamp"], headers["X-LI-Nonce"], headers["X-LI-Content-SHA256"],
                          headers["X-LI-Key-Id"]).decode() == VECTORS["valid"]["string_to_sign"]
    assert verify(vector_ring(), MemoryNonces(), method, target, headers, body, now=lambda: now) == "test-c2a-1"
    for item in VECTORS["invalid"]:
        method, target, headers, body, now = vector_request(item["change"])
        with pytest.raises(AuthFailed):
            verify(vector_ring(), MemoryNonces(), method, target, headers, body, now=lambda: now)


def test_tamper_wrong_key_skew_and_size_are_auth_failures():
    ring = keyring()
    headers, body = signed(ring, "POST", "/internal/runs", {"a": 1})
    check = lambda h=headers, b=body, t="/internal/runs", r=ring, at=NOW: verify(r, MemoryNonces(), "POST", t, h, b,  # noqa: E731
                                                                                 now=lambda: at)
    assert check() == "c2a-1"
    for bad in ({**headers, "X-LI-Signature": headers["X-LI-Signature"][:-2] + "AA"},
                {k: v for k, v in headers.items() if k != "X-LI-Nonce"},
                {**headers, "X-LI-Nonce": "short"}):
        with pytest.raises(AuthFailed):
            check(h=bad)
    with pytest.raises(AuthFailed):
        check(b=body + b" ")
    with pytest.raises(AuthFailed):
        check(t="/internal/runs/")
    with pytest.raises(AuthFailed):
        check(r=keyring())  # same key id, other secret
    with pytest.raises(AuthFailed):
        check(at=NOW + 121)
    with pytest.raises(AuthFailed):
        check(at=NOW - 121)
    big_headers, big = signed(ring, "POST", "/internal/runs", b"x" * (1024 * 1024))
    with pytest.raises(AuthFailed):
        check(h=big_headers, b=big + b"x")
    assert check(h=big_headers, b=big) == "c2a-1"  # exactly 1 MiB is allowed


def test_nonce_replay_is_rejected_and_a_resend_with_a_new_nonce_passes():
    ring, nonces = keyring(), MemoryNonces(clock=lambda: NOW)
    headers, body = signed(ring, "POST", "/internal/runs", {"run_id": "same business ids"})
    verify(ring, nonces, "POST", "/internal/runs", headers, body, now=lambda: NOW)
    with pytest.raises(ReplayRejected):
        verify(ring, nonces, "POST", "/internal/runs", headers, body, now=lambda: NOW)
    again, _ = signed(ring, "POST", "/internal/runs", body, now=NOW + 5)
    assert verify(ring, nonces, "POST", "/internal/runs", again, body, now=lambda: NOW + 5) == "c2a-1"


def test_rotation_signs_with_the_current_key_and_still_verifies_the_old_one():
    old_key, new_key = secrets.token_bytes(32), secrets.token_bytes(32)
    old = Keyring("k1", {"k1": old_key})
    rotated = Keyring("k2", {"k1": old_key, "k2": new_key})
    headers, body = signed(old, "POST", "/x", b"{}")
    assert verify(rotated, MemoryNonces(), "POST", "/x", headers, body, now=lambda: NOW) == "k1"
    assert signed(rotated, "POST", "/x", b"{}")[0]["X-LI-Key-Id"] == "k2"
    with pytest.raises(ValueError):
        Keyring("k", {"k": b"too short"})


def test_invalid_signature_does_not_consume_a_nonce():
    ring, nonces = keyring(), MemoryNonces(clock=lambda: NOW)
    headers, body = signed(ring, "POST", "/internal/runs", b"{}")
    with pytest.raises(AuthFailed):
        verify(ring, nonces, "POST", "/internal/runs", {**headers, "X-LI-Signature": "A" * 43}, body, now=lambda: NOW)
    verify(ring, nonces, "POST", "/internal/runs", headers, body, now=lambda: NOW)


# ---------------------------------------------------------------------------------------------- handlers (no DB)

def request_body(name="m1", conversation=None, attempt="a1"):
    from fakes import run_request

    return run_request(f"{name}-{uuid.uuid4().hex[:6]}", "Thời gian chờ là bao lâu?", conversation_id=conversation or str(uuid.uuid4()),
                       attempt=attempt)


class MemoryReceipts:
    """Minimal store double for handler tests: receipt by attempt with the same ACK rules as PgRuntimeStore."""

    def __init__(self):
        self.receipts, self.revoked, self.fail = {}, set(), False

    def accept_run(self, request):
        if self.fail:
            raise ConnectionError("db down")
        digest, attempt = sha256_json(request), request["attempt_id"]
        ack = lambda o, r=None: {"outcome": o, "run_id": request["run_id"], "attempt_id": attempt, "event_id": None,  # noqa: E731
                                 "reason": r}
        if attempt in self.revoked:
            return ack("IGNORED_STALE", "ATTEMPT_NOT_CURRENT")
        if attempt in self.receipts:
            return ack("DUPLICATE") if self.receipts[attempt] == digest else ack("CONFLICT", "PAYLOAD_MISMATCH")
        self.receipts[attempt] = digest
        return ack("ACCEPTED")

    def revoke(self, revocation):
        already = revocation["attempt_id"] in self.revoked
        self.revoked.add(revocation["attempt_id"])
        return {"outcome": "ALREADY_REVOKED" if already else "REVOKED", "run_id": revocation["run_id"],
                "attempt_id": revocation["attempt_id"], "writer_epoch": 2, "reason": None}


def service(store=None, ring=None, clock=lambda: NOW):
    ring = ring or keyring()
    woke = []
    svc = AgentService(store or MemoryReceipts(), ring, nonces=MemoryNonces(clock=clock), clock=clock,
                       notify=lambda: woke.append(1))
    return svc, ring, woke


def call(svc, ring, target, payload, *, method="POST", now=NOW, nonce=None, headers=None):
    h, body = signed(ring, method, target, payload, now=now, nonce=nonce)
    return svc.handle(method, target, headers or h, body)


def revocation_of(req, reason="STAFF_TAKEOVER"):
    return {"schema_version": "agent-v1", "run_id": req["run_id"], "attempt_id": req["attempt_id"],
            "conversation_id": req["conversation_id"], "reason": reason, "requested_at": "2026-11-06T00:00:00Z"}


def test_run_endpoint_maps_acks_to_http_and_wakes_the_worker():
    svc, ring, woke = service()
    req = request_body()
    status, ack = call(svc, ring, "/internal/runs", req)
    assert (status, ack["outcome"]) == (202, "ACCEPTED") and contracts.is_valid("DurableAck", ack)
    status, ack = call(svc, ring, "/internal/runs", req)  # Core resend: new nonce, same business ids
    assert (status, ack["outcome"]) == (200, "DUPLICATE") and len(woke) == 2
    status, ack = call(svc, ring, "/internal/runs", {**req, "message_text": "khác"})
    assert (status, ack["outcome"], ack["reason"]) == (409, "CONFLICT", "PAYLOAD_MISMATCH")


def test_auth_failures_say_nothing_about_the_cause_and_store_nothing():
    store = MemoryReceipts()
    svc, ring, _ = service(store)
    req = request_body()
    headers, body = signed(ring, "POST", "/internal/runs", req)
    for bad_headers, bad_body in (({**headers, "X-LI-Timestamp": str(int(NOW) + 1)}, body),
                                  (headers, body.replace(b"Th", b"th")), ({}, body)):
        assert svc.handle("POST", "/internal/runs", bad_headers, bad_body) == (401, {"error": {"code": "AUTH_FAILED"}})
    assert store.receipts == {}
    assert svc.handle("POST", "/internal/runs", headers, body)[0] == 202
    assert svc.handle("POST", "/internal/runs", headers, body) == (401, {"error": {"code": "REPLAY_REJECTED"}})


def test_schema_errors_unknown_routes_and_store_outage():
    store = MemoryReceipts()
    svc, ring, _ = service(store)
    req = request_body()
    status, ack = call(svc, ring, "/internal/runs", {**req, "actor": {"id": req["actor"]["id"], "role": "ADMIN"}})
    assert (status, ack["outcome"], ack["reason"], ack["attempt_id"]) == (400, "REJECTED", "SCHEMA_INVALID", req["attempt_id"])
    assert call(svc, ring, "/internal/runs", b"not json") == (400, {"error": {"code": "SCHEMA_INVALID"}})
    assert call(svc, ring, "/internal/other", req)[0] == 404
    assert svc.handle("GET", "/healthz", {}, b"") == (200, {"status": "ok"})
    store.fail = True
    assert call(svc, ring, "/internal/runs", req) == (503, {"error": {"code": "UNAVAILABLE"}})  # no ACK: Core resends


def test_revoke_endpoint_checks_the_path_attempt():
    svc, ring, _ = service()
    req = request_body()
    target = f"/internal/attempts/{req['attempt_id']}/revoke"
    status, ack = call(svc, ring, target, revocation_of(req))
    assert (status, ack["outcome"]) == (200, "REVOKED") and contracts.is_valid("RevocationAck", ack)
    other = f"/internal/attempts/{uuid.uuid4()}/revoke"
    status, ack = call(svc, ring, other, revocation_of(req))
    assert (status, ack["outcome"], ack["reason"]) == (400, "REJECTED", "SCHEMA_INVALID")
    assert call(svc, ring, "/internal/runs", req)[1]["outcome"] == "IGNORED_STALE"  # dispatch landing after the revoke


# ---------------------------------------------------------------------------------------------- real HTTP server

class LiveServer:
    """uvicorn on an ephemeral port in a thread (Starlette app), stopped after the test."""

    def __init__(self, app):
        import uvicorn

        self.server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=0, log_level="warning",
                                                    access_log=False, server_header=False))
        self.thread = threading.Thread(target=self.server.run, daemon=True)

    def __enter__(self):
        self.thread.start()
        deadline = time.time() + 10
        while not self.server.started and time.time() < deadline:
            time.sleep(0.02)
        port = self.server.servers[0].sockets[0].getsockname()[1]
        self.base = f"http://127.0.0.1:{port}"
        return self

    def __exit__(self, *exc):
        self.server.should_exit = True
        self.thread.join(10)


def http_post(url, target, body, headers):
    import urllib.error
    import urllib.request

    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    request = urllib.request.Request(url + target, data=body, headers={**headers, "Content-Type": "application/json"},
                                     method="POST")
    try:
        with opener.open(request, timeout=10) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read())


def test_starlette_app_signs_over_the_raw_path_and_body():
    svc, ring, _ = service(clock=time.time)
    req = request_body()
    with LiveServer(create_app(svc)) as live:
        headers, body = signed(ring, "POST", "/internal/runs", req, now=time.time())
        assert http_post(live.base, "/internal/runs", body, headers)[0] == 202
        headers, body = signed(ring, "POST", "/internal/runs?x=1", req, now=time.time())
        assert http_post(live.base, "/internal/runs?x=1", body, headers)[0] == 200  # query is part of the signature
        headers, body = signed(ring, "POST", "/internal/runs", req, now=time.time())
        assert http_post(live.base, "/internal/runs?x=1", body, headers) == (401, {"error": {"code": "AUTH_FAILED"}})
        target = f"/internal/attempts/{req['attempt_id']}/revoke"
        headers, body = signed(ring, "POST", target, revocation_of(req), now=time.time())
        status, ack = http_post(live.base, target, body, headers)
        assert (status, ack["outcome"]) == (200, "REVOKED")


# ---------------------------------------------------------------------------------------------- outbound clients

class CoreHttpDouble(ThreadingHTTPServer):
    """Stdlib HTTP server that verifies Agent -> Core signatures and answers from a script."""

    def __init__(self, ring, answers):
        self.ring, self.answers, self.seen, self.nonces = ring, answers, [], MemoryNonces()

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def handle_any(handler, method):
                from urllib.parse import parse_qs, urlsplit

                length = int(handler.headers.get("Content-Length") or 0)
                body = handler.rfile.read(length) if length else b""
                parts = urlsplit(handler.path)
                try:
                    verify(self.ring, self.nonces, method, handler.path, dict(handler.headers), body)
                    payload = json.loads(body) if body else None
                    query = {k: v[0] for k, v in parse_qs(parts.query).items()}
                    self.seen.append((method, parts.path, query, payload))
                    key = next(k for k in self.answers if parts.path.endswith(k))
                    status, answer = self.answers[key](payload)
                except AuthFailed:
                    status, answer = 401, {"error": {"code": "AUTH_FAILED"}}
                data = json.dumps(answer).encode() if answer is not None else b"not json"
                if status == "sleep":
                    time.sleep(1.5)
                    status = 200
                try:
                    handler.send_response(status)
                    handler.send_header("Content-Length", str(len(data)))
                    handler.end_headers()
                    handler.wfile.write(data)
                except BrokenPipeError:
                    pass  # the client gave up (timeout case)

            def do_POST(handler):
                handler.handle_any("POST")

            def do_GET(handler):
                handler.handle_any("GET")

        super().__init__(("127.0.0.1", 0), Handler)
        self.base = f"http://127.0.0.1:{self.server_address[1]}"
        threading.Thread(target=self.serve_forever, daemon=True).start()


def ctx():
    from fakes import run_request
    from life_agent.graph import execution_context

    return execution_context(run_request("ctx", "?"))


def test_core_reads_use_the_plan_paths_are_signed_and_map_errors():
    ring = keyring("a2c-1")
    page = {"items": [], "nextCursor": None}
    overview = {"policy_number": "SYN-POL/2024-0001", "main_product": {"code": "PUB-HTHP-GTBV-V2", "name": "HTHP"},
                "riders": [], "riders_complete": False}
    answers = {"/history": lambda p: (200, page),
               "/linked-history": lambda p: (403, {"error": {"code": "NOT_AUTHORIZED"}}),
               "/contracts": lambda p: (200, {"contracts": [{"policy_number": "x"}]}),
               "/contracts/SYN-POL%2F2024-0001": lambda p: (200, overview),
               "/scope": lambda p: (409, None)}
    server = CoreHttpDouble(ring, answers)
    try:
        client = HttpCoreClient(server.base, ring)
        context = ctx()
        view = context["history_view"]
        run = f"/api/v1/internal/agent/runs/{context['run_id']}"
        assert client.history(context, view, "p7", timeout=2) == page
        assert client.get_contract_overview(context, "SYN-POL/2024-0001", timeout=2) == overview
        for call_, code in ((lambda: client.linked_history(context, view, None, timeout=2), "NOT_AUTHORIZED"),
                            (lambda: client.scope(context, "PRIVATE", "SYN-POL-2024-0001", timeout=2), "INVALID_ATTEMPT"),
                            (lambda: client.list_contracts(context, timeout=2), "UNAVAILABLE")):  # malformed summary
            with pytest.raises(CoreError) as raised:
                call_()
            assert raised.value.code == code
        attempt = {"attemptId": context["attempt_id"]}
        assert server.seen == [
            ("GET", f"{run}/history", {**attempt, "cursor": "p7"}, None),
            ("GET", f"{run}/contracts/SYN-POL%2F2024-0001", attempt, None),
            ("GET", f"{run}/linked-history", attempt, None),  # Core pages by the views it stored for the run
            ("POST", f"{run}/scope", attempt, {"attempt_id": context["attempt_id"], "kind": "PRIVATE",
                                               "policy_number": "SYN-POL-2024-0001"}),
            ("GET", f"{run}/contracts", attempt, None)]
        wrong = HttpCoreClient(server.base, keyring("a2c-1"))
        with pytest.raises(CoreError) as raised:
            wrong.history(context, view, None, timeout=2)
        assert raised.value.code == "UNAVAILABLE"  # 401 is not a Core business answer
    finally:
        server.shutdown()


def test_core_read_timeout_and_unreachable_core_are_transient_codes():
    ring = keyring("a2c-1")
    server = CoreHttpDouble(ring, {"/history": lambda p: ("sleep", {"items": []})})
    try:
        with pytest.raises(CoreError) as raised:
            HttpCoreClient(server.base, ring).history(ctx(), ctx()["history_view"], None, timeout=0.3)
        assert raised.value.code == "TIMEOUT"
    finally:
        server.shutdown()
    with pytest.raises(CoreError) as raised:
        HttpCoreClient("http://127.0.0.1:9", ring).history(ctx(), ctx()["history_view"], None, timeout=1)
    assert raised.value.code == "UNAVAILABLE"


def test_event_transport_returns_core_ack_and_classifies_failures():
    ring = keyring("a2c-1")
    event = {"event_id": "e1"}
    acks = iter([(409, {"outcome": "CONFLICT"}), (401, None), (503, {"error": {}}), (200, None)])
    server = CoreHttpDouble(ring, {"/api/v1/internal/agent/events": lambda p: next(acks)})
    try:
        transport = HttpEventTransport(server.base, ring, timeout_s=2)
        assert transport.post_event(event) == {"outcome": "CONFLICT"}
        for code in ("AUTH_FAILED", "UNAVAILABLE", "INVALID_ACK"):
            with pytest.raises(TransportError) as raised:
                transport.post_event(event)
            assert raised.value.code == code
        assert server.seen[0] == ("POST", "/api/v1/internal/agent/events", {}, event)
    finally:
        server.shutdown()


# ---------------------------------------------------------------------------------------------- delivery (no DB)

POLICY = DeliveryPolicy(initial_s=1, max_s=60, jitter=0.2, max_age_s=86400)


def test_backoff_doubles_to_the_cap_with_bounded_jitter():
    assert [DeliveryPolicy(1, 60, 0, 10).delay(n) for n in range(8)] == [1, 2, 4, 8, 16, 32, 60, 60]
    assert 0.8 <= POLICY.delay(0, rand=lambda: 0) <= POLICY.delay(0, rand=lambda: 0.999) <= 1.2
    with pytest.raises(ValueError):
        DeliveryPolicy(0, 60, 0.2, 10)


class FakeOutbox:
    def __init__(self, items):
        self.items, self.acks, self.given_up = items, [], []

    def pending_deliveries(self, limit=50):
        return [i for i in self.items if i["event"]["event_id"] not in {a[0] for a in self.acks if a[1]} |
                set(self.given_up)]

    def ack_event(self, event_id, ack, *, retry_after_s=0, failure=None):
        stop = bool(ack and ack["outcome"] in ("ACCEPTED", "DUPLICATE", "IGNORED_STALE", "CONFLICT"))
        self.acks.append((event_id, stop, retry_after_s, failure))

    def give_up_event(self, event_id, failure):
        self.given_up.append(event_id)


def outbox_event(age_s=1.0, attempts=0):
    event = {"schema_version": "agent-v1", "run_id": str(uuid.uuid4()), "attempt_id": str(uuid.uuid4()),
             "event_id": str(uuid.uuid4()), "sequence": 1, "kind": "RESULT", "payload": {"result": RESULT}}
    return {"event": contracts.validate("AgentEvent", event), "age_s": age_s, "attempts": attempts}


def ack_for(event, outcome, reason=None):
    return {"outcome": outcome, "run_id": event["run_id"], "attempt_id": event["attempt_id"],
            "event_id": event["event_id"], "reason": reason}


class ScriptedTransport:
    def __init__(self, answers):
        self.answers, self.sent = answers, []

    def post_event(self, event):
        self.sent.append(copy.deepcopy(event))
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer(event) if callable(answer) else answer


def test_delivery_stops_on_final_acks_and_keeps_rejected_or_unacknowledged_events():
    items = [outbox_event() for _ in range(7)]
    answers = [lambda e: ack_for(e, "ACCEPTED"), lambda e: ack_for(e, "DUPLICATE"),
               lambda e: ack_for(e, "IGNORED_STALE", "ATTEMPT_NOT_CURRENT"),
               lambda e: ack_for(e, "CONFLICT", "PAYLOAD_MISMATCH"), lambda e: ack_for(e, "REJECTED", "UNKNOWN_RUN"),
               TransportError("TIMEOUT"), lambda e: {**ack_for(e, "ACCEPTED"), "event_id": str(uuid.uuid4())}]
    outbox, transport = FakeOutbox(items), ScriptedTransport(answers)
    report = deliver_pending(outbox, transport, POLICY, rand=lambda: 0.5)
    assert report.acked == {"ACCEPTED": 1, "DUPLICATE": 1, "IGNORED_STALE": 1, "CONFLICT": 1}
    assert report.conflicts == [items[3]["event"]["event_id"]]
    assert report.retried == {"REJECTED_UNKNOWN_RUN": 1, "TIMEOUT": 1, "INVALID_ACK": 1}  # ack for another event
    assert [a[1] for a in outbox.acks] == [True, True, True, True, False, False, False]
    assert all(a[2] == 1.0 for a in outbox.acks if not a[1])
    assert transport.sent == [i["event"] for i in items]  # stored events sent unchanged


def test_delivery_gives_up_after_max_age_without_sending():
    old = outbox_event(age_s=86401, attempts=900)
    outbox, transport = FakeOutbox([old]), ScriptedTransport([])
    report = deliver_pending(outbox, transport, POLICY)
    assert report.gave_up == 1 and transport.sent == [] and outbox.given_up == [old["event"]["event_id"]]


# ---------------------------------------------------------------------------------------------- end to end on PostgreSQL

class CoreDouble:
    """Applies events like Core's applyEvent dedup (12.3): same event id + same hash -> DUPLICATE, other content ->
    CONFLICT, attempt no longer current -> IGNORED_STALE. `lose_acks` commits but loses the response."""

    def __init__(self):
        self.applied, self.sends, self.messages = {}, [], []
        self.stale, self.lose_acks = set(), 0

    def post_event(self, event):
        self.sends.append(copy.deepcopy(event))
        if event["attempt_id"] in self.stale:
            ack = ack_for(event, "IGNORED_STALE", "ATTEMPT_NOT_CURRENT")
        elif event["event_id"] in self.applied:
            same = self.applied[event["event_id"]] == sha256_json(event)
            ack = ack_for(event, "DUPLICATE") if same else ack_for(event, "CONFLICT", "PAYLOAD_MISMATCH")
        else:
            self.applied[event["event_id"]] = sha256_json(event)
            if event["kind"] == "RESULT":
                self.messages.append(event["payload"]["result"]["message"])
            ack = ack_for(event, "ACCEPTED")
        if self.lose_acks:
            self.lose_acks -= 1
            raise TransportError("TIMEOUT")  # committed on Core, response lost
        return ack


class Scoped:
    """Store view limited to this test's attempts (the shared test database may hold other rows)."""

    def __init__(self, store, attempts):
        self._store, self._attempts_of = store, attempts

    @property
    def _attempts(self):
        return self._attempts_of()

    def __getattr__(self, name):
        return getattr(self._store, name)

    def recoverable(self):
        return [r for r in self._store.recoverable() if r[1] in self._attempts]

    def pending_deliveries(self, limit=50):
        return [d for d in self._store.pending_deliveries(500) if d["event"]["attempt_id"] in self._attempts][:limit]


FAST = DeliveryPolicy(initial_s=0.01, max_s=0.01, jitter=0, max_age_s=3600)


@pytest.fixture
def db():
    from test_store import Ids

    if not DSN:
        pytest.skip("store test database DSN not configured")
    ids = Ids()
    stores = []

    def open_store():
        stores.append(PgRuntimeStore(DSN))
        return Scoped(stores[-1], lambda: {r["attempt_id"] for r in ids.requests})

    yield ids, open_store
    ids.cleanup(stores[0] if stores else PgRuntimeStore(DSN))
    for s in stores:
        s.close()


def graph_builder(model, core=None):
    from life_agent.graph import build_graph

    return lambda runtime, saver: build_graph(runtime, core or FakeCore(), FakeRetrieval(), model, config(),
                                              clock=ManualClock(), checkpointer=saver)


def deliver_until_quiet(store, core, rounds=5):
    for _ in range(rounds):
        time.sleep(0.02)
        deliver_pending(store, core, FAST)


@needs_db
def test_restart_after_lost_ack_redelivers_without_graph(db):
    ids, open_store = db
    req = ids.request()
    ring = keyring()
    store = open_store()
    svc = AgentService(store, ring, clock=time.time)
    assert call(svc, ring, "/internal/runs", req, now=time.time())[0] == 202
    model = ScriptedModel([reply(draft(RESULT["message"]))])
    tools = FakeCore()
    Worker(store, graph_builder(model, tools), worker_id="w1", lease_seconds=30).run_once()
    persisted = store.final_event(req["attempt_id"])
    core = CoreDouble()
    core.lose_acks = 1
    deliver_pending(store, core, FAST)  # Core commits, the ACK is lost
    assert store.event_delivery(persisted["event_id"])["ack_outcome"] is None

    # --- restart: new store connections, new worker; Core resends its RunRequest (new nonce, same ids)
    restarted = open_store()
    svc2 = AgentService(restarted, ring, clock=time.time)
    status, ack = call(svc2, ring, "/internal/runs", req, now=time.time())
    assert (status, ack["outcome"]) == (200, "DUPLICATE")
    model2, tools2 = ScriptedModel([]), FakeCore()
    assert Worker(restarted, graph_builder(model2, tools2), worker_id="w2", lease_seconds=30).run_once() == []
    deliver_until_quiet(restarted, core)
    resent_event = core.sends[-1]
    assert resent_event == persisted  # run/attempt/event/sequence/payload all equal
    assert model2.contexts == [] and tools2.calls == []
    assert core.messages == [RESULT["message"]]  # accepted_message_count == 1
    assert restarted.event_delivery(persisted["event_id"])["ack_outcome"] == "DUPLICATE"


@needs_db
def test_crash_matrix_on_the_agent_side(db):
    ids, open_store = db
    ring = keyring()
    store = open_store()

    # 3: Agent store fails before the receipt commits -> no ACK -> Core resends -> ACCEPTED
    req = ids.request("m1")
    class Down:
        def accept_run(self, request):
            raise OSError("connection lost before commit")

    failing = AgentService(Down(), ring, nonces=MemoryNonces(), clock=time.time)
    assert call(failing, ring, "/internal/runs", req, now=time.time())[0] == 503
    assert store.receipt(req["attempt_id"]) is None
    svc = AgentService(store, ring, clock=time.time)
    assert call(svc, ring, "/internal/runs", req, now=time.time())[0] == 202

    # 4: receipt committed, ACK lost -> resend is DUPLICATE, nothing runs twice
    assert call(svc, ring, "/internal/runs", req, now=time.time())[1]["outcome"] == "DUPLICATE"

    # 7: final event committed, process dies before the callback -> a new process delivers it, no graph
    model = ScriptedModel([reply(draft(RESULT["message"]))])
    Worker(store, graph_builder(model), worker_id="w1", lease_seconds=30).run_once()
    event = store.final_event(req["attempt_id"])
    fresh = open_store()
    core = CoreDouble()
    report = deliver_pending(fresh, core, FAST)
    assert report.acked == {"ACCEPTED": 1} and core.sends == [event]

    # 16: Core already holds the same event id with other content -> CONFLICT stops resending (incident)
    req2 = ids.request("m2")
    call(svc, ring, "/internal/runs", req2, now=time.time())
    Worker(store, graph_builder(ScriptedModel([reply(draft("Bản khác."))])), worker_id="w1", lease_seconds=30).run_once()
    second = store.final_event(req2["attempt_id"])
    core.applied[second["event_id"]] = "other-content"
    report = deliver_pending(fresh, core, FAST)
    assert report.conflicts == [second["event_id"]]
    deliver_until_quiet(fresh, core, rounds=2)
    assert sum(1 for e in core.sends if e["event_id"] == second["event_id"]) == 1


@needs_db
def test_takeover_while_a_tool_waits_stops_the_old_writer_and_its_late_event(db):
    ids, open_store = db
    ring = keyring()
    req = ids.request()
    store, worker_store = open_store(), open_store()
    svc = AgentService(store, ring, clock=time.time)
    call(svc, ring, "/internal/runs", req, now=time.time())
    waiting, release = threading.Event(), threading.Event()

    class SlowCore(FakeCore):
        def list_contracts(self, ctx, *, timeout):
            waiting.set()
            release.wait(10)
            return []

    model = ScriptedModel([reply(tool("list_contracts")), reply(draft("Không thấy hợp đồng."))])
    finished = []
    thread = threading.Thread(target=lambda: finished.append(
        Worker(worker_store, graph_builder(model, SlowCore()), worker_id="w1", lease_seconds=30).run_once()))
    thread.start()
    assert waiting.wait(10)
    target = f"/internal/attempts/{req['attempt_id']}/revoke"
    status, ack = call(svc, ring, target, revocation_of(req), now=time.time())
    assert (status, ack["outcome"]) == (200, "REVOKED")
    release.set()
    thread.join(20)
    assert finished == [[]]  # the worker stopped the attempt (StaleWriter), nothing finalized
    assert store.final_event(req["attempt_id"]) is None and store.receipt(req["attempt_id"])["status"] == "REVOKED"
    assert [d for d in store.pending_deliveries() if d["event"]["kind"] != "PROGRESS"] == []
    # a progress event written before the revoke is late now: Core ignores it, delivery stops
    core = CoreDouble()
    core.stale.add(req["attempt_id"])
    deliver_until_quiet(store, core, rounds=2)
    assert core.messages == [] and store.pending_deliveries() == []


@needs_db
def test_nonce_store_is_durable_and_windowed(db):
    ids, open_store = db
    store, other = open_store(), open_store()
    nonce = b64url(secrets.token_bytes(16))
    assert store.remember_nonce("test-key", nonce, 600) is True
    assert other.remember_nonce("test-key", nonce, 600) is False  # another connection/process sees it
    assert other.remember_nonce("test-key-2", nonce, 600) is True
    with store.transaction() as cur:
        cur.execute("UPDATE agent_runtime.request_nonces SET received_at = now() - interval '11 minutes' "
                    "WHERE nonce = %s", (nonce,))
    assert store.remember_nonce("test-key", nonce, 600) is True  # outside the window
    with store.transaction() as cur:
        cur.execute("DELETE FROM agent_runtime.request_nonces WHERE nonce = %s", (nonce,))


@needs_db
def test_gave_up_event_is_reopened_by_a_core_resend(db):
    ids, open_store = db
    ring = keyring()
    req = ids.request()
    store = open_store()
    svc = AgentService(store, ring, clock=time.time)
    call(svc, ring, "/internal/runs", req, now=time.time())
    Worker(store, graph_builder(ScriptedModel([reply(draft(RESULT["message"]))])), worker_id="w",
           lease_seconds=30).run_once()
    event = store.final_event(req["attempt_id"])
    report = deliver_pending(store, CoreDouble(), DeliveryPolicy(0.01, 0.01, 0, max_age_s=0.0001))
    assert report.gave_up == 1 and store.event_delivery(event["event_id"])["gave_up"] is True
    assert store.pending_deliveries() == []
    assert call(svc, ring, "/internal/runs", req, now=time.time())[1]["outcome"] == "DUPLICATE"
    core = CoreDouble()
    deliver_pending(store, core, FAST)
    assert core.sends == [event]


def test_keys_and_delivery_schedule_come_from_configuration_only():
    from life_agent.config import ConfigError
    from life_agent.http import keyring_from_env

    k1, k2 = b64url(secrets.token_bytes(32)), b64url(secrets.token_bytes(32))
    env = {"LIFE_AGENT_CORE_TO_AGENT_KEY_ID": "c2a-2", "LIFE_AGENT_CORE_TO_AGENT_KEYS": f"c2a-1:{k1}, c2a-2:{k2}",
           "LIFE_AGENT_DELIVERY_INITIAL_S": "1", "LIFE_AGENT_DELIVERY_MAX_S": "60", "LIFE_AGENT_DELIVERY_JITTER": "0.2",
           "LIFE_AGENT_DELIVERY_MAX_AGE_S": "86400"}
    ring = keyring_from_env(env, "LIFE_AGENT_CORE_TO_AGENT")
    assert ring.current_id == "c2a-2" and set(ring.keys) == {"c2a-1", "c2a-2"}
    assert DeliveryPolicy.from_env(env) == POLICY
    with pytest.raises(ConfigError):
        keyring_from_env(env, "LIFE_AGENT_AGENT_TO_CORE")  # missing: startup fails, nothing is defaulted
    with pytest.raises(ConfigError):
        DeliveryPolicy.from_env({})
