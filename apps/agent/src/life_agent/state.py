"""Graph state. Three logical groups (contracts/agent-v1.md section 7):

- ConversationContext: kept across messages of one thread (checkpointed).
- MessageWork: one per message; replay of the same message keeps it, a new message replaces it.
- ExecutionContext: trusted, passed as LangGraph runtime context, never stored in state or shown to the model.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, TypedDict

STATE_SCHEMA_VERSION = "agent-state-v1"


@dataclass(frozen=True)
class TrustedContext:
    execution: Mapping[str, Any]


class AgentState(TypedDict, total=False):
    incoming: dict[str, Any]          # {"message_id", "text"} for this invoke
    conversation: dict[str, Any]      # ConversationContext
    recent_history: list[dict]        # Core HistoryItem copies of this conversation, ordered by position
    linked_history: list[dict]        # Copilot only: linked Customer chat items within the frozen view
    linked_status: str                # NONE | SYNCED | SYNC_FAILED
    work: dict[str, Any]              # MessageWork
    decision: dict[str, Any] | None   # pending ToolDecision
    draft: dict[str, Any] | None      # pending AnswerDraft
    finalize_issue: dict[str, Any] | None
    finishing: bool
    failure: dict[str, Any] | None    # TechnicalFailure
    result: dict[str, Any] | None     # AgentResult
    event: dict[str, Any] | None      # persisted AgentEvent
    trace: list[str]                  # node path of the current message (ids only)


def new_conversation(graph_version: str) -> dict[str, Any]:
    return {
        "state_schema_version": STATE_SCHEMA_VERSION,
        "graph_version": graph_version,
        "topic": None,
        "active_policy_number": None,
        "pending_clarification": None,
        "history_summary": None,
        "history_synced_through": None,
        "linked_sync": None,
    }


def new_work(message_id: str, run_id: str, question: str) -> dict[str, Any]:
    return {
        "message_id": message_id,
        "run_id": run_id,
        "original_question": question,
        "source_outputs": [],
        "agent_assessment": None,
        "unverified_conditions": [],
        "counters": {k: 0 for k in ["retrieval_calls", "core_read_requests", "model_calls", "graph_steps",
                                    "repair_attempts", "input_tokens", "output_tokens", "thinking_tokens"]},
        "progress": "PREPARING",
        "errors": [],
    }
