"""Evaluation harness (plan Task 9): same corpus, cases and scope for every compared configuration.

    python evaluation/evaluate.py --cases evaluation/cases.json --mode retrieval
    python evaluation/evaluate.py --cases evaluation/cases.json --mode end-to-end

Report = mandatory_checks (PASS | FAIL | NOT_RUN) kept apart from quality_metrics. A mandatory failure is never offset by
quality, and NOT_RUN is never PASS: checks that need a person (claim commitment, ticket wording) stay NOT_RUN until a
reviewer file records a verdict. No threshold here is an approved acceptance gate; acceptance is never declared by
code. The run reads an already built index (no seeding/indexing) and writes its report to the ignored .local/ area.
Prompts and chunk text are never written to the report; Public answers are kept for human review. Text of Private,
mixed, multi-turn and Copilot cases is left out unless --include-synthetic-private-text is given, which is allowed only
because those cases use the fully synthetic fixture (G5, 06/11/2026).

Case kinds: public | private | mixed (Private + Public in one turn) | multi_turn (earlier `turns` run for real, then
`question` is scored) | copilot (STAFF_COPILOT with an authored `linked_chat` frozen at `linked_through`). Private
access goes through LocalCore, a double of the intended Core rule; it does not prove Core permissions (Tasks 3/10).
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import statistics
import sys
import time
import uuid
from dataclasses import dataclass
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
        if "anchor" in target and location.get("anchor") != target["anchor"]:
            continue
        hits.add(index)
    return hits


def ranked_evidence(retrievals: Sequence[Mapping[str, Any]]) -> list[Mapping[str, Any]]:
    """One ranking for a turn with several retrieval calls: interleave by rank (1st of each call, then 2nd, ...), so a
    mixed Private + Public turn is not scored as if the second call started after the first call's last item."""
    lists = [r["evidence"] for r in retrievals]
    out: list[Mapping[str, Any]] = []
    for rank in range(max((len(items) for items in lists), default=0)):
        out.extend(items[rank] for items in lists if rank < len(items))
    return out


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


def _all_evidence(run: Mapping[str, Any]) -> list[Mapping[str, Any]]:
    """Evidence of every turn of the case (earlier turns of a multi-turn case included)."""
    return [e for r in [*run.get("prior_retrievals", []), *run.get("retrievals", [])] for e in r["evidence"]]


def _results(run: Mapping[str, Any]) -> list[Mapping[str, Any]]:
    return [r for r in [*run.get("prior_results", []), run.get("result")] if r]


def _pair(item: Mapping[str, Any]) -> tuple[str, str]:
    return item["document_id"], item["document_version"]


def case_checks(case: Mapping[str, Any], run: Mapping[str, Any], mode: str, human: Mapping[str, str] | None) -> dict:
    checks: dict[str, dict[str, Any]] = {}
    pairs = {tuple(p) for p in run["scope_pairs"]}
    retrievals = run.get("retrievals", [])
    evidence = [e for r in retrievals for e in r["evidence"]]
    every = _all_evidence(run)
    results = _results(run) if mode == "end-to-end" else []
    leaked = [e for e in every if _pair(e) not in pairs] + [c for r in results for c in r["citations"] if _pair(c) not in pairs]
    checks["scope_and_version"] = check("FAIL" if leaked else "PASS", reason="evidence outside granted pairs" if leaked else None)
    if case.get("expect_denied"):
        protected = {tuple(p) for p in run.get("protected_pairs", [])}
        exposed = [e for e in every if _pair(e) in protected] + \
            [c for r in results for c in r["citations"] if _pair(c) in protected]
        statuses = run.get("private_statuses", [])
        if exposed:
            checks["cross_access_denied"] = check("FAIL", reason="Private evidence of a policy this actor may not read")
        elif run.get("released_policy"):
            checks["cross_access_denied"] = check("FAIL", reason="contract data released to this actor")
        elif mode == "retrieval" and not (statuses and all(s == "DENIED" for s in statuses)):
            checks["cross_access_denied"] = check("FAIL", reason=f"Core denial not kept: {statuses}")
        else:
            checks["cross_access_denied"] = check("PASS")
    if run.get("linked_view") is not None:
        used = run.get("linked_views_used", [])
        marker = case.get("after_view_marker")
        if any(v != run["linked_view"] for v in used):
            checks["linked_view_frozen"] = check("FAIL", reason="linked chat read outside the frozen view")
        elif marker and any(marker.lower() in r["message"].lower() for r in results):
            checks["linked_view_frozen"] = check("FAIL", reason="message committed after the view appears in the answer")
        elif not used:
            checks["linked_view_frozen"] = check("NOT_RUN", reason="linked chat not read")
        else:
            checks["linked_view_frozen"] = check("PASS")
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
        for name, patterns in (("no_claim_commitment", COMMITMENT_PATTERNS),
                               ("no_ticket_success_before_commit", TICKET_SUCCESS_PATTERNS)):
            if run.get("result") is None:
                checks[name] = check("NOT_RUN", reason="no result to review")
            elif any(_contains(r["message"], patterns) for r in results):
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


def review_checks(case: Mapping[str, Any], run: Mapping[str, Any], mode: str, human: Mapping[str, str] | None) -> dict:
    """Behaviour expectations of plan Task 9 Step 3/3a (rider not mapped, recent/from-start, no draft, ...). Only the
    absence of actions in Copilot is checked by code; the rest stays NOT_RUN until a reviewer records a verdict. They
    are reported apart from mandatory checks and never change the mandatory status."""
    checks: dict[str, dict[str, Any]] = {}
    if mode != "end-to-end":
        return checks
    result = run.get("result")
    if case.get("kind") == "copilot":
        checks["copilot_no_actions"] = (check("NOT_RUN", reason="no result to review") if result is None else
                                        check("FAIL" if result["actions"] else "PASS"))
    for name in case.get("review", []):
        checks[name] = check("NOT_RUN", reason="no result to review" if result is None else "needs human review")
    for name, verdict in (human or {}).items():
        if name in checks and verdict in CHECK_STATES:
            checks[name] = check(verdict, source="human")
    return checks


MANDATORY = ("scope_and_version", "cross_access_denied", "linked_view_frozen", "failure_status_kept",
             "source_warning_surfaced", "no_claim_commitment", "no_ticket_success_before_commit", "citations_resolve")


# ---------------------------------------------------------------------------------------------- report

def evaluate(cases: Sequence[Mapping[str, Any]], dataset_id: str, config_id: str, *, runner: Callable[[Mapping], dict],
             mode: str, meta: Mapping[str, Any], doc_ids: Mapping[str, str], ks: Sequence[int] = (1, 3, 5, 8),
             human_review: Mapping[str, Mapping[str, str]] | None = None,
             include_synthetic_text: bool = False) -> dict[str, Any]:
    """Run every case through ``runner`` and build an EvaluationReport. ``meta`` must carry prompt_version.

    Text of non-Public cases (questions, answers, tool queries) is left out of the report unless
    ``include_synthetic_text`` is set and the runner marks the case as using synthetic data only; chunk text never is."""
    if mode not in ("retrieval", "end-to-end"):
        raise ValueError("mode must be retrieval or end-to-end")
    versions = meta.get("prompt_version")
    if not versions or not all(isinstance(v, str) and v for v in versions.values()):
        raise ValueError("prompt_version is required in the report metadata")
    human_review = human_review or {}
    rows, all_checks, all_review = [], [], []
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
        review = review_checks(case, run, mode, human_review.get(case["id"]))
        all_checks.append(checks)
        all_review.append(review)
        retrievals = run.get("retrievals", [])
        first = retrievals[0] if retrievals else None
        ordered = ranked_evidence(retrievals)
        ranked = [target_matches(e, case.get("expected", []), doc_ids) for e in ordered]
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
        usage_totals["retrieval_calls"] += len(retrievals) + len(run.get("prior_retrievals", []))
        usage_totals["embedding_calls"] += usage.get("embedding_calls", 0)
        usage_totals["rate_limited_waits"] += usage.get("rate_limited_waits", 0)
        if run.get("latency_ms") is not None:
            latencies.append(run["latency_ms"])
        public = case.get("kind", "public") == "public"
        show_text = public or (include_synthetic_text and run.get("synthetic_only") is True)
        row = {"id": case["id"], "kind": case.get("kind"), "tags": case.get("tags", []),
               "statuses": [r["status"] for r in retrievals], "degraded": [r["degraded"] for r in retrievals],
               "evidence": [{"document_id": e["document_id"], "document_version": e["document_version"],
                             "clause": e["location"].get("clause"), "pages": e["location"].get("pages"),
                             "anchor": e["location"].get("anchor"), "matched": sorted(ranked[i])}
                            for i, e in enumerate(ordered)],
               "missing": [{"code": m["code"], "reference": m.get("reference")} for r in retrievals for m in r["missing"]],
               "metrics": metrics, "checks": checks, "review_checks": review, "latency_ms": run.get("latency_ms"),
               "technical_failure": run.get("failure"), "text_redacted": not show_text}
        if run.get("turn_latencies_ms") and len(run["turn_latencies_ms"]) > 1:
            row["turn_latencies_ms"] = run["turn_latencies_ms"]
        if show_text:
            row["question"] = case["question"]
            if case.get("turns"):
                row["turns"] = list(case["turns"])
            if result is not None:
                row["answer"] = {"response_type": result["response_type"], "message": result["message"],
                                 "citations": [{"clause": c["location"].get("clause"), "pages": c["location"].get("pages"),
                                                "anchor": c["location"].get("anchor"), "document_id": c["document_id"]}
                                               for c in result["citations"]],
                                 "actions": [a["type"] for a in result["actions"]]}
            row["tool_calls"] = run.get("tool_calls", [])
        rows.append(row)
    mandatory = aggregate(all_checks, MANDATORY)
    review_names = sorted({name for r in all_review for name in r})
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
        "private_text_in_report": bool(include_synthetic_text),
        "mandatory_checks": mandatory, "mandatory_status": status,
        "review_checks": aggregate(all_review, review_names), "quality_metrics": quality_metrics,
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


# ---------------------------------------------------------------------------------------------- local Core double

PRIVATE_KEY = "synthetic:SYN-CONTRACT-001"  # `expected[].document` for the synthetic contract
CASE_KINDS = ("public", "private", "mixed", "multi_turn", "copilot")
ACTORS = ("anonymous", "owner", "other_customer", "assigned_staff", "unassigned_staff")
_NS = uuid.UUID("0b7c5d2e-91a4-4c3f-8e6d-5a4b3c2d1e0f")
_RUN_OUTCOME_CODES = ("DEADLINE_EXCEEDED", "BUDGET_EXHAUSTED", "MODEL_ERROR", "OUTPUT_INVALID", "PERMISSION_DENIED",
                      "SOURCE_UNAVAILABLE", "INTERNAL", "STAFF_TAKEOVER", "CANCELLED_BY_CORE")


def _timestamp(moment: datetime) -> str:
    return moment.isoformat(timespec="seconds").replace("+00:00", "Z")


def _scope(doc_pairs: Sequence[tuple[str, str]], kind: str = "PUBLIC", *, policy_number: str | None = None,
           policy_id: str | None = None) -> dict[str, Any]:
    return {"decision": "GRANTED", "kind": kind, "policy_number": policy_number, "scope_version": "local-eval",
            "expires_at": _timestamp(datetime.now(timezone.utc) + timedelta(minutes=10)),
            "documents": [{"document_id": d, "document_version": v, "policy_id": policy_id} for d, v in doc_pairs]}


@dataclass(frozen=True)
class SyntheticPolicy:
    """What Core would know about the synthetic contract (data/synthetic/manulife-demo-v1). DEMO-TITAN riders are listed
    with their fixture labels and riders_complete stays false: their commercial mapping is not reviewed (G5)."""

    policy_number: str
    policy_id: str
    document_id: str
    document_version: str
    owner_id: str
    staff_id: str
    main: Mapping[str, str]
    riders: tuple[Mapping[str, str], ...]

    @classmethod
    def load(cls, directory: Path) -> "SyntheticPolicy":
        data = json.loads((Path(directory) / "contract.json").read_text(encoding="utf-8"))
        if data.get("synthetic") is not True:
            raise ValueError("Private evaluation uses the fully synthetic fixture only (G5)")
        contract, doc = data["contract"], data["private_document"]
        return cls(policy_number=contract["policy_number"], policy_id=contract["proposed_uuid"],
                   document_id=doc["proposed_uuid"], document_version=doc["version"],
                   owner_id=data["owner_customer"]["proposed_uuid"], staff_id=data["assigned_staff"]["proposed_uuid"],
                   main={"code": contract["main_product"]["fixture_product_ref"], "name": contract["main_product"]["name"]},
                   riders=tuple({"code": r["benefit_id"], "name": r["display_name"]} for r in contract["riders"]))

    @property
    def pair(self) -> tuple[str, str]:
        return self.document_id, self.document_version


def _pos(cursor: str | None) -> int:
    return int(cursor[1:]) if cursor else 0


class LocalCore:
    """Core double for local evaluation, synthetic data only. Public scope = the case's catalog pairs. Private access
    follows the fixture's intent (the owner, and the assigned Staff for that owner) so cross-access cases have a
    decision to check; denied and unknown look the same. It does not prove Core permissions, assignment or
    linked-chat checks (Tasks 3/10). History cursors are "p<position>"."""

    def __init__(self, public_pairs: Sequence[tuple[str, str]], policy: SyntheticPolicy | None = None) -> None:
        self.public_pairs = [tuple(p) for p in public_pairs]
        self.policy = policy
        self.histories: dict[str, list[dict[str, Any]]] = {}
        self.granted: set[tuple[str, str]] = set()
        self.released = False  # contract data or Private scope returned to the actor
        self.linked_views: list[dict[str, Any]] = []

    def may_read_policy(self, ctx: Mapping[str, Any]) -> bool:
        p = self.policy
        if p is None or ctx["target_customer_id"] != p.owner_id:
            return False
        actor = ctx["actor"]
        return actor["id"] == (p.owner_id if actor["role"] == "CUSTOMER" else p.staff_id)

    def scope(self, ctx, kind, policy_number, *, timeout):
        if kind == "PUBLIC":
            self.granted.update(self.public_pairs)
            return _scope(self.public_pairs)
        if self.may_read_policy(ctx) and policy_number == self.policy.policy_number:
            self.granted.add(self.policy.pair)
            self.released = True
            return _scope([self.policy.pair], "PRIVATE", policy_number=policy_number, policy_id=self.policy.policy_id)
        return {"decision": "DENIED", "kind": "PRIVATE", "policy_number": policy_number, "reason": "NOT_AUTHORIZED"}

    def list_contracts(self, ctx, *, timeout):
        from life_agent.core_client import CoreError

        if ctx["actor"]["role"] == "STAFF" and not self.may_read_policy(ctx):
            raise CoreError("NOT_AUTHORIZED")  # Staff without an active assignment for the target Customer
        if not self.may_read_policy(ctx):
            return []  # a Customer without contracts: valid-empty
        self.released = True
        return [{"policy_number": self.policy.policy_number, "main_product": dict(self.policy.main)}]

    def get_contract_overview(self, ctx, policy_number, *, timeout):
        from life_agent.core_client import CoreError

        if not self.may_read_policy(ctx) or policy_number != self.policy.policy_number:
            raise CoreError("NOT_AUTHORIZED")
        self.released = True
        return {"policy_number": self.policy.policy_number, "main_product": dict(self.policy.main),
                "riders": [dict(r) for r in self.policy.riders], "riders_complete": False}

    def _page(self, conversation_id: str, view: Mapping[str, Any], cursor: str | None) -> dict[str, Any]:
        items = [i for i in self.histories.get(conversation_id, [])
                 if _pos(cursor) < int(i["position"]) <= _pos(view["through_cursor"])]
        return {"items": copy.deepcopy(items), "nextCursor": None}

    def history(self, ctx, view, cursor, *, timeout):
        from life_agent.core_client import CoreError

        if view["conversation_id"] != ctx["conversation_id"]:
            raise CoreError("NOT_AUTHORIZED")
        return self._page(view["conversation_id"], view, cursor)

    def linked_history(self, ctx, view, cursor, *, timeout):
        from life_agent.core_client import CoreError

        self.linked_views.append(dict(view))
        if not self.may_read_policy(ctx):
            raise CoreError("NOT_AUTHORIZED")
        return self._page(view["conversation_id"], view, cursor)


class CaseSetup:
    """Actor, channel, conversations and Core double of one case. Earlier turns are run for real by the end-to-end
    runner and recorded here as Core-accepted history; the Copilot source chat is authored in the case."""

    def __init__(self, case: Mapping[str, Any], public_pairs: Sequence[tuple[str, str]],
                 policy: SyntheticPolicy | None) -> None:
        kind = case.get("kind", "public")
        if kind not in CASE_KINDS:
            raise ValueError(f"case {case['id']}: unknown kind {kind}")
        self.case = case
        self.copilot = kind == "copilot"
        self.channel = "STAFF_COPILOT" if self.copilot else "CUSTOMER_SUPPORT"
        actor = case.get("actor") or ("assigned_staff" if self.copilot else "owner" if kind != "public" else "anonymous")
        if actor not in ACTORS or (actor.endswith("staff") != self.copilot):
            raise ValueError(f"case {case['id']}: actor {actor} does not fit channel {self.channel}")
        if actor != "anonymous" and policy is None:
            raise ValueError(f"case {case['id']} needs the synthetic Private fixture (trial private_fixture)")
        self.policy = policy
        self.core = LocalCore(public_pairs, policy)
        if actor == "anonymous":
            self.actor, self.target = {"id": self.ident("customer"), "role": "CUSTOMER"}, self.ident("customer")
        elif actor == "owner":
            self.actor, self.target = {"id": policy.owner_id, "role": "CUSTOMER"}, policy.owner_id
        elif actor == "other_customer":
            self.actor, self.target = {"id": self.ident("other-customer"), "role": "CUSTOMER"}, self.ident("other-customer")
        elif actor == "assigned_staff":
            self.actor, self.target = {"id": policy.staff_id, "role": "STAFF"}, policy.owner_id
        else:
            self.actor, self.target = {"id": self.ident("unassigned-staff"), "role": "STAFF"}, policy.owner_id
        self.conversation_id = self.ident("conversation")
        self.linked_view: dict[str, Any] | None = None
        if self.copilot:
            source = self.ident("customer-chat")
            items = self._source_items(case.get("linked_chat", []))
            self.core.histories[source] = items
            through = case.get("linked_through", len(items))
            self.linked_view = {"conversation_id": source, "through_cursor": f"p{through}" if through else None}

    def ident(self, name: str) -> str:
        return str(uuid.uuid5(_NS, f"{self.case['id']}:{name}"))

    def _source_items(self, chat: Sequence[Mapping[str, str]]) -> list[dict[str, Any]]:
        from life_agent import contracts

        items: list[dict[str, Any]] = []
        created = _timestamp(datetime.now(timezone.utc) - timedelta(days=1))
        for index, entry in enumerate(chat):
            position = str(index + 1)
            if entry["from"] == "AGENT":
                asked = items[-1]
                item = {"kind": "AGENT_RESULT", "position": position, "runId": asked["run"]["id"],
                        "messageId": asked["messageId"], "createdAt": created,
                        "result": {"response_type": "ANSWER", "message": entry["text"], "citations": [], "actions": []}}
            else:
                answered = index + 1 < len(chat) and chat[index + 1]["from"] == "AGENT"
                item = {"kind": "USER_MESSAGE", "position": position, "messageId": self.ident(f"src-message:{index}"),
                        "senderType": entry["from"], "content": entry["text"], "createdAt": created,
                        "run": {"id": self.ident(f"src-run:{index}"), "status": "COMPLETED"} if answered else None}
            items.append(contracts.validate("HistoryItem", item))
        return items

    def request(self, turn: int, text: str, limits: Mapping[str, Any]) -> dict[str, Any]:
        from life_agent import contracts

        own = self.core.histories.get(self.conversation_id, [])
        message = self.ident(f"message:{turn}")
        deadline = datetime.now(timezone.utc) + timedelta(seconds=limits["deadline_s"])
        request = {
            "schema_version": "agent-v1", "run_id": self.ident(f"run:{turn}"), "attempt_id": self.ident(f"attempt:{turn}"),
            "conversation_id": self.conversation_id, "message_id": message, "message_text": text,
            "channel_type": self.channel, "actor": dict(self.actor), "target_customer_id": self.target,
            "history_view": {"conversation_id": self.conversation_id,
                             "through_cursor": f"p{own[-1]['position']}" if own else None, "current_message_id": message},
            "linked_history_view": dict(self.linked_view) if self.linked_view else None,
            "limits": {**{k: v for k, v in limits.items() if k != "deadline_s"}, "deadline_at": _timestamp(deadline)},
        }
        return contracts.validate("RunRequest", request)

    def record(self, turn: int, text: str, event: Mapping[str, Any]) -> None:
        """Store a finished turn as Core would accept it, so the next turn reads it through the history API."""
        from life_agent import contracts

        items = self.core.histories.setdefault(self.conversation_id, [])
        position = len(items) + 1
        message, run = self.ident(f"message:{turn}"), self.ident(f"run:{turn}")
        ok = event["kind"] == "RESULT"
        created = _timestamp(datetime.now(timezone.utc))
        items.append(contracts.validate("HistoryItem", {
            "kind": "USER_MESSAGE", "position": str(position), "messageId": message,
            "senderType": "STAFF" if self.copilot else "CUSTOMER", "content": text, "createdAt": created,
            "run": {"id": run, "status": "COMPLETED" if ok else "FAILED"}}))
        if ok:
            tail = {"kind": "AGENT_RESULT", "result": event["payload"]["result"]}
        else:
            code = (event["payload"].get("failure") or {}).get("code")
            tail = {"kind": "RUN_OUTCOME", "status": "FAILED", "code": code if code in _RUN_OUTCOME_CODES else "INTERNAL"}
        items.append(contracts.validate("HistoryItem", {**tail, "position": str(position + 1), "runId": run,
                                                        "messageId": message, "createdAt": created}))

    def protected_pairs(self) -> list[tuple[str, str]]:
        """Private pairs this actor may not read (checked by cross_access_denied)."""
        ctx = {"actor": self.actor, "target_customer_id": self.target}
        return [] if self.policy is None or self.core.may_read_policy(ctx) else [self.policy.pair]

    def policy_number(self) -> str | None:
        return self.case.get("policy_number") or (self.policy.policy_number if self.policy else None)


def run_request(case: Mapping[str, Any], limits: Mapping[str, Any]) -> dict[str, Any]:
    """Single-turn RunRequest of a Public case (kept for callers of the Public-only harness)."""
    return CaseSetup(case, [], None).request(0, case["question"], limits)


# ---------------------------------------------------------------------------------------------- real runners

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
    from life_agent.corpus import CorpusConfig, catalog_entry, load_manifest, inventory, prepare_private_fixture
    from life_agent.model import EmbeddingConfig, GeminiEmbedding
    from life_agent.retrieval import PgIndexReader, SearchConfig, SearchEngine

    manifest_path = REPO_ROOT / trial["manifest"]
    manifest = load_manifest(manifest_path)
    inventory(manifest)
    corpus = CorpusConfig.from_mapping(trial["corpus"])
    catalog = {s["source_relative_path"]: catalog_entry(s) for s in manifest["sources"]}
    dataset_id = f"{corpus.dataset_version}@{hashlib.sha256(manifest_path.read_bytes()).hexdigest()[:12]}"
    policy = None
    if trial.get("private_fixture"):
        directory = REPO_ROOT / trial["private_fixture"]
        version = prepare_private_fixture(directory, corpus)  # synthetic-only and checksum checks (G5)
        policy = SyntheticPolicy.load(directory)
        if (version.document_id, version.document_version, version.policy_id) != (*policy.pair, policy.policy_id):
            raise ValueError("synthetic fixture identifiers disagree between contract.json and the prepared version")
        dataset_id += f"+{hashlib.sha256((directory / 'manifest.json').read_bytes()).hexdigest()[:12]}"
    embedding = EmbeddingConfig.from_mapping(trial["embedding"])
    search = SearchConfig.from_mapping(trial["search"])
    embedder = GeminiEmbedding(env)
    reader = PgIndexReader(require(env, "LIFE_AGENT_RAG_RETRIEVER_DSN"))
    return {"manifest": manifest, "corpus": corpus, "catalog": catalog, "embedding": embedding, "search": search,
            "embedder": embedder, "reader": reader, "engine": SearchEngine(reader, embedder, embedding),
            "dataset_id": dataset_id, "policy": policy}


def _pairs_for(case, catalog) -> list[tuple[str, str]]:
    docs = case.get("scope") or sorted(catalog)
    return [(catalog[d]["document_id"], catalog[d]["document_version"]) for d in docs]


def retrieval_queries(case: Mapping[str, Any]) -> list[tuple[str, str]]:
    """(kind, query) calls of a retrieval-mode case: explicit `retrieval_queries`, else the question once per side."""
    if case.get("retrieval_queries"):
        return [(q["kind"], q["query"]) for q in case["retrieval_queries"]]
    text = case.get("query") or case["question"]
    kind = case.get("kind", "public")
    if kind == "private":
        return [("PRIVATE", text)]
    if kind == "mixed":
        return [("PRIVATE", text), ("PUBLIC", text)]
    return [("PUBLIC", text)]


def retrieval_runner(rt, trial) -> Callable[[Mapping], dict]:
    from life_agent.graph import execution_context
    from life_agent.retrieval import RetrievalService, SearchEngine

    def run(case):
        setup = CaseSetup(case, _pairs_for(case, rt["catalog"]), rt.get("policy"))
        engine = rt["engine"]
        if case.get("fault") == "search_down":
            engine = SearchEngine(_FaultyIndex(rt["reader"], {"keyword", "profile"}), rt["embedder"], rt["embedding"])
        elif case.get("fault") == "embedding_down":
            engine = SearchEngine(rt["reader"], _DownEmbedding(rt["embedder"]), rt["embedding"])
        service = RetrievalService(setup.core, engine, rt["search"])
        execution = execution_context(setup.request(0, case["question"], trial["limits"]))
        results, private_statuses = [], []
        before = rt["embedder"].calls
        started = time.perf_counter()
        for kind, query in retrieval_queries(case):
            if kind == "PRIVATE":
                result = service.retrieve_private(execution, query, setup.policy_number())
                private_statuses.append(result["status"])
            else:
                result = service.retrieve_public(execution, query)
            results.append(result)
        return {"retrievals": results, "scope_pairs": sorted(setup.core.granted), "protected_pairs": setup.protected_pairs(),
                "private_statuses": private_statuses, "released_policy": bool(setup.protected_pairs()) and setup.core.released,
                "latency_ms": round((time.perf_counter() - started) * 1000, 1),
                "usage": {"embedding_calls": rt["embedder"].calls - before}, "synthetic_only": True}
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
        setup = CaseSetup(case, _pairs_for(case, rt["catalog"]), rt.get("policy"))
        core = setup.core
        model = RecordingModel(GeminiModel(generation, env))
        service = RetrievalService(core, rt["engine"], rt["search"])
        graph = build_graph(MemoryStore(), core, service, model, agent_config, checkpointer=InMemorySaver())
        runner = AgentRunner(graph)
        texts = [*case.get("turns", []), case["question"]]
        prior_retrievals, prior_results, latencies = [], [], []
        before = rt["embedder"].calls
        for turn, text in enumerate(texts):
            request = setup.request(turn, text, trial["limits"])
            started = time.perf_counter()
            try:
                event = runner.run(request)
            except Exception as error:  # noqa: BLE001 - recorded as a technical failure of the case
                event = {"kind": "ERROR", "payload": {"failure": {"code": type(error).__name__, "retryable": False}}}
            latencies.append(round((time.perf_counter() - started) * 1000, 1))
            values = graph.get_state({"configurable": {"thread_id": f"conv:{request['conversation_id']}"}}).values
            outputs = (values.get("work") or {}).get("source_outputs", [])
            retrievals = [o["result"] for o in outputs if o["tool"].startswith("retrieve_") and not o["replaced"]]
            result = event["payload"].get("result") if event["kind"] == "RESULT" else None
            if turn < len(texts) - 1:  # earlier turns: kept for leak checks, then accepted into Core history
                prior_retrievals += retrievals
                prior_results += [result] if result else []
                setup.record(turn, text, event)
        protected = setup.protected_pairs()
        return {"retrievals": retrievals, "prior_retrievals": prior_retrievals, "prior_results": prior_results,
                "scope_pairs": sorted(core.granted), "protected_pairs": protected,
                "released_policy": bool(protected) and core.released,
                "linked_view": setup.linked_view, "linked_views_used": core.linked_views,
                "latency_ms": latencies[-1], "turn_latencies_ms": latencies, "result": result,
                "failure": event["payload"].get("failure"),
                "tool_calls": [{"tool": o["tool"], "query": o["arguments"].get("query")} for o in outputs],
                "usage": {"calls": model.calls, "embedding_calls": rt["embedder"].calls - before,
                          "rate_limited_waits": model.rate_limited}, "synthetic_only": True}
    return run


def report_meta(trial: Mapping[str, Any], rt: Mapping[str, Any], mode: str) -> dict[str, Any]:
    from dataclasses import asdict

    from life_agent.model import DECISION_SCHEMA
    from life_agent.prompts import prompt_version

    statuses = sorted({s["status"] for s in rt["manifest"]["sources"]})
    policy = rt.get("policy")
    return {
        "trial_id": trial["trial_id"], "trial_status": trial["status"],
        "prompt_version": {c: prompt_version(c) for c in ("CUSTOMER_SUPPORT", "STAFF_COPILOT")},
        "output_schema_version": hashlib.sha256(json.dumps(DECISION_SCHEMA, sort_keys=True).encode()).hexdigest()[:12],
        "corpus": {"manifest": trial["manifest"], "human_approved": bool(rt["manifest"].get("human_approved")),
                   "statuses": statuses, "approval_note": "Corpus chưa được người duyệt (G5); kết quả chỉ là phép thử.",
                   "config": asdict(rt["corpus"])},
        "private_fixture": None if policy is None else {
            "path": trial["private_fixture"], "synthetic": True, "document_id": policy.document_id,
            "document_version": policy.document_version, "riders_complete": False,
            "note": "G5 06/11/2026: chỉ bộ synthetic được chunk/embed/gửi provider; rider DEMO-TITAN giữ chưa ánh xạ. "
                    "LocalCore chỉ mô phỏng quyền, không chứng minh quyền Core (Task 3/10)."},
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
    parser.add_argument("--kind", nargs="*", choices=CASE_KINDS, help="case kinds to run (default: all)")
    parser.add_argument("--human-review", type=Path, help="JSON {case_id: {check: PASS|FAIL|NOT_RUN}}")
    parser.add_argument("--include-synthetic-private-text", action="store_true",
                        help="write questions/answers of synthetic Private cases for human review (never chunk text)")
    parser.add_argument("--out", type=Path)
    args = parser.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    env = load_env(args.env_file)
    trial = json.loads(args.trial.read_text(encoding="utf-8"))
    cases = json.loads(args.cases.read_text(encoding="utf-8"))["cases"]
    cases = [c for c in cases if args.mode in c.get("modes", ["retrieval", "end-to-end"])
             and (not args.only or c["id"] in args.only) and (not args.kind or c.get("kind", "public") in args.kind)]
    rt = build_runtime(trial, env)
    if rt["policy"] is None:
        skipped = [c["id"] for c in cases if c.get("kind", "public") != "public"]
        cases = [c for c in cases if c.get("kind", "public") == "public"]
        if skipped:
            print(f"skipped {len(skipped)} non-Public cases: trial has no private_fixture", file=sys.stderr)
    runner = retrieval_runner(rt, trial) if args.mode == "retrieval" else end_to_end_runner(rt, trial, env)
    doc_ids = {path: entry["document_id"] for path, entry in rt["catalog"].items()}
    if rt["policy"]:
        doc_ids[PRIVATE_KEY] = rt["policy"].document_id
    human = json.loads(args.human_review.read_text(encoding="utf-8")) if args.human_review else None
    try:
        report = evaluate(cases, rt["dataset_id"], f"{trial['trial_id']}:{rt['search'].config_id}", runner=runner,
                          mode=args.mode, meta=report_meta(trial, rt, args.mode), doc_ids=doc_ids, human_review=human,
                          include_synthetic_text=args.include_synthetic_private_text)
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
               "review": {k: v["status"] for k, v in report["review_checks"].items()},
               "recall@8": q.get("recall@8"), "ndcg@8": q.get("ndcg@8"), "mrr": q.get("mrr"),
               "latency_ms_p50": q["latency_ms_p50"], "latency_ms_p95": q["latency_ms_p95"], "usage": q["usage"],
               "cost_usd": q["cost_usd"], "acceptance": report["acceptance"]}
    if args.mode == "end-to-end":
        summary.update({k: q.get(k) for k in ("response_type_match", "answer_has_citation", "cited_expected")})
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
