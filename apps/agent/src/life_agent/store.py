"""Runtime store used by the graph: interface, in-memory double and the durable PostgreSQL store (Task 4).

The durable store follows contracts/agent-v1.md section 12 and the G2/G3 proposals recorded on 06/11/2026: receipts keyed by
attempt, one writer per thread fenced by (thread_id, attempt_id, writer_epoch) inside the same transaction as every
write, a per-message ledger reserved before external calls, and an immutable final event committed together with the
completion marker. It lives in schema agent_runtime with its own roles; it never touches business or rag.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any, Mapping, Protocol

from . import contracts


class BudgetExhausted(Exception):
    """A reservation would exceed the per-message cap. Adapters must not send the request after this."""

    def __init__(self, kind: str):
        self.kind = kind
        super().__init__(f"budget exhausted: {kind}")


class StaleWriter(BaseException):
    """The attempt/claim no longer owns the thread. A BaseException on purpose: graph and adapter code that catches
    Exception must not swallow it and carry on sending requests or saving state."""


class AttemptInvalid(Exception):
    """Core reported the attempt as invalid/revoked. The turn stops; nothing more is published for it."""


@dataclass(frozen=True)
class Reservation:
    message_id: str
    kind: str
    operation_id: str
    amount: int


class RuntimeStore(Protocol):
    def open_message(self, message_id: str, caps: Mapping[str, int]) -> None:
        """Create the per-message ledger once. Replays and new attempts of the same message keep usage."""

    def reserve(self, message_id: str, kind: str, operation_id: str, amount: int = 1) -> Reservation:
        """Atomically reserve before an external call; raises BudgetExhausted. A reservation is spent even if
        the call never returns."""

    def settle(self, message_id: str, kind: str, operation_id: str, actual: int) -> None:
        """Replace a reservation amount with the measured usage (tokens). Never increases remaining budget for
        reservations whose outcome is unknown."""

    def usage(self, message_id: str) -> Mapping[str, int]:
        """Current spent amounts per kind."""

    def persist_final(self, execution: Mapping[str, Any], outcome: Mapping[str, Any]) -> dict[str, Any]:
        """Store the final result or technical failure as an immutable AgentEvent before any callback.
        outcome is {"result": AgentResult} or {"failure": TechnicalFailure}."""


class MemoryStore:
    """Ledger semantics of the planned durable store, in memory only: for tests and local evaluation runs.
    No durability, no fencing, no checkpoint ownership; never a substitute for the Task 4 store."""

    def __init__(self) -> None:
        self.caps: dict[str, dict[str, int]] = {}
        self.used: dict[str, dict[str, int]] = {}
        self.reservations: dict[tuple[str, str, str], int] = {}
        self.events: list[dict] = []
        self.sequences: dict[str, int] = {}

    def open_message(self, message_id: str, caps: dict[str, int]) -> None:
        if message_id not in self.caps:
            self.caps[message_id] = dict(caps)
            self.used[message_id] = {kind: 0 for kind in caps}

    def reserve(self, message_id: str, kind: str, operation_id: str, amount: int = 1) -> Reservation:
        key = (message_id, kind, operation_id)
        if key in self.reservations:
            return Reservation(message_id, kind, operation_id, self.reservations[key])
        if self.used[message_id][kind] + amount > self.caps[message_id][kind]:
            raise BudgetExhausted(kind)
        self.used[message_id][kind] += amount
        self.reservations[key] = amount
        return Reservation(message_id, kind, operation_id, amount)

    def settle(self, message_id: str, kind: str, operation_id: str, actual: int) -> None:
        key = (message_id, kind, operation_id)
        self.used[message_id][kind] += actual - self.reservations[key]
        self.reservations[key] = actual

    def usage(self, message_id: str) -> dict[str, int]:
        return dict(self.used.get(message_id, {}))

    def persist_final(self, execution: dict, outcome: dict) -> dict:
        attempt = execution["attempt_id"]
        self.sequences[attempt] = self.sequences.get(attempt, 0) + 1
        kind = "RESULT" if "result" in outcome else "ERROR"
        event = {"schema_version": "agent-v1", "run_id": execution["run_id"], "attempt_id": attempt,
                 "event_id": str(uuid.uuid4()), "sequence": self.sequences[attempt], "kind": kind,
                 "payload": {"result": outcome["result"]} if kind == "RESULT" else {"failure": outcome["failure"]}}
        contracts.validate("AgentEvent", event)
        self.events.append(event)
        return event


# ==================================================================================================== durable store

import hashlib  # noqa: E402
import json  # noqa: E402
import threading  # noqa: E402
from pathlib import Path  # noqa: E402
from typing import Callable, Iterator, Sequence  # noqa: E402

MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "migrations"
SCHEMA = "agent_runtime"


class LeaseHeld(Exception):
    """Another live worker holds the execution lease of this attempt."""


class EventConflict(Exception):
    """Same event id with a different payload, or a sequence already used by another event."""


class CheckpointConflict(Exception):
    """The checkpoint head moved under a valid lease (should not happen with one writer per thread)."""


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class ExecutionLease:
    run_id: str
    attempt_id: str
    message_id: str
    thread_id: str
    writer_epoch: int
    worker_id: str


def _ack(outcome: str, run_id: str, attempt_id: str, reason: str | None = None) -> dict:
    return contracts.validate("DurableAck", {"outcome": outcome, "run_id": run_id, "attempt_id": attempt_id,
                                             "event_id": None, "reason": reason})


class PgRuntimeStore:
    """Durable runtime store on the agent_runtime schema. One connection per instance (thread-safe via a lock);
    use separate instances per worker thread/process. The DSN is the runtime role's, never the migrator's."""

    def __init__(self, dsn: str, *, connect: Callable[[], Any] | None = None) -> None:
        self._dsn = dsn
        self._connect = connect
        self._conn = None
        self._lock = threading.RLock()
        self.hooks: dict[str, Callable[..., None]] = {}  # deterministic pause points for tests only

    # ------------------------------------------------------------------ connection
    def connection(self):
        if self._conn is None or self._conn.closed:
            if self._connect:
                self._conn = self._connect()
            else:
                import psycopg

                self._conn = psycopg.connect(self._dsn, autocommit=True, connect_timeout=5)
        return self._conn

    def close(self) -> None:
        if self._conn is not None:
            self._conn.close()

    def _hook(self, name: str, **info: Any) -> None:
        if name in self.hooks:
            self.hooks[name](**info)

    def transaction(self):
        return _Tx(self)

    @staticmethod
    def fence(cur, lease: ExecutionLease | None) -> None:
        """The write gate: must run first in every writing transaction (FOR SHARE until commit)."""
        if lease is None:
            raise StaleWriter("no execution lease")
        cur.execute(f"SELECT 1 FROM {SCHEMA}.thread_owners WHERE thread_id = %s AND attempt_id = %s "
                    f"AND writer_epoch = %s AND NOT revoked FOR SHARE",
                    (lease.thread_id, lease.attempt_id, lease.writer_epoch))
        if cur.fetchone() is None:
            raise StaleWriter(lease.attempt_id)

    # ------------------------------------------------------------------ receipt
    def accept_run(self, request: Mapping[str, Any]) -> dict:
        """Durable receipt of a RunRequest, then the DurableAck (12.4). Called after HMAC/schema checks."""
        request = contracts.validate("RunRequest", dict(request))
        digest = sha256_json(request)
        run_id, attempt_id = request["run_id"], request["attempt_id"]
        thread_id = f"conv:{request['conversation_id']}"
        with self.transaction() as cur:
            owner = self._lock_owner(cur, thread_id)
            cur.execute(f"SELECT request_sha256, status FROM {SCHEMA}.run_receipts WHERE attempt_id = %s FOR UPDATE",
                        (attempt_id,))
            row = cur.fetchone()
            if row is not None:
                existing, status = row
                if existing is None:
                    return _ack("IGNORED_STALE", run_id, attempt_id, "ATTEMPT_NOT_CURRENT")
                if existing != digest:
                    return _ack("CONFLICT", run_id, attempt_id, "PAYLOAD_MISMATCH")
                if status == "REVOKED":
                    return _ack("IGNORED_STALE", run_id, attempt_id, "ATTEMPT_NOT_CURRENT")
                cur.execute(f"UPDATE {SCHEMA}.outbound_events SET next_delivery_at = now() "
                            f"WHERE attempt_id = %s AND ack_outcome IS NULL", (attempt_id,))
                return _ack("DUPLICATE", run_id, attempt_id)
            epoch = 1
            if owner is not None:
                previous, epoch = owner[0], owner[1] + 1
                if str(previous) != attempt_id:
                    cur.execute(f"UPDATE {SCHEMA}.run_receipts SET status = 'REVOKED', revoked_at = now() "
                                f"WHERE attempt_id = %s AND status = 'ACCEPTED'", (previous,))
                cur.execute(f"UPDATE {SCHEMA}.thread_owners SET attempt_id = %s, writer_epoch = %s, revoked = false, "
                            f"updated_at = now() WHERE thread_id = %s", (attempt_id, epoch, thread_id))
            else:
                cur.execute(f"INSERT INTO {SCHEMA}.thread_owners (thread_id, attempt_id, writer_epoch) VALUES (%s, %s, 1)",
                            (thread_id, attempt_id))
            cur.execute(f"INSERT INTO {SCHEMA}.run_receipts (attempt_id, run_id, conversation_id, message_id, thread_id, "
                        f"request_sha256, request, status) VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, 'ACCEPTED')",
                        (attempt_id, run_id, request["conversation_id"], request["message_id"], thread_id, digest,
                         canonical_json(request)))
        return _ack("ACCEPTED", run_id, attempt_id)

    @staticmethod
    def _lock_owner(cur, thread_id: str):
        # The advisory gate also covers the first receipt/revoke, when there is no owner row to lock yet.
        # Control transactions always acquire owner before receipt; fenced writes use the same row order.
        cur.execute("SELECT pg_advisory_xact_lock(718001, hashtext(%s))", (thread_id,))
        cur.execute(f"SELECT attempt_id, writer_epoch, revoked FROM {SCHEMA}.thread_owners WHERE thread_id = %s FOR UPDATE",
                    (thread_id,))
        return cur.fetchone()

    def revoke(self, revocation: Mapping[str, Any]) -> dict:
        """Commit the revoke (epoch raised under the row lock), then return the RevocationAck. This commit is the
        linearization point: writes that started earlier finish first, later ones are refused."""
        revocation = contracts.validate("AttemptRevocation", dict(revocation))
        run_id, attempt_id = revocation["run_id"], revocation["attempt_id"]
        thread_id = f"conv:{revocation['conversation_id']}"
        with self.transaction() as cur:
            owner = self._lock_owner(cur, thread_id)
            cur.execute(f"SELECT status, thread_id, run_id FROM {SCHEMA}.run_receipts WHERE attempt_id = %s FOR UPDATE",
                        (attempt_id,))
            row = cur.fetchone()
            if row is not None and (row[1] != thread_id or (row[2] is not None and str(row[2]) != run_id)):
                return contracts.validate("RevocationAck", {"outcome": "REJECTED", "run_id": run_id,
                    "attempt_id": attempt_id, "writer_epoch": None, "reason": "PAYLOAD_MISMATCH"})
            if row is None:  # dispatch still in flight: leave a tombstone so it is refused when it lands
                cur.execute(f"INSERT INTO {SCHEMA}.run_receipts (attempt_id, thread_id, status, revoked_at) "
                            f"VALUES (%s, %s, 'REVOKED', now())", (attempt_id, thread_id))
                outcome, epoch = "REVOKED", owner[1] if owner else 0
            else:
                owns = owner is not None and str(owner[0]) == attempt_id
                already = row[0] == "REVOKED" or not owns or owner[2]
                epoch = owner[1] if owner else 0
                if owns and not owner[2]:
                    epoch += 1
                    cur.execute(f"UPDATE {SCHEMA}.thread_owners SET writer_epoch = %s, revoked = true, updated_at = now() "
                                f"WHERE thread_id = %s", (epoch, row[1]))
                cur.execute(f"UPDATE {SCHEMA}.run_receipts SET status = 'REVOKED', revoked_at = now() "
                            f"WHERE attempt_id = %s AND status = 'ACCEPTED'", (attempt_id,))
                outcome = "ALREADY_REVOKED" if already else "REVOKED"
        return contracts.validate("RevocationAck", {"outcome": outcome, "run_id": run_id, "attempt_id": attempt_id,
                                                    "writer_epoch": epoch, "reason": None})

    def claim_execution(self, run_id: str, attempt_id: str, *, worker_id: str, lease_seconds: float) -> ExecutionLease:
        """Take the execution lease and raise the epoch, fencing any earlier claim of the same attempt."""
        with self.transaction() as cur:
            cur.execute(f"SELECT thread_id FROM {SCHEMA}.run_receipts WHERE attempt_id = %s", (attempt_id,))
            existing = cur.fetchone()
            if existing is None:
                raise StaleWriter(attempt_id)
            owner = self._lock_owner(cur, existing[0])
            cur.execute(f"SELECT run_id, message_id, thread_id, status, claimed_by, lease_expires_at > now() "
                        f"FROM {SCHEMA}.run_receipts WHERE attempt_id = %s FOR UPDATE", (attempt_id,))
            row = cur.fetchone()
            if row is None or row[3] != "ACCEPTED" or str(row[0]) != run_id:
                raise StaleWriter(attempt_id)
            if row[4] and row[4] != worker_id and row[5]:
                raise LeaseHeld(attempt_id)
            if owner is None or str(owner[0]) != attempt_id or owner[2]:
                raise StaleWriter(attempt_id)
            epoch = owner[1] + 1
            cur.execute(f"UPDATE {SCHEMA}.thread_owners SET writer_epoch = %s, updated_at = now() WHERE thread_id = %s",
                        (epoch, row[2]))
            cur.execute(f"UPDATE {SCHEMA}.run_receipts SET claimed_by = %s, "
                        f"lease_expires_at = now() + make_interval(secs => %s) WHERE attempt_id = %s",
                        (worker_id, lease_seconds, attempt_id))
        return ExecutionLease(run_id, attempt_id, str(row[1]), row[2], epoch, worker_id)

    def renew_lease(self, lease: ExecutionLease, lease_seconds: float) -> None:
        with self.transaction() as cur:
            self.fence(cur, lease)
            cur.execute(f"UPDATE {SCHEMA}.run_receipts SET lease_expires_at = now() + make_interval(secs => %s) "
                        f"WHERE attempt_id = %s AND claimed_by = %s", (lease_seconds, lease.attempt_id, lease.worker_id))

    def receipt(self, attempt_id: str) -> dict | None:
        with self.transaction() as cur:
            cur.execute(f"SELECT run_id, status, request, final_event_id FROM {SCHEMA}.run_receipts WHERE attempt_id = %s",
                        (attempt_id,))
            row = cur.fetchone()
        if row is None:
            return None
        return {"run_id": str(row[0]) if row[0] else None, "status": row[1], "request": row[2],
                "final_event_id": str(row[3]) if row[3] else None}

    def recoverable(self) -> list[tuple[str, str]]:
        """Receipts to resume after a restart: accepted, still owning their thread, lease absent or expired."""
        with self.transaction() as cur:
            cur.execute(f"SELECT r.run_id::text, r.attempt_id::text FROM {SCHEMA}.run_receipts r "
                        f"JOIN {SCHEMA}.thread_owners o ON o.thread_id = r.thread_id AND o.attempt_id = r.attempt_id "
                        f"WHERE r.status = 'ACCEPTED' AND NOT o.revoked "
                        f"AND (r.lease_expires_at IS NULL OR r.lease_expires_at < now()) ORDER BY r.accepted_at")
            return [(a, b) for a, b in cur.fetchall()]

    # ------------------------------------------------------------------ ledger
    def open_message(self, lease: ExecutionLease, message_id: str, caps: Mapping[str, int]) -> None:
        with self.transaction() as cur:
            self.fence(cur, lease)
            for kind, cap in caps.items():
                cur.execute(f"INSERT INTO {SCHEMA}.ledgers (message_id, kind, cap) VALUES (%s, %s, %s) "
                            f"ON CONFLICT (message_id, kind) DO NOTHING", (message_id, kind, cap))

    def reserve(self, lease: ExecutionLease, message_id: str, kind: str, operation_id: str, amount: int = 1) -> Reservation:
        with self.transaction() as cur:
            self.fence(cur, lease)
            cur.execute(f"SELECT used, cap FROM {SCHEMA}.ledgers WHERE message_id = %s AND kind = %s FOR UPDATE",
                        (message_id, kind))
            ledger = cur.fetchone()
            if ledger is None:
                raise BudgetExhausted(kind)  # no ledger opened: nothing may be spent
            cur.execute(f"SELECT amount FROM {SCHEMA}.reservations WHERE message_id = %s AND kind = %s AND operation_id = %s",
                        (message_id, kind, operation_id))
            replay = cur.fetchone()
            if replay is not None:
                return Reservation(message_id, kind, operation_id, int(replay[0]))
            if ledger[0] + amount > ledger[1]:
                raise BudgetExhausted(kind)
            cur.execute(f"INSERT INTO {SCHEMA}.reservations (message_id, kind, operation_id, attempt_id, amount) "
                        f"VALUES (%s, %s, %s, %s, %s)", (message_id, kind, operation_id, lease.attempt_id, amount))
            cur.execute(f"UPDATE {SCHEMA}.ledgers SET used = used + %s WHERE message_id = %s AND kind = %s",
                        (amount, message_id, kind))
        return Reservation(message_id, kind, operation_id, amount)

    def settle(self, lease: ExecutionLease, message_id: str, kind: str, operation_id: str, actual: int) -> None:
        """Replace a reservation with measured usage (tokens). Unknown usage after a crash is never settled."""
        with self.transaction() as cur:
            self.fence(cur, lease)
            cur.execute(f"SELECT 1 FROM {SCHEMA}.ledgers WHERE message_id = %s AND kind = %s FOR UPDATE", (message_id, kind))
            cur.execute(f"SELECT amount FROM {SCHEMA}.reservations WHERE message_id = %s AND kind = %s AND operation_id = %s "
                        f"FOR UPDATE", (message_id, kind, operation_id))
            row = cur.fetchone()
            if row is None:
                raise KeyError(operation_id)
            cur.execute(f"UPDATE {SCHEMA}.ledgers SET used = GREATEST(used + %s, 0) WHERE message_id = %s AND kind = %s",
                        (actual - int(row[0]), message_id, kind))
            cur.execute(f"UPDATE {SCHEMA}.reservations SET amount = %s, settled = true WHERE message_id = %s AND kind = %s "
                        f"AND operation_id = %s", (actual, message_id, kind, operation_id))

    def usage(self, message_id: str) -> dict[str, int]:
        with self.transaction() as cur:
            cur.execute(f"SELECT kind, used FROM {SCHEMA}.ledgers WHERE message_id = %s", (message_id,))
            return {kind: int(used) for kind, used in cur.fetchall()}

    # ------------------------------------------------------------------ events
    def _emit(self, cur, lease: ExecutionLease, kind: str, payload: dict, event_id: str | None = None) -> dict:
        cur.execute(f"INSERT INTO {SCHEMA}.attempt_sequences (attempt_id, last_sequence) VALUES (%s, 1) "
                    f"ON CONFLICT (attempt_id) DO UPDATE SET last_sequence = {SCHEMA}.attempt_sequences.last_sequence + 1 "
                    f"RETURNING last_sequence", (lease.attempt_id,))
        sequence = cur.fetchone()[0]
        event = contracts.validate("AgentEvent", {
            "schema_version": "agent-v1", "run_id": lease.run_id, "attempt_id": lease.attempt_id,
            "event_id": event_id or str(uuid.uuid4()), "sequence": sequence, "kind": kind, "payload": payload})
        self.insert_event(cur, event)
        return event

    @staticmethod
    def insert_event(cur, event: Mapping[str, Any]) -> None:
        """Immutable insert. Same id + same content is a no-op; different content is a conflict."""
        digest = sha256_json(event)
        cur.execute(f"INSERT INTO {SCHEMA}.outbound_events (event_id, attempt_id, run_id, sequence, kind, event, event_sha256) "
                    f"VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s) ON CONFLICT DO NOTHING RETURNING event_id",
                    (event["event_id"], event["attempt_id"], event["run_id"], event["sequence"], event["kind"],
                     canonical_json(event), digest))
        if cur.fetchone() is None:
            cur.execute(f"SELECT event_sha256 FROM {SCHEMA}.outbound_events WHERE event_id = %s", (event["event_id"],))
            row = cur.fetchone()
            if row is None or row[0] != digest:
                raise EventConflict(event["event_id"])

    def persist_progress(self, lease: ExecutionLease, stage: str) -> dict:
        with self.transaction() as cur:
            self.fence(cur, lease)
            return self._emit(cur, lease, "PROGRESS", {"stage": stage})

    def persist_final(self, lease: ExecutionLease, outcome: Mapping[str, Any]) -> dict:
        """Final result/failure + event + sequence + completion marker in one transaction (12.7)."""
        with self.transaction() as cur:
            cur.execute(f"SELECT status, final_event_id FROM {SCHEMA}.run_receipts WHERE attempt_id = %s",
                        (lease.attempt_id,))
            row = cur.fetchone()
            if row is not None and row[0] == "FINALIZED":
                return self._event(cur, row[1])
            self.fence(cur, lease)
            # Serialize finalization without blocking the FK KEY SHARE locks taken by concurrent progress events.
            cur.execute(f"SELECT status, final_event_id FROM {SCHEMA}.run_receipts WHERE attempt_id = %s FOR NO KEY UPDATE",
                        (lease.attempt_id,))
            row = cur.fetchone()
            if row is not None and row[0] == "FINALIZED":
                return self._event(cur, row[1])
            if "result" in outcome:
                event = self._emit(cur, lease, "RESULT", {"result": outcome["result"]})
            else:
                event = self._emit(cur, lease, "ERROR", {"failure": outcome["failure"]})
            self._hook("before_final_commit", event=event)
            cur.execute(f"UPDATE {SCHEMA}.run_receipts SET status = 'FINALIZED', final_event_id = %s WHERE attempt_id = %s",
                        (event["event_id"], lease.attempt_id))
        return event

    @staticmethod
    def _event(cur, event_id) -> dict:
        cur.execute(f"SELECT event FROM {SCHEMA}.outbound_events WHERE event_id = %s", (event_id,))
        return cur.fetchone()[0]

    def final_event(self, attempt_id: str) -> dict | None:
        with self.transaction() as cur:
            cur.execute(f"SELECT final_event_id FROM {SCHEMA}.run_receipts WHERE attempt_id = %s AND status = 'FINALIZED'",
                        (attempt_id,))
            row = cur.fetchone()
            return self._event(cur, row[0]) if row else None

    def pending_events(self, limit: int = 50) -> list[dict]:
        with self.transaction() as cur:
            cur.execute(f"SELECT event FROM {SCHEMA}.outbound_events WHERE ack_outcome IS NULL AND next_delivery_at <= now() "
                        f"ORDER BY created_at, sequence LIMIT %s", (limit,))
            return [row[0] for row in cur.fetchall()]

    def ack_event(self, event_id: str, ack: Mapping[str, Any], *, retry_after_s: float = 0) -> None:
        """Stop resending on ACCEPTED/DUPLICATE/IGNORED_STALE/CONFLICT; REJECTED or no ACK keeps the event."""
        with self.transaction() as cur:
            cur.execute(f"SELECT run_id::text, attempt_id::text FROM {SCHEMA}.outbound_events WHERE event_id = %s",
                        (event_id,))
            row = cur.fetchone()
            if row is None:
                return
            valid = contracts.is_valid("DurableAck", ack)
            matches = valid and (ack["run_id"], ack["attempt_id"], ack["event_id"]) == (*row, event_id)
            outcome = ack["outcome"] if matches else None
            if outcome in ("ACCEPTED", "DUPLICATE", "IGNORED_STALE", "CONFLICT"):
                cur.execute(f"UPDATE {SCHEMA}.outbound_events SET ack_outcome = %s, acked_at = now(), "
                            f"delivery_attempts = delivery_attempts + 1 WHERE event_id = %s AND ack_outcome IS NULL",
                            (outcome, event_id))
            else:
                cur.execute(f"UPDATE {SCHEMA}.outbound_events SET delivery_attempts = delivery_attempts + 1, "
                            f"next_delivery_at = now() + make_interval(secs => %s) WHERE event_id = %s",
                            (retry_after_s, event_id))

    # ------------------------------------------------------------------ maintenance
    def fence_after_restore(self) -> int:
        """After restoring agent_runtime from a backup/split: revoke unfinished receipts and move every epoch forward
        so no writer that existed before the restore can write again. Run before accepting work."""
        with self.transaction() as cur:
            cur.execute(f"UPDATE {SCHEMA}.run_receipts SET status = 'REVOKED', revoked_at = now() WHERE status = 'ACCEPTED'")
            revoked = cur.rowcount
            cur.execute(f"UPDATE {SCHEMA}.thread_owners SET writer_epoch = writer_epoch + 1000000, revoked = true, "
                        f"updated_at = now()")
        return revoked

    def checkpointer(self, lease: ExecutionLease | None) -> "FencedPostgresSaver":
        return FencedPostgresSaver(self, lease)

    def leased(self, lease: ExecutionLease) -> "LeasedStore":
        return LeasedStore(self, lease)


class _Tx:
    """One DB transaction on the store connection, serialized by the store lock."""

    def __init__(self, store: PgRuntimeStore) -> None:
        self._store = store

    def __enter__(self):
        self._store._lock.acquire()
        try:
            self._tx = self._store.connection().transaction()
            self._tx.__enter__()
            self._cur = self._store.connection().cursor()
            return self._cur
        except BaseException:
            self._store._lock.release()
            raise

    def __exit__(self, exc_type, exc, tb):
        try:
            self._cur.close()
            return self._tx.__exit__(exc_type, exc, tb)
        finally:
            self._store._lock.release()


class LeasedStore:
    """The graph's RuntimeStore for one claimed execution: every write carries the lease."""

    def __init__(self, store: PgRuntimeStore, lease: ExecutionLease) -> None:
        self.store = store
        self.lease = lease

    def open_message(self, message_id: str, caps: Mapping[str, int]) -> None:
        self.store.open_message(self.lease, message_id, caps)

    def reserve(self, message_id: str, kind: str, operation_id: str, amount: int = 1) -> Reservation:
        return self.store.reserve(self.lease, message_id, kind, operation_id, amount)

    def settle(self, message_id: str, kind: str, operation_id: str, actual: int) -> None:
        self.store.settle(self.lease, message_id, kind, operation_id, actual)

    def usage(self, message_id: str) -> Mapping[str, int]:
        return self.store.usage(message_id)

    def persist_final(self, execution: Mapping[str, Any], outcome: Mapping[str, Any]) -> dict[str, Any]:
        if execution["attempt_id"] != self.lease.attempt_id:
            raise StaleWriter(execution["attempt_id"])
        return self.store.persist_final(self.lease, outcome)


# ---------------------------------------------------------------------------------------------- checkpointer

from langgraph.checkpoint.base import (  # noqa: E402
    WRITES_IDX_MAP, BaseCheckpointSaver, CheckpointTuple, get_checkpoint_id, get_checkpoint_metadata, writes_sort_key)


class FencedPostgresSaver(BaseCheckpointSaver[str]):
    """LangGraph checkpointer whose every write path (put, put_writes, delete_thread) runs the epoch fence in the
    same transaction (decision 12.13 #2). Reads need no lease. Async methods are not provided: the graph runs
    synchronously with durability="sync"."""

    def __init__(self, store: PgRuntimeStore, lease: ExecutionLease | None) -> None:
        super().__init__()
        self.store = store
        self.lease = lease

    # ------------------------------------------------------------------ reads
    def _tuple(self, cur, thread_id: str, ns: str, row) -> CheckpointTuple:
        checkpoint_id, parent, ctype, cblob, mtype, mblob = row
        checkpoint = self.serde.loads_typed((ctype, bytes(cblob)))
        values = {}
        for channel, version in checkpoint["channel_versions"].items():
            cur.execute(f"SELECT value_type, value FROM {SCHEMA}.checkpoint_blobs WHERE thread_id = %s AND checkpoint_ns = %s "
                        f"AND channel = %s AND version = %s", (thread_id, ns, channel, str(version)))
            blob = cur.fetchone()
            if blob and blob[0] != "empty":
                values[channel] = self.serde.loads_typed((blob[0], bytes(blob[1])))
        cur.execute(f"SELECT task_id, channel, value_type, value, task_path, idx FROM {SCHEMA}.checkpoint_writes "
                    f"WHERE thread_id = %s AND checkpoint_ns = %s AND checkpoint_id = %s",
                    (thread_id, ns, checkpoint_id))
        writes = sorted(cur.fetchall(), key=lambda w: writes_sort_key(w[4], w[0], w[5]))
        config = {"configurable": {"thread_id": thread_id, "checkpoint_ns": ns, "checkpoint_id": checkpoint_id}}
        return CheckpointTuple(
            config=config, checkpoint={**checkpoint, "channel_values": values},
            metadata=self.serde.loads_typed((mtype, bytes(mblob))),
            parent_config={"configurable": {"thread_id": thread_id, "checkpoint_ns": ns, "checkpoint_id": parent}}
            if parent else None,
            pending_writes=[(w[0], w[1], self.serde.loads_typed((w[2], bytes(w[3])))) for w in writes])

    _COLUMNS = "checkpoint_id, parent_checkpoint_id, checkpoint_type, checkpoint, metadata_type, metadata"

    def get_tuple(self, config) -> CheckpointTuple | None:
        thread_id = config["configurable"]["thread_id"]
        ns = config["configurable"].get("checkpoint_ns", "")
        with self.store.transaction() as cur:
            if checkpoint_id := get_checkpoint_id(config):
                cur.execute(f"SELECT {self._COLUMNS} FROM {SCHEMA}.checkpoints WHERE thread_id = %s AND checkpoint_ns = %s "
                            f"AND checkpoint_id = %s", (thread_id, ns, checkpoint_id))
            else:
                cur.execute(f"SELECT {self._COLUMNS} FROM {SCHEMA}.checkpoints WHERE thread_id = %s AND checkpoint_ns = %s "
                            f"ORDER BY checkpoint_id DESC LIMIT 1", (thread_id, ns))
            row = cur.fetchone()
            return self._tuple(cur, thread_id, ns, row) if row else None

    def list(self, config, *, filter=None, before=None, limit=None) -> Iterator[CheckpointTuple]:
        if config is None:
            raise ValueError("listing requires a thread_id")
        thread_id = config["configurable"]["thread_id"]
        ns = config["configurable"].get("checkpoint_ns")
        with self.store.transaction() as cur:
            sql = f"SELECT checkpoint_ns, {self._COLUMNS} FROM {SCHEMA}.checkpoints WHERE thread_id = %s"
            params: list[Any] = [thread_id]
            if ns is not None:
                sql += " AND checkpoint_ns = %s"
                params.append(ns)
            if checkpoint_id := get_checkpoint_id(config):
                sql += " AND checkpoint_id = %s"
                params.append(checkpoint_id)
            if before and (before_id := get_checkpoint_id(before)):
                sql += " AND checkpoint_id < %s"
                params.append(before_id)
            cur.execute(sql + " ORDER BY checkpoint_id DESC", params)
            rows = cur.fetchall()
            out = []
            for row in rows:
                item = self._tuple(cur, thread_id, row[0], row[1:])
                if filter and not all(item.metadata.get(k) == v for k, v in filter.items()):
                    continue
                out.append(item)
                if limit is not None and len(out) >= limit:
                    break
        yield from out

    # ------------------------------------------------------------------ writes (fenced)
    def put(self, config, checkpoint, metadata, new_versions):
        thread_id = config["configurable"]["thread_id"]
        ns = config["configurable"].get("checkpoint_ns", "")
        parent = config["configurable"].get("checkpoint_id")
        stored = dict(checkpoint)
        values = stored.pop("channel_values")
        ctype, cblob = self.serde.dumps_typed(stored)
        mtype, mblob = self.serde.dumps_typed(get_checkpoint_metadata(config, metadata))
        blobs = [(k, str(v), *(self.serde.dumps_typed(values[k]) if k in values else ("empty", b"")))
                 for k, v in new_versions.items()]
        self.store._hook("before_checkpoint_write", thread_id=thread_id)
        with self.store.transaction() as cur:
            self.store.fence(cur, self.lease)
            self._check_thread(thread_id)
            # A different advisory namespace from owner transitions avoids any SHARE-to-UPDATE lock upgrade.
            # Serialize the head check and insert even when this namespace has no checkpoint yet.
            cur.execute("SELECT pg_advisory_xact_lock(718002, hashtext(%s))", (canonical_json([thread_id, ns]),))
            cur.execute(f"SELECT checkpoint_id FROM {SCHEMA}.checkpoints WHERE thread_id = %s AND checkpoint_ns = %s "
                        f"ORDER BY checkpoint_id DESC LIMIT 1", (thread_id, ns))
            head = cur.fetchone()
            if head is not None and head[0] != parent:
                raise CheckpointConflict(thread_id)
            for channel, version, vtype, value in blobs:
                cur.execute(f"INSERT INTO {SCHEMA}.checkpoint_blobs (thread_id, checkpoint_ns, channel, version, value_type, value) "
                            f"VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
                            (thread_id, ns, channel, version, vtype, value))
            cur.execute(f"INSERT INTO {SCHEMA}.checkpoints (thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, "
                        f"checkpoint_type, checkpoint, metadata_type, metadata, writer_attempt_id, writer_epoch) "
                        f"VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                        (thread_id, ns, checkpoint["id"], parent, ctype, cblob, mtype, mblob, self.lease.attempt_id,
                         self.lease.writer_epoch))
            self.store._hook("checkpoint_write_locked", thread_id=thread_id)
        return {"configurable": {"thread_id": thread_id, "checkpoint_ns": ns, "checkpoint_id": checkpoint["id"]}}

    def put_writes(self, config, writes, task_id, task_path=""):
        thread_id = config["configurable"]["thread_id"]
        ns = config["configurable"].get("checkpoint_ns", "")
        checkpoint_id = config["configurable"]["checkpoint_id"]
        rows = []
        for idx, (channel, value) in enumerate(writes):
            vtype, vblob = self.serde.dumps_typed(value)
            rows.append((WRITES_IDX_MAP.get(channel, idx), channel, vtype, vblob))
        with self.store.transaction() as cur:
            self.store.fence(cur, self.lease)
            self._check_thread(thread_id)
            for idx, channel, vtype, vblob in rows:
                conflict = "DO UPDATE SET channel = EXCLUDED.channel, value_type = EXCLUDED.value_type, value = EXCLUDED.value" \
                    if idx < 0 else "DO NOTHING"
                cur.execute(f"INSERT INTO {SCHEMA}.checkpoint_writes (thread_id, checkpoint_ns, checkpoint_id, task_id, idx, "
                            f"task_path, channel, value_type, value, writer_attempt_id, writer_epoch) "
                            f"VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) "
                            f"ON CONFLICT (thread_id, checkpoint_ns, checkpoint_id, task_id, idx) {conflict}",
                            (thread_id, ns, checkpoint_id, task_id, idx, task_path, channel, vtype, vblob,
                             self.lease.attempt_id, self.lease.writer_epoch))

    def delete_thread(self, thread_id: str) -> None:
        with self.store.transaction() as cur:
            self.store.fence(cur, self.lease)
            self._check_thread(thread_id)
            for table in ("checkpoint_writes", "checkpoint_blobs", "checkpoints"):
                cur.execute(f"DELETE FROM {SCHEMA}.{table} WHERE thread_id = %s", (thread_id,))

    def _check_thread(self, thread_id: str) -> None:
        if thread_id != self.lease.thread_id:  # a lease never writes another conversation's thread
            raise StaleWriter(thread_id)

    def get_next_version(self, current, channel):
        number = 0 if current is None else int(str(current).split(".")[0])
        return f"{number + 1:032}.{uuid.uuid4().hex[:16]}"


# ---------------------------------------------------------------------------------------------- execution

def execute_attempt(store: PgRuntimeStore, run_id: str, attempt_id: str, build: Callable[[Any, Any], Any], *,
                    worker_id: str, lease_seconds: float) -> dict | None:
    """Claim and run one accepted attempt. A FINALIZED receipt returns its stored event without running the graph;
    a revoked/foreign receipt returns None. `build(runtime_store, checkpointer)` returns a compiled graph."""
    from .graph import AgentRunner

    receipt = store.receipt(attempt_id)
    if receipt is None or receipt["run_id"] != run_id:
        return None
    if receipt["status"] == "FINALIZED":
        return store.final_event(attempt_id)
    if receipt["status"] != "ACCEPTED":
        return None
    lease = store.claim_execution(run_id, attempt_id, worker_id=worker_id, lease_seconds=lease_seconds)
    graph = build(store.leased(lease), store.checkpointer(lease))
    return AgentRunner(graph).run(receipt["request"])


# ---------------------------------------------------------------------------------------------- migrations

def migrate(dsn: str, directory: Path = MIGRATIONS_DIR) -> list[str]:
    """Apply migrations/*.sql in order as the migrator role; refuse a changed file that was already applied."""
    import psycopg

    applied = []
    with psycopg.connect(dsn, autocommit=True) as conn:
        conn.execute(f"CREATE TABLE IF NOT EXISTS {SCHEMA}.schema_migrations (version text PRIMARY KEY, "
                     f"sha256 char(64) NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())")
        conn.execute(f"REVOKE ALL ON {SCHEMA}.schema_migrations FROM PUBLIC")
        conn.execute(f"DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_runtime') THEN "
                     f"REVOKE ALL ON {SCHEMA}.schema_migrations FROM agent_runtime; END IF; END $$")
        for path in sorted(directory.glob("*.sql")):
            sql = path.read_text(encoding="utf-8")
            digest = hashlib.sha256(sql.encode("utf-8")).hexdigest()
            row = conn.execute(f"SELECT sha256 FROM {SCHEMA}.schema_migrations WHERE version = %s", (path.stem,)).fetchone()
            if row:
                if row[0] != digest:
                    raise RuntimeError(f"applied migration {path.stem} was modified; add a new migration instead")
                continue
            with conn.transaction():
                conn.execute(sql)
                conn.execute(f"INSERT INTO {SCHEMA}.schema_migrations (version, sha256) VALUES (%s, %s)", (path.stem, digest))
            applied.append(path.stem)
    return applied


TABLES = ("run_receipts", "thread_owners", "checkpoints", "checkpoint_blobs", "checkpoint_writes", "ledgers",
          "reservations", "attempt_sequences", "outbound_events", "request_nonces")


def copy_runtime_data(source_dsn: str, target_dsn: str) -> dict[str, int]:
    """Maintenance split helper: copy every agent_runtime table (in FK order) into a target database already
    migrated to the same version. Intake must be stopped first; run fence_after_restore on the target afterwards."""
    import psycopg

    counts = {}
    with psycopg.connect(source_dsn) as source, psycopg.connect(target_dsn) as target:
        versions = lambda c: c.execute(f"SELECT version, sha256 FROM {SCHEMA}.schema_migrations ORDER BY 1").fetchall()  # noqa: E731
        if versions(source) != versions(target):
            raise RuntimeError("source and target migration versions differ")
        with target.transaction():
            for table in TABLES:
                with source.cursor().copy(f"COPY {SCHEMA}.{table} TO STDOUT (FORMAT binary)") as out, \
                        target.cursor().copy(f"COPY {SCHEMA}.{table} FROM STDIN (FORMAT binary)") as into:
                    for block in out:
                        into.write(block)
                counts[table] = target.execute(f"SELECT count(*) FROM {SCHEMA}.{table}").fetchone()[0]
    return counts


def _main(argv: Sequence[str] | None = None) -> int:
    import argparse

    from .config import load_env, require

    parser = argparse.ArgumentParser(description="Agent runtime store maintenance")
    parser.add_argument("command", choices=("migrate",))
    parser.add_argument("--env-file", type=Path)
    args = parser.parse_args(argv)
    env = load_env(args.env_file)
    print(json.dumps({"applied": migrate(require(env, "LIFE_AGENT_STORE_MIGRATOR_DSN"))}))
    return 0


if __name__ == "__main__":
    import sys

    sys.exit(_main())
