"""Runtime store interface used by the graph.

Only the interface lives here in milestone 2. The durable PostgreSQL implementation (receipt, fencing,
checkpoint ownership, atomic final record) is Task 4 after the G2 protocol review; tests use an in-memory double.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Protocol


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
