"""Context assembly per model call: five groups, overflow order, no trusted context or credentials in the prompt."""
import json

from life_agent.context import assemble_context
from life_agent.graph import execution_context
from life_agent.state import new_conversation, new_work

from fakes import POLICY, config, contract, evidence, result_item, retrieval_ok, run_request, uid, user_item, draft

QUESTION = "Hạn mức nội trú của Demo Bình là bao nhiêu?"


def output(op, tool, arguments, result, replaced=False):
    return {"operation_id": op, "tool": tool, "arguments": arguments, "result": result, "replaced": replaced}


def make_state(*, outputs=(), history=(), pending=None, conditions=()):
    work = new_work(uid("message:m9"), uid("run:m9"), QUESTION)
    work["source_outputs"] = list(outputs)
    work["unverified_conditions"] = list(conditions)
    conversation = new_conversation("graph-0.1")
    conversation["pending_clarification"] = pending
    return {"work": work, "conversation": conversation, "recent_history": list(history)}


def ctx(channel="CUSTOMER_SUPPORT"):
    return execution_context(run_request("m9", QUESTION))


def test_five_groups_and_question_verbatim():
    state = make_state(outputs=[
        output("op-1", "list_contracts", {}, {"status": "OK", "contracts": [contract(POLICY)], "error": None}),
        output("op-2", "retrieve_private", {"query": "hạn mức", "policy_number": POLICY},
               retrieval_ok(evidence("op-2-E1", "Hạn mức 240.000.000 đồng/năm hợp đồng."))),
    ], history=[user_item(1, "m0", "Xin chào")])
    context = assemble_context(state, ctx(), config(), finishing=False, available_tools=["retrieve_public"])
    assert context.question == QUESTION
    assert "Quy tắc hỏi làm rõ và dữ liệu nhạy cảm" in context.system_prompt
    assert set(context.tools) == {"retrieve_public"}
    assert context.conversation["recent_turns"][0]["text"] == "Xin chào"
    assert context.core_results[0]["source_ref"] == "core:op-1"
    assert context.retrieval_results[0]["evidence"][0]["evidence_id"] == "op-2-E1"
    assert not context.overflow


def test_finishing_context_offers_no_tools():
    context = assemble_context(make_state(), ctx(), config(), finishing=True, available_tools=["retrieve_public"])
    assert context.tools == {} and context.finishing


def test_replaced_outputs_and_duplicate_evidence_are_dropped():
    e = evidence("op-1-E1", "Đoạn giống nhau.")
    duplicate = {**e, "evidence_id": "op-3-E1"}
    state = make_state(outputs=[
        output("op-1", "retrieve_private", {"query": "a", "policy_number": POLICY}, retrieval_ok(e)),
        output("op-2", "retrieve_private", {"query": "b", "policy_number": POLICY}, retrieval_ok(evidence("op-2-E1", "Cũ.")), replaced=True),
        output("op-3", "retrieve_private", {"query": "c", "policy_number": POLICY}, retrieval_ok(duplicate)),
    ])
    context = assemble_context(state, ctx(), config(), finishing=False, available_tools=[])
    ops = [r["operation_id"] for r in context.retrieval_results]
    assert ops == ["op-1", "op-3"]
    assert context.retrieval_results[1]["evidence"] == []


def test_only_accepted_clarification_is_shown():
    pending = {"status": "PROPOSED", "question": "Hợp đồng nào?", "options": [], "asked_in_run_id": uid("run:x"),
               "asked_in_message_id": uid("message:x")}
    context = assemble_context(make_state(pending=pending), ctx(), config(), finishing=False, available_tools=[])
    assert context.conversation["pending_clarification"] is None
    pending["status"] = "ASKED"
    context = assemble_context(make_state(pending=pending), ctx(), config(), finishing=False, available_tools=[])
    assert context.conversation["pending_clarification"]["question"] == "Hợp đồng nào?"


def test_overflow_order_keeps_question_conditions_and_latest_evidence():
    long = "x" * 1500
    old_history = [user_item(i, f"h{i}", long) for i in range(1, 9)]
    outputs = [output(f"op-{i}", "retrieve_private", {"query": f"q{i}", "policy_number": POLICY},
                      retrieval_ok(evidence(f"op-{i}-E1", f"Đoạn {i} " + long))) for i in range(1, 5)]
    condition = {"text": "Thời gian chờ 45 ngày", "basis_refs": ["evidence:op-1-E1"], "reason": "FINISH_RESERVE"}
    state = make_state(outputs=outputs, history=old_history, conditions=[condition])
    context = assemble_context(state, ctx(), config(max_context_chars=12000, recent_turns=2), finishing=False, available_tools=[])
    assert context.budget_notes[0] == "older_turns_omitted"
    assert context.conversation["omitted_older_turns"] == 6 and len(context.conversation["recent_turns"]) == 2
    kept = {e["evidence_id"] for r in context.retrieval_results for e in r["evidence"]}
    assert "op-1-E1" in kept and "op-4-E1" in kept  # basis of an identified condition + latest output
    assert context.dropped_evidence >= 1 and context.question == QUESTION
    tiny = assemble_context(state, ctx(), config(max_context_chars=2000, recent_turns=2), finishing=False, available_tools=[])
    assert tiny.overflow and tiny.question == QUESTION


def test_trusted_execution_context_never_reaches_the_model():
    request = run_request("m9", QUESTION)
    state = make_state(history=[result_item(2, "m0", draft("Đã trả lời."))])
    context = assemble_context(state, execution_context(request), config(), finishing=False, available_tools=["list_contracts"])
    dumped = json.dumps(context.__dict__, ensure_ascii=False, default=str)
    for secretish in (request["attempt_id"], request["actor"]["id"], request["target_customer_id"], f"conv:{request['conversation_id']}"):
        assert secretish not in dumped
