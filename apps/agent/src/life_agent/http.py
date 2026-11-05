"""Agent HTTP surface, callback delivery and the background worker (plan Task 6; contracts/agent-v1.md 12.4, 12.9, 12.10).

Request handlers only authenticate -> store -> ACK; the graph never runs inside a request. The worker picks accepted
receipts from the database (the same path after a restart), and the delivery loop sends stored, immutable events to
Core until Core acknowledges them. Nothing here logs bodies, signatures, keys or URLs; log lines carry IDs and codes.

    python -m life_agent.http serve      # uvicorn + worker + delivery (needs the env described in README)

Starlette/uvicorn are imported only by `create_app`/`serve`, so the handlers, delivery and worker are testable
with the standard library.
"""
from __future__ import annotations

import argparse
import json
import logging
import random
import re
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Callable, Mapping, Protocol
from urllib.parse import urlsplit

from . import contracts
from .contracts import ContractError
from .signing import MAX_BODY_BYTES, AuthFailed, Keyring, NonceStore, ReplayRejected, sign, verify

log = logging.getLogger("life_agent.http")

RUNS_PATH = "/internal/runs"
_REVOKE = re.compile(r"^/internal/attempts/([0-9a-f-]{36})/revoke$")
EVENTS_PATH = "/api/v1/internal/agent/events"
_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
_RUN_STATUS = {"ACCEPTED": 202, "DUPLICATE": 200, "IGNORED_STALE": 200, "CONFLICT": 409}
STOP_OUTCOMES = ("ACCEPTED", "DUPLICATE", "IGNORED_STALE", "CONFLICT")


def _error(code: str) -> dict[str, Any]:
    return {"error": {"code": code}}


def _rejected(payload: Any, reason: str) -> dict[str, Any]:
    """A REJECTED DurableAck when trustworthy IDs exist in an authenticated body, else a bare error."""
    if isinstance(payload, dict) and all(isinstance(payload.get(k), str) and _UUID.match(payload[k])
                                         for k in ("run_id", "attempt_id")):
        return {"outcome": "REJECTED", "run_id": payload["run_id"], "attempt_id": payload["attempt_id"],
                "event_id": None, "reason": reason}
    return _error(reason)


# ---------------------------------------------------------------------------------------------- inbound (Core -> Agent)

class AgentService:
    """Framework-independent handlers for the two Core -> Agent endpoints and /healthz.

    `store` needs accept_run, revoke and remember_nonce (PgRuntimeStore). `notify` wakes the worker/delivery loops
    after a receipt was stored (ACCEPTED) or a resend asked for pending events again (DUPLICATE)."""

    def __init__(self, store: Any, keyring: Keyring, *, nonces: NonceStore | None = None,
                 clock: Callable[[], float] = time.time, notify: Callable[[], None] | None = None) -> None:
        self._store = store
        self._keyring = keyring
        self._nonces = nonces or store
        self._clock = clock
        self._notify = notify or (lambda: None)

    def handle(self, method: str, target: str, headers: Mapping[str, str], body: bytes) -> tuple[int, dict[str, Any]]:
        path = urlsplit(target).path
        if path == "/healthz":
            return (200, {"status": "ok"}) if method == "GET" else (405, _error("METHOD_NOT_ALLOWED"))
        revoke = _REVOKE.match(path)
        if path != RUNS_PATH and not revoke:
            return 404, _error("NOT_FOUND")
        if method != "POST":
            return 405, _error("METHOD_NOT_ALLOWED")
        try:
            verify(self._keyring, self._nonces, method, target, headers, body, now=self._clock)
        except ReplayRejected:
            return 401, _error("REPLAY_REJECTED")
        except AuthFailed:
            return 401, _error("AUTH_FAILED")
        try:
            payload = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            return 400, _error("SCHEMA_INVALID")
        try:
            if revoke:
                return self._revoke(revoke.group(1), payload)
            return self._run(payload)
        except ContractError:
            return 400, _rejected(payload, "SCHEMA_INVALID")
        except Exception as error:  # noqa: BLE001 - store unavailable: no ACK, Core resends the same request
            log.warning("store unavailable while handling %s: %s", path, type(error).__name__)
            return 503, _error("UNAVAILABLE")

    def _run(self, payload: Any) -> tuple[int, dict[str, Any]]:
        contracts.validate("RunRequest", payload)
        ack = self._store.accept_run(payload)
        if ack["outcome"] in ("ACCEPTED", "DUPLICATE"):
            self._notify()
        log.info("run receipt %s attempt=%s outcome=%s", ack["run_id"], ack["attempt_id"], ack["outcome"])
        return _RUN_STATUS[ack["outcome"]], ack

    def _revoke(self, attempt_id: str, payload: Any) -> tuple[int, dict[str, Any]]:
        contracts.validate("AttemptRevocation", payload)
        if payload["attempt_id"] != attempt_id:
            return 400, {"outcome": "REJECTED", "run_id": payload["run_id"], "attempt_id": payload["attempt_id"],
                         "writer_epoch": None, "reason": "SCHEMA_INVALID"}
        ack = self._store.revoke(payload)
        log.info("revoke attempt=%s reason=%s outcome=%s", attempt_id, payload["reason"], ack["outcome"])
        return 200, ack


def create_app(service: AgentService):
    """Starlette app around AgentService. The raw body (capped at 1 MiB + 1 byte) and the raw path+query are what
    the signature covers; handlers run in the thread pool because the store is synchronous."""
    from starlette.applications import Starlette
    from starlette.concurrency import run_in_threadpool
    from starlette.responses import JSONResponse
    from starlette.routing import Route

    async def endpoint(request):
        chunks, size = [], 0
        async for chunk in request.stream():
            chunks.append(chunk)
            size += len(chunk)
            if size > MAX_BODY_BYTES:
                break  # verify() refuses it; no need to read the rest
        body = b"".join(chunks)[: MAX_BODY_BYTES + 1]
        raw = request.scope.get("raw_path") or request.url.path.encode()
        target = raw.decode("latin-1") + ("?" + request.url.query if request.url.query else "")
        status, payload = await run_in_threadpool(service.handle, request.method, target, dict(request.headers), body)
        return JSONResponse(payload, status_code=status)

    routes = [Route(RUNS_PATH, endpoint, methods=["POST"]),
              Route("/internal/attempts/{attempt_id}/revoke", endpoint, methods=["POST"]),
              Route("/healthz", endpoint, methods=["GET"])]
    return Starlette(routes=routes)


# ---------------------------------------------------------------------------------------------- outbound (Agent -> Core)

class TransportError(Exception):
    """No usable ACK. code: TIMEOUT | UNAVAILABLE | AUTH_FAILED | INVALID_ACK."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


class EventTransport(Protocol):
    def post_event(self, event: Mapping[str, Any]) -> dict[str, Any]: ...


def _opener() -> urllib.request.OpenerDirector:
    """Internal service calls never go through an environment proxy."""
    return urllib.request.build_opener(urllib.request.ProxyHandler({}))


def signed_post(opener: urllib.request.OpenerDirector, keyring: Keyring, url: str, payload: Mapping[str, Any], *,
                timeout: float) -> tuple[int, Any]:
    """POST JSON with LI-HMAC-SHA256-v1 headers (new timestamp/nonce per call). Returns (status, parsed body or None)."""
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    parts = urlsplit(url)
    target = parts.path + ("?" + parts.query if parts.query else "")
    headers = {"Content-Type": "application/json", **sign(keyring, "POST", target, body)}
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with opener.open(request, timeout=timeout) as response:
            status, raw = response.status, response.read(MAX_BODY_BYTES + 1)
    except urllib.error.HTTPError as error:
        status, raw = error.code, error.read(MAX_BODY_BYTES + 1)
    except TimeoutError:
        raise TransportError("TIMEOUT") from None
    except urllib.error.URLError as error:
        raise TransportError("TIMEOUT" if isinstance(error.reason, TimeoutError) else "UNAVAILABLE") from None
    except OSError:
        raise TransportError("UNAVAILABLE") from None
    try:
        return status, json.loads(raw.decode("utf-8")) if raw and len(raw) <= MAX_BODY_BYTES else None
    except (UnicodeDecodeError, ValueError):
        return status, None


class HttpEventTransport:
    """Sends AgentEvents to Core's callback endpoint. The base URL comes from configuration only."""

    def __init__(self, base_url: str, keyring: Keyring, *, timeout_s: float = 10.0,
                 opener: urllib.request.OpenerDirector | None = None) -> None:
        self._url = base_url.rstrip("/") + EVENTS_PATH
        self._keyring = keyring
        self._timeout = timeout_s
        self._opener = opener or _opener()

    def post_event(self, event: Mapping[str, Any]) -> dict[str, Any]:
        status, body = signed_post(self._opener, self._keyring, self._url, event, timeout=self._timeout)
        if status == 401:
            raise TransportError("AUTH_FAILED")
        if status >= 500:
            raise TransportError("UNAVAILABLE")
        if not isinstance(body, dict):
            raise TransportError("INVALID_ACK")
        return body


@dataclass(frozen=True)
class DeliveryPolicy:
    """Resend schedule (12.10, proposal not yet decided): exponential backoff with jitter, then give up after
    max_age_s and record an incident. The 3 s / 4 requests / 1 retry of Business Tools do not apply here."""

    initial_s: float
    max_s: float
    jitter: float
    max_age_s: float

    def __post_init__(self) -> None:
        if not (0 < self.initial_s <= self.max_s and 0 <= self.jitter < 1 and self.max_age_s > 0):
            raise ValueError("invalid delivery policy")

    @classmethod
    def from_env(cls, env: Mapping[str, str]) -> "DeliveryPolicy":
        from .config import require

        return cls(float(require(env, "LIFE_AGENT_DELIVERY_INITIAL_S")), float(require(env, "LIFE_AGENT_DELIVERY_MAX_S")),
                   float(require(env, "LIFE_AGENT_DELIVERY_JITTER")), float(require(env, "LIFE_AGENT_DELIVERY_MAX_AGE_S")))

    def delay(self, attempts: int, rand: Callable[[], float] = random.random) -> float:
        base = min(self.max_s, self.initial_s * 2 ** min(attempts, 30))
        return round(base * (1 + self.jitter * (2 * rand() - 1)), 3)


@dataclass
class DeliveryReport:
    sent: int = 0
    acked: dict[str, int] = field(default_factory=dict)
    retried: dict[str, int] = field(default_factory=dict)
    gave_up: int = 0
    conflicts: list[str] = field(default_factory=list)


def _usable_ack(ack: Any, event: Mapping[str, Any]) -> dict[str, Any] | None:
    try:
        ack = contracts.validate("DurableAck", ack)
    except ContractError:
        return None
    if (ack["run_id"], ack["attempt_id"], ack["event_id"]) != (event["run_id"], event["attempt_id"], event["event_id"]):
        return None
    return ack


def deliver_pending(store: Any, transport: EventTransport, policy: DeliveryPolicy, *, limit: int = 50,
                    rand: Callable[[], float] = random.random) -> DeliveryReport:
    """One pass over due events. Each send is the stored event unchanged (same run/attempt/event/sequence/payload);
    only the signature headers are new. ACCEPTED/DUPLICATE/IGNORED_STALE/CONFLICT stop resending (CONFLICT is an
    incident); REJECTED or no usable ACK are resent with backoff until max age."""
    report = DeliveryReport()
    for item in store.pending_deliveries(limit):
        event = item["event"]
        event_id = event["event_id"]
        if item["age_s"] > policy.max_age_s:
            store.give_up_event(event_id, "MAX_AGE")
            report.gave_up += 1
            log.error("incident: delivery given up event=%s attempt=%s after %d sends", event_id, event["attempt_id"],
                      item["attempts"])
            continue
        report.sent += 1
        try:
            ack = _usable_ack(transport.post_event(event), event)
            failure = None if ack else "INVALID_ACK"
        except TransportError as error:
            ack, failure = None, error.code
        if ack is not None and ack["outcome"] in STOP_OUTCOMES:
            store.ack_event(event_id, ack)
            report.acked[ack["outcome"]] = report.acked.get(ack["outcome"], 0) + 1
            if ack["outcome"] == "CONFLICT":
                report.conflicts.append(event_id)
                log.error("incident: Core reported CONFLICT (%s) for event=%s attempt=%s", ack["reason"], event_id,
                          event["attempt_id"])
            continue
        if ack is not None:  # REJECTED: keep the stored event, never rewrite its payload
            failure = f"REJECTED_{ack['reason']}" if ack["reason"] else "REJECTED"
        store.ack_event(event_id, ack, retry_after_s=policy.delay(item["attempts"], rand), failure=failure)
        report.retried[failure] = report.retried.get(failure, 0) + 1
    return report


# ---------------------------------------------------------------------------------------------- worker

class Worker:
    """Runs accepted receipts read from the store: fresh ones and, after a restart, those whose lease expired.
    A FINALIZED receipt is never run again (execute_attempt returns its stored event)."""

    def __init__(self, store: Any, build: Callable[[Any, Any], Any], *, worker_id: str, lease_seconds: float) -> None:
        self._store = store
        self._build = build
        self._worker_id = worker_id
        self._lease = lease_seconds

    def run_once(self) -> list[str]:
        from .store import LeaseHeld, StaleWriter, execute_attempt

        finished = []
        for run_id, attempt_id in self._store.recoverable():
            try:
                event = execute_attempt(self._store, run_id, attempt_id, self._build, worker_id=self._worker_id,
                                        lease_seconds=self._lease)
            except (LeaseHeld, StaleWriter):
                continue  # another worker holds it, or Core revoked it meanwhile
            except Exception as error:  # noqa: BLE001 - the lease expires and the receipt is picked up again
                log.warning("attempt=%s stopped: %s", attempt_id, type(error).__name__)
                continue
            if event is not None:
                finished.append(event["event_id"])
                log.info("attempt=%s finalized event=%s kind=%s", attempt_id, event["event_id"], event["kind"])
        return finished


class Loop(threading.Thread):
    """Calls `step` every `interval_s` seconds, or sooner when woken; stops with `stop()`."""

    def __init__(self, name: str, step: Callable[[], Any], interval_s: float) -> None:
        super().__init__(name=name, daemon=True)
        self._step, self._interval = step, interval_s
        self._wake, self._stopped = threading.Event(), threading.Event()

    def wake(self) -> None:
        self._wake.set()

    def stop(self) -> None:
        self._stopped.set()
        self._wake.set()

    def run(self) -> None:
        while not self._stopped.is_set():
            try:
                self._step()
            except Exception as error:  # noqa: BLE001 - keep the loop alive; the next pass retries
                log.warning("%s pass failed: %s", self.name, type(error).__name__)
            self._wake.wait(self._interval)
            self._wake.clear()


# ---------------------------------------------------------------------------------------------- service wiring

def keyring_from_env(env: Mapping[str, str], prefix: str) -> Keyring:
    """`<prefix>_KEY_ID` signs; `<prefix>_KEYS` = "id:base64url,id2:base64url" (old ids verify-only)."""
    from .config import require

    pairs = dict(item.split(":", 1) for item in require(env, f"{prefix}_KEYS").split(",") if item.strip())
    return Keyring.from_config(require(env, f"{prefix}_KEY_ID"), {k.strip(): v.strip() for k, v in pairs.items()})


def build_service(env: Mapping[str, str]) -> dict[str, Any]:
    """Wire stores, Core client, retrieval, model and graph from env + the runtime config file (trial-config format)."""
    from pathlib import Path

    from .config import AgentConfig, require
    from .core_client import HttpCoreClient
    from .graph import build_graph
    from .model import EmbeddingConfig, GeminiEmbedding, GeminiModel, GenerationConfig
    from .retrieval import PgIndexReader, RetrievalService, SearchConfig, SearchEngine
    from .store import PgRuntimeStore

    runtime = json.loads(Path(require(env, "LIFE_AGENT_RUNTIME_CONFIG")).read_text(encoding="utf-8"))
    inbound = keyring_from_env(env, "LIFE_AGENT_CORE_TO_AGENT")   # verifies Core -> Agent
    outbound = keyring_from_env(env, "LIFE_AGENT_AGENT_TO_CORE")  # signs Agent -> Core
    core_url = require(env, "LIFE_AGENT_CORE_BASE_URL")
    dsn = require(env, "LIFE_AGENT_STORE_DSN")
    core = HttpCoreClient(core_url, outbound)
    embedding = EmbeddingConfig.from_mapping(runtime["embedding"])
    search = SearchConfig.from_mapping(runtime["search"])
    engine = SearchEngine(PgIndexReader(require(env, "LIFE_AGENT_RAG_RETRIEVER_DSN")), GeminiEmbedding(env), embedding)
    retrieval = RetrievalService(core, engine, search)
    model = GeminiModel(GenerationConfig.from_mapping(runtime["generation"]), env)
    agent_config = AgentConfig(**runtime["agent"])

    def build(store, saver):
        return build_graph(store, core, retrieval, model, agent_config, checkpointer=saver)

    return {"http_store": PgRuntimeStore(dsn), "worker_store": PgRuntimeStore(dsn), "delivery_store": PgRuntimeStore(dsn),
            "inbound": inbound, "transport": HttpEventTransport(core_url, outbound), "build": build,
            "policy": DeliveryPolicy.from_env(env), "lease_s": float(require(env, "LIFE_AGENT_LEASE_S")),
            "host": env.get("LIFE_AGENT_HTTP_HOST", "127.0.0.1"), "port": int(env.get("LIFE_AGENT_HTTP_PORT", "8090"))}


def serve(env: Mapping[str, str]) -> None:
    import socket
    import uuid

    import uvicorn

    parts = build_service(env)
    worker = Worker(parts["worker_store"], parts["build"], worker_id=f"{socket.gethostname()}:{uuid.uuid4().hex[:8]}",
                    lease_seconds=parts["lease_s"])
    work_loop = Loop("worker", worker.run_once, 2.0)
    delivery_loop = Loop("delivery", lambda: deliver_pending(parts["delivery_store"], parts["transport"],
                                                             parts["policy"]), 1.0)

    def notify() -> None:
        work_loop.wake()
        delivery_loop.wake()

    service = AgentService(parts["http_store"], parts["inbound"], notify=notify)
    work_loop.start()
    delivery_loop.start()
    try:
        uvicorn.run(create_app(service), host=parts["host"], port=parts["port"], access_log=False,
                    log_level="info", server_header=False)
    finally:
        work_loop.stop()
        delivery_loop.stop()


def _main(argv: list[str] | None = None) -> int:
    from .config import load_env

    parser = argparse.ArgumentParser(description="Agent HTTP service (Task 6).")
    parser.add_argument("command", choices=("serve",))
    parser.add_argument("--env-file")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    serve(load_env(args.env_file))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
