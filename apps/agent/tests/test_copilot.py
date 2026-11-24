"""Staff Copilot: own thread, linked Customer chat read through a view frozen when Core accepted the Staff question.
Whether the model honours "recent" versus "from the start" is measured with a real model in Task 9."""
import json
from dataclasses import replace
from types import SimpleNamespace

import pytest

from life_agent.core_client import CoreError
from life_agent.context import compact_item
from life_agent.graph import requests_full_chat_summary
from life_agent.prompts import TOOL_DEFINITIONS
from life_agent.retrieval import RetrievalService, SearchEngine

from fakes import (COPILOT_CONV, CONV, FakeCore, Harness, ManualClock, ProcessCrash, ScriptedModel, config, draft, reply, run_request,
                   tool, uid, user_item)


def customer_chat(n):
    return [user_item(i, f"c{i}", f"Tin khách {i}") for i in range(1, n + 1)]


def copilot_request(name, text, through, *, attempt="a1", history_cursor=None):
    return run_request(name, text, conversation_id=COPILOT_CONV, channel="STAFF_COPILOT", attempt=attempt,
                       history_cursor=history_cursor,
                       linked_view=None if through is False else {"conversation_id": CONV, "through_cursor": through})


def linked_texts(context):
    source = context.linked_source
    return [i["text"] for i in source["older_items"] + source["recent_items"]]


def test_copilot_uses_frozen_source_view_on_resume():
    core = FakeCore(page_size=2)
    core.histories[CONV] = customer_chat(3)  # A: messages 1..3 when the Staff question was accepted
    model = ScriptedModel([ProcessCrash(), reply(draft("Tóm tắt 3 tin.")), reply(draft("Tóm tắt có tin mới."))])
    h = Harness(model, core=core)
    with pytest.raises(ProcessCrash):
        h.run(copilot_request("s1", "Tóm tắt giúp", "p3"))
    core.histories[CONV].append(user_item(4, "c4", "Tin khách 4"))  # B committed after the view
    calls_before = core.count("linked_history")
    first = h.run(copilot_request("s1", "Tóm tắt giúp", "p3", attempt="a2"))
    assert core.count("linked_history") == calls_before + 1  # reauthorize without widening the frozen view
    assert linked_texts(model.contexts[1]) == ["Tin khách 1", "Tin khách 2", "Tin khách 3"]
    assert all(c[1] == {"conversation_id": CONV, "through_cursor": "p3"} for c in core.calls if c[0] == "linked_history")
    assert first["run_id"] == uid("run:s1")  # result belongs to the Copilot run, not the Customer chat
    h.run(copilot_request("s2", "Có gì mới?", "p4"))
    assert core.calls[-1][0] == "linked_history" and core.calls[-1][2] == "p3"  # incremental from the previous view
    assert linked_texts(model.contexts[2])[-1] == "Tin khách 4"


def test_history_is_never_an_llm_tool():
    assert not any("history" in name for name in TOOL_DEFINITIONS)
    h = Harness(ScriptedModel([reply(tool("read_linked_history", conversation_id=CONV))]))
    event = h.run(copilot_request("s1", "?", None))
    assert event["payload"]["failure"]["code"] == "OUTPUT_INVALID"


def test_own_copilot_history_is_separate_from_the_linked_customer_chat():
    core = FakeCore()
    core.histories[CONV] = customer_chat(2)
    core.histories[COPILOT_CONV] = [user_item(1, "s0", "Câu Staff trước", sender="STAFF")]
    model = ScriptedModel([reply(draft("Tóm tắt."))])
    h = Harness(model, core=core)
    h.run(copilot_request("s1", "Tóm tắt", "p2", history_cursor="p1"))
    context = model.contexts[0]
    assert [t["text"] for t in context.conversation["recent_turns"]] == ["Câu Staff trước"]
    assert linked_texts(context) == ["Tin khách 1", "Tin khách 2"]
    assert h.state(CONV) == {}  # the Customer conversation's checkpoint is never read or written


def test_missing_link_is_reported_instead_of_choosing_another_chat():
    core = FakeCore()
    core.histories[CONV] = customer_chat(2)
    model = ScriptedModel([reply(draft("Chưa có cuộc chat liên kết để tóm tắt."))])
    h = Harness(model, core=core)
    h.run(copilot_request("s1", "Tóm tắt", False))
    assert model.contexts[0].linked_source["status"] == "NONE" and linked_texts(model.contexts[0]) == []
    assert core.count("linked_history") == 0


@pytest.mark.parametrize("code", ["TIMEOUT", "UNAVAILABLE"])
def test_linked_sync_failure_stops_before_model_and_preserves_watermark_for_recovery(code):
    core = FakeCore()
    core.histories[CONV] = customer_chat(2)
    model = ScriptedModel([reply(draft("Authorized reply")), reply(draft("Recovered reply"))])
    h = Harness(model, core=core)
    h.run(copilot_request("s1", "Tóm tắt", "p2"))
    core.histories[CONV].append(user_item(3, "c3", "Tin khách 3"))
    core.fail_linked = CoreError(code)
    reads_before = core.count("linked_history")
    event = h.run(copilot_request("s2", "Có gì mới?", "p3"))
    assert event["kind"] == "ERROR"
    assert event["payload"]["failure"] == {"code": "SOURCE_UNAVAILABLE", "retryable": True}
    assert core.count("linked_history") == reads_before + 2
    assert len(model.contexts) == 1 and not model.summaries
    assert h.state(COPILOT_CONV)["conversation"]["linked_sync"]["through_cursor"] == "p2"

    core.fail_linked = None
    event = h.run(copilot_request("s3", "Có gì mới?", "p3"))
    assert event["payload"]["result"]["message"] == "Recovered reply"
    assert core.calls[-1][2] == "p2"
    assert linked_texts(model.contexts[1]) == ["Tin khách 1", "Tin khách 2", "Tin khách 3"]


def test_linked_history_can_recover_when_legacy_core_only_supports_forward_reads():
    class ForwardOnlyCore(FakeCore):
        def linked_history(self, ctx, view, cursor, *, timeout, backward=False):
            if backward:
                raise CoreError("UNAVAILABLE")
            return super().linked_history(ctx, view, cursor, timeout=timeout)

    core = ForwardOnlyCore()
    core.histories[CONV] = customer_chat(2)
    model = ScriptedModel([reply(draft("Authorized legacy history"))])
    h = Harness(model, core=core)
    event = h.run(copilot_request("s1", "Summarize recent messages", "p2"))
    assert event["kind"] == "RESULT"
    assert linked_texts(model.contexts[0]) == ["Tin khách 1", "Tin khách 2"]


@pytest.mark.parametrize("decision", [tool("list_contracts"), tool("get_contract_overview", policy_number="SYN-REVIEW-1")])
@pytest.mark.parametrize("core_code,failure_code", [("NOT_AUTHORIZED", "PERMISSION_DENIED"),
                                                   ("INVALID_ATTEMPT", "ATTEMPT_INVALID")])
def test_core_denial_during_copilot_business_read_stops_before_next_model_call(decision, core_code, failure_code):
    core = FakeCore()
    core.histories[CONV] = customer_chat(1)
    core.script[decision["tool"]] = [CoreError(core_code)]
    model = ScriptedModel([reply(decision)])
    event = Harness(model, core=core).run(copilot_request("denied", "Check a contract.", "p1"))
    assert event["kind"] == "ERROR"
    assert event["payload"]["failure"] == {"code": failure_code, "retryable": False}
    assert len(model.contexts) == core.count(decision["tool"]) == 1
    assert linked_texts(model.contexts[0]) == ["Tin khách 1"]


def test_missing_individual_contract_allows_copilot_to_ask_for_clarification():
    core = FakeCore()
    core.histories[CONV] = customer_chat(1)
    core.script["get_contract_overview"] = [CoreError("NOT_FOUND")]
    model = ScriptedModel([
        reply(tool("get_contract_overview", policy_number="SYN-REVIEW-1")),
        reply(draft("Please confirm the policy number.", response_type="CLARIFICATION")),
    ])
    event = Harness(model, core=core).run(copilot_request("not-found", "Check a contract.", "p1"))
    assert model.contexts[1].core_results[0]["result"]["status"] == "NOT_FOUND"
    assert event["payload"]["result"]["response_type"] == "CLARIFICATION"


@pytest.mark.parametrize("kind,scope_denial,source_error,failure", [
    ("PUBLIC", "ATTEMPT_INVALID", None, "ATTEMPT_INVALID"),
    ("PRIVATE", "ATTEMPT_INVALID", None, "ATTEMPT_INVALID"),
    ("PUBLIC", "NOT_AUTHORIZED", None, "PERMISSION_DENIED"),
    ("PRIVATE", CoreError("NOT_AUTHORIZED"), None, "PERMISSION_DENIED"),
    ("PRIVATE", "NOT_AUTHORIZED", "NOT_AUTHORIZED", "PERMISSION_DENIED"),
    ("PRIVATE", "NOT_AUTHORIZED", "INVALID_ATTEMPT", "ATTEMPT_INVALID"),
    ("PRIVATE", "NOT_AUTHORIZED", "TIMEOUT", "SOURCE_UNAVAILABLE"),
    ("PRIVATE", "NOT_AUTHORIZED", None, None),
])
def test_copilot_retrieval_denial_rechecks_ambiguous_private_scope(kind, scope_denial, source_error, failure):
    class DenyingCore(FakeCore):
        def scope(self, ctx, kind, policy_number, *, timeout):
            if source_error:
                self.fail_linked = CoreError(source_error)
            if isinstance(scope_denial, CoreError):
                raise scope_denial
            return {"decision": "DENIED", "kind": kind, "policy_number": policy_number, "reason": scope_denial}

    core = DenyingCore()
    core.histories[CONV] = customer_chat(1)
    clock = ManualClock()
    retrieval = RetrievalService(core, SearchEngine(None, None, None), SimpleNamespace(scope_timeout_s=2), clock=clock)
    decision = (tool("retrieve_public", query="Policy terms") if kind == "PUBLIC"
                else tool("retrieve_private", query="Policy terms", policy_number="SYN-REVIEW-1"))
    model = ScriptedModel([reply(decision), reply(draft("Please confirm the policy number.", response_type="CLARIFICATION"))])
    event = Harness(model, core=core, retrieval=retrieval, clock=clock).run(
        copilot_request("scope-denied", "Check the policy terms.", "p1"))

    assert linked_texts(model.contexts[0]) == ["Tin khách 1"]
    if kind == "PRIVATE" and scope_denial == "NOT_AUTHORIZED":
        assert core.count("linked_history") == 2
        assert core.calls[-1][2] == "p1"
    else:
        assert core.count("linked_history") == 1
    if failure:
        assert event["kind"] == "ERROR"
        assert event["payload"]["failure"] == {"code": failure, "retryable": source_error == "TIMEOUT"}
        assert len(model.contexts) == 1
    else:
        assert len(model.contexts) == 2
        assert event["payload"]["result"]["response_type"] == "CLARIFICATION"


def test_revocation_during_backward_sync_stops_before_model_even_after_a_valid_page():
    class RevokedAfterFirstPage(FakeCore):
        def linked_history(self, ctx, view, cursor, *, timeout, backward=False):
            if cursor:
                raise CoreError("NOT_AUTHORIZED")
            return super().linked_history(ctx, view, cursor, timeout=timeout, backward=backward)

    core = RevokedAfterFirstPage(page_size=2)
    core.histories[CONV] = customer_chat(3)
    model = ScriptedModel([])
    event = Harness(model, core=core).run(copilot_request("s1", "Summarize recent messages", "p3"))
    assert event["kind"] == "ERROR" and event["payload"]["failure"]["code"] == "PERMISSION_DENIED"
    assert not model.contexts and not model.summaries


@pytest.mark.parametrize("code,expected", [("NOT_AUTHORIZED", "PERMISSION_DENIED"),
                                          ("INVALID_ATTEMPT", "ATTEMPT_INVALID")])
@pytest.mark.parametrize("through", ["p2", "p3"])
def test_linked_authorization_failure_never_reuses_cached_private_history(code, expected, through):
    core = FakeCore()
    core.histories[CONV] = customer_chat(2)
    model = ScriptedModel([reply(draft("Authorized summary")), reply(draft("Must not see cached history"))])
    h = Harness(model, core=core)
    h.run(copilot_request("s1", "Summarize", "p2"))
    core.fail_linked = CoreError(code)
    event = h.run(copilot_request("s2", "Continue", through))
    assert event["kind"] == "ERROR"
    assert event["payload"]["failure"]["code"] == expected
    assert len(model.contexts) == 1


@pytest.mark.parametrize("max_chars", [60000, 4500])
def test_copilot_full_summary_reports_limit_instead_of_using_partial_history(max_chars):
    core = FakeCore()
    core.histories[CONV] = [user_item(i, f"c{i}", f"Tin khách {i} " + "chi tiết " * 30) for i in range(1, 11)]
    model = ScriptedModel([reply(draft("Tóm tắt."), notes={"summary_scope": "FULL"})])
    h = Harness(model, core=core, cfg=config(copilot_recent_items=4, max_context_chars=max_chars))
    event = h.run(copilot_request("s1", "Tóm tắt từ đầu", "p10"))
    if max_chars == 4500:
        assert not model.contexts
        assert "Chưa thể tóm tắt từ đầu" in event["payload"]["result"]["message"]
    else:
        assert event["payload"]["result"]["message"] == "Tóm tắt."
        coverage = model.contexts[0].linked_source["coverage"]
        assert coverage["total_items"] == 10 and coverage["recent_window"] == 4
        assert coverage["includes_start"] and coverage["omitted_older_items"] == 0
        assert len(model.contexts[0].linked_source["recent_items"]) == 4


@pytest.mark.parametrize("incomplete", [False, True])
def test_copilot_full_summary_uses_all_older_sections_with_a_bounded_context(incomplete):
    class SectionModel(ScriptedModel):
        def summarize(self, items, *, max_chars):
            result = super().summarize(items, max_chars=max_chars)
            return replace(result, complete=False) if incomplete and len(self.summaries) == 2 else result

    core = FakeCore()
    core.histories[CONV] = [user_item(i, f"c{i}", f"Tin khách {i} " + "chi tiết " * 38) for i in range(1, 14)]
    model = SectionModel([reply(draft("Tóm tắt từ đầu."), notes={"summary_scope": "FULL"})])
    h = Harness(model, core=core, cfg=config(copilot_recent_items=2, max_context_chars=6000))
    event = h.run(copilot_request("s1", "Tóm tắt từ đầu", "p13"))
    assert event["kind"] == "RESULT"
    if incomplete:
        assert len(model.summaries) == 2 and not model.contexts
        assert "Chưa thể tóm tắt từ đầu" in event["payload"]["result"]["message"]
        assert h.store.usage(uid("message:s1"))["model_tokens"] == 320
        return
    assert model.contexts[0].linked_source["coverage"]["includes_start"]
    assert event["payload"]["result"]["message"] == "Tóm tắt từ đầu."
    assert model.contexts[0].linked_source["older_sections"]
    assert [part["position"] for group in model.summaries for part in group] == [str(i) for i in range(1, 12)]


def test_copilot_cannot_publish_an_incomplete_final_full_summary():
    core = FakeCore()
    core.histories[CONV] = customer_chat(2)
    model = ScriptedModel([replace(reply(draft("Partial final answer")), complete=False)])
    h = Harness(model, core=core)
    event = h.run(copilot_request("s1", "Tóm tắt từ đầu", "p2"))
    assert model.contexts[0].linked_source["coverage"]["includes_start"]
    assert "Chưa thể tóm tắt từ đầu" in event["payload"]["result"]["message"]


@pytest.mark.parametrize("question", [
    "Tóm tắt diễn biến gần đây rồi giải thích vì sao phải đóng phí từ đầu tháng.",
    "Đừng tóm tắt từ đầu.",
    "Summarize all history since yesterday.",
])
def test_scope_shortcut_does_not_treat_limited_or_mixed_intent_as_full(question):
    assert not requests_full_chat_summary(question)


def test_recent_summary_and_start_of_month_question_reaches_the_model_with_latest_messages():
    core = FakeCore(page_size=10)
    core.histories[CONV] = [user_item(i, f"c{i}", "Synthetic chat " * 20) for i in range(1, 101)]
    model = ScriptedModel([reply(draft("Recent updates and payment explanation"), notes={"summary_scope": "RECENT"})])
    h = Harness(model, core=core, cfg=config(max_context_chars=6000, history_summary_threshold_chars=1500))
    event = h.run(copilot_request("mixed", "Tóm tắt gần đây rồi giải thích phí từ đầu tháng.", "p100"))
    assert event["payload"]["result"]["message"] == "Recent updates and payment explanation"
    source = model.contexts[0].linked_source
    assert source["status"] == "PARTIAL" and source["recent_items"][-1]["position"] == "100"


@pytest.mark.parametrize("scope", ["RECENT", "NONE", None])
def test_explicit_full_summary_rejects_an_answer_with_inconsistent_scope(scope):
    core = FakeCore()
    core.histories[CONV] = customer_chat(3)
    notes = {"summary_scope": scope} if scope else {}
    model = ScriptedModel([reply(draft("Only the latest messages"), notes=notes)])
    h = Harness(model, core=core)
    event = h.run(copilot_request("s1", "Summarize the entire conversation.", "p3"))
    assert model.contexts[0].linked_source["coverage"]["includes_start"]
    assert event["payload"]["result"]["response_type"] == "CLARIFICATION"
    assert "Chưa thể tóm tắt từ đầu" in event["payload"]["result"]["message"]


def test_model_classified_full_summary_can_expand_a_truncated_context():
    core = FakeCore()
    core.histories[CONV] = [user_item(i, f"c{i}", f"Synthetic chat {i} " + "detail " * 48) for i in range(1, 14)]
    model = ScriptedModel([
        reply(draft("Only saw the end"), notes={"summary_scope": "FULL"}),
        reply(draft("Synthetic full-chat summary"), notes={"summary_scope": "FULL"}),
    ])
    h = Harness(model, core=core, cfg=config(copilot_recent_items=2, max_context_chars=6000))
    event = h.run(copilot_request("s1", "Summarize the conversation from the first message to the last.", "p13"))
    assert event["payload"]["result"]["message"] == "Synthetic full-chat summary"
    assert [context.linked_source["coverage"]["includes_start"] for context in model.contexts] == [False, True]
    assert [item["position"] for part in model.summaries for item in part] == [str(i) for i in range(1, 12)]
    assert h.store.usage(uid("message:s1"))["model_calls"] == 2 + len(model.summaries)


def test_model_classified_full_scope_is_preserved_after_a_tool_call():
    core = FakeCore()
    core.histories[CONV] = customer_chat(3)
    model = ScriptedModel([
        reply(tool("list_contracts"), notes={"summary_scope": "FULL"}),
        reply(draft("Only the latest messages"), notes={"summary_scope": "RECENT"}),
    ])
    h = Harness(model, core=core)
    event = h.run(copilot_request("scope", "Summarize the conversation from the first message to the last.", "p3"))
    assert core.count("list_contracts") == 1
    assert len(model.contexts) == 2
    assert event["payload"]["result"]["response_type"] == "CLARIFICATION"


@pytest.mark.parametrize("prefix", ["m1_", "p"])
def test_large_chat_keeps_latest_authorized_messages_without_marking_full_coverage(prefix):
    core = FakeCore(page_size=100)
    core.histories[CONV] = customer_chat(10002)
    if prefix == "m1_":
        core.histories[CONV] = [{k: v for k, v in item.items() if k != "run"} | {"kind": "SOURCE_MESSAGE"}
                                for item in core.histories[CONV]]
    model = ScriptedModel([reply(draft("Synthetic recent summary")), reply(draft("Summary of new messages"))])
    h = Harness(model, core=core)
    view = f"{prefix}10001"
    h.run(copilot_request("s1", "Summarize recent messages", view))
    first = model.contexts[0].linked_source
    assert first["status"] == "PARTIAL" and first["view"]["through_cursor"] == view
    assert not first["coverage"]["includes_start"]
    assert first["recent_items"][-1]["position"] == "10001"  # 10002 committed after this view
    assert core.count("linked_history") < 100
    assert h.state(COPILOT_CONV)["conversation"]["linked_sync"] is None
    event = h.run(copilot_request("s2", "Tóm tắt từ đầu", view))
    assert len(model.contexts) == 1 and "Chưa thể tóm tắt từ đầu" in event["payload"]["result"]["message"]
    h.run(copilot_request("s3", "Any new messages?", f"{prefix}10002"))
    assert model.contexts[1].linked_source["recent_items"][-1]["position"] == "10002"


def test_linked_cursor_upgrade_reloads_then_continues_incrementally():
    core = FakeCore(page_size=1)
    core.histories[CONV] = customer_chat(2)
    model = ScriptedModel([reply(draft("Synthetic answer")) for _ in range(3)])
    h = Harness(model, core=core)
    h.run(copilot_request("s1", "First", "p2"))
    core.histories[CONV] = [
        {k: v for k, v in user_item(i, f"new{i}", f"Published message {i}").items() if k != "run"}
        | {"kind": "SOURCE_MESSAGE"} for i in range(1, 4)
    ]
    h.run(copilot_request("s2", "Second", "m1_2"))
    assert linked_texts(model.contexts[1]) == ["Published message 1", "Published message 2"]
    reads = [call[2] for call in core.calls if call[0] == "linked_history"]
    assert reads == [None, "p2", None, "m1_2"]
    h.run(copilot_request("s3", "Third", "m1_3"))
    assert core.calls[-1][2] == "m1_2"
    assert linked_texts(model.contexts[2]) == ["Published message 1", "Published message 2", "Published message 3"]


def test_incremental_linked_cache_stays_bounded_and_tracks_partial_coverage():
    core = FakeCore(page_size=30)
    core.histories[CONV] = [user_item(i, f"c{i}", "Synthetic " * 10) for i in range(1, 201)]
    model = ScriptedModel([reply(draft("Synthetic recent summary")) for _ in range(5)])
    cfg = config(max_context_chars=6000, history_summary_threshold_chars=1000)
    h = Harness(model, core=core, cfg=cfg)
    for i in range(1, 6):
        h.run(copilot_request(f"increments{i}", "Any recent updates?", f"p{i * 40}"))
        state = h.state(COPILOT_CONV)
        items = state["linked_history"]
        cap = cfg.max_context_chars + cfg.history_summary_threshold_chars * 8
        assert sum(len(json.dumps(compact_item(item), ensure_ascii=False)) + 2 for item in items) <= cap
        assert items[-1]["position"] == str(i * 40)
        if i > 1:
            assert core.calls[-2][2] == f"p{(i - 1) * 40}"
    assert state["linked_status"] == "PARTIAL"
    assert state["conversation"]["linked_sync"] is None and state["linked_tail_sync"]["through_cursor"] == "p200"
    assert h.run(copilot_request("full", "Tóm tắt từ đầu", "p200"))["payload"]["result"]["response_type"] == "CLARIFICATION"


def test_interrupted_backfill_can_recover_full_coverage_on_a_new_turn():
    class InterruptedCore(FakeCore):
        interrupted = True

        def linked_history(self, ctx, view, cursor, *, timeout, backward=False):
            if self.interrupted and backward and cursor:
                raise CoreError("UNAVAILABLE")
            return super().linked_history(ctx, view, cursor, timeout=timeout, backward=backward)

    core = InterruptedCore(page_size=2)
    core.histories[CONV] = customer_chat(3)
    model = ScriptedModel([
        reply(draft("Recent")),
        reply(draft("Full recovered"), notes={"summary_scope": "FULL"}),
    ])
    h = Harness(model, core=core)
    h.run(copilot_request("s1", "Recent updates?", "p3"))
    assert model.contexts[0].linked_source["status"] == "PARTIAL"
    assert h.state(COPILOT_CONV)["linked_tail_sync"] is None
    core.interrupted = False
    event = h.run(copilot_request("s2", "Tóm tắt từ đầu", "p3"))
    assert event["payload"]["result"]["message"] == "Full recovered"
    assert model.contexts[1].linked_source["coverage"]["includes_start"]
