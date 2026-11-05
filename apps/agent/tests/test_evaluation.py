"""Evaluation harness (plan Task 9 Step 1): deterministic scoring, report metadata, mandatory vs quality, NOT_RUN,
redaction and usage totals. Scripted runners only; real model behaviour is what the harness measures, not this file."""
import json
import re
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
    from life_agent.corpus import SYNTHETIC_FIXTURE, load_manifest, REPO_ROOT

    sources = {s["source_relative_path"] for s in load_manifest(REPO_ROOT / "data/public/manifest-manulife-text.json")["sources"]}
    anchors = set(re.findall(r'<a id="(syn-[a-z-]+)"></a>', (SYNTHETIC_FIXTURE / "contract.md").read_text(encoding="utf-8")))
    seeds = {a["case_id"] for a in json.loads((SYNTHETIC_FIXTURE / "expected-answers.json").read_text(encoding="utf-8"))["cases"]}
    ids = [c["id"] for c in data["cases"]]
    assert len(ids) == len(set(ids))
    for c in data["cases"]:
        kind = c.get("kind", "public")
        assert kind in ev.CASE_KINDS and c["question"]
        for t in c["expected"]:
            if t["document"] == ev.PRIVATE_KEY:
                assert kind != "public" and t["anchor"] in anchors and "pages" not in t  # anchors, no invented pages
            else:
                assert t["document"] in sources and t["clause"]
        assert all(d in sources for d in c.get("scope", []))
        assert c.get("actor", "owner") in ev.ACTORS
        if kind in ("multi_turn", "copilot"):
            assert c["modes"] == ["end-to-end"]
        if kind == "copilot":
            assert 0 < c["linked_through"] <= len(c["linked_chat"])
            assert all(c["after_view_marker"] not in e["text"] for e in c["linked_chat"][: c["linked_through"]])
        if c.get("seed"):
            assert c["seed"] in seeds
    assert {c["seed"] for c in data["cases"] if c.get("seed")} == seeds  # every synthetic expected answer is a case
    counts = {k: sum(c.get("kind", "public") == k for c in data["cases"]) for k in ev.CASE_KINDS}
    assert counts["private"] >= 20 and counts["mixed"] and counts["multi_turn"] and counts["copilot"]


# ---------------------------------------------------------------------------------------------- Private / Copilot

POLICY = ev.SyntheticPolicy.load(Path(ev.REPO_ROOT) / "data" / "synthetic" / "manulife-demo-v1")
PRIVATE_IDS = {**DOC_IDS, ev.PRIVATE_KEY: POLICY.document_id}


def private_evidence(anchor, eid=None):
    return {"evidence_id": eid or f"p-{anchor}", "document_id": POLICY.document_id,
            "document_version": POLICY.document_version, "title": "t", "document_type": "CONTRACT",
            "location": {"clause": "x", "anchor": anchor}, "content": "synthetic"}


def test_anchor_targets_and_interleaved_ranking_of_mixed_turns():
    c = {"id": "m1", "kind": "mixed", "question": "q", "expect_status": "OK",
         "expected": [{"document": ev.PRIVATE_KEY, "anchor": "syn-benefits"}, {"document": "P/b.pdf", "clause": "Điều 2"}]}
    runs = {"m1": {"retrievals": [retrieval(private_evidence("syn-schedule"), private_evidence("syn-benefits")),
                                  retrieval(evidence(DOC_B, "Điều 2"))],
                   "scope_pairs": [*PAIRS, POLICY.pair]}}
    report = ev.evaluate([c], "d", "cfg", runner=runner(runs), mode="retrieval", meta=META, doc_ids=PRIVATE_IDS,
                         ks=(1, 2, 3))
    row = report["cases"][0]
    assert [e["anchor"] for e in row["evidence"]] == ["syn-schedule", None, "syn-benefits"]  # rank 1 of each call first
    assert row["metrics"]["recall@2"] == 0.5 and row["metrics"]["recall@3"] == 1.0
    assert ev.target_matches(private_evidence("syn-benefits-2"), c["expected"][:1], PRIVATE_IDS) == set()


def test_cross_access_fails_on_any_private_evidence_and_needs_denial_in_retrieval_mode():
    c = {"id": "x1", "kind": "private", "question": "q", "expected": [], "expect_status": "DENIED",
         "expect_denied": True}
    base = {"scope_pairs": [*PAIRS, POLICY.pair], "protected_pairs": [POLICY.pair]}
    leak = {**base, "retrievals": [retrieval(private_evidence("syn-benefits"))], "private_statuses": ["OK"]}
    denied = {**base, "retrievals": [retrieval(status="DENIED")], "private_statuses": ["DENIED"]}
    not_kept = {**base, "retrievals": [retrieval(status="ERROR")], "private_statuses": ["ERROR"]}
    assert ev.case_checks(c, leak, "retrieval", None)["cross_access_denied"]["status"] == "FAIL"
    assert ev.case_checks(c, denied, "retrieval", None)["cross_access_denied"]["status"] == "PASS"
    assert ev.case_checks(c, not_kept, "retrieval", None)["cross_access_denied"]["status"] == "FAIL"
    earlier = {**base, "retrievals": [], "prior_retrievals": [retrieval(private_evidence("syn-persons"))], "result": None}
    assert ev.case_checks(c, earlier, "end-to-end", None)["cross_access_denied"]["status"] == "FAIL"  # any turn counts
    report = ev.evaluate([c], "d", "cfg", runner=runner({"x1": leak}), mode="retrieval", meta=META, doc_ids=PRIVATE_IDS)
    assert report["mandatory_status"] == "FAIL" and report["acceptance"] == "NOT_ACCEPTED"


def test_linked_view_must_stay_frozen_and_later_messages_must_not_surface():
    view = {"conversation_id": DOC_A, "through_cursor": "p9"}
    c = {"id": "c1", "kind": "copilot", "question": "q", "expected": [], "after_view_marker": "SAU-MOC-B"}
    ok_run = {"scope_pairs": PAIRS, "retrievals": [], "linked_view": view, "linked_views_used": [view, view],
              "result": {"response_type": "ANSWER", "message": "Khách hỏi về giấy tờ.", "citations": [], "actions": []}}
    moved = {**ok_run, "linked_views_used": [view, {**view, "through_cursor": "p10"}]}
    surfaced = {**ok_run, "result": {**ok_run["result"], "message": "Khách muốn đổi người thụ hưởng sau-moc-b"}}
    assert ev.case_checks(c, ok_run, "end-to-end", None)["linked_view_frozen"]["status"] == "PASS"
    assert ev.case_checks(c, moved, "end-to-end", None)["linked_view_frozen"]["status"] == "FAIL"
    assert ev.case_checks(c, surfaced, "end-to-end", None)["linked_view_frozen"]["status"] == "FAIL"


def test_review_checks_stay_apart_from_mandatory_and_copilot_actions_fail_by_code():
    c = {"id": "c1", "kind": "copilot", "question": "q", "expected": [], "review": ["copilot_no_draft", "recent_scope"]}
    result = {"response_type": "ANSWER", "message": "Tóm tắt.", "citations": [],
              "actions": [{"type": "PROPOSE_TICKET"}]}
    run = {"scope_pairs": PAIRS, "retrievals": [], "result": result}
    report = ev.evaluate([c], "d", "cfg", runner=runner({"c1": run}), mode="end-to-end", meta=META, doc_ids=DOC_IDS,
                         human_review={"c1": {"recent_scope": "PASS"}})
    review = report["review_checks"]
    assert review["copilot_no_actions"]["status"] == "FAIL" and review["copilot_no_draft"]["status"] == "NOT_RUN"
    assert review["recent_scope"]["status"] == "PASS"
    assert "copilot_no_actions" not in report["mandatory_checks"] and report["mandatory_status"] != "FAIL"


def test_synthetic_private_text_is_written_only_with_the_explicit_flag():
    c = {"id": "p1", "kind": "private", "question": "Ai là người thụ hưởng?", "expected": [], "expect_status": "OK"}
    run = {"scope_pairs": [POLICY.pair], "retrievals": [retrieval(private_evidence("syn-private-conditions"))],
           "synthetic_only": True, "tool_calls": [{"tool": "retrieve_private", "query": "người thụ hưởng"}],
           "result": {"response_type": "ANSWER", "message": "Demo An, 100%.", "citations": [], "actions": []}}
    hidden = ev.evaluate([c], "d", "cfg", runner=runner({"p1": run}), mode="end-to-end", meta=META, doc_ids=PRIVATE_IDS)
    shown = ev.evaluate([c], "d", "cfg", runner=runner({"p1": run}), mode="end-to-end", meta=META, doc_ids=PRIVATE_IDS,
                        include_synthetic_text=True)
    real = ev.evaluate([c], "d", "cfg", runner=runner({"p1": {**run, "synthetic_only": False}}), mode="end-to-end",
                       meta=META, doc_ids=PRIVATE_IDS, include_synthetic_text=True)
    assert "Demo An" not in json.dumps(hidden, ensure_ascii=False) and hidden["cases"][0]["text_redacted"]
    assert shown["cases"][0]["answer"]["message"] == "Demo An, 100%." and shown["private_text_in_report"] is True
    assert "Demo An" not in json.dumps(real, ensure_ascii=False)
    assert '"content"' not in json.dumps(shown, ensure_ascii=False)  # chunk text never


# ---------------------------------------------------------------------------------------------- LocalCore

LIMITS = {"retrieval_calls_max": 3, "core_read_requests_max": 4, "core_request_timeout_ms": 3000, "core_retry_per_call": 1,
          "model_calls_max": 6, "graph_steps_max": 30, "turn_token_budget": 120000, "finish_reserve_tokens": 12000,
          "deadline_s": 120}


def ctx_of(case):
    setup = ev.CaseSetup(case, PAIRS, POLICY)
    from life_agent.graph import execution_context

    return setup, execution_context(setup.request(0, case["question"], LIMITS))


def test_local_core_grants_the_owner_and_assigned_staff_only():
    from life_agent import contracts
    from life_agent.core_client import CoreError

    owner, octx = ctx_of({"id": "o", "kind": "private", "question": "q"})
    granted = contracts.validate("DocumentScope", owner.core.scope(octx, "PRIVATE", POLICY.policy_number, timeout=1))
    assert granted["documents"] == [{"document_id": POLICY.document_id, "document_version": "synthetic-v1",
                                     "policy_id": POLICY.policy_id}]
    overview = contracts.validate("ContractOverview", owner.core.get_contract_overview(octx, POLICY.policy_number, timeout=1))
    assert overview["riders_complete"] is False and [r["code"] for r in overview["riders"]] == ["SYN-BEN-001", "SYN-BEN-002"]
    assert owner.protected_pairs() == []
    denied = owner.core.scope(octx, "PRIVATE", "SYN-POL-2025-0002", timeout=1)
    assert contracts.validate("DocumentScope", denied)["decision"] == "DENIED"

    other, xctx = ctx_of({"id": "x", "kind": "private", "question": "q", "actor": "other_customer"})
    assert other.core.scope(xctx, "PRIVATE", POLICY.policy_number, timeout=1)["decision"] == "DENIED"
    assert other.core.list_contracts(xctx, timeout=1) == []  # valid-empty, not an error
    with pytest.raises(CoreError):
        other.core.get_contract_overview(xctx, POLICY.policy_number, timeout=1)
    assert other.protected_pairs() == [POLICY.pair] and other.core.released is False

    staff, sctx = ctx_of({"id": "s", "kind": "copilot", "question": "q", "linked_chat": [], "linked_through": 0})
    assert sctx["actor"]["role"] == "STAFF" and staff.core.list_contracts(sctx, timeout=1)[0]["policy_number"] == POLICY.policy_number
    stranger, uctx = ctx_of({"id": "u", "kind": "copilot", "question": "q", "actor": "unassigned_staff",
                             "linked_chat": [{"from": "CUSTOMER", "text": "x"}]})
    with pytest.raises(CoreError):
        stranger.core.list_contracts(uctx, timeout=1)
    with pytest.raises(CoreError):
        stranger.core.linked_history(uctx, stranger.linked_view, None, timeout=1)
    with pytest.raises(ValueError):
        ev.CaseSetup({"id": "bad", "kind": "private", "question": "q", "actor": "assigned_staff"}, PAIRS, POLICY)


def test_copilot_source_chat_is_cut_at_the_frozen_view():
    chat = [{"from": "CUSTOMER", "text": "Tin 1"}, {"from": "AGENT", "text": "Trả lời 1"}, {"from": "CUSTOMER", "text": "Tin 2"},
            {"from": "CUSTOMER", "text": "Tin sau mốc"}]
    setup, ctx = ctx_of({"id": "c", "kind": "copilot", "question": "q", "linked_chat": chat, "linked_through": 3})
    assert ctx["linked_history_view"] == setup.linked_view and setup.linked_view["through_cursor"] == "p3"
    page = setup.core.linked_history(ctx, setup.linked_view, None, timeout=1)
    texts = [i.get("content") or i.get("result", {}).get("message") for i in page["items"]]
    assert texts == ["Tin 1", "Trả lời 1", "Tin 2"] and setup.core.linked_views == [setup.linked_view]


def test_finished_turns_become_core_history_for_the_next_turn():
    setup, _ = ctx_of({"id": "t", "kind": "multi_turn", "question": "q2", "turns": ["q1"]})
    answer = {"kind": "RESULT", "payload": {"result": {"response_type": "ANSWER", "message": "a1", "citations": [],
                                                       "actions": []}}}
    setup.record(0, "q1", answer)
    second = setup.request(1, "q2", LIMITS)
    assert second["history_view"]["through_cursor"] == "p2" and second["message_id"] != setup.request(0, "q1", LIMITS)["message_id"]
    setup.record(1, "q2", {"kind": "ERROR", "payload": {"failure": {"code": "TimeoutError", "retryable": False}}})
    assert setup.core.histories[setup.conversation_id][-1]["code"] == "INTERNAL"  # unknown failures are not invented codes


# ---------------------------------------------------------------------------------------------- runner plumbing

class CountingEmbedding:
    def __init__(self):
        from rag_fakes import HashEmbedding

        self.inner = HashEmbedding()

    @property
    def calls(self):
        return self.inner.query_calls

    def embed_query(self, query, config):
        return self.inner.embed_query(query, config)


def synthetic_runtime(monkeypatch, steps):
    """Runtime over an in-memory index of the synthetic contract and a scripted model (plumbing only)."""
    from life_agent.corpus import SYNTHETIC_FIXTURE, build_chunks, chunk_metadata, fingerprint, prepare_private_fixture
    from life_agent.corpus import resolve_refs
    from life_agent import model as model_module
    from life_agent.retrieval import SearchEngine

    from corpus_fixtures import corpus_config
    from fakes import ScriptedModel
    from rag_fakes import embedding_config
    from test_retrieval import MemoryIndex, Row, search_config

    version = prepare_private_fixture(SYNTHETIC_FIXTURE, corpus_config())
    cfg = embedding_config()
    fp = fingerprint(version, cfg.config_id)
    rows = [Row(f"r{c.ordinal}", version.document_id, version.document_version, c.content,
                {**chunk_metadata(version, c, fp=fp, embedding=cfg.identity()), "policy_id": version.policy_id,
                 "access_scope": "PRIVATE_POLICY"}) for c in resolve_refs(build_chunks(version)).chunks]
    embedder = CountingEmbedding()
    scripted = ScriptedModel(steps)
    monkeypatch.setattr(model_module, "GeminiModel", lambda generation, env: scripted)
    trial = json.loads((Path(ev.__file__).parent / "trial-config.json").read_text(encoding="utf-8"))
    rt = {"catalog": {}, "engine": SearchEngine(MemoryIndex(rows, cfg), embedder, cfg), "embedder": embedder,
          "search": search_config(), "policy": POLICY, "reader": None}
    return rt, trial, scripted


def test_end_to_end_runner_replays_turns_through_core_history(monkeypatch):
    from fakes import answer_citing, reply, tool

    steps = [reply(tool("retrieve_private", query="quyền lợi nội trú DEMO-TITAN", policy_number=POLICY.policy_number)),
             answer_citing("Hai quyền lợi nội trú demo.", which=[0]),
             reply(tool("retrieve_private", query="thời gian chờ bệnh thông thường", policy_number=POLICY.policy_number)),
             answer_citing("Chờ 45 ngày theo dữ liệu giả lập.", which=[0])]
    rt, trial, scripted = synthetic_runtime(monkeypatch, steps)
    case = {"id": "mt", "kind": "multi_turn", "turns": ["Có quyền lợi nội trú nào?"], "question": "Thời gian chờ bao lâu?"}
    run = ev.end_to_end_runner(rt, trial, {})(case)
    assert run["failure"] is None and run["result"]["message"].startswith("Chờ 45 ngày")
    assert len(run["prior_results"]) == 1 and len(run["prior_retrievals"]) == 1 and len(run["turn_latencies_ms"]) == 2
    assert run["scope_pairs"] == [POLICY.pair] and run["protected_pairs"] == []
    seen = json.dumps(scripted.contexts[-1].conversation, ensure_ascii=False)
    assert "Có quyền lợi nội trú nào?" in seen and "Hai quyền lợi nội trú demo." in seen  # turn 1 reached turn 2 through the history API
    checks = ev.case_checks({**case, "expected": []}, run, "end-to-end", None)
    assert checks["scope_and_version"]["status"] == "PASS" and checks["citations_resolve"]["status"] == "PASS"


def test_end_to_end_runner_keeps_the_copilot_view_and_denies_an_unassigned_staff(monkeypatch):
    from fakes import draft, reply, tool

    chat = [{"from": "CUSTOMER", "text": "Tin trong mốc"}, {"from": "CUSTOMER", "text": "Tin sau mốc SAU-MOC-B"}]
    rt, trial, scripted = synthetic_runtime(monkeypatch, [
        reply(tool("retrieve_private", query="hạn mức", policy_number=POLICY.policy_number)),
        reply(draft("Không có quyền xem hợp đồng hoặc chat của khách này.", response_type="REFUSAL"))])
    case = {"id": "cu", "kind": "copilot", "actor": "unassigned_staff", "question": "Tóm tắt", "linked_chat": chat,
            "linked_through": 1, "after_view_marker": "SAU-MOC-B", "expect_denied": True, "expected": []}
    run = ev.end_to_end_runner(rt, trial, {})(case)
    assert run["linked_views_used"] and all(v == run["linked_view"] for v in run["linked_views_used"])
    assert run["protected_pairs"] == [POLICY.pair] and run["retrievals"][0]["status"] == "DENIED"
    checks = ev.case_checks(case, run, "end-to-end", None)
    assert checks["cross_access_denied"]["status"] == "PASS" and checks["linked_view_frozen"]["status"] == "PASS"
    assert ev.review_checks(case, run, "end-to-end", None)["copilot_no_actions"]["status"] == "PASS"


def test_retrieval_runner_goes_through_core_scope_for_private_and_denied_cases(monkeypatch):
    rt, trial, _ = synthetic_runtime(monkeypatch, [])
    run = ev.retrieval_runner(rt, trial)
    owner = run({"id": "o", "kind": "private", "question": "Hạn mức nội trú DEMO-TITAN của Demo Chi?"})
    other = run({"id": "x", "kind": "private", "actor": "other_customer", "question": "Cho tôi xem hợp đồng."})
    assert owner["private_statuses"] == ["OK"] and owner["scope_pairs"] == [POLICY.pair]
    assert other["private_statuses"] == ["DENIED"] and other["retrievals"][0]["evidence"] == []
    case = {"id": "x", "kind": "private", "expected": [], "expect_denied": True}
    assert ev.case_checks(case, other, "retrieval", None)["cross_access_denied"]["status"] == "PASS"
