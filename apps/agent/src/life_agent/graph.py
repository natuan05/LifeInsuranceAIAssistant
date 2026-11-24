"""Four-node custom LangGraph: Prepare -> Agent -> Execute tools -> Agent ... -> Finalize.

Decided rules applied here (Agent_Design sections 3-7, plan Task 5):
- one tool per Agent cycle, exactly four tools, no identity/scope fields in tool arguments;
- per message: 3 retrieval calls (errors included), 4 Core requests for the two read tools, model/token/graph
  caps from Core limits; the ledger lives in the runtime store so replays keep what was spent;
- a finish reserve: near the cap the Agent answers without tools; at the hard cap code reports an unfinished turn;
- Finalize checks structure, citations, actions and ticket source refs by code, repairs at most once;
- the result or technical failure is persisted by the store before anything is delivered.
The trusted ExecutionContext is LangGraph runtime context: it is never written into state or shown to the model.
"""
from __future__ import annotations

import copy
import json
import math
import re
import unicodedata
from typing import Any, Callable, Mapping, Protocol

from langgraph.graph import END, START, StateGraph
from langgraph.runtime import Runtime

from . import contracts
from .config import AgentConfig, ConfigError, RunLimits
from .context import ModelContext, assemble_context, compact_item
from .core_client import BusinessReads, Clock, CoreClient, CoreError, SystemClock, seconds_left
from .model import ModelAdapter
from .state import STATE_SCHEMA_VERSION, AgentState, TrustedContext, new_conversation, new_work
from .store import AttemptInvalid, BudgetExhausted, RuntimeStore

BUSINESS_TOOLS = ("list_contracts", "get_contract_overview")
RETRIEVAL_TOOLS = ("retrieve_public", "retrieve_private")
MAX_HISTORY_PAGES = 100
FULL_CHAT_SUMMARY = re.compile(
    r"(?:(?:(?:hay|vui\s+long)\s+)?(?:tom\s+tat|tong\s+hop)(?:\s+(?:giup(?:\s+toi)?|cho\s+toi))?\s+"
    r"(?:toan(?:\s+bo)?\s+(?:cuoc\s+(?:chat|tro\s+chuyen|hoi\s+thoai)(?:\s+nay)?|lich\s+su(?:\s+chat)?)|"
    r"(?:cuoc\s+(?:chat|tro\s+chuyen|hoi\s+thoai)(?:\s+nay)?\s+)?"
    r"tu\s+(?:luc\s+)?(?:dau|bat\s+dau)(?:\s+den\s+(?:cuoi|hien\s+tai))?)"
    r"|(?:please\s+)?(?:summari[sz]e|summary\s+of)\s+(?:(?:the|this|our)\s+)?"
    r"(?:(?:entire|whole|full|all)\s+(?:chat|conversation|transcript|history)|"
    r"(?:(?:chat|conversation|transcript|history)\s+)?from\s+(?:the\s+)?(?:start|beginning)"
    r"(?:\s+to\s+(?:the\s+)?end)?))(?:\s*[.!?])?",
    re.IGNORECASE,
)
SUMMARY_SCOPE_LIMIT = ("Chưa thể tóm tắt từ đầu đến mốc của lượt này. "
                       "Bạn có thể yêu cầu tóm tắt diễn biến gần đây hoặc một đoạn cụ thể.")
SUMMARY_SCOPE_DRAFT = {"response_type": "CLARIFICATION", "message": SUMMARY_SCOPE_LIMIT, "citations": [], "actions": []}


def requests_full_chat_summary(text: str) -> bool:
    normalized = unicodedata.normalize("NFD", text.lower().replace("đ", "d").replace("Đ", "d"))
    return bool(FULL_CHAT_SUMMARY.fullmatch("".join(c for c in normalized if not unicodedata.combining(c)).strip()))


class RetrievalTools(Protocol):
    """Task 8 engine behind the two retrieval tools. It obtains scope from Core itself; the graph never passes
    document lists, and an AttemptInvalid from Core propagates."""

    def retrieve_public(self, execution: Mapping[str, Any], query: str) -> dict: ...

    def retrieve_private(self, execution: Mapping[str, Any], query: str, policy_number: str) -> dict: ...


class _Stop(Exception):
    def __init__(self, code: str, retryable: bool = False):
        self.failure = {"code": code, "retryable": retryable}
        super().__init__(code)


def execution_context(request: Mapping[str, Any]) -> dict[str, Any]:
    """RunRequest -> trusted ExecutionContext. thread_id comes from the conversation mapping, never from the model."""
    context = {k: copy.deepcopy(v) for k, v in request.items() if k != "message_text"}
    context["thread_id"] = f"conv:{request['conversation_id']}"
    return contracts.validate("ExecutionContext", context)


def source_registry(work: Mapping[str, Any]) -> tuple[dict[str, dict], set[str]]:
    """Evidence by id and successful Core reads of the current message (replaced outputs excluded)."""
    evidence: dict[str, dict] = {}
    core_ok: set[str] = set()
    for output in work["source_outputs"]:
        if output["replaced"]:
            continue
        if output["tool"] in RETRIEVAL_TOOLS:
            for item in output["result"]["evidence"]:
                evidence[item["evidence_id"]] = item
        elif output["result"]["status"] == "OK":
            core_ok.add(output["operation_id"])
    return evidence, core_ok


def _ref_known(ref: str, evidence: Mapping[str, Any], core_ok: set[str], message_ids: set[str]) -> bool:
    kind, _, ident = ref.partition(":")
    return (kind == "evidence" and ident in evidence) or (kind == "core" and ident in core_ok) or \
        (kind == "message" and ident in message_ids)


def check_draft(draft: Mapping[str, Any], channel_type: str, evidence: Mapping[str, Any], core_ok: set[str]) -> list[dict]:
    """Code checks only: structure is already valid; this verifies references and the action allowlist."""
    issues = []
    for citation in draft["citations"]:
        if citation["evidence_id"] not in evidence:
            issues.append({"code": "CITATION_UNKNOWN", "ref": citation["evidence_id"]})
    if channel_type == "STAFF_COPILOT" and draft["actions"]:
        issues.append({"code": "ACTION_NOT_ALLOWED", "ref": draft["actions"][0]["type"]})
    for action in draft["actions"]:
        if action["type"] != "PROPOSE_TICKET":
            continue
        for finding in action["summary"]["verified_findings"]:
            for ref in finding["source_refs"]:
                if not _ref_known(ref, evidence, core_ok, set()):
                    issues.append({"code": "SOURCE_REF_UNKNOWN", "ref": ref})
    return issues


def _namespace_evidence(result: dict, operation_id: str) -> dict:
    """Evidence ids are unique per message: prefix them with the operation that produced them."""
    mapping = {e["evidence_id"]: f"{operation_id}-E{position}"
               for position, e in enumerate(result["evidence"], start=1)}
    result = copy.deepcopy(result)
    for item in result["evidence"]:
        item["evidence_id"] = mapping[item["evidence_id"]]
    for conflict in result["conflicts"]:
        conflict["evidence_ids"] = [mapping.get(i, i) for i in conflict["evidence_ids"]]
    return result


def _error_result(code: str) -> dict:
    return {"status": "ERROR", "evidence": [], "missing": [], "conflicts": [], "degraded": False,
            "error": {"code": code, "retryable": False}}


def build_graph(store: RuntimeStore, core: CoreClient, retrieval: RetrievalTools, model: ModelAdapter,
                config: AgentConfig, *, clock: Clock | None = None, checkpointer: Any = None):
    clock = clock or SystemClock()
    reads = BusinessReads(core, store, clock, retry_wait_s=config.core_retry_wait_s)

    def tokens_for(chars: int) -> int:
        return math.ceil(chars / config.chars_per_token) + config.max_output_tokens

    def sync_counters(work: dict, message_id: str) -> None:
        usage = store.usage(message_id)
        for kind in ("retrieval_calls", "core_read_requests", "model_calls"):
            work["counters"][kind] = usage.get(kind, 0)

    def guard(work: dict, limits: RunLimits) -> None:
        work["counters"]["graph_steps"] += 1
        if work["counters"]["graph_steps"] > limits.graph_steps_max:
            raise _Stop("BUDGET_EXHAUSTED")
        if seconds_left(clock, limits) <= 0:
            raise _Stop("DEADLINE_EXCEEDED")

    def check_model_limits(message_id: str, limits: RunLimits) -> None:
        if seconds_left(clock, limits) <= 0:
            raise _Stop("DEADLINE_EXCEEDED")
        if store.usage(message_id).get("model_tokens", 0) > limits.turn_token_budget:
            raise _Stop("BUDGET_EXHAUSTED")

    def add_error(work: dict, source: str, code: str, operation_id: str | None) -> None:
        work["errors"] = (work["errors"] + [{"source": source, "code": code, "operation_id": operation_id}])[-20:]

    # ------------------------------------------------------------------ Prepare
    def prepare(state: AgentState, runtime: Runtime[TrustedContext]) -> dict:
        execution = runtime.context.execution
        message_id = execution["message_id"]
        previous = state.get("work")
        replay = bool(previous) and previous["message_id"] == message_id
        stored = state.get("event")
        if replay and stored and stored["attempt_id"] == execution["attempt_id"]:
            # Redelivery of the same attempt: the final event is already stored; never rerun model or tools.
            return {"trace": state.get("trace", []) + ["prepare"]}
        # A new attempt for the same message (Core retried after invalidating the old one) continues with the
        # budget already spent; the old attempt's event is not reused.
        conversation = copy.deepcopy(state.get("conversation")) or new_conversation(config.graph_version)
        recent = list(state.get("recent_history") or [])
        linked = list(state.get("linked_history") or [])
        linked_tail_sync = state.get("linked_tail_sync")
        if conversation.get("state_schema_version") != STATE_SCHEMA_VERSION or conversation["graph_version"] != config.graph_version:
            conversation, recent = new_conversation(config.graph_version), []  # rebuild context from Core history
            linked, linked_tail_sync = [], None
        work = copy.deepcopy(previous) if replay else new_work(message_id, execution["run_id"], state["incoming"]["text"])
        update: dict[str, Any] = {"decision": None, "draft": None, "finalize_issue": None, "failure": None,
                                  "result": None, "event": None, "finishing": bool(replay and state.get("finishing")),
                                  "trace": (state.get("trace", []) if replay else []) + ["prepare"]}
        try:
            contracts.validate("ExecutionContext", dict(execution))
            limits = RunLimits.from_contract(execution["limits"])
        except (contracts.ContractError, ConfigError):
            return {**update, "work": work, "conversation": conversation, "recent_history": recent,
                    "failure": {"code": "INTERNAL", "retryable": False}}
        store.open_message(message_id, limits.budget_caps())
        linked_status = state.get("linked_status", "NONE")
        try:
            guard(work, limits)
            recent = _sync_history(execution, conversation, recent, limits)
            linked, linked_status, linked_tail_sync = _sync_linked(execution, conversation, linked, linked_tail_sync, limits)
            _reconcile_pending(conversation, recent)
            recent = _summarize_if_needed(work, conversation, recent, message_id, limits)
        except _Stop as stop:
            update["failure"] = stop.failure
        work["progress"] = "PREPARING"
        sync_counters(work, message_id)
        return {**update, "work": work, "conversation": conversation, "recent_history": recent,
                "linked_history": linked, "linked_status": linked_status, "linked_tail_sync": linked_tail_sync,
                "linked_rollup": state.get("linked_rollup") if replay and linked_status == "SYNCED" else None,
                "full_summary_requested": bool(replay and state.get("full_summary_requested"))}

    def _pages(fetch: Callable[[str | None, float], dict], start: str | None, limits: RunLimits) -> list[dict]:
        items, cursor = [], start
        for _ in range(MAX_HISTORY_PAGES):
            left = seconds_left(clock, limits)
            if left <= 0:
                raise _Stop("DEADLINE_EXCEEDED")
            page = contracts.validate("ConversationHistoryPage", fetch(cursor, left))
            items.extend(page["items"])
            cursor = page["nextCursor"]
            if cursor is None:
                return items
        raise _Stop("SOURCE_UNAVAILABLE", retryable=True)

    def _merge(existing: list[dict], new: list[dict]) -> list[dict]:
        by_position = {item["position"]: item for item in existing}
        for item in new:
            by_position[item["position"]] = item
        return sorted(by_position.values(), key=lambda i: int(i["position"]))

    def _sync_history(execution, conversation, recent, limits) -> list[dict]:
        view = execution["history_view"]
        if view["through_cursor"] is None or conversation["history_synced_through"] == view["through_cursor"]:
            return recent
        try:
            items = _pages(lambda cursor, left: core.history(execution, view, cursor, timeout=left),
                           conversation["history_synced_through"], limits)
        except CoreError as error:
            code = {"NOT_AUTHORIZED": "PERMISSION_DENIED", "INVALID_ATTEMPT": "ATTEMPT_INVALID"}.get(
                error.code, "SOURCE_UNAVAILABLE")
            raise _Stop(code, retryable=error.transient) from error
        conversation["history_synced_through"] = view["through_cursor"]
        return _merge(recent, items)

    def _linked_char_limit(limits) -> int:
        # At most one prompt plus all older segments that the remaining model-call budget could summarize.
        return config.max_context_chars + config.history_summary_threshold_chars * limits.model_calls_max

    def _linked_item_size(item: dict) -> int:
        return len(json.dumps(compact_item(item), ensure_ascii=False)) + 2

    def _cap_linked(items: list[dict], limits) -> tuple[list[dict], bool]:
        char_limit = _linked_char_limit(limits)
        size, start = 0, len(items)
        for item in reversed(items):
            size += _linked_item_size(item)
            if size > char_limit and start < len(items):
                break
            start -= 1
        return items[start:], start == 0

    def _read_linked(execution, view, start, limits, *, backward: bool) -> tuple[list[dict], str]:
        char_limit = _linked_char_limit(limits)
        items, cursor, chars = [], start, 0
        for _ in range(MAX_HISTORY_PAGES):
            left = seconds_left(clock, limits)
            if left <= 0:
                raise _Stop("DEADLINE_EXCEEDED")
            if items and left <= limits.core_request_timeout_s:
                return items, "INTERRUPTED"  # leave time to use the material already read
            try:
                page = core.linked_history(execution, view, cursor,
                                           timeout=min(left, limits.core_request_timeout_s), backward=backward)
            except CoreError as error:
                if backward and items and error.transient:
                    return items, "INTERRUPTED"
                raise
            page_type = "LinkedHistoryBackwardPage" if backward else "ConversationHistoryPage"
            page = contracts.validate(page_type, page)
            batch = page["items"]
            chars += sum(_linked_item_size(item) for item in batch)
            if items and chars > char_limit:
                break
            items.extend(batch)
            cursor = page["previousCursor" if backward else "nextCursor"]
            if cursor is None:
                return items, "COMPLETE"
            if chars >= char_limit:
                break
        return items, "BOUNDED"

    def _sync_linked(execution, conversation, linked, tail_view, limits) -> tuple[list[dict], str, dict | None]:
        if execution["channel_type"] != "STAFF_COPILOT":
            return [], "NONE", None
        view = execution["linked_history_view"]
        if view is None:
            conversation["linked_sync"] = None
            return [], "NONE", None
        full_view = conversation["linked_sync"]
        previous = full_view or tail_view
        def cursor_parts(cursor):
            return ("m1", int(cursor[3:])) if cursor and cursor.startswith("m1_") else ("p", int(cursor[1:]) if cursor else 0)

        format_, position = cursor_parts(view["through_cursor"])
        previous_format, previous_position = cursor_parts(previous.get("through_cursor") if previous else None)
        same_chat = (previous is not None and "through_cursor" in previous and previous.get("conversation_id") == view["conversation_id"]
                     and previous_format == format_ and previous_position <= position)
        base = linked if same_chat else []
        def publish(items, includes_start):
            bounded, retained_start = _cap_linked(items, limits)
            if includes_start and retained_start:
                conversation["linked_sync"] = dict(view)
                return bounded, "SYNCED", None
            conversation["linked_sync"] = None
            return bounded, "PARTIAL", dict(view)

        # Reauthorize via Core on every turn. Cold reads start at the end. Both full and
        # bounded snapshots can fetch appended messages, but only a full view has the start.
        for backward in (not same_chat, same_chat):
            start = previous["through_cursor"] if same_chat and not backward else None
            try:
                items, coverage = _read_linked(execution, view, start, limits, backward=backward)
            except CoreError as error:
                denied = {"NOT_AUTHORIZED": "PERMISSION_DENIED", "INVALID_ATTEMPT": "ATTEMPT_INVALID"}
                if error.code in denied:
                    raise _Stop(denied[error.code]) from error
                if not error.transient:
                    raise _Stop("SOURCE_UNAVAILABLE") from error
                continue
            if coverage == "COMPLETE":
                return publish(_merge(base if not backward else [], items), backward or not same_chat or full_view is not None)
            if backward and items:
                if coverage == "INTERRUPTED":
                    conversation["linked_sync"] = None
                    bounded, _ = _cap_linked(_merge([], items), limits)
                    return bounded, "PARTIAL", None  # retry the older pages on the next turn
                return publish(_merge([], items), False)
        # A cached watermark cannot authorize disclosure to the model for a new turn or attempt.
        raise _Stop("SOURCE_UNAVAILABLE", retryable=True)

    def _summarize_linked_sections(state, execution, limits, work) -> list[dict] | None:
        items = [compact_item(item) for item in state["linked_history"]]
        keep = config.copilot_recent_items
        older = items[: max(0, len(items) - keep)]
        if not older:
            return None
        max_input = min(config.history_summary_threshold_chars, config.max_context_chars // 2)
        max_output = min(1200, config.max_context_chars // 12)
        if max_input <= 0 or max_output <= 0:
            return None
        parts: list[list[dict]] = []
        part: list[dict] = []
        size = 2
        for entry in older:
            entry_size = len(json.dumps(entry, ensure_ascii=False)) + 2
            if entry_size > max_input:
                return None
            if part and size + entry_size > max_input:
                parts.append(part)
                part, size = [], 2
            part.append(entry)
            size += entry_size
        if part:
            parts.append(part)
        message_id = execution["message_id"]
        if store.usage(message_id).get("model_calls", 0) + len(parts) >= limits.model_calls_max:
            return None
        summaries = []
        for part in parts:
            guard(work, limits)
            operation = f"linked-summary-{store.usage(message_id).get('model_calls', 0) + 1}"
            try:
                store.reserve(message_id, "model_calls", operation)
                store.reserve(message_id, "model_tokens", operation, tokens_for(len(json.dumps(part, ensure_ascii=False))))
            except BudgetExhausted:
                return None
            try:
                reply = model.summarize(part, max_chars=max_output)
            except Exception:
                return None
            store.settle(message_id, "model_tokens", operation, reply.usage.total)
            _count_tokens(work, reply)
            check_model_limits(message_id, limits)
            if not reply.complete or not isinstance(reply.output, str) or not reply.output.strip() or len(reply.output) > max_output:
                return None
            summaries.append({"from_position": part[0]["position"], "through_position": part[-1]["position"],
                              "text": reply.output})
        return summaries

    def _reconcile_pending(conversation, recent) -> None:
        pending = conversation["pending_clarification"]
        if not pending or pending["status"] != "PROPOSED":
            return
        outcome = next((i for i in recent if i["kind"] in ("AGENT_RESULT", "RUN_OUTCOME")
                        and i["runId"] == pending["asked_in_run_id"]), None)
        if outcome is None:
            return  # Core has not accepted it yet: not usable for interpreting the next message
        if outcome["kind"] == "AGENT_RESULT" and outcome["result"]["response_type"] == "CLARIFICATION":
            pending["status"] = "ASKED"
        else:
            conversation["pending_clarification"] = None

    def _summarize_if_needed(work, conversation, recent, message_id, limits) -> list[dict]:
        keep = config.recent_turns
        older = recent[: max(len(recent) - keep, 0)]
        summary = conversation["history_summary"]
        if summary:
            older = [i for i in older if int(i["position"]) > int(summary["covers_through"])]
        material = [compact_item(i) for i in older]
        if not older or len(str(material)) <= config.history_summary_threshold_chars:
            return recent
        if summary:
            material = [{"previous_summary": summary["text"]}] + material
        check_model_limits(message_id, limits)
        # Prepare itself may not have checkpointed before a crash. Allocate from ledger usage,
        # never a graph-step counter that can roll back and reuse a spent reservation.
        operation = f"summary-{store.usage(message_id).get('model_calls', 0) + 1}"
        try:
            store.reserve(message_id, "model_calls", operation)
            store.reserve(message_id, "model_tokens", operation, tokens_for(len(str(material))))
        except BudgetExhausted:
            return recent  # context assembly omits older turns with coverage metadata instead
        max_output = min(4000, config.history_summary_threshold_chars)
        try:
            reply = model.summarize(material, max_chars=max_output)
        except Exception:
            add_error(work, "MODEL", "SUMMARY_FAILED", None)
            return recent
        store.settle(message_id, "model_tokens", operation, reply.usage.total)
        _count_tokens(work, reply)
        check_model_limits(message_id, limits)
        if not reply.complete or not isinstance(reply.output, str) or not reply.output.strip() or len(reply.output) > max_output:
            add_error(work, "MODEL", "SUMMARY_FAILED", None)
            return recent
        covers = older[-1]["position"]
        conversation["history_summary"] = {"text": reply.output, "covers_through": covers}
        return [i for i in recent if int(i["position"]) > int(covers)]

    def _count_tokens(work, reply) -> None:
        work["counters"]["input_tokens"] += reply.usage.input_tokens
        work["counters"]["output_tokens"] += reply.usage.output_tokens
        work["counters"]["thinking_tokens"] += reply.usage.thinking_tokens

    # ------------------------------------------------------------------ Agent
    def agent(state: AgentState, runtime: Runtime[TrustedContext]) -> dict:
        execution = runtime.context.execution
        message_id = execution["message_id"]
        limits = RunLimits.from_contract(execution["limits"])
        work = copy.deepcopy(state["work"])
        conversation = copy.deepcopy(state["conversation"])
        trace = state.get("trace", []) + ["agent"]
        finishing = bool(state.get("finishing") or state.get("finalize_issue"))
        rollup = state.get("linked_rollup")
        full_summary_requested = bool(state.get("full_summary_requested"))
        try:
            guard(work, limits)
            usage = store.usage(message_id)
            available = []
            if usage.get("retrieval_calls", 0) < limits.retrieval_calls_max:
                available += list(RETRIEVAL_TOOLS)
            if usage.get("core_read_requests", 0) < limits.core_read_requests_max:
                available += list(BUSINESS_TOOLS)
            if not available or usage.get("model_calls", 0) >= limits.model_calls_max - 1:
                finishing = True
            view_state = {**state, "work": work, "conversation": conversation}
            context = assemble_context(view_state, execution, config, finishing=finishing, available_tools=available)
            copilot = execution["channel_type"] == "STAFF_COPILOT"
            full_summary = copilot and (full_summary_requested
                                        or requests_full_chat_summary(work["original_question"]))
            if full_summary:
                linked = context.linked_source
                if linked and linked["status"] == "SYNCED" and (context.overflow or not linked["coverage"]["includes_start"]) and not rollup:
                    rollup = _summarize_linked_sections(view_state, execution, limits, work)
                    view_state["linked_rollup"] = rollup
                    finishing = True
                    context = assemble_context(view_state, execution, config, finishing=True, available_tools=[])
                    linked = context.linked_source
                if not linked or linked["status"] != "SYNCED" or not linked["coverage"]["includes_start"] or context.overflow:
                    sync_counters(work, message_id)
                    return {"draft": copy.deepcopy(SUMMARY_SCOPE_DRAFT), "decision": None,
                            "work": work, "conversation": conversation, "trace": trace}
                usage = store.usage(message_id)
            estimate = tokens_for(context.size_chars)
            tokens_left = limits.turn_token_budget - usage.get("model_tokens", 0)
            if not finishing and tokens_left - estimate < limits.finish_reserve_tokens:
                finishing = True
                context = assemble_context(view_state, execution, config, finishing=True, available_tools=available)
                estimate = tokens_for(context.size_chars)
            operation = f"model-{usage.get('model_calls', 0) + 1}"
            try:
                store.reserve(message_id, "model_calls", operation)
                store.reserve(message_id, "model_tokens", operation, estimate)
            except BudgetExhausted:
                if full_summary:
                    sync_counters(work, message_id)
                    return {"draft": copy.deepcopy(SUMMARY_SCOPE_DRAFT), "decision": None,
                            "work": work, "conversation": conversation, "trace": trace}
                raise _Stop("BUDGET_EXHAUSTED")
            try:
                reply = model.decide(context)
            except Exception:
                raise _Stop("MODEL_ERROR", retryable=True)
            store.settle(message_id, "model_tokens", operation, reply.usage.total)
            _count_tokens(work, reply)
            check_model_limits(message_id, limits)
            output = reply.output
            linked = context.linked_source
            summary_scope = reply.notes.get("summary_scope")
            classified_full = copilot and summary_scope == "FULL"
            full_coverage = linked and linked["status"] == "SYNCED" and linked["coverage"]["includes_start"] and not context.overflow
            if classified_full and reply.complete and not full_summary and linked and linked["status"] == "SYNCED" and not full_coverage:
                sync_counters(work, message_id)
                return {"draft": None, "decision": None, "work": work, "conversation": conversation,
                        "trace": trace, "full_summary_requested": True}
            full_summary_requested = full_summary_requested or (classified_full and reply.complete)
            wrong_answer_scope = isinstance(output, dict) and output.get("response_type") == "ANSWER" and summary_scope != "FULL"
            if (full_summary or classified_full) and (not reply.complete or not full_coverage or wrong_answer_scope):
                output = copy.deepcopy(SUMMARY_SCOPE_DRAFT)
            else:
                _apply_notes(reply.notes, work, conversation, state)
            if not contracts.is_valid("AgentDecision", output):
                raise _Stop("OUTPUT_INVALID")  # e.g. several tools, unknown tool, identity/scope fields
            if "tool" in output and finishing:
                raise _Stop("OUTPUT_INVALID")
            update = {"decision": output, "draft": None} if "tool" in output else {"draft": output, "decision": None}
        except _Stop as stop:
            update = {"failure": stop.failure}
        work["progress"] = "COMPOSING" if update.get("draft") else work["progress"]
        sync_counters(work, message_id)
        return {**update, "work": work, "conversation": conversation, "finishing": finishing, "trace": trace,
                "linked_rollup": rollup, "full_summary_requested": full_summary_requested}

    def _apply_notes(notes: Mapping[str, Any], work: dict, conversation: dict, state: Mapping[str, Any]) -> None:
        if not notes:
            return
        if contracts.is_valid("AgentAssessment", notes.get("assessment")):
            work["agent_assessment"] = notes["assessment"]
        if "unverified_conditions" in notes:
            evidence, core_ok = source_registry(work)
            message_ids = {work["message_id"]} | {i["messageId"] for i in state.get("recent_history", [])
                                                  if i["kind"] == "USER_MESSAGE"}
            accepted = []
            for condition in notes["unverified_conditions"] or []:
                if contracts.is_valid("UnverifiedCondition", condition) and all(
                        _ref_known(ref, evidence, core_ok, message_ids) for ref in condition["basis_refs"]):
                    accepted.append(condition)
                else:
                    add_error(work, "MODEL", "CONDITION_WITHOUT_BASIS", None)
            work["unverified_conditions"] = accepted[:20]
        topic = notes.get("topic")
        if isinstance(topic, str) and topic.strip():
            conversation["topic"] = topic.strip()[:300]

    # ------------------------------------------------------------------ Execute tools
    def execute_tools(state: AgentState, runtime: Runtime[TrustedContext]) -> dict:
        execution = runtime.context.execution
        message_id = execution["message_id"]
        limits = RunLimits.from_contract(execution["limits"])
        work = copy.deepcopy(state["work"])
        conversation = copy.deepcopy(state["conversation"])
        trace = state.get("trace", []) + ["execute_tools"]
        decision = state["decision"]
        tool, arguments = decision["tool"], decision["arguments"]
        update: dict[str, Any] = {"decision": None}
        try:
            guard(work, limits)
            # Unique per execution: a replay after a crash runs Prepare again, so the step number (and therefore the
            # ledger operation id) differs and a reservation spent before the crash is never granted again.
            operation = f"op-{work['counters']['graph_steps']}"
            try:
                if tool == "list_contracts":
                    result = reads.list_contracts(execution, limits, operation)
                elif tool == "get_contract_overview":
                    result = reads.get_contract_overview(execution, limits, operation, arguments["policy_number"])
                else:
                    store.reserve(message_id, "retrieval_calls", operation)
                    try:
                        if tool == "retrieve_public":
                            raw = retrieval.retrieve_public(execution, arguments["query"])
                        else:
                            raw = retrieval.retrieve_private(execution, arguments["query"], arguments["policy_number"])
                        result = _namespace_evidence(contracts.validate("RetrievalResult", raw), operation)
                    except (AttemptInvalid, CoreError):
                        raise
                    except Exception:
                        result = _error_result("INTERNAL")
            except BudgetExhausted:
                add_error(work, "TOOL", "BUDGET_EXHAUSTED", None)
                result = None
            except AttemptInvalid:
                raise _Stop("ATTEMPT_INVALID")
            except CoreError as error:
                code = {"NOT_AUTHORIZED": "PERMISSION_DENIED", "INVALID_ATTEMPT": "ATTEMPT_INVALID"}.get(
                    error.code, "SOURCE_UNAVAILABLE")
                raise _Stop(code, retryable=error.transient) from error
            if result is not None:
                if tool in BUSINESS_TOOLS and result["status"] == "DENIED":
                    # Core denies the run here. A missing individual contract returns NOT_FOUND.
                    failure = "ATTEMPT_INVALID" if result["error"]["code"] == "INVALID_ATTEMPT" else "PERMISSION_DENIED"
                    raise _Stop(failure)
                for output in work["source_outputs"]:
                    if output["tool"] == tool and output["arguments"] == arguments:
                        output["replaced"] = True
                record = {"operation_id": operation, "tool": tool, "arguments": arguments, "result": result, "replaced": False}
                work["source_outputs"] = work["source_outputs"] + [contracts.validate("SourceOutput", record)]
                if tool in ("get_contract_overview", "retrieve_private") and result["status"] == "OK":
                    conversation["active_policy_number"] = arguments["policy_number"]
                if result["status"] != "OK":
                    add_error(work, "TOOL", f"{tool.upper()}_{result['status']}", operation)
        except _Stop as stop:
            update["failure"] = stop.failure
        work["progress"] = "LOOKING_UP"
        sync_counters(work, message_id)
        return {**update, "work": work, "conversation": conversation, "trace": trace}

    # ------------------------------------------------------------------ Finalize
    def finalize(state: AgentState, runtime: Runtime[TrustedContext]) -> dict:
        execution = runtime.context.execution
        message_id = execution["message_id"]
        work = copy.deepcopy(state["work"])
        conversation = copy.deepcopy(state["conversation"])
        trace = state.get("trace", []) + ["finalize"]
        failure = state.get("failure")
        result = None
        if failure is None:
            try:
                check_model_limits(message_id, RunLimits.from_contract(execution["limits"]))
            except _Stop as stop:
                failure = stop.failure
        if failure is None:
            draft = state["draft"]
            evidence, core_ok = source_registry(work)
            issues = check_draft(draft, execution["channel_type"], evidence, core_ok)
            if issues:
                limits = RunLimits.from_contract(execution["limits"])
                can_repair = (work["counters"]["repair_attempts"] < 1 and seconds_left(clock, limits) > 0
                              and store.usage(message_id).get("model_calls", 0) < limits.model_calls_max)
                if can_repair:
                    work["counters"]["repair_attempts"] += 1
                    return {"finalize_issue": {"issues": issues}, "draft": None, "work": work, "trace": trace}
                failure = {"code": "OUTPUT_INVALID", "retryable": False}
            else:
                result = {"response_type": draft["response_type"], "message": draft["message"],
                          "citations": [_citation(evidence[c["evidence_id"]]) for c in draft["citations"]],
                          "actions": draft["actions"]}
                contracts.validate("AgentResult", result)
        if failure is not None:
            event = store.persist_final(execution, {"failure": failure})
            return {"event": event, "failure": failure, "result": None, "finalize_issue": None, "work": work, "trace": trace}
        _update_pending(conversation, work, execution, result)
        work["progress"] = "COMPOSING"
        sync_counters(work, message_id)
        contracts.validate("MessageWork", work)
        contracts.validate("ConversationContext", conversation)
        event = store.persist_final(execution, {"result": result})
        return {"event": event, "result": result, "finalize_issue": None, "work": work, "conversation": conversation,
                "trace": trace}

    def _update_pending(conversation, work, execution, result) -> None:
        if result["response_type"] != "CLARIFICATION":
            conversation["pending_clarification"] = None
            return
        options = []
        listing = next((o for o in reversed(work["source_outputs"])
                        if o["tool"] == "list_contracts" and not o["replaced"] and o["result"]["status"] == "OK"), None)
        if listing and len(listing["result"]["contracts"]) > 1:
            # Order comes from Core's list, never from the model.
            options = [{"ordinal": i + 1, "label": f"{c['policy_number']} — {c['main_product']['name']}"[:300],
                        "policy_number": c["policy_number"]} for i, c in enumerate(listing["result"]["contracts"][:20])]
        conversation["pending_clarification"] = {
            "status": "PROPOSED", "question": result["message"][:1000], "options": options,
            "asked_in_run_id": execution["run_id"], "asked_in_message_id": execution["message_id"]}

    # ------------------------------------------------------------------ wiring
    def after_prepare(state: AgentState) -> str:
        if state.get("event"):
            return END
        return "finalize" if state.get("failure") else "agent"

    def after_agent(state: AgentState) -> str:
        if state.get("failure") or state.get("draft"):
            return "finalize"
        if state.get("full_summary_requested") and not state.get("decision"):
            return "agent"
        return "execute_tools"

    def after_execute(state: AgentState) -> str:
        return "finalize" if state.get("failure") else "agent"

    def after_finalize(state: AgentState) -> str:
        return "agent" if state.get("finalize_issue") and not state.get("event") else END

    graph = StateGraph(AgentState, context_schema=TrustedContext)
    graph.add_node("prepare", prepare)
    graph.add_node("agent", agent)
    graph.add_node("execute_tools", execute_tools)
    graph.add_node("finalize", finalize)
    graph.add_edge(START, "prepare")
    graph.add_conditional_edges("prepare", after_prepare, ["agent", "finalize", END])
    graph.add_conditional_edges("agent", after_agent, ["agent", "execute_tools", "finalize"])
    graph.add_conditional_edges("execute_tools", after_execute, ["agent", "finalize"])
    graph.add_conditional_edges("finalize", after_finalize, ["agent", END])
    return graph.compile(checkpointer=checkpointer)


def _citation(evidence: Mapping[str, Any]) -> dict:
    return {k: evidence[k] for k in ("evidence_id", "document_id", "document_version", "title", "document_type", "location")}


class AgentRunner:
    """Runs one Core RunRequest through the graph and returns the persisted AgentEvent."""

    def __init__(self, graph: Any):
        self._graph = graph

    def run(self, request: Mapping[str, Any]) -> dict:
        contracts.validate("RunRequest", request)
        execution = execution_context(request)
        steps = request["limits"].get("graph_steps_max") or 1
        config = {"configurable": {"thread_id": execution["thread_id"]}, "recursion_limit": steps + 10}
        # durability="sync": each checkpoint is written (and fenced) before the next step starts.
        out = self._graph.invoke({"incoming": {"message_id": request["message_id"], "text": request["message_text"]}},
                                 config, context=TrustedContext(execution), durability="sync")
        return out["event"]


__all__ = ["AgentRunner", "ModelContext", "RetrievalTools", "build_graph", "check_draft", "execution_context",
           "source_registry"]
