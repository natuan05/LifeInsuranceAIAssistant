"""Test doubles: scripted model, in-memory runtime store, fake Core, fake retrieval and a manual clock.

Synthetic data only. Customer/policy/document ids reuse data/synthetic/manulife-demo-v1; the rest are uuid5 values
derived from readable names so failures are easy to read. None of these doubles prove durability or permissions.
"""
from __future__ import annotations

import copy
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Iterable

from life_agent import contracts
from life_agent.config import AgentConfig
from life_agent.core_client import CoreError
from life_agent.graph import AgentRunner, build_graph
from life_agent.model import ModelReply, TokenUsage
from life_agent.store import MemoryStore
from langgraph.checkpoint.memory import InMemorySaver

NS = uuid.UUID("6a0f6d55-8a8c-4d5e-9a71-2b8a1c9e0f00")
CUSTOMER = "472f999c-4dd4-5510-9cf2-33838eddaad4"
STAFF = "9c4cbaed-e152-5cbb-b8ab-925af8c804f1"
POLICY = "SYN-POL-2024-0001"
POLICY_2 = "SYN-POL-2025-0002"
PRIVATE_DOC = "bd29723f-d5ce-5fda-977a-51eef8bebc74"
PUBLIC_DOC = "6f1d2c3a-0b4e-4a6f-8c7d-1e2f3a4b5c6d"
NOW = datetime(2026, 11, 5, 9, 0, tzinfo=timezone.utc)


def uid(name: str) -> str:
    return str(uuid.uuid5(NS, name))


CONV = uid("customer-conversation")
COPILOT_CONV = uid("copilot-conversation")


def config(**overrides: Any) -> AgentConfig:
    values = dict(graph_version="graph-0.1", max_context_chars=60000, recent_turns=6, history_summary_threshold_chars=4000,
                  copilot_recent_items=4, max_output_tokens=800, core_retry_wait_s=0.0, chars_per_token=4.0)
    values.update(overrides)
    return AgentConfig(**values)


def limits(**overrides: Any) -> dict:
    values = dict(deadline_at=(NOW + timedelta(seconds=90)).isoformat().replace("+00:00", "Z"), retrieval_calls_max=3,
                  core_read_requests_max=4, core_request_timeout_ms=3000, core_retry_per_call=1, model_calls_max=8,
                  graph_steps_max=40, turn_token_budget=100000, finish_reserve_tokens=2000)
    values.update(overrides)
    return values


def run_request(name: str, text: str, *, conversation_id: str = CONV, channel: str = "CUSTOMER_SUPPORT",
                history_cursor: str | None = None, linked_view: dict | None = None, attempt: str = "a1",
                limits_override: dict | None = None) -> dict:
    staff = channel == "STAFF_COPILOT"
    request = {
        "schema_version": "agent-v1", "run_id": uid(f"run:{name}"), "attempt_id": uid(f"attempt:{name}:{attempt}"),
        "conversation_id": conversation_id, "message_id": uid(f"message:{name}"), "message_text": text,
        "channel_type": channel, "actor": {"id": STAFF if staff else CUSTOMER, "role": "STAFF" if staff else "CUSTOMER"},
        "target_customer_id": CUSTOMER,
        "history_view": {"conversation_id": conversation_id, "through_cursor": history_cursor,
                         "current_message_id": uid(f"message:{name}")},
        "linked_history_view": linked_view, "limits": limits(**(limits_override or {})),
    }
    return contracts.validate("RunRequest", request)


# ---------------------------------------------------------------- data builders
def evidence(eid: str, content: str, *, doc: str = PRIVATE_DOC, version: str = "synthetic-v1", doc_type: str = "CONTRACT",
             anchor: str | None = "syn-benefits", pages: list[int] | None = None, clause: str | None = None) -> dict:
    location = {k: v for k, v in {"anchor": anchor, "pages": pages, "clause": clause}.items() if v}
    return {"evidence_id": eid, "document_id": doc, "document_version": version, "title": "Tài liệu synthetic",
            "document_type": doc_type, "location": location, "content": content}


def retrieval_ok(*items: dict, missing: list | None = None, degraded: bool = False) -> dict:
    return {"status": "OK", "evidence": list(items), "missing": missing or [], "conflicts": [], "degraded": degraded, "error": None}


def retrieval_status(status: str, *, error: str | None = None, degraded: bool = False) -> dict:
    return {"status": status, "evidence": [], "missing": [], "conflicts": [], "degraded": degraded,
            "error": {"code": error, "retryable": True} if error else None}


def contract(policy: str, name: str = "Hành Trình Hạnh Phúc – Gia Tăng Bảo Vệ (fixture)") -> dict:
    return {"policy_number": policy, "main_product": {"code": "SYN-HTHP-GTBV", "name": name}}


def overview(policy: str, riders: list[dict] | None = None, complete: bool = False) -> dict:
    return {**contract(policy), "riders": riders or [], "riders_complete": complete}


def user_item(position: int, name: str, text: str, *, run: str | None = None, sender: str = "CUSTOMER") -> dict:
    return {"kind": "USER_MESSAGE", "position": str(position), "messageId": uid(f"message:{name}"), "senderType": sender,
            "content": text, "createdAt": NOW.isoformat().replace("+00:00", "Z"),
            "run": {"id": uid(f"run:{run}"), "status": "COMPLETED"} if run else None}


def result_item(position: int, name: str, result: dict) -> dict:
    return {"kind": "AGENT_RESULT", "position": str(position), "runId": uid(f"run:{name}"), "messageId": uid(f"message:{name}"),
            "result": result, "createdAt": NOW.isoformat().replace("+00:00", "Z")}


def outcome_item(position: int, name: str, status: str = "FAILED", code: str = "SOURCE_UNAVAILABLE") -> dict:
    return {"kind": "RUN_OUTCOME", "position": str(position), "runId": uid(f"run:{name}"), "messageId": uid(f"message:{name}"),
            "status": status, "code": code, "createdAt": NOW.isoformat().replace("+00:00", "Z")}


def tool(name: str, **arguments: Any) -> dict:
    return {"tool": name, "arguments": arguments}


def draft(message: str, *, cites: Iterable[str] = (), actions: list | None = None, response_type: str = "ANSWER") -> dict:
    return {"response_type": response_type, "message": message, "citations": [{"evidence_id": c} for c in cites],
            "actions": actions or []}


def reply(output: Any, *, tokens: tuple[int, int] = (300, 80), notes: dict | None = None) -> ModelReply:
    return ModelReply(output=output, usage=TokenUsage(*tokens), notes=notes or {})


def evidence_ids(context: Any) -> list[str]:
    return [e["evidence_id"] for r in context.retrieval_results for e in r["evidence"]]


def answer_citing(message: str, *, which: list[int] | None = None, notes: Callable[[list[str]], dict] | None = None,
                  response_type: str = "ANSWER", actions: Callable[[Any], list] | None = None) -> Callable[[Any], ModelReply]:
    """Scripted step that cites evidence the graph actually returned (ids are assigned by code, not by tests)."""
    def step(context: Any) -> ModelReply:
        ids = evidence_ids(context)
        cites = ids if which is None else [ids[i] for i in which]
        return reply(draft(message, cites=cites, response_type=response_type, actions=actions(context) if actions else None),
                     notes=notes(ids) if notes else None)
    return step


# ---------------------------------------------------------------- doubles
class ManualClock:
    def __init__(self, now: datetime = NOW):
        self.current = now
        self.sleeps: list[float] = []

    def now(self) -> datetime:
        return self.current

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.current += timedelta(seconds=seconds)

    def advance(self, seconds: float) -> None:
        self.current += timedelta(seconds=seconds)


InMemoryStore = MemoryStore  # moved to life_agent.store for local evaluation runs


def _pos(cursor: str | None) -> int:
    return int(cursor[1:]) if cursor else 0


class FakeCore:
    """Core internal API double. Cursors are 'p<position>'; Core semantics (permissions) are NOT simulated."""

    def __init__(self, *, page_size: int = 50) -> None:
        self.page_size = page_size
        self.histories: dict[str, list[dict]] = {}
        self.contract_list: list[dict] = []
        self.overviews: dict[str, dict] = {}
        self.script: dict[str, list[Any]] = {"list_contracts": [], "get_contract_overview": []}
        self.calls: list[tuple] = []
        self.fail_linked: CoreError | None = None

    def _page(self, kind: str, view: dict, cursor: str | None, timeout: float) -> dict:
        self.calls.append((kind, copy.deepcopy(view), cursor, timeout))
        items = [i for i in self.histories.get(view["conversation_id"], [])
                 if _pos(cursor) < int(i["position"]) <= _pos(view["through_cursor"])]
        page = items[: self.page_size]
        more = len(items) > self.page_size
        return {"items": copy.deepcopy(page), "nextCursor": f"p{page[-1]['position']}" if more else None}

    def history(self, ctx: dict, view: dict, cursor: str | None, *, timeout: float) -> dict:
        return self._page("history", view, cursor, timeout)

    def linked_history(self, ctx: dict, view: dict, cursor: str | None, *, timeout: float) -> dict:
        if self.fail_linked:
            self.calls.append(("linked_history", copy.deepcopy(view), cursor, timeout))
            raise self.fail_linked
        return self._page("linked_history", view, cursor, timeout)

    def scope(self, ctx: dict, kind: str, policy_number: str | None, *, timeout: float) -> dict:
        raise AssertionError("the graph must not request scope itself; the retrieval engine does")

    def _scripted(self, name: str, default: Callable[[], Any]) -> Any:
        if self.script[name]:
            step = self.script[name].pop(0)
            if isinstance(step, CoreError):
                raise step
            return step
        return default()

    def list_contracts(self, ctx: dict, *, timeout: float) -> list[dict]:
        self.calls.append(("list_contracts", None, None, timeout))
        return self._scripted("list_contracts", lambda: copy.deepcopy(self.contract_list))

    def get_contract_overview(self, ctx: dict, policy_number: str, *, timeout: float) -> dict:
        self.calls.append(("get_contract_overview", policy_number, None, timeout))

        def default() -> dict:
            if policy_number not in self.overviews:
                raise CoreError("NOT_FOUND")
            return copy.deepcopy(self.overviews[policy_number])
        return self._scripted("get_contract_overview", default)

    def count(self, kind: str) -> int:
        return sum(1 for c in self.calls if c[0] == kind)


class FakeRetrieval:
    def __init__(self, results: dict[str, Any] | None = None) -> None:
        self.results = results or {}
        self.calls: list[tuple] = []

    def _answer(self, key: str) -> dict:
        value = self.results.get(key, retrieval_status("NO_MATCH"))
        if isinstance(value, list):
            value = value.pop(0) if len(value) > 1 else value[0]
        if isinstance(value, BaseException):
            raise value
        return copy.deepcopy(value)

    def retrieve_public(self, execution: dict, query: str) -> dict:
        self.calls.append(("retrieve_public", query, None))
        return self._answer(query)

    def retrieve_private(self, execution: dict, query: str, policy_number: str) -> dict:
        self.calls.append(("retrieve_private", query, policy_number))
        return self._answer(query)


class ProcessCrash(BaseException):
    """Simulates the worker dying mid-run: not an Exception, so nodes do not convert it into a failure."""


class ScriptedModel:
    def __init__(self, steps: Iterable[Any]) -> None:
        self.steps = list(steps)
        self.contexts: list[Any] = []
        self.summaries: list[Any] = []

    def decide(self, context: Any) -> ModelReply:
        self.contexts.append(context)
        if not self.steps:
            raise AssertionError("model called more times than scripted")
        step = self.steps.pop(0)
        if isinstance(step, BaseException):
            raise step
        return step(context) if callable(step) else step

    def summarize(self, items: Any, *, max_chars: int) -> ModelReply:
        self.summaries.append(items)
        return ModelReply(output="Tóm tắt synthetic các lượt cũ.", usage=TokenUsage(120, 40))


class Harness:
    def __init__(self, model: ScriptedModel, *, core: FakeCore | None = None, retrieval: FakeRetrieval | None = None,
                 cfg: AgentConfig | None = None, clock: ManualClock | None = None) -> None:
        self.model = model
        self.core = core or FakeCore()
        self.retrieval = retrieval or FakeRetrieval()
        self.store = InMemoryStore()
        self.clock = clock or ManualClock()
        self.checkpointer = InMemorySaver()
        self.graph = build_graph(self.store, self.core, self.retrieval, model, cfg or config(), clock=self.clock,
                                 checkpointer=self.checkpointer)
        self.runner = AgentRunner(self.graph)

    def run(self, request: dict) -> dict:
        return self.runner.run(request)

    def state(self, conversation_id: str = CONV) -> dict:
        return self.graph.get_state({"configurable": {"thread_id": f"conv:{conversation_id}"}}).values
