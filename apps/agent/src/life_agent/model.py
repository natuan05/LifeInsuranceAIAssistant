"""Model and embedding interfaces plus Managed Model API adapters (Task 9).

MVP model selection follows Agent_Design.md#managed-model-api and the generation/embedding entries in
evaluation/trial-config.json. Adapters require explicit model, version and dimensions; no hidden defaults.
Operational limits and quality/cost/latency acceptance remain under G4/Task 9 review.
Calls use the public REST API with the standard library (no SDK). The API key is read from the private env file and is
never logged; errors carry a filtered code only.
"""
from __future__ import annotations

import json
import math
import re
import socket
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field, fields
from typing import Any, Callable, Mapping, Protocol, Sequence, TypedDict


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
    provider: str
    input_format: str
    normalize: bool


class EmbeddingAdapter(Protocol):
    def embed_documents(self, texts: Sequence[str], config: Any) -> list[EmbeddingVector]: ...

    def embed_query(self, query: str, config: Any) -> EmbeddingVector: ...


# ------------------------------------------------------------------------------------------------ configuration

class ProviderError(Exception):
    """Filtered provider failure. code: TIMEOUT | RATE_LIMITED | UNAVAILABLE | REJECTED | BAD_RESPONSE."""

    OUTAGE = ("TIMEOUT", "RATE_LIMITED", "UNAVAILABLE")

    def __init__(self, code: str, status: int | None = None):
        super().__init__(code)
        self.code = code
        self.status = status

    @property
    def outage(self) -> bool:
        return self.code in self.OUTAGE


def _required(cls: type, data: Mapping[str, Any]) -> dict[str, Any]:
    names = [f.name for f in fields(cls)]
    missing = [n for n in names if n not in data]
    if missing:
        raise ValueError(f"{cls.__name__} missing: " + ", ".join(missing))
    return {n: data[n] for n in names}


@dataclass(frozen=True)
class EmbeddingConfig:
    """One vector space. Chunks and queries must share config_id/model/version/dims; vectors are never mixed."""

    config_id: str
    provider: str
    model_id: str
    model_version: str
    dimensions: int
    input_format: str  # "gemini-embedding-2-prefix" | "gemini-task-type"
    normalize: bool
    timeout_s: float
    batch_size: int

    @classmethod
    def from_mapping(cls, data: Mapping[str, Any]) -> "EmbeddingConfig":
        cfg = cls(**_required(cls, data))
        if cfg.input_format not in ("gemini-embedding-2-prefix", "gemini-task-type"):
            raise ValueError("unknown embedding input_format")
        return cfg

    def identity(self) -> dict[str, Any]:
        return {"model_id": self.model_id, "model_version": self.model_version, "dimensions": self.dimensions,
                "config_id": self.config_id, "provider": self.provider, "input_format": self.input_format,
                "normalize": self.normalize}


@dataclass(frozen=True)
class GenerationConfig:
    config_id: str
    provider: str
    model_id: str
    thinking_level: str | None
    max_output_tokens: int
    temperature: float | None
    timeout_s: float

    @classmethod
    def from_mapping(cls, data: Mapping[str, Any]) -> "GenerationConfig":
        return cls(**_required(cls, data))


# ------------------------------------------------------------------------------------------------ HTTP

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"


class GeminiHttp:
    """Minimal JSON POST client. The key goes in a header, never in URLs, logs or exceptions."""

    def __init__(self, api_key: str, *, base_url: str = GEMINI_BASE,
                 opener: Callable[..., Any] | None = None) -> None:
        if not api_key:
            raise ValueError("GEMINI_API_KEY is not set")
        self._key = api_key
        self._base = base_url
        self._open = opener or urllib.request.urlopen

    def post(self, path: str, body: Mapping[str, Any], *, timeout: float) -> dict[str, Any]:
        request = urllib.request.Request(f"{self._base}/{path}", data=json.dumps(body).encode("utf-8"), method="POST",
                                         headers={"Content-Type": "application/json", "x-goog-api-key": self._key})
        try:
            with self._open(request, timeout=timeout) as response:
                payload = response.read()
        except urllib.error.HTTPError as error:
            status = error.code
            code = "RATE_LIMITED" if status == 429 else "UNAVAILABLE" if status >= 500 else "REJECTED"
            raise ProviderError(code, status) from None
        except (TimeoutError, socket.timeout):
            raise ProviderError("TIMEOUT") from None
        except (urllib.error.URLError, OSError):
            raise ProviderError("UNAVAILABLE") from None
        try:
            return json.loads(payload)
        except ValueError:
            raise ProviderError("BAD_RESPONSE") from None


# ------------------------------------------------------------------------------------------------ embeddings

class GeminiEmbedding:
    """EmbeddingAdapter for Gemini embedding models. Input formatting follows each model: gemini-embedding-2 uses
    text prefixes (no task_type); gemini-embedding-001 uses RETRIEVAL_DOCUMENT/RETRIEVAL_QUERY task types."""

    def __init__(self, env: Mapping[str, str] | None = None, *, http: GeminiHttp | None = None,
                 document_retries: int = 0, sleep: Callable[[float], None] = time.sleep) -> None:
        """document_retries applies to offline indexing only (outage codes, exponential wait); query embedding never
        retries here because retrieval falls back to keyword-only instead."""
        self._http = http or GeminiHttp((env or {}).get("GEMINI_API_KEY", ""))
        self._retries = document_retries
        self._sleep = sleep
        self.calls = 0
        self.retries = 0
        self.input_chars = 0

    @staticmethod
    def _format(text: str, config: EmbeddingConfig, *, query: bool) -> tuple[str, str | None]:
        if config.input_format == "gemini-embedding-2-prefix":
            return (f"task: search result | query: {text}" if query else f"title: none | text: {text}"), None
        return text, ("RETRIEVAL_QUERY" if query else "RETRIEVAL_DOCUMENT")

    def _vector(self, values: Any, config: EmbeddingConfig) -> EmbeddingVector:
        if not isinstance(values, list) or len(values) != config.dimensions:
            raise ProviderError("BAD_RESPONSE")
        values = [float(v) for v in values]
        if config.normalize:
            norm = math.sqrt(sum(v * v for v in values))
            if norm == 0:
                raise ProviderError("BAD_RESPONSE")
            values = [v / norm for v in values]
        return {"values": values, **config.identity()}  # type: ignore[typeddict-item]

    def _batch(self, texts: Sequence[str], config: EmbeddingConfig, *, query: bool) -> list[EmbeddingVector]:
        requests = []
        for text in texts:
            formatted, task = self._format(text, config, query=query)
            item: dict[str, Any] = {"model": f"models/{config.model_id}", "content": {"parts": [{"text": formatted}]},
                                    "outputDimensionality": config.dimensions}
            if task:
                item["taskType"] = task
            requests.append(item)
            self.input_chars += len(formatted)
        self.calls += 1
        reply = self._http.post(f"models/{config.model_id}:batchEmbedContents", {"requests": requests},
                                timeout=config.timeout_s)
        embeddings = reply.get("embeddings")
        if not isinstance(embeddings, list) or len(embeddings) != len(texts):
            raise ProviderError("BAD_RESPONSE")
        return [self._vector(e.get("values"), config) for e in embeddings]

    def embed_documents(self, texts: Sequence[str], config: EmbeddingConfig) -> list[EmbeddingVector]:
        out: list[EmbeddingVector] = []
        for start in range(0, len(texts), config.batch_size):
            chunk = texts[start:start + config.batch_size]
            for attempt in range(self._retries + 1):
                try:
                    out.extend(self._batch(chunk, config, query=False))
                    break
                except ProviderError as error:
                    if not error.outage or attempt == self._retries:
                        raise
                    self.retries += 1
                    self._sleep(min(60.0, 2.0 * 2 ** attempt))
        return out

    def embed_query(self, query: str, config: EmbeddingConfig) -> EmbeddingVector:
        return self._batch([query], config, query=True)[0]


# ------------------------------------------------------------------------------------------------ generation

_TOOL_NAMES = ["list_contracts", "get_contract_overview", "retrieve_public", "retrieve_private"]
_NULLABLE_STR = {"type": ["string", "null"]}
DECISION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "kind": {"type": "string", "enum": ["TOOL", "ANSWER"]},
        "tool": {"type": ["object", "null"], "properties": {
            "name": {"type": "string", "enum": _TOOL_NAMES}, "query": _NULLABLE_STR, "policy_number": _NULLABLE_STR},
            "required": ["name", "query", "policy_number"]},
        "answer": {"type": ["object", "null"], "properties": {
            "response_type": {"type": "string", "enum": ["ANSWER", "CLARIFICATION", "REFUSAL"]},
            "message": {"type": "string"},
            "citations": {"type": "array", "items": {"type": "string"}},
            "handoff": {"type": ["object", "null"], "properties": {"subject": {"type": "string"}, "reason": _NULLABLE_STR},
                        "required": ["subject", "reason"]},
            "ticket": {"type": ["object", "null"], "properties": {
                "request": {"type": "string"}, "context": {"type": "string"},
                "customer_statements": {"type": "array", "items": {"type": "string"}},
                "verified_findings": {"type": "array", "items": {"type": "object", "properties": {
                    "text": {"type": "string"}, "source_refs": {"type": "array", "items": {"type": "string"}}},
                    "required": ["text", "source_refs"]}},
                "attempted_steps": {"type": "array", "items": {"type": "string"}},
                "pending_issues": {"type": "array", "items": {"type": "string"}}},
                "required": ["request", "context", "customer_statements", "verified_findings", "attempted_steps",
                             "pending_issues"]}},
            "required": ["response_type", "message", "citations", "handoff", "ticket"]},
        "assessment": {"type": "object", "properties": {
            "sufficiency": {"type": "string", "enum": ["SUFFICIENT", "PARTIAL", "INSUFFICIENT"]},
            "notes": {"type": "string"}}, "required": ["sufficiency", "notes"]},
        "unverified_conditions": {"type": "array", "items": {"type": "object", "properties": {
            "text": {"type": "string"}, "basis_refs": {"type": "array", "items": {"type": "string"}},
            "reason": {"type": "string", "enum": ["NOT_SEARCHED", "FINISH_RESERVE", "SOURCE_ERROR",
                                                  "NEEDS_CUSTOMER_INFO", "NEEDS_STAFF"]}},
            "required": ["text", "basis_refs", "reason"]}},
        "topic": _NULLABLE_STR,
    },
    "required": ["kind", "tool", "answer", "assessment", "unverified_conditions", "topic"],
}


_EVIDENCE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _clean_text(value: Any, max_len: int) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = _CONTROL_CHARS_RE.sub("", value).strip()
    return cleaned[:max_len] if cleaned else None


def _normalize_citation(raw: Any) -> str | None:
    if not isinstance(raw, str):
        return None
    s = raw.strip().strip("[]").strip()
    if s.startswith("evidence:"):
        s = s[len("evidence:"):].strip()
    return s if _EVIDENCE_ID_RE.match(s) else None


def envelope_to_decision(envelope: Any) -> tuple[Any, dict[str, Any]]:
    """Provider envelope -> (AgentDecision candidate, notes). Shape errors are left for the graph's contract check."""
    if not isinstance(envelope, dict):
        return {"invalid": "not an object"}, {}
    notes = {"assessment": envelope.get("assessment"), "unverified_conditions": envelope.get("unverified_conditions") or [],
             "topic": envelope.get("topic")}
    if envelope.get("kind") == "TOOL" and isinstance(envelope.get("tool"), dict):
        tool = envelope["tool"]
        name = tool.get("name")
        query = _clean_text(tool.get("query"), 500)
        policy_number = _clean_text(tool.get("policy_number"), 64)
        if name == "get_contract_overview" and not policy_number:
            return {"tool": "list_contracts", "arguments": {}}, notes
        if name == "retrieve_private" and not policy_number:
            if query:
                return {"tool": "retrieve_public", "arguments": {"query": query}}, notes
            return {"tool": "list_contracts", "arguments": {}}, notes
        if name == "retrieve_private" and not query:
            return {"tool": "get_contract_overview", "arguments": {"policy_number": policy_number}}, notes
        if name == "retrieve_public" and not query:
            return {"tool": "list_contracts", "arguments": {}}, notes
        args: dict[str, Any] = {}
        if name in ("retrieve_public", "retrieve_private"):
            args["query"] = query
        if name in ("get_contract_overview", "retrieve_private"):
            args["policy_number"] = policy_number
        return {"tool": name, "arguments": args}, notes
    answer = envelope.get("answer")
    if envelope.get("kind") != "ANSWER" or not isinstance(answer, dict):
        return {"invalid": "kind/payload mismatch"}, notes
    actions: list[dict[str, Any]] = []
    if isinstance(answer.get("ticket"), dict):
        actions.append({"type": "PROPOSE_TICKET", "summary": answer["ticket"]})
    if isinstance(answer.get("handoff"), dict):
        subject = _clean_text(answer["handoff"].get("subject"), 180)
        if subject:
            reason = _clean_text(answer["handoff"].get("reason"), 1000)
            actions.append({"type": "PROPOSE_HANDOFF", "subject": subject, "reason": reason})
    citations = list(dict.fromkeys(
        cid for cid in (_normalize_citation(c) for c in (answer.get("citations") or [])) if cid
    ))[:20]
    message = _clean_text(answer.get("message"), 8000)
    return {"response_type": answer.get("response_type"), "message": message,
            "citations": [{"evidence_id": c} for c in citations], "actions": actions[:2]}, notes


def render_context(context: Any) -> str:
    """ModelContext -> user content. Only the five context groups; the trusted ExecutionContext is never included."""
    payload = {"question": context.question, "conversation": context.conversation,
               "linked_source": context.linked_source, "core_results": context.core_results,
               "retrieval_results": context.retrieval_results, "unverified_conditions": context.unverified_conditions,
               "available_tools": context.tools, "finishing": context.finishing,
               "finalize_issue": context.finalize_issue, "context_overflow": context.overflow,
               "budget_notes": context.budget_notes}
    return json.dumps(payload, ensure_ascii=False)


class GeminiModel:
    """ModelAdapter over generateContent with JSON output. Counts input/output/thinking tokens per call."""

    def __init__(self, config: GenerationConfig, env: Mapping[str, str] | None = None, *,
                 http: GeminiHttp | None = None, clock: Callable[[], float] = time.monotonic) -> None:
        self.config = config
        self._http = http or GeminiHttp((env or {}).get("GEMINI_API_KEY", ""))
        self._clock = clock
        self.latencies_s: list[float] = []

    def _generate(self, system: str, user: str, *, schema: Mapping[str, Any] | None) -> tuple[str, TokenUsage]:
        generation: dict[str, Any] = {"maxOutputTokens": self.config.max_output_tokens}
        if self.config.temperature is not None:
            generation["temperature"] = self.config.temperature
        if self.config.thinking_level:
            generation["thinkingConfig"] = {"thinkingLevel": self.config.thinking_level}
        if schema is not None:
            generation["responseMimeType"] = "application/json"
            generation["responseJsonSchema"] = schema
        body = {"systemInstruction": {"parts": [{"text": system}]},
                "contents": [{"role": "user", "parts": [{"text": user}]}], "generationConfig": generation}
        started = self._clock()
        reply = self._http.post(f"models/{self.config.model_id}:generateContent", body, timeout=self.config.timeout_s)
        self.latencies_s.append(self._clock() - started)
        meta = reply.get("usageMetadata") or {}
        usage = TokenUsage(int(meta.get("promptTokenCount", 0)), int(meta.get("candidatesTokenCount", 0)),
                           int(meta.get("thoughtsTokenCount", 0)))
        try:
            parts = reply["candidates"][0]["content"]["parts"]
            text = "".join(p.get("text", "") for p in parts if not p.get("thought"))
        except (KeyError, IndexError, TypeError):
            raise ProviderError("BAD_RESPONSE") from None
        return text, usage

    def decide(self, context: Any) -> ModelReply:
        text, usage = self._generate(context.system_prompt, render_context(context), schema=DECISION_SCHEMA)
        try:
            envelope = json.loads(text)
        except ValueError:
            return ModelReply({"invalid": "not json"}, usage, {})
        output, notes = envelope_to_decision(envelope)
        return ModelReply(output, usage, notes)

    def summarize(self, items: Sequence[dict[str, Any]], *, max_chars: int) -> ModelReply:
        from .prompts import summary_instructions

        text, usage = self._generate(summary_instructions(max_chars), json.dumps(list(items), ensure_ascii=False),
                                     schema=None)
        return ModelReply(text.strip()[:max_chars], usage, {})
