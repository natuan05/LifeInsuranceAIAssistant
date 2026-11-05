"""Core internal API port and the Business Tools adapter.

CoreClient mirrors the Task 3 internal endpoints (history, linked-history, scope, contracts). HttpCoreClient is the
signed HTTP client (Task 6, paths proposed for Task 3 in contracts 12.10); tests use a fake. BusinessReads applies the decided trial rules for the two read tools only:
4 Core requests per message (retries included), timeout min(3 s, deadline left), at most 1 automatic retry per
logical call on transient errors, no retry for denied/invalid attempt/not found/invalid input.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable, Mapping, Protocol

from . import contracts
from .config import RunLimits
from .store import BudgetExhausted, RuntimeStore

TRANSIENT = frozenset({"TIMEOUT", "UNAVAILABLE"})


class CoreError(Exception):
    """Filtered Core failure. code: TIMEOUT | UNAVAILABLE | NOT_AUTHORIZED | INVALID_ATTEMPT | NOT_FOUND | INVALID_INPUT."""

    def __init__(self, code: str):
        self.code = code
        super().__init__(code)

    @property
    def transient(self) -> bool:
        return self.code in TRANSIENT


class Clock(Protocol):
    def now(self) -> datetime: ...

    def sleep(self, seconds: float) -> None: ...


class SystemClock:
    def now(self) -> datetime:
        return datetime.now(timezone.utc)

    def sleep(self, seconds: float) -> None:
        import time

        time.sleep(seconds)


class CoreClient(Protocol):
    """Trusted ExecutionContext is passed by code; nothing here comes from LLM arguments except policy_number."""

    def history(self, ctx: Mapping[str, Any], view: Mapping[str, Any], cursor: str | None, *, timeout: float) -> dict: ...

    def linked_history(self, ctx: Mapping[str, Any], view: Mapping[str, Any], cursor: str | None, *, timeout: float) -> dict: ...

    def scope(self, ctx: Mapping[str, Any], kind: str, policy_number: str | None, *, timeout: float) -> dict: ...

    def list_contracts(self, ctx: Mapping[str, Any], *, timeout: float) -> list[dict]: ...

    def get_contract_overview(self, ctx: Mapping[str, Any], policy_number: str, *, timeout: float) -> dict: ...


def seconds_left(clock: Clock, limits: RunLimits) -> float:
    return (limits.deadline_at - clock.now()).total_seconds()


class BusinessReads:
    def __init__(self, core: CoreClient, store: RuntimeStore, clock: Clock, *, retry_wait_s: float):
        self._core = core
        self._store = store
        self._clock = clock
        self._wait = retry_wait_s

    def list_contracts(self, ctx: Mapping[str, Any], limits: RunLimits, operation_id: str) -> dict:
        outcome = self._call(ctx, limits, operation_id, lambda timeout: self._core.list_contracts(ctx, timeout=timeout))
        if isinstance(outcome, CoreError):
            result = {"status": "DENIED" if outcome.code in ("NOT_AUTHORIZED", "INVALID_ATTEMPT") else "ERROR",
                      "contracts": [], "error": _error(outcome)}
        else:
            result = {"status": "OK", "contracts": outcome, "error": None}
        return contracts.validate("ContractListResult", result)

    def get_contract_overview(self, ctx: Mapping[str, Any], limits: RunLimits, operation_id: str, policy_number: str) -> dict:
        outcome = self._call(ctx, limits, operation_id,
                             lambda timeout: self._core.get_contract_overview(ctx, policy_number, timeout=timeout))
        if isinstance(outcome, CoreError):
            if outcome.code == "NOT_FOUND":
                result = {"status": "NOT_FOUND", "overview": None, "error": None}
            elif outcome.code in ("NOT_AUTHORIZED", "INVALID_ATTEMPT"):
                result = {"status": "DENIED", "overview": None, "error": _error(outcome)}
            else:
                result = {"status": "ERROR", "overview": None, "error": _error(outcome)}
        else:
            result = {"status": "OK", "overview": outcome, "error": None}
        return contracts.validate("ContractOverviewResult", result)

    def _call(self, ctx: Mapping[str, Any], limits: RunLimits, operation_id: str, send: Callable[[float], Any]) -> Any:
        message_id = ctx["message_id"]
        retries_left = limits.core_retry_per_call
        attempt = 0
        while True:
            left = seconds_left(self._clock, limits)
            if left <= 0:
                return CoreError("TIMEOUT")
            attempt += 1
            # Raises BudgetExhausted before anything is sent; on a retry the earlier transient error is kept.
            try:
                self._store.reserve(message_id, "core_read_requests", f"{operation_id}.{attempt}")
            except BudgetExhausted:
                if attempt == 1:
                    raise
                return last_error
            try:
                return send(min(limits.core_request_timeout_s, left))
            except CoreError as error:
                last_error = error
                if not error.transient or retries_left <= 0:
                    return error
                retries_left -= 1
                if self._wait > 0:
                    if seconds_left(self._clock, limits) <= self._wait:
                        return error
                    self._clock.sleep(self._wait)


def _error(error: CoreError) -> dict:
    code = error.code if error.code != "NOT_FOUND" else "INVALID_INPUT"
    return {"code": code, "retryable": error.transient}


# ---------------------------------------------------------------------------------------------- HTTP (Task 6)

READ_PATHS = {
    "history": "/api/v1/internal/agent/history",
    "linked_history": "/api/v1/internal/agent/linked-history",
    "scope": "/api/v1/internal/agent/scope",
    "list_contracts": "/api/v1/internal/agent/contracts",
    "get_contract_overview": "/api/v1/internal/agent/contract-overview",
}
_STATUS_CODES = {400: "INVALID_INPUT", 403: "NOT_AUTHORIZED", 404: "NOT_FOUND", 409: "INVALID_ATTEMPT"}
_CORE_CODES = frozenset({"TIMEOUT", "UNAVAILABLE", "NOT_AUTHORIZED", "INVALID_ATTEMPT", "NOT_FOUND", "INVALID_INPUT"})


class HttpCoreClient:
    """Signed reads to Core's internal Agent API (LI-HMAC-SHA256-v1, Agent -> Core key). Every request carries the
    run/attempt so Core checks the current attempt and the actor's present permissions; the view/policy number are
    the only other inputs. Paths and bodies are a proposal for Task 3 (contracts 12.10) until Core implements them.
    Errors map to CoreError codes; response bodies are validated against agent-v1 before use."""

    def __init__(self, base_url: str, keyring: Any, *, opener: Any = None) -> None:
        from .http import _opener

        self._base = base_url.rstrip("/")
        self._keyring = keyring
        self._opener = opener or _opener()

    def _post(self, name: str, ctx: Mapping[str, Any], extra: Mapping[str, Any], timeout: float) -> Any:
        from .http import TransportError, signed_post

        body = {"run_id": ctx["run_id"], "attempt_id": ctx["attempt_id"], **extra}
        try:
            status, payload = signed_post(self._opener, self._keyring, self._base + READ_PATHS[name], body,
                                          timeout=timeout)
        except TransportError as error:
            raise CoreError("TIMEOUT" if error.code == "TIMEOUT" else "UNAVAILABLE") from None
        if status == 200 and payload is not None:
            return payload
        given = (payload or {}).get("error", {}).get("code") if isinstance(payload, dict) else None
        if given in _CORE_CODES and status < 500:
            raise CoreError(given)
        raise CoreError(_STATUS_CODES.get(status, "UNAVAILABLE"))

    @staticmethod
    def _checked(type_name: str, value: Any) -> Any:
        try:
            return contracts.validate(type_name, value)
        except contracts.ContractError:
            raise CoreError("UNAVAILABLE") from None  # malformed Core answer is never used as data

    def history(self, ctx, view, cursor, *, timeout):
        return self._checked("ConversationHistoryPage",
                             self._post("history", ctx, {"view": dict(view), "cursor": cursor}, timeout))

    def linked_history(self, ctx, view, cursor, *, timeout):
        return self._checked("ConversationHistoryPage",
                             self._post("linked_history", ctx, {"view": dict(view), "cursor": cursor}, timeout))

    def scope(self, ctx, kind, policy_number, *, timeout):
        return self._post("scope", ctx, {"kind": kind, "policy_number": policy_number}, timeout)  # validated by retrieval

    def list_contracts(self, ctx, *, timeout):
        payload = self._post("list_contracts", ctx, {}, timeout)
        items = payload.get("contracts") if isinstance(payload, dict) else None
        if not isinstance(items, list):
            raise CoreError("UNAVAILABLE")
        return [self._checked("ContractSummary", item) for item in items]

    def get_contract_overview(self, ctx, policy_number, *, timeout):
        return self._checked("ContractOverview",
                             self._post("get_contract_overview", ctx, {"policy_number": policy_number}, timeout))
