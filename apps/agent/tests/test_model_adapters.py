"""Managed API adapters with a scripted HTTP opener (no network, no key). Checks request shape, identity, filtered
errors and envelope conversion; answer quality is measured by evaluation/evaluate.py with the approved trial config."""
import io
import json
import socket
import urllib.error

import pytest

from life_agent import contracts
from life_agent.context import ModelContext
from life_agent.model import (EmbeddingConfig, GeminiEmbedding, GeminiHttp, GeminiModel, GenerationConfig, ProviderError,
                              envelope_to_decision)

KEY = "test-key-not-real"


class Opener:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.requests = []

    def __call__(self, request, timeout):
        self.requests.append((request, timeout))
        step = self.responses.pop(0)
        if isinstance(step, BaseException):
            raise step
        return io.BytesIO(json.dumps(step).encode())


def body(opener, i=0):
    return json.loads(opener.requests[i][0].data)


def emb_config(fmt="gemini-embedding-2-prefix", dims=3, normalize=True):
    return EmbeddingConfig(config_id=f"t.{fmt}", provider="gemini", model_id="gemini-embedding-x", model_version="x",
                           dimensions=dims, input_format=fmt, normalize=normalize, timeout_s=5, batch_size=2)


def test_embedding_input_format_follows_the_model():
    opener = Opener({"embeddings": [{"values": [3, 4, 0]}, {"values": [0, 0, 2]}]}, {"embeddings": [{"values": [1, 0, 0]}]})
    adapter = GeminiEmbedding(http=GeminiHttp(KEY, opener=opener))
    vectors = adapter.embed_documents(["a", "b"], emb_config())
    query = adapter.embed_query("q", emb_config())
    requests = body(opener)["requests"]
    assert [r["content"]["parts"][0]["text"] for r in requests] == ["title: none | text: a", "title: none | text: b"]
    assert "taskType" not in requests[0] and requests[0]["outputDimensionality"] == 3
    assert body(opener, 1)["requests"][0]["content"]["parts"][0]["text"] == "task: search result | query: q"
    assert vectors[0]["values"] == pytest.approx([0.6, 0.8, 0.0]) and query["config_id"] == "t.gemini-embedding-2-prefix"
    opener = Opener({"embeddings": [{"values": [1, 0, 0]}]})
    GeminiEmbedding(http=GeminiHttp(KEY, opener=opener)).embed_query("q", emb_config("gemini-task-type"))
    assert body(opener)["requests"][0]["taskType"] == "RETRIEVAL_QUERY"


def test_wrong_dimension_is_rejected():
    opener = Opener({"embeddings": [{"values": [1, 0]}]})
    with pytest.raises(ProviderError) as error:
        GeminiEmbedding(http=GeminiHttp(KEY, opener=opener)).embed_query("q", emb_config())
    assert error.value.code == "BAD_RESPONSE" and not error.value.outage


@pytest.mark.parametrize("failure,code,outage", [
    (urllib.error.HTTPError("u", 429, "x", {}, None), "RATE_LIMITED", True),
    (urllib.error.HTTPError("u", 503, "x", {}, None), "UNAVAILABLE", True),
    (urllib.error.HTTPError("u", 400, "x", {}, None), "REJECTED", False),
    (socket.timeout(), "TIMEOUT", True),
])
def test_http_errors_are_filtered(failure, code, outage):
    opener = Opener(failure)
    with pytest.raises(ProviderError) as error:
        GeminiHttp(KEY, opener=opener).post("models/m:generateContent", {}, timeout=1)
    assert error.value.code == code and error.value.outage is outage and KEY not in str(error.value)
    request = opener.requests[0][0]
    assert request.get_header("X-goog-api-key") == KEY and KEY not in request.full_url


def gen_config():
    return GenerationConfig(config_id="g", provider="gemini", model_id="gemini-x-flash", thinking_level="low",
                            max_output_tokens=512, temperature=None, timeout_s=10)


def context(**kw):
    values = dict(system_prompt="SYS", prompt_version="v", channel_type="CUSTOMER_SUPPORT", tools={}, question="Q",
                  conversation={}, linked_source=None, core_results=[], retrieval_results=[], unverified_conditions=[],
                  finishing=False, finalize_issue=None, overflow=False, dropped_evidence=0, size_chars=10)
    values.update(kw)
    return ModelContext(**values)


def reply(envelope, usage=None, thought=False):
    parts = ([{"text": "nghĩ", "thought": True}] if thought else []) + [{"text": json.dumps(envelope)}]
    return {"candidates": [{"content": {"parts": parts}}],
            "usageMetadata": usage or {"promptTokenCount": 100, "candidatesTokenCount": 20, "thoughtsTokenCount": 7}}


TOOL = {"kind": "TOOL", "tool": {"name": "retrieve_public", "query": "thời gian chờ", "policy_number": None},
        "answer": None, "assessment": {"sufficiency": "INSUFFICIENT", "notes": ""}, "unverified_conditions": [], "topic": None}


def test_decide_sends_json_schema_and_counts_thinking_tokens():
    opener = Opener(reply(TOOL, thought=True))
    out = GeminiModel(gen_config(), http=GeminiHttp(KEY, opener=opener)).decide(context())
    assert contracts.is_valid("AgentDecision", out.output)
    assert out.output == {"tool": "retrieve_public", "arguments": {"query": "thời gian chờ"}}
    assert (out.usage.input_tokens, out.usage.output_tokens, out.usage.thinking_tokens) == (100, 20, 7)
    sent = body(opener)
    assert sent["systemInstruction"]["parts"][0]["text"] == "SYS"
    assert sent["generationConfig"]["responseMimeType"] == "application/json"
    assert sent["generationConfig"]["thinkingConfig"] == {"thinkingLevel": "low"}
    assert json.loads(sent["contents"][0]["parts"][0]["text"])["question"] == "Q"


def test_answer_envelope_becomes_a_valid_draft_with_proposals():
    answer = {**TOOL, "kind": "ANSWER", "tool": None, "answer": {
        "response_type": "ANSWER", "message": "Thời gian chờ 30 ngày.", "citations": ["op-3-c1", "op-3-c1"],
        "handoff": {"subject": "Nhờ Staff kiểm tra", "reason": None}, "ticket": None}}
    decision, notes = envelope_to_decision(answer)
    assert contracts.is_valid("AgentDecision", decision)
    assert decision["citations"] == [{"evidence_id": "op-3-c1"}] and decision["actions"][0]["type"] == "PROPOSE_HANDOFF"
    assert notes["assessment"]["sufficiency"] == "INSUFFICIENT"


def test_unparseable_output_is_left_for_the_graph_contract_check():
    opener = Opener({"candidates": [{"content": {"parts": [{"text": "không phải JSON"}]}}], "usageMetadata": {}})
    out = GeminiModel(gen_config(), http=GeminiHttp(KEY, opener=opener)).decide(context())
    assert not contracts.is_valid("AgentDecision", out.output)
    mismatch, _ = envelope_to_decision({**TOOL, "kind": "ANSWER"})
    assert not contracts.is_valid("AgentDecision", mismatch)


def test_offline_document_embedding_waits_out_outages_but_queries_never_retry():
    busy = urllib.error.HTTPError("u", 429, "x", {}, None)
    waits = []
    opener = Opener(busy, {"embeddings": [{"values": [1, 0, 0]}]}, busy)
    adapter = GeminiEmbedding(http=GeminiHttp(KEY, opener=opener), document_retries=2, sleep=waits.append)
    assert len(adapter.embed_documents(["a"], emb_config())) == 1 and adapter.retries == 1 and waits == [2.0]
    with pytest.raises(ProviderError):
        adapter.embed_query("q", emb_config())  # retrieval falls back to keyword-only instead
