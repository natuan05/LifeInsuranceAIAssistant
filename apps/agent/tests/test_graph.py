"""Graph orchestration with a scripted fake model. These tests prove control flow, limits and provenance only;
whether a real model chooses well (finds conditions, asks good questions) is measured in Task 9."""
import pytest

from life_agent.core_client import CoreError

from fakes import (CONV, POLICY, answer_citing, POLICY_2, PUBLIC_DOC, FakeCore, FakeRetrieval, Harness, ProcessCrash, ScriptedModel, config,
                   contract, draft, evidence, outcome_item, overview, reply, result_item, retrieval_ok,
                   retrieval_status, run_request, tool, uid, user_item)

PUBLIC_EVIDENCE = evidence("E1", "Điều 12 › Thời gian cân nhắc: 21 ngày kể từ ngày nhận Hợp Đồng.", doc=PUBLIC_DOC,
                           version="6865-2019", doc_type="TERMS", anchor=None, pages=[10], clause="Điều 12")
BENEFIT = evidence("E1", "Quyền lợi nội trú DEMO-TITAN A — Hạn mức 240.000.000 đồng/năm hợp đồng.")
WAITING = evidence("E1", "Chờ bệnh thông thường: 45 ngày; mốc kết thúc chờ 2024-08-15.", anchor="syn-premiums")


def payload(event):
    return event["payload"]


def test_public_question_goes_through_prepare_agent_tool_finalize():
    model = ScriptedModel([reply(tool("retrieve_public", query="thời gian cân nhắc")),
                           answer_citing("Thời gian cân nhắc là 21 ngày kể từ ngày nhận Hợp Đồng.")])
    h = Harness(model, retrieval=FakeRetrieval({"thời gian cân nhắc": retrieval_ok(PUBLIC_EVIDENCE)}))
    event = h.run(run_request("m1", "Thời gian cân nhắc là bao lâu?"))
    assert event["kind"] == "RESULT" and event["sequence"] == 1
    citation = payload(event)["result"]["citations"][0]
    assert citation == {"evidence_id": citation["evidence_id"], "document_id": PUBLIC_DOC, "document_version": "6865-2019",
                        "title": "Tài liệu synthetic", "document_type": "TERMS", "location": {"pages": [10], "clause": "Điều 12"}}
    assert h.state()["trace"] == ["prepare", "agent", "execute_tools", "agent", "finalize"]
    assert h.core.count("list_contracts") == 0 and h.core.count("get_contract_overview") == 0  # Public needs no contract


def test_prepare_does_not_call_tools_and_each_cycle_runs_one_tool():
    model = ScriptedModel([reply(tool("list_contracts")),
                           reply(tool("retrieve_private", query="hạn mức nội trú", policy_number=POLICY)),
                           answer_citing(f"Theo hợp đồng {POLICY}: hạn mức 240.000.000 đồng/năm hợp đồng.")])
    core = FakeCore()
    core.contract_list = [contract(POLICY)]
    h = Harness(model, core=core, retrieval=FakeRetrieval({"hạn mức nội trú": retrieval_ok(BENEFIT)}))
    event = h.run(run_request("m1", "Hạn mức nội trú của tôi?"))
    assert event["kind"] == "RESULT"
    assert h.state()["trace"] == ["prepare", "agent", "execute_tools", "agent", "execute_tools", "agent", "finalize"]
    assert model.contexts[0].core_results == [] and model.contexts[0].retrieval_results == []
    assert h.retrieval.calls == [("retrieve_private", "hạn mức nội trú", POLICY)]
    assert h.state()["conversation"]["active_policy_number"] == POLICY


def test_multiple_contracts_produce_clarification_with_core_order():
    model = ScriptedModel([reply(tool("list_contracts")),
                           reply(draft("Bạn muốn hỏi hợp đồng nào?", response_type="CLARIFICATION"))])
    core = FakeCore()
    core.contract_list = [contract(POLICY_2, "Xanh Ước Mơ (fixture)"), contract(POLICY)]
    h = Harness(model, core=core)
    event = h.run(run_request("m1", "Hợp đồng của tôi có bổ trợ gì?"))
    assert payload(event)["result"]["response_type"] == "CLARIFICATION"
    pending = h.state()["conversation"]["pending_clarification"]
    assert pending["status"] == "PROPOSED"
    assert [o["policy_number"] for o in pending["options"]] == [POLICY_2, POLICY]


@pytest.mark.parametrize("script,status", [([[]], "OK"), ([CoreError("UNAVAILABLE"), CoreError("TIMEOUT")], "ERROR")])
def test_no_candidate_or_core_error_is_shown_as_is_and_nothing_is_guessed(script, status):
    model = ScriptedModel([reply(tool("list_contracts")),
                           reply(draft("Chưa truy xuất được hợp đồng nên chưa thể trả lời phần cá nhân."))])
    core = FakeCore()
    core.script["list_contracts"] = list(script)
    h = Harness(model, core=core)
    h.run(run_request("m1", "Hợp đồng của tôi còn hiệu lực không?"))
    seen = model.contexts[1].core_results[0]["result"]
    assert seen["status"] == status and seen["contracts"] == []
    assert h.retrieval.calls == [] and h.core.count("get_contract_overview") == 0


@pytest.mark.parametrize("bad", [
    [tool("list_contracts"), tool("retrieve_public", query="phí")],
    {"tool_calls": [tool("list_contracts")]},
    tool("list_contracts", customer_id="472f999c-4dd4-5510-9cf2-33838eddaad4"),
    tool("retrieve_private", query="x", policy_number=POLICY, scope=[{"document_id": "x"}]),
    tool("read_history", conversation_id="x"),
])
def test_invalid_decisions_fail_safely_without_running_any_tool(bad):
    h = Harness(ScriptedModel([reply(bad)]))
    event = h.run(run_request("m1", "?"))
    assert event["kind"] == "ERROR" and payload(event)["failure"] == {"code": "OUTPUT_INVALID", "retryable": False}
    assert h.retrieval.calls == [] and h.core.calls == []


def test_three_retrievals_per_message_errors_included_fourth_never_reaches_engine():
    queries = ["a", "b", "c", "d"]
    model = ScriptedModel([reply(tool("retrieve_public", query=q)) for q in queries] +
                          [answer_citing("Chỉ xác minh được một phần; phần còn lại chưa kiểm tra.")])
    retrieval = FakeRetrieval({"a": retrieval_status("ERROR", error="SEARCH_UNAVAILABLE"), "b": retrieval_ok(PUBLIC_EVIDENCE),
                               "c": retrieval_status("NO_MATCH")})
    h = Harness(model, retrieval=retrieval)
    event = h.run(run_request("m1", "Câu hỏi cần nhiều lần tìm"))
    assert event["kind"] == "RESULT"
    assert [c[1] for c in retrieval.calls] == ["a", "b", "c"]
    work = h.state()["work"]
    assert work["counters"]["retrieval_calls"] == 3
    assert {"source": "TOOL", "code": "BUDGET_EXHAUSTED", "operation_id": None} in work["errors"]
    assert "retrieve_public" not in model.contexts[-1].tools


def test_proactive_condition_search_without_explicit_ref():
    model = ScriptedModel([
        reply(tool("retrieve_private", query="quyền lợi nội trú", policy_number=POLICY)),
        reply(tool("retrieve_private", query="thời gian chờ nội trú", policy_number=POLICY)),
        answer_citing("Hạn mức 240.000.000 đồng/năm; áp dụng thời gian chờ 45 ngày với bệnh thông thường.")])
    retrieval = FakeRetrieval({"quyền lợi nội trú": retrieval_ok(BENEFIT), "thời gian chờ nội trú": retrieval_ok(WAITING)})
    h = Harness(model, retrieval=retrieval)
    event = h.run(run_request("m1", "Nằm viện thì được trả bao nhiêu?"))
    first = model.contexts[1].retrieval_results[0]
    assert first["missing"] == []  # no reference edge pointed to the waiting period
    assert len(retrieval.calls) == 2 and len(payload(event)["result"]["citations"]) == 2


def test_finish_reserve_reports_only_identified_pending_conditions():
    invented = {"text": "Điều kiện X chưa có nguồn", "basis_refs": ["evidence:op-99-E9"], "reason": "NOT_SEARCHED"}

    def condition_for(ids):
        return {"text": "Thời gian chờ 45 ngày với bệnh thông thường", "basis_refs": [f"evidence:{ids[0]}"], "reason": "FINISH_RESERVE"}
    model = ScriptedModel([
        reply(tool("retrieve_private", query="quyền lợi nội trú", policy_number=POLICY), tokens=(2200, 300)),
        answer_citing("Hạn mức 240.000.000 đồng/năm. Chưa kiểm tra xong điều kiện thời gian chờ.",
                      notes=lambda ids: {"unverified_conditions": [condition_for(ids), invented]})])
    h = Harness(model, retrieval=FakeRetrieval({"quyền lợi nội trú": retrieval_ok(BENEFIT)}))
    event = h.run(run_request("m1", "Nằm viện được trả không?",
                              limits_override={"turn_token_budget": 5000, "finish_reserve_tokens": 2000}))
    assert event["kind"] == "RESULT"
    final_context = model.contexts[-1]
    assert final_context.finishing and final_context.tools == {}
    work = h.state()["work"]
    assert [c["text"] for c in work["unverified_conditions"]] == ["Thời gian chờ 45 ngày với bệnh thông thường"]
    assert any(e["code"] == "CONDITION_WITHOUT_BASIS" for e in work["errors"])
    assert len(h.retrieval.calls) == 1


def test_tool_request_after_finish_threshold_is_rejected():
    model = ScriptedModel([reply(tool("retrieve_public", query="a"), tokens=(2200, 300)),
                           reply(tool("retrieve_public", query="b"))])
    h = Harness(model, retrieval=FakeRetrieval({"a": retrieval_ok(PUBLIC_EVIDENCE)}))
    event = h.run(run_request("m1", "?", limits_override={"turn_token_budget": 5000, "finish_reserve_tokens": 2000}))
    assert payload(event)["failure"]["code"] == "OUTPUT_INVALID" and len(h.retrieval.calls) == 1


def test_last_model_call_is_kept_for_finishing():
    model = ScriptedModel([reply(tool("retrieve_public", query="a")), answer_citing("Phần đã xác minh.")])
    h = Harness(model, retrieval=FakeRetrieval({"a": retrieval_ok(PUBLIC_EVIDENCE)}))
    h.run(run_request("m1", "?", limits_override={"model_calls_max": 2}))
    assert not model.contexts[0].finishing and model.contexts[1].finishing


def test_hard_token_cap_reports_unfinished_without_calling_the_model():
    model = ScriptedModel([])
    h = Harness(model)
    event = h.run(run_request("m1", "?", limits_override={"turn_token_budget": 500, "finish_reserve_tokens": 100}))
    assert payload(event)["failure"]["code"] == "BUDGET_EXHAUSTED" and model.contexts == []


def test_graph_step_cap_stops_a_loop():
    model = ScriptedModel([reply(tool("list_contracts"))] * 10)
    core = FakeCore()
    core.contract_list = [contract(POLICY)]
    h = Harness(model, core=core)
    event = h.run(run_request("m1", "?", limits_override={"graph_steps_max": 4, "core_read_requests_max": 20}))
    assert payload(event)["failure"]["code"] == "BUDGET_EXHAUSTED"
    assert h.state()["trace"][-1] == "finalize"


def test_deadline_exceeded_is_a_technical_failure():
    model = ScriptedModel([lambda ctx: (h.clock.advance(120), reply(tool("retrieve_public", query="a")))[1]])
    h = Harness(model, retrieval=FakeRetrieval({"a": retrieval_ok(PUBLIC_EVIDENCE)}))
    event = h.run(run_request("m1", "?"))
    assert payload(event)["failure"]["code"] == "DEADLINE_EXCEEDED" and h.retrieval.calls == []


def test_finalize_repairs_unknown_citation_once():
    model = ScriptedModel([reply(tool("retrieve_public", query="a")),
                           reply(draft("Sai trích dẫn.", cites=["op-77-E7"])),
                           answer_citing("Đúng trích dẫn.")])
    h = Harness(model, retrieval=FakeRetrieval({"a": retrieval_ok(PUBLIC_EVIDENCE)}))
    event = h.run(run_request("m1", "?"))
    assert event["kind"] == "RESULT"
    assert model.contexts[2].finalize_issue == {"issues": [{"code": "CITATION_UNKNOWN", "ref": "op-77-E7"}]}
    assert model.contexts[2].tools  # repair does not reset tool budget but may still see allowed tools
    assert h.state()["work"]["counters"]["repair_attempts"] == 1
    assert h.state()["trace"].count("finalize") == 2


def test_second_invalid_output_is_never_published():
    model = ScriptedModel([reply(draft("Sai.", cites=["E404"])), reply(draft("Vẫn sai.", cites=["E405"]))])
    h = Harness(model)
    event = h.run(run_request("m1", "?"))
    assert event["kind"] == "ERROR" and payload(event)["failure"]["code"] == "OUTPUT_INVALID"
    assert len(h.store.events) == 1


def test_invalid_attempt_from_core_stops_the_turn_without_retry():
    model = ScriptedModel([reply(tool("get_contract_overview", policy_number=POLICY))])
    core = FakeCore()
    core.script["get_contract_overview"] = [CoreError("INVALID_ATTEMPT")]
    h = Harness(model, core=core)
    event = h.run(run_request("m1", "?"))
    assert payload(event)["failure"]["code"] == "ATTEMPT_INVALID" and core.count("get_contract_overview") == 1


# ---------------------------------------------------------------- multi-turn
def clarification_turn(h):
    return h.run(run_request("m1", "Hợp đồng của tôi có bổ trợ gì?"))


def test_pending_clarification_over_two_turns_second_option_follows_core_order():
    picked = {}

    def choose(context):
        options = context.conversation["pending_clarification"]["options"]
        picked["policy"] = options[1]["policy_number"]  # "cái thứ hai" resolved against Core's order
        return reply(tool("get_contract_overview", policy_number=picked["policy"]))

    model = ScriptedModel([reply(tool("list_contracts")), reply(draft("Bạn chọn hợp đồng nào?", response_type="CLARIFICATION")),
                           choose, reply(draft(f"Hợp đồng {POLICY} chưa có bổ trợ được xác nhận đầy đủ.", actions=[]))])
    core = FakeCore()
    core.contract_list = [contract(POLICY_2), contract(POLICY)]
    core.overviews[POLICY] = overview(POLICY)
    h = Harness(model, core=core)
    first = clarification_turn(h)
    core.histories[CONV] = [
        user_item(1, "m1", "Hợp đồng của tôi có bổ trợ gì?", run="m1"), result_item(2, "m1", payload(first)["result"])]
    event = h.run(run_request("m2", "Cái thứ hai", history_cursor="p2"))
    assert picked["policy"] == POLICY
    assert ("get_contract_overview", POLICY, None, 3.0) in core.calls
    assert event["kind"] == "RESULT"
    assert h.state()["conversation"]["pending_clarification"] is None  # answered, so cleared
    assert h.store.usage(uid("message:m2"))["core_read_requests"] == 1  # new message, new budget


def test_clarification_not_accepted_by_core_is_not_used():
    model = ScriptedModel([reply(tool("list_contracts")), reply(draft("Bạn chọn hợp đồng nào?", response_type="CLARIFICATION")),
                           reply(draft("Bạn muốn hỏi hợp đồng nào trong danh sách?", response_type="CLARIFICATION"))])
    core = FakeCore()
    core.contract_list = [contract(POLICY_2), contract(POLICY)]
    h = Harness(model, core=core)
    clarification_turn(h)
    core.histories[CONV] = [user_item(1, "m1", "Hợp đồng của tôi có bổ trợ gì?", run="m1"), outcome_item(2, "m1")]
    h.run(run_request("m2", "Cái thứ hai", history_cursor="p2"))
    assert model.contexts[-1].conversation["pending_clarification"] is None
    assert h.state()["conversation"]["pending_clarification"]["asked_in_message_id"] == uid("message:m2")


def test_follow_up_after_failed_turn_reads_previous_request_with_new_budget():
    model = ScriptedModel([reply(tool("get_contract_overview", policy_number=POLICY)), RuntimeError("provider down"),
                           lambda ctx: reply(tool("get_contract_overview", policy_number=POLICY)),
                           reply(draft(f"Hợp đồng {POLICY}: danh sách bổ trợ chưa xác nhận đầy đủ."))])
    core = FakeCore()
    core.script["get_contract_overview"] = [CoreError("TIMEOUT"), CoreError("TIMEOUT")]
    core.overviews[POLICY] = overview(POLICY)
    h = Harness(model, core=core)
    failed = h.run(run_request("m1", f"Hợp đồng {POLICY} có những sản phẩm bổ trợ nào?"))
    assert payload(failed)["failure"]["code"] == "MODEL_ERROR"
    core.histories[CONV] = [user_item(1, "m1", f"Hợp đồng {POLICY} có những sản phẩm bổ trợ nào?", run="m1"),
                            outcome_item(2, "m1", code="MODEL_ERROR")]
    event = h.run(run_request("m2", "Trong đó có Lá Chắn Xanh không?", history_cursor="p2"))
    turns = model.contexts[2].conversation["recent_turns"]
    assert turns[0]["text"].startswith(f"Hợp đồng {POLICY}") and turns[1]["technical_outcome"] == "FAILED"
    assert model.contexts[2].core_results == []  # nothing from the failed turn is replayed as evidence
    assert event["kind"] == "RESULT"
    assert h.store.usage(uid("message:m1"))["core_read_requests"] == 2
    assert h.store.usage(uid("message:m2"))["core_read_requests"] == 1


def test_replay_of_same_message_after_crash_keeps_spent_budget():
    model = ScriptedModel([reply(tool("retrieve_public", query="a")), reply(tool("retrieve_public", query="b")), ProcessCrash(),
                           reply(tool("retrieve_public", query="c")), reply(tool("retrieve_public", query="d")),
                           answer_citing("Phần đã xác minh.", which=[0])])
    retrieval = FakeRetrieval({q: retrieval_ok(PUBLIC_EVIDENCE) for q in "abcd"})
    h = Harness(model, retrieval=retrieval)
    with pytest.raises(ProcessCrash):
        h.run(run_request("m1", "?"))
    event = h.run(run_request("m1", "?", attempt="a2"))
    assert event["kind"] == "RESULT" and event["attempt_id"] == uid("attempt:m1:a2")
    assert [c[1] for c in retrieval.calls] == ["a", "b", "c"]  # third call of the message; "d" never reaches the engine
    assert h.store.usage(uid("message:m1"))["retrieval_calls"] == 3


def test_crash_after_reservation_before_result_does_not_grant_the_budget_again():
    model = ScriptedModel([reply(tool("retrieve_public", query="a")),
                           reply(tool("retrieve_public", query="a")), answer_citing("Chưa truy xuất được tài liệu.")])
    retrieval = FakeRetrieval({"a": [ProcessCrash(), retrieval_ok(PUBLIC_EVIDENCE)]})
    h = Harness(model, retrieval=retrieval)
    with pytest.raises(ProcessCrash):
        h.run(run_request("m1", "?", limits_override={"retrieval_calls_max": 1}))
    event = h.run(run_request("m1", "?", attempt="a2", limits_override={"retrieval_calls_max": 1}))
    assert event["kind"] == "RESULT"
    assert len(retrieval.calls) == 1  # the reservation spent before the crash is not re-granted
    assert h.store.usage(uid("message:m1"))["retrieval_calls"] == 1


def test_redelivery_of_the_same_attempt_does_not_rerun_the_graph():
    model = ScriptedModel([reply(draft("Xin chào."))])
    h = Harness(model)
    first = h.run(run_request("m1", "Chào"))
    again = h.run(run_request("m1", "Chào"))
    assert again == first and len(model.contexts) == 1 and len(h.store.events) == 1


def test_new_attempt_after_retryable_failure_runs_again_with_spent_budget():
    model = ScriptedModel([reply(tool("retrieve_public", query="a")), RuntimeError("provider timeout"),
                           answer_citing("Phần đã xác minh.")])
    h = Harness(model, retrieval=FakeRetrieval({"a": retrieval_ok(PUBLIC_EVIDENCE)}))
    failed = h.run(run_request("m1", "?"))
    assert failed["payload"]["failure"] == {"code": "MODEL_ERROR", "retryable": True}
    retried = h.run(run_request("m1", "?", attempt="a2"))
    assert retried["kind"] == "RESULT" and retried["attempt_id"] == uid("attempt:m1:a2")
    assert len(h.retrieval.calls) == 1  # evidence from the first attempt is reused, not fetched again
    assert h.store.usage(uid("message:m1"))["model_calls"] == 3


def test_missing_g4_limits_refuse_to_run():
    model = ScriptedModel([])
    h = Harness(model)
    event = h.run(run_request("m1", "?", limits_override={"model_calls_max": None}))
    assert payload(event)["failure"]["code"] == "INTERNAL" and model.contexts == []


def test_long_history_is_summarised_once_over_threshold_and_counted():
    model = ScriptedModel([reply(draft("Đã nắm bối cảnh."))])
    core = FakeCore()
    core.histories[CONV] = [user_item(i, f"h{i}", "nội dung " * 60) for i in range(1, 11)]
    h = Harness(model, core=core, cfg=config(recent_turns=3, history_summary_threshold_chars=1000))
    h.run(run_request("m11", "Tiếp tục", history_cursor="p10"))
    summary = h.state()["conversation"]["history_summary"]
    assert summary["covers_through"] == "7" and len(model.summaries) == 1
    assert [t["position"] for t in model.contexts[0].conversation["recent_turns"]] == ["8", "9", "10"]
    assert h.store.usage(uid("message:m11"))["model_calls"] == 2
