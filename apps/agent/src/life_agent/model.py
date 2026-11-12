"""Model and embedding interfaces. Managed Model API is decided; provider/model/dims are not (G4).

Milestone 2 uses scripted fakes only. Real adapters arrive in Task 9 after the trial configuration is approved.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol, Sequence, TypedDict


@dataclass(frozen=True)
class TokenUsage:
    input_tokens: int
    output_tokens: int
    thinking_tokens: int = 0

    @property
    def total(self) -> int:
        return self.input_tokens + self.output_tokens + self.thinking_tokens


@dataclass(frozen=True)
class ModelReply:
    """output is the raw decision (AgentDecision) or summary text; notes carry the Agent's own assessment:
    {"assessment": AgentAssessment, "unverified_conditions": [UnverifiedCondition], "topic": str}."""

    output: Any
    usage: TokenUsage
    notes: dict[str, Any] = field(default_factory=dict)


class ModelAdapter(Protocol):
    def decide(self, context: Any) -> ModelReply:
        """One Agent-node call: return one ToolDecision or one AnswerDraft."""

    def summarize(self, items: Sequence[dict[str, Any]], *, max_chars: int) -> ModelReply:
        """Summarise older history beyond the configured threshold; output is plain text."""


class EmbeddingVector(TypedDict):
    values: list[float]
    model_id: str
    model_version: str
    dimensions: int
    config_id: str


class EmbeddingAdapter(Protocol):
    def embed_documents(self, texts: Sequence[str], config: Any) -> list[EmbeddingVector]: ...

    def embed_query(self, query: str, config: Any) -> EmbeddingVector: ...
