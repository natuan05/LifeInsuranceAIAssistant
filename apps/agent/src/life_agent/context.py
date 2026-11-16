"""Context assembly for each Agent model call (Agent_Design #model-context-assembly, #context-overflow-policy).

Five source groups: instructions/tools, current question, conversation context, Core results, retrieval results.
Reduction order when over max_context_chars:
  1. drop replaced tool outputs and duplicate evidence (always);
  2. older history is represented by its summary (made in Prepare when over threshold); uncovered older own
     history, then older linked Copilot history, are omitted with coverage metadata;
  3. drop evidence not needed for identified conditions, oldest outputs first, keeping whole passages;
  4. if still too large, mark overflow so the Agent narrows the question or answers only the verified part.
The question, instructions and recent turns are never cut. Nothing here proves permissions.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Mapping

from .config import AgentConfig
from .prompts import TOOL_DEFINITIONS, build_system_prompt, prompt_version


@dataclass(frozen=True)
class ModelContext:
    system_prompt: str
    prompt_version: str
    channel_type: str
    tools: dict[str, Any]
    question: str
    conversation: dict[str, Any]
    linked_source: dict[str, Any] | None
    core_results: list[dict[str, Any]]
    retrieval_results: list[dict[str, Any]]
    unverified_conditions: list[dict[str, Any]]
    finishing: bool
    finalize_issue: dict[str, Any] | None
    overflow: bool
    dropped_evidence: int
    size_chars: int
    budget_notes: list[str] = field(default_factory=list)


def compact_item(item: Mapping[str, Any]) -> dict[str, Any]:
    kind = item["kind"]
    if kind == "USER_MESSAGE":
        return {"position": item["position"], "role": item["senderType"], "text": item["content"]}
    if kind == "AGENT_RESULT":
        return {"position": item["position"], "role": "AGENT", "response_type": item["result"]["response_type"],
                "text": item["result"]["message"]}
    return {"position": item["position"], "role": "SYSTEM", "technical_outcome": item["status"], "code": item["code"]}


def _size(payload: Any) -> int:
    return len(json.dumps(payload, ensure_ascii=False))


def _dedupe_outputs(work: Mapping[str, Any]) -> tuple[list[dict], list[dict]]:
    core, retrieval, seen = [], [], set()
    for output in work["source_outputs"]:
        if output["replaced"]:
            continue
        if output["tool"] in ("list_contracts", "get_contract_overview"):
            core.append({"source_ref": f"core:{output['operation_id']}", "tool": output["tool"],
                         "arguments": output["arguments"], "result": output["result"]})
            continue
        result = output["result"]
        evidence = []
        for item in result["evidence"]:
            key = (item["document_id"], item["document_version"], json.dumps(item["location"], sort_keys=True), item["content"])
            if key in seen:
                continue
            seen.add(key)
            evidence.append(item)
        retrieval.append({"operation_id": output["operation_id"], "tool": output["tool"], "arguments": output["arguments"],
                          "status": result["status"], "degraded": result["degraded"], "error": result["error"],
                          "missing": result["missing"], "conflicts": result["conflicts"], "evidence": evidence})
    return core, retrieval


def assemble_context(state: Mapping[str, Any], execution: Mapping[str, Any], config: AgentConfig, *,
                     finishing: bool, available_tools: list[str]) -> ModelContext:
    channel = execution["channel_type"]
    conversation = state["conversation"]
    work = state["work"]
    history = [compact_item(i) for i in state.get("recent_history", [])]
    recent = history[-config.recent_turns:] if config.recent_turns else []
    older = history[: len(history) - len(recent)]
    summary = conversation.get("history_summary")
    if summary:
        older = [i for i in older if int(i["position"]) > int(summary["covers_through"])]
    pending = conversation.get("pending_clarification")
    conv_payload = {
        "topic": conversation.get("topic"),
        "active_policy_number": conversation.get("active_policy_number"),
        "pending_clarification": pending if pending and pending["status"] == "ASKED" else None,
        "history_summary": summary["text"] if summary else None,
        "older_turns": older,
        "recent_turns": recent,
        "omitted_older_turns": 0,
    }
    core, retrieval = _dedupe_outputs(work)
    linked = None
    if channel == "STAFF_COPILOT":
        items = [compact_item(i) for i in state.get("linked_history", [])]
        window = items[-config.copilot_recent_items:] if config.copilot_recent_items else []
        linked = {"status": state.get("linked_status", "NONE"),
                  "view": conversation.get("linked_sync"),
                  "older_items": items[: len(items) - len(window)],
                  "recent_items": window,
                  "coverage": {"total_items": len(items), "recent_window": len(window),
                               "includes_start": True, "omitted_older_items": 0}}
    tools = {} if finishing else {name: TOOL_DEFINITIONS[name] for name in available_tools}
    system_prompt = build_system_prompt(channel)
    conditions = list(work["unverified_conditions"])

    def payload() -> dict[str, Any]:
        return {"system": system_prompt, "tools": tools, "question": work["original_question"],
                "conversation": conv_payload, "linked_source": linked, "core_results": core,
                "retrieval_results": retrieval, "unverified_conditions": conditions,
                "finalize_issue": state.get("finalize_issue")}

    limit = config.max_context_chars
    notes: list[str] = []
    if _size(payload()) > limit and conv_payload["older_turns"]:
        conv_payload["omitted_older_turns"] = len(conv_payload["older_turns"])
        conv_payload["older_turns"] = []
        notes.append("older_turns_omitted")
    if linked and _size(payload()) > limit and linked["older_items"]:
        linked["coverage"]["omitted_older_items"] = len(linked["older_items"])
        linked["coverage"]["includes_start"] = False
        linked["older_items"] = []
        notes.append("linked_older_omitted")
    dropped = 0
    if _size(payload()) > limit:
        keep = {ref.split(":", 1)[1] for c in conditions for ref in c["basis_refs"] if ref.startswith("evidence:")}
        latest = retrieval[-1]["operation_id"] if retrieval else None
        for output in retrieval:  # oldest first; whole passages only
            if output["operation_id"] == latest:
                continue
            for item in list(output["evidence"]):
                if _size(payload()) <= limit:
                    break
                if item["evidence_id"] in keep:
                    continue
                output["evidence"].remove(item)
                dropped += 1
            if _size(payload()) <= limit:
                break
        if dropped:
            notes.append("evidence_reduced")
    size = _size(payload())
    return ModelContext(system_prompt=system_prompt, prompt_version=prompt_version(channel), channel_type=channel,
                        tools=tools, question=work["original_question"], conversation=conv_payload, linked_source=linked,
                        core_results=core, retrieval_results=retrieval, unverified_conditions=conditions,
                        finishing=finishing, finalize_issue=state.get("finalize_issue"), overflow=size > limit,
                        dropped_evidence=dropped, size_chars=size, budget_notes=notes)
