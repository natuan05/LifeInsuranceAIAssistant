"""Staff Copilot: own thread, linked Customer chat read through a view frozen when Core accepted the Staff question.
Whether the model honours "recent" versus "from the start" is measured with a real model in Task 9."""
import pytest

from life_agent.core_client import CoreError
from life_agent.prompts import TOOL_DEFINITIONS

from fakes import (COPILOT_CONV, CONV, FakeCore, Harness, ProcessCrash, ScriptedModel, config, draft, reply, run_request,
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
    assert core.count("linked_history") == calls_before  # resume keeps the same view, no refresh
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


def test_linked_sync_failure_is_kept_as_source_status():
    core = FakeCore()
    core.histories[CONV] = customer_chat(2)
    model = ScriptedModel([reply(draft("Tóm tắt.")), reply(draft("Chưa cập nhật được tin mới."))])
    h = Harness(model, core=core)
    h.run(copilot_request("s1", "Tóm tắt", "p2"))
    core.histories[CONV].append(user_item(3, "c3", "Tin khách 3"))
    core.fail_linked = CoreError("UNAVAILABLE")
    h.run(copilot_request("s2", "Có gì mới?", "p3"))
    second = model.contexts[1].linked_source
    assert second["status"] == "SYNC_FAILED" and linked_texts(model.contexts[1]) == ["Tin khách 1", "Tin khách 2"]
    assert second["view"] == {"conversation_id": CONV, "through_cursor": "p2"}  # not claimed as synced to p3


@pytest.mark.parametrize("max_chars,includes_start,omitted", [(60000, True, 0), (4500, False, 6)])
def test_copilot_summary_history_ranges(max_chars, includes_start, omitted):
    core = FakeCore()
    core.histories[CONV] = [user_item(i, f"c{i}", f"Tin khách {i} " + "chi tiết " * 30) for i in range(1, 11)]
    model = ScriptedModel([reply(draft("Tóm tắt."))])
    h = Harness(model, core=core, cfg=config(copilot_recent_items=4, max_context_chars=max_chars))
    h.run(copilot_request("s1", "Tóm tắt từ đầu", "p10"))
    coverage = model.contexts[0].linked_source["coverage"]
    assert coverage["total_items"] == 10 and coverage["recent_window"] == 4
    assert coverage["includes_start"] is includes_start and coverage["omitted_older_items"] == omitted
    assert len(model.contexts[0].linked_source["recent_items"]) == 4
