"""Ticket handoff summary: six groups and source provenance checked by code. Whether the summary is faithful to what
the customer meant is judged with a real model and a rubric in Task 9, not here."""
from life_agent.core_client import CoreError

from fakes import (COPILOT_CONV, CONV, POLICY, FakeCore, FakeRetrieval, Harness, ScriptedModel, answer_citing, draft,
                   evidence, overview, reply, retrieval_ok, run_request, tool, uid)

BENEFIT = evidence("E1", "Quyền lợi nội trú DEMO-TITAN A — Hạn mức 240.000.000 đồng/năm hợp đồng.")


def summary(verified_refs):
    return {"request": "Khách muốn biết hồ sơ nằm viện có được chi trả không.",
            "context": f"Hợp đồng {POLICY}; quyền lợi nội trú DEMO-TITAN A.",
            "customer_statements": ["Khách cho biết người được bảo hiểm nằm viện 3 ngày.", "Khách sửa lại: không phải 5 ngày."],
            "verified_findings": [{"text": "Hạn mức nội trú 240.000.000 đồng/năm hợp đồng.", "source_refs": verified_refs}],
            "attempted_steps": ["Đọc tổng quan hợp đồng.", "Tra quyền lợi nội trú."],
            "pending_issues": ["Chưa có hồ sơ y tế/hóa đơn để đối chiếu điều kiện chi trả."]}


def ticket_with(refs_from_context):
    return lambda context: [{"type": "PROPOSE_TICKET", "summary": summary(refs_from_context(context))}]


def harness(model, *, overview_script=None):
    core = FakeCore()
    core.overviews[POLICY] = overview(POLICY)
    if overview_script:
        core.script["get_contract_overview"] = overview_script
    return Harness(model, core=core, retrieval=FakeRetrieval({"nội trú": retrieval_ok(BENEFIT)}))


def test_ticket_summary_keeps_source_provenance():
    refs = lambda c: [c.core_results[0]["source_ref"], f"evidence:{c.retrieval_results[0]['evidence'][0]['evidence_id']}"]
    model = ScriptedModel([reply(tool("get_contract_overview", policy_number=POLICY)),
                           reply(tool("retrieve_private", query="nội trú", policy_number=POLICY)),
                           answer_citing("Đây là thông tin tham khảo; em đề xuất chuyển Staff kiểm tra hồ sơ.",
                                         actions=ticket_with(refs))])
    h = harness(model)
    event = h.run(run_request("m1", "Nằm viện 3 ngày có được trả không?"))
    action = event["payload"]["result"]["actions"][0]
    assert action["type"] == "PROPOSE_TICKET"
    assert set(action["summary"]) == {"request", "context", "customer_statements", "verified_findings", "attempted_steps",
                                      "pending_issues"}
    kinds = [ref.split(":")[0] for ref in action["summary"]["verified_findings"][0]["source_refs"]]
    assert kinds == ["core", "evidence"]
    assert "Khách sửa lại: không phải 5 ngày." in action["summary"]["customer_statements"]


def test_customer_message_is_never_a_verified_finding():
    refs = lambda c: [f"message:{uid('message:m1')}"]
    h = harness(ScriptedModel([answer_citing("Tóm tắt.", actions=ticket_with(refs))]))
    event = h.run(run_request("m1", "Tôi nằm viện 3 ngày."))
    assert event["kind"] == "ERROR" and event["payload"]["failure"]["code"] == "OUTPUT_INVALID"


def test_failed_tool_or_invented_refs_are_rejected_by_finalize():
    refs = lambda c: [c.core_results[0]["source_ref"]]  # the overview read failed: not verified
    invented = lambda c: ["evidence:op-404-E1"]
    model = ScriptedModel([reply(tool("get_contract_overview", policy_number=POLICY)),
                           answer_citing("Chưa xác minh được.", actions=ticket_with(refs)),
                           answer_citing("Chưa xác minh được.", actions=ticket_with(invented))])
    h = harness(model, overview_script=[CoreError("TIMEOUT"), CoreError("TIMEOUT")])
    event = h.run(run_request("m1", "?"))
    assert model.contexts[2].finalize_issue["issues"][0]["code"] == "SOURCE_REF_UNKNOWN"
    assert event["kind"] == "ERROR" and event["payload"]["failure"]["code"] == "OUTPUT_INVALID"


def test_copilot_result_cannot_carry_actions():
    refs = lambda c: []
    no_refs_summary = lambda c: [{"type": "PROPOSE_HANDOFF", "subject": "Chuyển Staff", "reason": None}]
    model = ScriptedModel([answer_citing("Tóm tắt cho Staff.", actions=no_refs_summary), answer_citing("Tóm tắt cho Staff.")])
    h = harness(model)
    request = run_request("s1", "Tóm tắt giúp", conversation_id=COPILOT_CONV, channel="STAFF_COPILOT",
                          linked_view={"conversation_id": CONV, "through_cursor": None})
    event = h.run(request)
    assert model.contexts[1].finalize_issue["issues"] == [{"code": "ACTION_NOT_ALLOWED", "ref": "PROPOSE_HANDOFF"}]
    assert event["kind"] == "RESULT" and event["payload"]["result"]["actions"] == []
