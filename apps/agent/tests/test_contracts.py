"""Python side of the shared agent-v1 contract fixtures (same files as apps/core/test/agent-contracts.test.cjs)."""
from life_agent import contracts
from life_agent.graph import execution_context

from fakes import run_request


def test_shared_fixture_cases_have_the_same_validity_in_python():
    cases = contracts.fixtures()["cases"]
    mismatched = [c["name"] for c in cases if contracts.is_valid(c["type"], c["value"]) != c["valid"]]
    assert mismatched == []
    assert len(cases) >= 100


def test_validate_reports_paths_without_values():
    try:
        contracts.validate("ToolDecision", {"tool": "list_contracts", "arguments": {"customer_id": "secret-value"}})
    except contracts.ContractError as error:
        assert "secret-value" not in str(error)
    else:
        raise AssertionError("identity field in tool arguments must be rejected")


def test_execution_context_adds_thread_and_drops_question():
    request = run_request("m1", "Câu hỏi synthetic")
    context = execution_context(request)
    assert context["thread_id"] == f"conv:{request['conversation_id']}"
    assert "message_text" not in context
    assert contracts.is_valid("ExecutionContext", context)
