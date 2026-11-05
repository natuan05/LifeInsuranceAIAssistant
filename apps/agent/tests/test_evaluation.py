"""Evaluation harness (plan Task 9 Step 1): deterministic scoring, report metadata, mandatory vs quality, NOT_RUN,
redaction and usage totals. Scripted runners only; real model behaviour is what the harness measures, not this file."""
import json
import sys
from pathlib import Path

import pytest

from life_agent import prompts
from life_agent.prompts import prompt_version

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "evaluation"))
import evaluate as ev  # noqa: E402

DOC_A, DOC_B = "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"
DOC_IDS = {"P/a.pdf": DOC_A, "P/b.pdf": DOC_B}
META = {"prompt_version": {"CUSTOMER_SUPPORT": "customer_support-abc", "STAFF_COPILOT": "staff_copilot-def"},
        "pricing_usd_per_million": {"m": {"input": 1.0, "output": 2.0}}, "generation_model": "m"}


def evidence(doc, clause, version="v1", eid=None):
    return {"evidence_id": eid or f"e-{clause.split()[1]}", "document_id": doc, "document_version": version,
            "title": "t", "document_type": "TERMS", "location": {"clause": clause, "pages": [1]}, "content": "x"}


def retrieval(*items, status="OK", missing=(), degraded=False):
    return {"status": status, "evidence": list(items), "missing": list(missing), "conflicts": [], "degraded": degraded,
            "error": None if status != "ERROR" else {"code": "SEARCH_UNAVAILABLE", "retryable": True}}


def case(cid="c1", expected=(("P/a.pdf", "Điều 3"),), **kw):
    return {"id": cid, "kind": kw.pop("kind", "public"), "question": kw.pop("question", "Thời gian chờ?"),
            "expected": [{"document": d, "clause": c} for d, c in expected], "expect_status": "OK", **kw}


def runner(runs):
    return lambda c: runs[c["id"]]


PAIRS = [(DOC_A, "v1"), (DOC_B, "v1")]


# ---------------------------------------------------------------------------------------------- metrics

def test_recall_and_ndcg_on_a_known_ranking():
    matches = [set(), {0}, set(), {1}]  # targets 0 and 1 found at ranks 2 and 4
    assert ev.recall_at_k(matches, 2, 1) == 0 and ev.recall_at_k(matches, 2, 2) == 0.5 and ev.recall_at_k(matches, 2, 4) == 1
    ideal = 1 + 1 / ev.math.log2(3)
    assert ev.ndcg_at_k(matches, 2, 4) == pytest.approx((1 / ev.math.log2(3) + 1 / ev.math.log2(5)) / ideal)
    assert ev.ndcg_at_k([{0}, {0}], 1, 2) == 1.0  # a target counts once
    assert ev.mrr(matches) == 0.5 and ev.recall_at_k([], 0, 8) is None


def test_clause_labels_match_on_boundaries_only():
    assert ev.clause_matches("Điều 3. Thời Gian Chờ", "Điều 3")
    assert ev.clause_matches("Điều 1 ▸ Quyền lợi trợ cấp y tế", "Điều 1")
    assert not ev.clause_matches("Điều 31. Hủy bỏ", "Điều 3")
    assert not ev.clause_matches("Phụ lục 1.2. Bệnh Lý", "Phụ lục 1")
    assert ev.clause_matches("Phụ lục 1.2. Bệnh Lý", "Phụ lục 1.2")


# ---------------------------------------------------------------------------------------------- mandatory vs quality

def test_mandatory_failure_is_not_offset_by_quality():
    perfect = retrieval(evidence(DOC_A, "Điều 3. Thời gian chờ"))
    leaked = retrieval(evidence(DOC_A, "Điều 3. Thời gian chờ"), evidence(DOC_A, "Điều 3. Thời gian chờ", version="v2"))
    runs = {f"c{i}": {"retrievals": [perfect], "scope_pairs": PAIRS} for i in range(9)}
    runs["c9"] = {"retrievals": [leaked], "scope_pairs": PAIRS}  # foreign version: perfect recall, still a violation
    report = ev.evaluate([case(f"c{i}") for i in range(10)], "d", "cfg", runner=runner(runs), mode="retrieval",
                         meta=META, doc_ids=DOC_IDS)
    assert report["quality_metrics"]["recall@8"] == 1.0
    assert report["mandatory_checks"]["scope_and_version"]["status"] == "FAIL"
    assert report["mandatory_status"] == "FAIL" and report["acceptance"] == "NOT_ACCEPTED"


def test_unrun_mandatory_check_is_not_pass():
    ok = retrieval(evidence(DOC_A, "Điều 3. Thời gian chờ"))
    result = {"response_type": "ANSWER", "message": "Thời gian chờ là 30 ngày.",
              "citations": [{k: v for k, v in evidence(DOC_A, "Điều 3. Thời gian chờ").items() if k != "content"}],
              "actions": []}
    runs = {"c1": {"retrievals": [ok], "scope_pairs": PAIRS, "result": result, "usage": {"calls": []}}}
    report = ev.evaluate([case(expect_response=["ANSWER"])], "d", "cfg", runner=runner(runs), mode="end-to-end",
                         meta=META, doc_ids=DOC_IDS)
    checks = report["mandatory_checks"]
    assert checks["no_claim_commitment"]["status"] == "NOT_RUN"  # code found no phrase: that is not a PASS
    assert checks["scope_and_version"]["status"] == "PASS" and checks["citations_resolve"]["status"] == "PASS"
    assert report["mandatory_status"] == "NOT_RUN" and report["acceptance"] == "PENDING_REVIEW"
    reviewed = ev.evaluate([case(expect_response=["ANSWER"])], "d", "cfg", runner=runner(runs), mode="end-to-end",
                           meta=META, doc_ids=DOC_IDS,
                           human_review={"c1": {"no_claim_commitment": "PASS", "no_ticket_success_before_commit": "PASS"}})
    assert reviewed["mandatory_checks"]["no_claim_commitment"]["status"] == "PASS"
    assert reviewed["acceptance"] == "PENDING_REVIEW"  # quality thresholds are not approved: never auto-accepted


def test_commitment_phrase_fails_the_mandatory_check():
    result = {"response_type": "ANSWER", "message": "Anh chắc chắn được chi trả 5 ngày.", "citations": [], "actions": []}
    runs = {"c1": {"retrievals": [], "scope_pairs": PAIRS, "result": result, "usage": {"calls": []}}}
    report = ev.evaluate([case(expected=())], "d", "cfg", runner=runner(runs), mode="end-to-end", meta=META, doc_ids=DOC_IDS)
    assert report["mandatory_checks"]["no_claim_commitment"]["status"] == "FAIL"


def test_failure_status_and_source_warning_checks():
    warn = {"code": "SOURCE_WARNING", "document_id": DOC_A, "document_version": "v1", "reason": "r"}
    runs = {"f1": {"retrievals": [retrieval(status="ERROR")], "scope_pairs": PAIRS},
            "f2": {"retrievals": [retrieval(evidence(DOC_A, "Điều 3. x"), degraded=True)], "scope_pairs": PAIRS},
            "w1": {"retrievals": [retrieval(evidence(DOC_A, "Phụ lục 2. Phân bổ"))], "scope_pairs": PAIRS},
            "w2": {"retrievals": [retrieval(evidence(DOC_A, "Phụ lục 2. Phân bổ"), missing=[warn])], "scope_pairs": PAIRS}}
    cases = [case("f1", expected=(), fault="search_down", expect_status="ERROR", expect_degraded=False),
             case("f2", fault="embedding_down", expect_degraded=True),
             case("w1", expected=(("P/a.pdf", "Phụ lục 2"),), expect_source_warning=True),
             case("w2", expected=(("P/a.pdf", "Phụ lục 2"),), expect_source_warning=True)]
    report = ev.evaluate(cases, "d", "cfg", runner=runner(runs), mode="retrieval", meta=META, doc_ids=DOC_IDS)
    rows = {r["id"]: r["checks"] for r in report["cases"]}
    assert rows["f1"]["failure_status_kept"]["status"] == "PASS" and rows["f2"]["failure_status_kept"]["status"] == "PASS"
    assert rows["w1"]["source_warning_surfaced"]["status"] == "FAIL"  # warned passage returned without its warning
    assert rows["w2"]["source_warning_surfaced"]["status"] == "PASS"
    assert report["mandatory_checks"]["source_warning_surfaced"]["status"] == "FAIL"


# ---------------------------------------------------------------------------------------------- metadata, usage, redaction

def test_prompt_version_is_required_and_tracks_prompt_content(monkeypatch):
    with pytest.raises(ValueError, match="prompt_version"):
        ev.evaluate([], "d", "cfg", runner=runner({}), mode="retrieval", meta={}, doc_ids=DOC_IDS)
    before = prompt_version("CUSTOMER_SUPPORT")
    monkeypatch.setattr(prompts, "_OUTPUT", prompts._OUTPUT + ("Thêm một chỉ dẫn.",))
    assert prompt_version("CUSTOMER_SUPPORT") != before
    assert "Thời gian chờ" not in before and len(before) < 40  # no question or customer data in the identifier


def test_token_and_cost_totals_include_summary_repair_and_retries():
    calls = [{"kind": "summary", "input_tokens": 100, "output_tokens": 10},
             {"kind": "decide", "input_tokens": 1000, "output_tokens": 50, "thinking_tokens": 20},
             {"kind": "decide", "input_tokens": 1200, "output_tokens": 60},
             {"kind": "repair", "input_tokens": 1300, "output_tokens": 70}]
    runs = {"c1": {"retrievals": [], "scope_pairs": PAIRS, "result": None, "usage": {"calls": calls}}}
    report = ev.evaluate([case(expected=())], "d", "cfg", runner=runner(runs), mode="end-to-end", meta=META,
                         doc_ids=DOC_IDS)
    usage = report["quality_metrics"]["usage"]
    assert (usage["model_calls"], usage["input_tokens"], usage["output_tokens"], usage["thinking_tokens"]) == (4, 3600, 190, 20)
    assert report["quality_metrics"]["model_calls_by_kind"] == {"summary": 1, "decide": 2, "repair": 1}
    assert report["quality_metrics"]["cost_usd"]["generation"] == pytest.approx((3600 * 1 + 210 * 2) / 1e6)


def test_private_case_text_is_not_written_to_the_report():
    secret = "Nội dung hợp đồng riêng SYN-POL-9 của khách"
    runs = {"p1": {"retrievals": [retrieval(evidence(DOC_A, "Điều 3. x"))], "scope_pairs": PAIRS,
                   "result": {"response_type": "ANSWER", "message": secret, "citations": [], "actions": []},
                   "usage": {"calls": []}}}
    report = ev.evaluate([case("p1", kind="private", question=secret)], "d", "cfg", runner=runner(runs),
                         mode="end-to-end", meta=META, doc_ids=DOC_IDS)
    text = json.dumps(report, ensure_ascii=False)
    assert secret not in text and '"content"' not in text  # neither question, answer nor chunk text


def test_shipped_cases_reference_known_documents_and_fields():
    data = json.loads((Path(ev.__file__).parent / "cases.json").read_text(encoding="utf-8"))
    from life_agent.corpus import load_manifest, REPO_ROOT

    sources = {s["source_relative_path"] for s in load_manifest(REPO_ROOT / "data/public/manifest-manulife-text.json")["sources"]}
    ids = [c["id"] for c in data["cases"]]
    assert len(ids) == len(set(ids))
    for c in data["cases"]:
        assert c["kind"] == "public" and c["question"]
        assert all(t["document"] in sources and t["clause"] for t in c["expected"])
        assert all(d in sources for d in c.get("scope", []))
