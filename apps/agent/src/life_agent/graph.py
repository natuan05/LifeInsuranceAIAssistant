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
import math
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
    mapping = {e["evidence_id"]: f"{operation_id}-{e['evidence_id']}"[:64] for e in result["evidence"]}
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
        if conversation.get("state_schema_version") != STATE_SCHEMA_VERSION or conversation["graph_version"] != config.graph_version:
            conversation, recent = new_conversation(config.graph_version), []  # rebuild context from Core history
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
        linked = list(state.get("linked_history") or [])
        linked_status = state.get("linked_status", "NONE")
        try:
            guard(work, limits)
            recent = _sync_history(execution, conversation, recent, limits)
            linked, linked_status = _sync_linked(execution, conversation, linked, linked_status, limits)
            _reconcile_pending(conversation, recent)
            recent = _summarize_if_needed(work, conversation, recent, message_id)
        except _Stop as stop:
            update["failure"] = stop.failure
        work["progress"] = "PREPARING"
        sync_counters(work, message_id)
        return {**update, "work": work, "conversation": conversation, "recent_history": recent,
                "linked_history": linked, "linked_status": linked_status}

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
            raise _Stop("SOURCE_UNAVAILABLE", retryable=error.transient) from error
        conversation["history_synced_through"] = view["through_cursor"]
        return _merge(recent, items)

    def _sync_linked(execution, conversation, linked, status, limits) -> tuple[list[dict], str]:
        if execution["channel_type"] != "STAFF_COPILOT":
            return [], "NONE"
        view = execution["linked_history_view"]
        if view is None:
            conversation["linked_sync"] = None
            return [], "NONE"
        previous = conversation["linked_sync"]
        if previous == view:
            return linked, status  # same Staff question: the frozen view is not refreshed
        same_chat = previous is not None and previous["conversation_id"] == view["conversation_id"]
        start = previous["through_cursor"] if same_chat else None
        base = linked if same_chat else []
        try:
            items = _pages(lambda cursor, left: core.linked_history(execution, view, cursor, timeout=left), start, limits)
        except CoreError:
            return base, "SYNC_FAILED"  # keep what was read before; never labelled as fully synced
        conversation["linked_sync"] = dict(view)
        return _merge(base, items), "SYNCED"

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

    def _summarize_if_needed(work, conversation, recent, message_id) -> list[dict]:
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
        operation = f"summary-{work['counters']['graph_steps']}"
        try:
            store.reserve(message_id, "model_calls", operation)
            store.reserve(message_id, "model_tokens", operation, tokens_for(len(str(material))))
        except BudgetExhausted:
            return recent  # context assembly omits older turns with coverage metadata instead
        try:
            reply = model.summarize(material, max_chars=config.history_summary_threshold_chars)
        except Exception:
            add_error(work, "MODEL", "SUMMARY_FAILED", None)
            return recent
        store.settle(message_id, "model_tokens", operation, reply.usage.total)
        _count_tokens(work, reply)
        covers = older[-1]["position"]
        conversation["history_summary"] = {"text": str(reply.output)[:4000] or "-", "covers_through": covers}
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
        finishing = bool(state.get("finishing"))
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
                raise _Stop("BUDGET_EXHAUSTED")
            try:
                reply = model.decide(context)
            except Exception:
                raise _Stop("MODEL_ERROR", retryable=True)
            store.settle(message_id, "model_tokens", operation, reply.usage.total)
            _count_tokens(work, reply)
            _apply_notes(reply.notes, work, conversation, state)
            output = reply.output
            if not contracts.is_valid("AgentDecision", output):
                raise _Stop("OUTPUT_INVALID")  # e.g. several tools, unknown tool, identity/scope fields
            if "tool" in output and finishing:
                raise _Stop("OUTPUT_INVALID")
            update = {"decision": output, "draft": None} if "tool" in output else {"draft": output, "decision": None}
        except _Stop as stop:
            update = {"failure": stop.failure}
        work["progress"] = "COMPOSING" if update.get("draft") else work["progress"]
        sync_counters(work, message_id)
        return {**update, "work": work, "conversation": conversation, "finishing": finishing, "trace": trace}

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
                    except AttemptInvalid:
                        raise
                    except Exception:
                        result = _error_result("INTERNAL")
            except BudgetExhausted:
                add_error(work, "TOOL", "BUDGET_EXHAUSTED", None)
                result = None
            except AttemptInvalid:
                raise _Stop("ATTEMPT_INVALID")
            if result is not None:
                if tool in BUSINESS_TOOLS and result["status"] == "DENIED" and result["error"]["code"] == "INVALID_ATTEMPT":
                    raise _Stop("ATTEMPT_INVALID")
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
    graph.add_conditional_edges("agent", after_agent, ["execute_tools", "finalize"])
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
        out = self._graph.invoke({"incoming": {"message_id": request["message_id"], "text": request["message_text"]}},
                                 config, context=TrustedContext(execution))
        return out["event"]


__all__ = ["AgentRunner", "ModelContext", "RetrievalTools", "build_graph", "check_draft", "execution_context",
           "source_registry"]
