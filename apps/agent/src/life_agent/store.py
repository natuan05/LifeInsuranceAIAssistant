"""Runtime store interface used by the graph.

Only the interface lives here in milestone 2. The durable PostgreSQL implementation (receipt, fencing,
checkpoint ownership, atomic final record) is Task 4 after the G2 protocol review; tests use an in-memory double.
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


class StaleWriter(Exception):
    """The attempt no longer owns the thread. Raised by the durable store (Task 4); never swallowed."""


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
