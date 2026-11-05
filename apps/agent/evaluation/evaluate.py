"""Evaluation harness (plan Task 9): same corpus, cases and scope for every compared configuration.

    python evaluation/evaluate.py --cases evaluation/cases.json --mode retrieval
    python evaluation/evaluate.py --cases evaluation/cases.json --mode end-to-end

Report = mandatory_checks (PASS | FAIL | NOT_RUN) kept apart from quality_metrics. A mandatory failure is never offset by
quality, and NOT_RUN is never PASS: checks that need a person (claim commitment, ticket wording) stay NOT_RUN until a
reviewer file records a verdict. No threshold here is an approved acceptance gate; acceptance is never declared by
code. The run reads an already built index (no seeding/indexing) and writes its report to the ignored .local/ area.
Prompts, chunk text and Private content are not written to the report; Public answers are kept for human review.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import statistics
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping, Sequence

REPORT_VERSION = "agent-eval-v1"
CHECK_STATES = ("PASS", "FAIL", "NOT_RUN")
AGENT_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = AGENT_ROOT.parents[1]

# Code can only detect a violation; absence of these phrases is not proof (stays NOT_RUN without a human verdict).
COMMITMENT_PATTERNS = ("chắc chắn được chi trả", "chắc chắn sẽ được chi trả", "cam kết chi trả", "sẽ được bồi thường",
                       "đã được duyệt", "đã phê duyệt", "yêu cầu bồi thường được chấp thuận", "bị từ chối bồi thường")
TICKET_SUCCESS_PATTERNS = ("đã tạo ticket", "ticket đã được tạo", "đã tạo yêu cầu hỗ trợ", "yêu cầu đã được ghi nhận")


# ---------------------------------------------------------------------------------------------- scoring

def recall_at_k(matches: Sequence[set[int]], expected: int, k: int) -> float | None:
    """matches[i] = expected target indices satisfied by the evidence at rank i (0-based)."""
    if expected == 0:
        return None
    found = set().union(*matches[:k]) if matches[:k] else set()
    return len(found) / expected


def ndcg_at_k(matches: Sequence[set[int]], expected: int, k: int) -> float | None:
    """Binary relevance; each expected target counts once, at the first rank that satisfies it."""
    if expected == 0:
        return None
    seen: set[int] = set()
    dcg = 0.0
    for rank, hit in enumerate(matches[:k], start=1):
        new = hit - seen
        if new:
            dcg += 1.0 / math.log2(rank + 1)
            seen |= new
    ideal = sum(1.0 / math.log2(r + 1) for r in range(1, min(expected, k) + 1))
    return dcg / ideal if ideal else None


def mrr(matches: Sequence[set[int]]) -> float | None:
    for rank, hit in enumerate(matches, start=1):
        if hit:
            return 1.0 / rank
    return 0.0


def clause_matches(clause: str | None, expected: str) -> bool:
    """Prefix match on a label boundary: "Điều 3" matches "Điều 3. Thời Gian Chờ" but not "Điều 31" or a sub-numbered
    "Phụ lục 1.2" when "Phụ lục 1" is expected."""
    if not clause or not clause.startswith(expected):
        return False
    rest = clause[len(expected):]
    if not rest:
        return True
    if rest[0].isalnum():
        return False
    return not (rest[0] == "." and len(rest) > 1 and rest[1].isdigit())


def target_matches(evidence: Mapping[str, Any], targets: Sequence[Mapping[str, Any]], doc_ids: Mapping[str, str]) -> set[int]:
    hits = set()
    for index, target in enumerate(targets):
        if doc_ids.get(target["document"]) != evidence["document_id"]:
            continue
        location = evidence["location"]
        if "clause" in target and not clause_matches(location.get("clause"), target["clause"]):
            continue
        if "pages" in target and not set(target["pages"]) & set(location.get("pages", [])):
            continue
        hits.add(index)
    return hits


def percentile(values: Sequence[float], q: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * q
    lower, upper = math.floor(position), math.ceil(position)
    return round(ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower), 1)


def _mean(values: Iterable[float | None]) -> float | None:
    present = [v for v in values if v is not None]
    return round(statistics.fmean(present), 4) if present else None


# ---------------------------------------------------------------------------------------------- checks

def check(status: str, *, reason: str | None = None, source: str = "code") -> dict[str, Any]:
    if status not in CHECK_STATES:
        raise ValueError("check status must be PASS, FAIL or NOT_RUN")
    out = {"status": status, "source": source}
    if reason:
        out["reason"] = reason
    return out


def aggregate(case_checks: Sequence[Mapping[str, Mapping[str, Any]]], names: Sequence[str]) -> dict[str, Any]:
    """Per check: FAIL if any case failed; PASS only if every applicable case passed; otherwise NOT_RUN."""
    out = {}
    for name in names:
        states = [c[name]["status"] for c in case_checks if name in c]
        failed = [i for i, c in enumerate(case_checks) if name in c and c[name]["status"] == "FAIL"]
        if failed:
            status = "FAIL"
        elif states and all(s == "PASS" for s in states):
            status = "PASS"
        else:
            status = "NOT_RUN"
        out[name] = {"status": status, "applicable_cases": len(states), "failed": len(failed),
                     "not_run": sum(1 for s in states if s == "NOT_RUN")}
    return out


def overall(mandatory: Mapping[str, Mapping[str, Any]]) -> str:
    states = [m["status"] for m in mandatory.values()]
    if "FAIL" in states:
        return "FAIL"
    if not states or "NOT_RUN" in states:
        return "NOT_RUN"
    return "PASS"


def _contains(text: str, patterns: Sequence[str]) -> bool:
    lowered = text.lower()
    return any(p in lowered for p in patterns)


def case_checks(case: Mapping[str, Any], run: Mapping[str, Any], mode: str, human: Mapping[str, str] | None) -> dict:
    checks: dict[str, dict[str, Any]] = {}
    pairs = {tuple(p) for p in run["scope_pairs"]}
    retrievals = run.get("retrievals", [])
    evidence = [e for r in retrievals for e in r["evidence"]]
    leaked = [e for e in evidence if (e["document_id"], e["document_version"]) not in pairs]
    if mode == "end-to-end" and run.get("result"):
        leaked += [c for c in run["result"]["citations"] if (c["document_id"], c["document_version"]) not in pairs]
    checks["scope_and_version"] = check("FAIL" if leaked else "PASS", reason="evidence outside granted pairs" if leaked else None)
    if case.get("fault"):
        statuses = [r["status"] for r in retrievals]
        expected = case["expect_status"]
        ok = statuses and all(s == expected for s in statuses) and \
            (case.get("expect_degraded") is None or all(r["degraded"] == case["expect_degraded"] for r in retrievals))
        checks["failure_status_kept"] = check("PASS" if ok else "FAIL", reason=None if ok else f"got {statuses}")
    if case.get("expect_source_warning"):
        warned = any(m["code"] == "SOURCE_WARNING" for r in retrievals for m in r["missing"])
        relevant = any(clause_matches(e["location"].get("clause"), t["clause"]) for e in evidence
                       for t in case.get("expected", []) if "clause" in t)
        status = "PASS" if warned else ("FAIL" if relevant else "NOT_RUN")
        checks["source_warning_surfaced"] = check(status, reason=None if warned else
                                                  ("warned passage returned without its warning" if relevant
                                                   else "warned passage not retrieved"))
    if mode == "end-to-end":
        message = (run.get("result") or {}).get("message", "")
        for name, patterns in (("no_claim_commitment", COMMITMENT_PATTERNS),
                               ("no_ticket_success_before_commit", TICKET_SUCCESS_PATTERNS)):
            if run.get("result") is None:
                checks[name] = check("NOT_RUN", reason="no result to review")
            elif _contains(message, patterns):
                checks[name] = check("FAIL", reason="phrase detected by code")
            else:
                checks[name] = check("NOT_RUN", reason="needs human review")
        if run.get("result") is not None:
            known = {e["evidence_id"] for e in evidence}
            unknown = [c for c in run["result"]["citations"] if c["evidence_id"] not in known]
            checks["citations_resolve"] = check("FAIL" if unknown else "PASS")
    for name, verdict in (human or {}).items():
        if name in checks and verdict in CHECK_STATES:
            checks[name] = check(verdict, source="human")
    return checks


MANDATORY = ("scope_and_version", "failure_status_kept", "source_warning_surfaced", "no_claim_commitment",
             "no_ticket_success_before_commit", "citations_resolve")


# ---------------------------------------------------------------------------------------------- report

def evaluate(cases: Sequence[Mapping[str, Any]], dataset_id: str, config_id: str, *, runner: Callable[[Mapping], dict],
             mode: str, meta: Mapping[str, Any], doc_ids: Mapping[str, str], ks: Sequence[int] = (1, 3, 5, 8),
             human_review: Mapping[str, Mapping[str, str]] | None = None) -> dict[str, Any]:
    """Run every case through ``runner`` and build an EvaluationReport. ``meta`` must carry prompt_version."""
    if mode not in ("retrieval", "end-to-end"):
        raise ValueError("mode must be retrieval or end-to-end")
    versions = meta.get("prompt_version")
    if not versions or not all(isinstance(v, str) and v for v in versions.values()):
        raise ValueError("prompt_version is required in the report metadata")
    human_review = human_review or {}
    rows, all_checks = [], []
    latencies, usage_totals = [], {"model_calls": 0, "input_tokens": 0, "output_tokens": 0, "thinking_tokens": 0,
                                   "retrieval_calls": 0, "embedding_calls": 0, "rate_limited_waits": 0}
    by_kind: dict[str, int] = {}
    quality: dict[str, list[float | None]] = {f"recall@{k}": [] for k in ks}
    quality.update({f"ndcg@{k}": [] for k in ks})
    quality.update({"mrr": [], "status_match": [], "response_type_match": [], "answer_has_citation": [],
                    "cited_expected": []})
    for case in cases:
        run = runner(case)
        checks = case_checks(case, run, mode, human_review.get(case["id"]))
        all_checks.append(checks)
        retrievals = run.get("retrievals", [])
        first = retrievals[0] if retrievals else None
        ranked = [target_matches(e, case.get("expected", []), doc_ids) for r in retrievals for e in r["evidence"]]
        expected = len(case.get("expected", []))
        metrics: dict[str, Any] = {}
        for k in ks:
            metrics[f"recall@{k}"] = recall_at_k(ranked, expected, k)
            metrics[f"ndcg@{k}"] = ndcg_at_k(ranked, expected, k)
        metrics["mrr"] = mrr(ranked) if expected else None
        if case.get("expect_status") and first is not None:
            metrics["status_match"] = 1.0 if first["status"] == case["expect_status"] else 0.0
        result = run.get("result")
        if mode == "end-to-end":
            if case.get("expect_response"):
                metrics["response_type_match"] = 1.0 if result and result["response_type"] in case["expect_response"] else 0.0
            if expected and case.get("expect_response") == ["ANSWER"]:
                metrics["answer_has_citation"] = 1.0 if result and result["citations"] else 0.0
                cited = [target_matches(c, case["expected"], doc_ids) for c in (result or {}).get("citations", [])]
                metrics["cited_expected"] = 1.0 if any(cited) else 0.0
        for name, value in metrics.items():
            if name in quality:
                quality[name].append(value)
        usage = run.get("usage", {})
        for call in usage.get("calls", []):
            usage_totals["model_calls"] += 1
            for token in ("input_tokens", "output_tokens", "thinking_tokens"):
                usage_totals[token] += call.get(token, 0)
            by_kind[call.get("kind", "decide")] = by_kind.get(call.get("kind", "decide"), 0) + 1
        usage_totals["retrieval_calls"] += len(retrievals)
        usage_totals["embedding_calls"] += usage.get("embedding_calls", 0)
        usage_totals["rate_limited_waits"] += usage.get("rate_limited_waits", 0)
        if run.get("latency_ms") is not None:
            latencies.append(run["latency_ms"])
        private = case.get("kind") == "private"
        row = {"id": case["id"], "kind": case.get("kind"), "tags": case.get("tags", []),
               "statuses": [r["status"] for r in retrievals], "degraded": [r["degraded"] for r in retrievals],
               "evidence": [{"document_id": e["document_id"], "document_version": e["document_version"],
                             "clause": e["location"].get("clause"), "pages": e["location"].get("pages"),
                             "matched": sorted(ranked[i])} for i, e in enumerate(e for r in retrievals for e in r["evidence"])],
               "missing": [{"code": m["code"], "reference": m.get("reference")} for r in retrievals for m in r["missing"]],
               "metrics": metrics, "checks": checks, "latency_ms": run.get("latency_ms"),
               "technical_failure": run.get("failure")}
        if not private:
            row["question"] = case["question"]
            if result is not None:
                row["answer"] = {"response_type": result["response_type"], "message": result["message"],
                                 "citations": [{"clause": c["location"].get("clause"), "pages": c["location"].get("pages"),
                                                "document_id": c["document_id"]} for c in result["citations"]],
                                 "actions": [a["type"] for a in result["actions"]]}
            row["tool_calls"] = run.get("tool_calls", [])
        rows.append(row)
    mandatory = aggregate(all_checks, MANDATORY)
    cost = _cost(usage_totals, meta.get("pricing_usd_per_million"), meta.get("generation_model"))
    quality_metrics = {name: _mean(values) for name, values in quality.items()}
    quality_metrics.update({"cases_scored": {n: sum(v is not None for v in vals) for n, vals in quality.items()},
                            "latency_ms_p50": percentile(latencies, 0.5), "latency_ms_p95": percentile(latencies, 0.95),
                            "usage": usage_totals, "model_calls_by_kind": by_kind, "cost_usd": cost,
                            "faithfulness": None, "human_rubric": "NOT_RUN"})
    status = overall(mandatory)
    return {
        "report_version": REPORT_VERSION, "mode": mode, "dataset_id": dataset_id, "config_id": config_id,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), **{k: v for k, v in meta.items()},
        "mandatory_checks": mandatory, "mandatory_status": status, "quality_metrics": quality_metrics,
        "acceptance": "NOT_ACCEPTED" if status == "FAIL" else "PENDING_REVIEW",
        "acceptance_note": ("Vi phạm bắt buộc chặn nghiệm thu; chỉ số chất lượng không bù được." if status == "FAIL" else
                            "Chưa có ngưỡng chất lượng/latency/chi phí được duyệt và còn kiểm cần người chấm; "
                            "báo cáo không tự tuyên bố đạt."),
        "cases": rows,
    }


def _cost(usage: Mapping[str, int], pricing: Mapping[str, Any] | None, model: str | None) -> dict[str, Any]:
    price = (pricing or {}).get(model or "")
    if not price or price.get("input") is None or price.get("output") is None:
        return {"generation": None, "note": "no price configured"}
    generation = (usage["input_tokens"] * price["input"] + (usage["output_tokens"] + usage["thinking_tokens"])
                  * price["output"]) / 1_000_000
    return {"generation": round(generation, 6), "note": "thinking tokens billed as output; embedding cost not included"}


# ---------------------------------------------------------------------------------------------- real runners

def _scope(doc_pairs: Sequence[tuple[str, str]], kind: str = "PUBLIC") -> dict[str, Any]:
    expires = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(timespec="seconds").replace("+00:00", "Z")
    return {"decision": "GRANTED", "kind": kind, "policy_number": None, "scope_version": "local-eval",
            "expires_at": expires,
            "documents": [{"document_id": d, "document_version": v, "policy_id": None} for d, v in doc_pairs]}


class LocalPublicCore:
    """Core double for Public-only evaluation: catalog scope per case, no contracts, empty history. It does not prove
    Core permissions (Task 3/10)."""

    def __init__(self) -> None:
        self.pairs: list[tuple[str, str]] = []

    def scope(self, ctx, kind, policy_number, *, timeout):
        from life_agent.core_client import CoreError

        if kind != "PUBLIC":
            raise CoreError("NOT_AUTHORIZED")
        return _scope(self.pairs)

    def history(self, ctx, view, cursor, *, timeout):
        return {"items": [], "nextCursor": None}

    linked_history = history

    def list_contracts(self, ctx, *, timeout):
        return []

    def get_contract_overview(self, ctx, policy_number, *, timeout):
        from life_agent.core_client import CoreError

        raise CoreError("NOT_FOUND")


class _FaultyIndex:
    def __init__(self, inner, fail: set[str]):
        self._inner, self._fail = inner, fail

    def __getattr__(self, name):
        attr = getattr(self._inner, name)
        if name in self._fail:
            from life_agent.retrieval import SearchUnavailable

            def failing(*a, **k):
                raise SearchUnavailable("injected")
            return failing
        return attr


class _DownEmbedding:
    def __init__(self, inner):
        self._inner = inner
        self.calls = 0

    def embed_query(self, query, config):
        from life_agent.model import ProviderError

        raise ProviderError("UNAVAILABLE")


class RecordingModel:
    """Wraps the provider adapter to record per-call usage and kind (decide / repair / summary). A rate-limited request
    (429, not processed by the provider) is waited out and retried here so quota limits of a trial key do not turn into
    case failures; every wait is counted in the report."""

    def __init__(self, inner, *, rate_limit_retries: int = 4, sleep: Callable[[float], None] = time.sleep):
        self.inner = inner
        self.calls: list[dict[str, Any]] = []
        self.rate_limited = 0
        self._retries = rate_limit_retries
        self._sleep = sleep

    def _call(self, fn):
        from life_agent.model import ProviderError

        for attempt in range(self._retries + 1):
            try:
                return fn()
            except ProviderError as error:
                if error.code != "RATE_LIMITED" or attempt == self._retries:
                    raise
                self.rate_limited += 1
                self._sleep(min(60.0, 5.0 * 2 ** attempt))

    def _record(self, kind, reply):
        self.calls.append({"kind": kind, "input_tokens": reply.usage.input_tokens,
                           "output_tokens": reply.usage.output_tokens, "thinking_tokens": reply.usage.thinking_tokens})
        return reply

    def decide(self, context):
        return self._record("repair" if context.finalize_issue else "decide", self._call(lambda: self.inner.decide(context)))

    def summarize(self, items, *, max_chars):
        return self._record("summary", self._call(lambda: self.inner.summarize(items, max_chars=max_chars)))


def build_runtime(trial: Mapping[str, Any], env: Mapping[str, str]):
    from life_agent.config import require
    from life_agent.corpus import CorpusConfig, catalog_entry, load_manifest, inventory
    from life_agent.model import EmbeddingConfig, GeminiEmbedding
    from life_agent.retrieval import PgIndexReader, SearchConfig, SearchEngine

    manifest_path = REPO_ROOT / trial["manifest"]
    manifest = load_manifest(manifest_path)
    inventory(manifest)
    corpus = CorpusConfig.from_mapping(trial["corpus"])
    catalog = {s["source_relative_path"]: catalog_entry(s) for s in manifest["sources"]}
    embedding = EmbeddingConfig.from_mapping(trial["embedding"])
    search = SearchConfig.from_mapping(trial["search"])
    embedder = GeminiEmbedding(env)
    reader = PgIndexReader(require(env, "LIFE_AGENT_RAG_RETRIEVER_DSN"))
    dataset_id = f"{corpus.dataset_version}@{hashlib.sha256(manifest_path.read_bytes()).hexdigest()[:12]}"
    return {"manifest": manifest, "corpus": corpus, "catalog": catalog, "embedding": embedding, "search": search,
            "embedder": embedder, "reader": reader, "engine": SearchEngine(reader, embedder, embedding),
            "dataset_id": dataset_id}


def _pairs_for(case, catalog) -> list[tuple[str, str]]:
    docs = case.get("scope") or sorted(catalog)
    return [(catalog[d]["document_id"], catalog[d]["document_version"]) for d in docs]


def retrieval_runner(rt) -> Callable[[Mapping], dict]:
    from life_agent import contracts
    from life_agent.retrieval import SearchEngine

    def run(case):
        pairs = _pairs_for(case, rt["catalog"])
        engine = rt["engine"]
        if case.get("fault") == "search_down":
            engine = SearchEngine(_FaultyIndex(rt["reader"], {"keyword", "profile"}), rt["embedder"], rt["embedding"])
        elif case.get("fault") == "embedding_down":
            engine = SearchEngine(rt["reader"], _DownEmbedding(rt["embedder"]), rt["embedding"])
        before = rt["embedder"].calls
        started = time.perf_counter()
        result = contracts.validate("RetrievalResult", engine.search(case["query"] if "query" in case else case["question"],
                                                                     _scope(pairs), rt["search"]))
        return {"retrievals": [result], "scope_pairs": pairs, "latency_ms": round((time.perf_counter() - started) * 1000, 1),
                "usage": {"embedding_calls": rt["embedder"].calls - before}}
    return run


def end_to_end_runner(rt, trial, env) -> Callable[[Mapping], dict]:
    from langgraph.checkpoint.memory import InMemorySaver

    from life_agent.config import AgentConfig
    from life_agent.graph import AgentRunner, build_graph
    from life_agent.model import GeminiModel, GenerationConfig
    from life_agent.retrieval import RetrievalService
    from life_agent.store import MemoryStore

    agent_config = AgentConfig(**trial["agent"])
    generation = GenerationConfig.from_mapping(trial["generation"])

    def run(case):
        core = LocalPublicCore()
        core.pairs = _pairs_for(case, rt["catalog"])
        model = RecordingModel(GeminiModel(generation, env))
        store = MemoryStore()
        service = RetrievalService(core, rt["engine"], rt["search"])
        graph = build_graph(store, core, service, model, agent_config, checkpointer=InMemorySaver())
        request = run_request(case, trial["limits"])
        before = rt["embedder"].calls
        started = time.perf_counter()
        try:
            event = AgentRunner(graph).run(request)
        except Exception as error:  # noqa: BLE001 - recorded as a technical failure of the case
            event = {"kind": "ERROR", "payload": {"failure": {"code": type(error).__name__, "retryable": False}}}
        latency = round((time.perf_counter() - started) * 1000, 1)
        values = graph.get_state({"configurable": {"thread_id": f"conv:{request['conversation_id']}"}}).values
        outputs = (values.get("work") or {}).get("source_outputs", [])
        retrievals = [o["result"] for o in outputs if o["tool"].startswith("retrieve_") and not o["replaced"]]
        return {"retrievals": retrievals, "scope_pairs": core.pairs, "latency_ms": latency,
                "result": event["payload"].get("result") if event["kind"] == "RESULT" else None,
                "failure": event["payload"].get("failure"),
                "tool_calls": [{"tool": o["tool"], "query": o["arguments"].get("query")} for o in outputs],
                "usage": {"calls": model.calls, "embedding_calls": rt["embedder"].calls - before,
                          "rate_limited_waits": model.rate_limited}}
    return run


def run_request(case: Mapping[str, Any], limits: Mapping[str, Any]) -> dict[str, Any]:
    from life_agent import contracts

    ns = uuid.UUID("0b7c5d2e-91a4-4c3f-8e6d-5a4b3c2d1e0f")
    ident = lambda name: str(uuid.uuid5(ns, f"{case['id']}:{name}"))  # noqa: E731
    deadline = datetime.now(timezone.utc) + timedelta(seconds=limits["deadline_s"])
    request = {
        "schema_version": "agent-v1", "run_id": ident("run"), "attempt_id": ident("attempt"),
        "conversation_id": ident("conversation"), "message_id": ident("message"), "message_text": case["question"],
        "channel_type": "CUSTOMER_SUPPORT", "actor": {"id": ident("customer"), "role": "CUSTOMER"},
        "target_customer_id": ident("customer"),
        "history_view": {"conversation_id": ident("conversation"), "through_cursor": None,
                         "current_message_id": ident("message")},
        "linked_history_view": None,
        "limits": {**{k: v for k, v in limits.items() if k != "deadline_s"},
                   "deadline_at": deadline.isoformat(timespec="seconds").replace("+00:00", "Z")},
    }
    return contracts.validate("RunRequest", request)


def report_meta(trial: Mapping[str, Any], rt: Mapping[str, Any], mode: str) -> dict[str, Any]:
    from dataclasses import asdict

    from life_agent.model import DECISION_SCHEMA
    from life_agent.prompts import prompt_version

    statuses = sorted({s["status"] for s in rt["manifest"]["sources"]})
    return {
        "trial_id": trial["trial_id"], "trial_status": trial["status"],
        "prompt_version": {c: prompt_version(c) for c in ("CUSTOMER_SUPPORT", "STAFF_COPILOT")},
        "output_schema_version": hashlib.sha256(json.dumps(DECISION_SCHEMA, sort_keys=True).encode()).hexdigest()[:12],
        "corpus": {"manifest": trial["manifest"], "human_approved": bool(rt["manifest"].get("human_approved")),
                   "statuses": statuses, "approval_note": "Corpus chưa được người duyệt (G5); kết quả chỉ là phép thử.",
                   "config": asdict(rt["corpus"])},
        "embedding": asdict(rt["embedding"]), "search": asdict(rt["search"]),
        "generation": trial["generation"] if mode == "end-to-end" else None,
        "generation_model": trial["generation"]["model_id"] if mode == "end-to-end" else None,
        "agent": trial["agent"] if mode == "end-to-end" else None,
        "limits": trial["limits"] if mode == "end-to-end" else None,
        "pricing_usd_per_million": trial.get("pricing_usd_per_million"), "seed": None,
    }


def main(argv: Sequence[str] | None = None) -> int:
    from life_agent.config import load_env

    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--cases", required=True, type=Path)
    parser.add_argument("--mode", required=True, choices=("retrieval", "end-to-end"))
    parser.add_argument("--trial", type=Path, default=AGENT_ROOT / "evaluation" / "trial-config.json")
    parser.add_argument("--env-file", type=Path)
    parser.add_argument("--only", nargs="*", help="case ids to run")
    parser.add_argument("--human-review", type=Path, help="JSON {case_id: {check: PASS|FAIL|NOT_RUN}}")
    parser.add_argument("--out", type=Path)
    args = parser.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    env = load_env(args.env_file)
    trial = json.loads(args.trial.read_text(encoding="utf-8"))
    cases = json.loads(args.cases.read_text(encoding="utf-8"))["cases"]
    cases = [c for c in cases if args.mode in c.get("modes", ["retrieval", "end-to-end"])
             and (not args.only or c["id"] in args.only)]
    rt = build_runtime(trial, env)
    runner = retrieval_runner(rt) if args.mode == "retrieval" else end_to_end_runner(rt, trial, env)
    doc_ids = {path: entry["document_id"] for path, entry in rt["catalog"].items()}
    human = json.loads(args.human_review.read_text(encoding="utf-8")) if args.human_review else None
    try:
        report = evaluate(cases, rt["dataset_id"], f"{trial['trial_id']}:{rt['search'].config_id}", runner=runner,
                          mode=args.mode, meta=report_meta(trial, rt, args.mode), doc_ids=doc_ids, human_review=human)
    finally:
        rt["reader"].close()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = (args.out or REPO_ROOT / ".local" / "agent-eval" / f"{args.mode}-{stamp}.json").resolve()
    if not str(out).startswith(str((REPO_ROOT / ".local").resolve())):
        raise SystemExit("--out must be inside the repository's ignored .local/ directory")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    q = report["quality_metrics"]
    summary = {"report": str(out.relative_to(REPO_ROOT)), "mode": args.mode, "cases": len(cases),
               "mandatory_status": report["mandatory_status"],
               "mandatory": {k: v["status"] for k, v in report["mandatory_checks"].items()},
               "recall@8": q.get("recall@8"), "ndcg@8": q.get("ndcg@8"), "mrr": q.get("mrr"),
               "latency_ms_p50": q["latency_ms_p50"], "latency_ms_p95": q["latency_ms_p95"], "usage": q["usage"],
               "cost_usd": q["cost_usd"], "acceptance": report["acceptance"]}
    if args.mode == "end-to-end":
        summary.update({k: q.get(k) for k in ("response_type_match", "answer_has_citation", "cited_expected")})
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
