"""Business read adapter: 4 Core requests per message (retries included), min(3 s, deadline left), one retry on
transient errors only, re-reading after a transient error stays inside the same budget."""
from datetime import timedelta

import pytest

from life_agent.config import RunLimits
from life_agent.core_client import BusinessReads, CoreError
from life_agent.graph import execution_context
from life_agent.store import BudgetExhausted

from fakes import NOW, POLICY, FakeCore, InMemoryStore, ManualClock, contract, limits, overview, run_request


def setup(*, wait: float = 0.0, **limit_overrides):
    request = run_request("m1", "q", limits_override=limit_overrides)
    ctx = execution_context(request)
    run_limits = RunLimits.from_contract(ctx["limits"])
    store = InMemoryStore()
    store.open_message(ctx["message_id"], run_limits.budget_caps())
    core, clock = FakeCore(), ManualClock()
    core.contract_list = [contract(POLICY)]
    core.overviews[POLICY] = overview(POLICY)
    return BusinessReads(core, store, clock, retry_wait_s=wait), core, store, clock, ctx, run_limits


def requests_used(store, ctx):
    return store.usage(ctx["message_id"])["core_read_requests"]


def test_timeout_is_three_seconds_or_deadline_left():
    reads, core, _, _, ctx, run_limits = setup()
    reads.list_contracts(ctx, run_limits, "op-1")
    assert core.calls[-1][3] == 3.0
    reads, core, _, _, ctx, run_limits = setup(deadline_at=(NOW + timedelta(seconds=2)).isoformat())
    reads.list_contracts(ctx, run_limits, "op-1")
    assert core.calls[-1][3] == pytest.approx(2.0)


def test_transient_error_is_retried_once():
    reads, core, store, _, ctx, run_limits = setup()
    core.script["list_contracts"] = [CoreError("TIMEOUT")]
    result = reads.list_contracts(ctx, run_limits, "op-1")
    assert result["status"] == "OK" and core.count("list_contracts") == 2 and requests_used(store, ctx) == 2


def test_two_transient_errors_return_error_without_third_request():
    reads, core, store, _, ctx, run_limits = setup()
    core.script["list_contracts"] = [CoreError("UNAVAILABLE"), CoreError("TIMEOUT")]
    result = reads.list_contracts(ctx, run_limits, "op-1")
    assert result["status"] == "ERROR" and result["error"] == {"code": "TIMEOUT", "retryable": True}
    assert core.count("list_contracts") == 2


@pytest.mark.parametrize("code,status", [("NOT_AUTHORIZED", "DENIED"), ("INVALID_ATTEMPT", "DENIED"),
                                         ("NOT_FOUND", "NOT_FOUND"), ("INVALID_INPUT", "ERROR")])
def test_denied_not_found_and_invalid_input_are_not_retried(code, status):
    reads, core, store, _, ctx, run_limits = setup()
    core.script["get_contract_overview"] = [CoreError(code)]
    result = reads.get_contract_overview(ctx, run_limits, "op-1", POLICY)
    assert result["status"] == status
    assert core.count("get_contract_overview") == 1 and requests_used(store, ctx) == 1


def test_four_requests_are_shared_by_both_tools_including_retries():
    reads, core, store, _, ctx, run_limits = setup()
    core.script["list_contracts"] = [CoreError("TIMEOUT")]
    core.script["get_contract_overview"] = [CoreError("TIMEOUT")]
    reads.list_contracts(ctx, run_limits, "op-1")
    reads.get_contract_overview(ctx, run_limits, "op-2", POLICY)
    assert requests_used(store, ctx) == 4
    sent_before = len(core.calls)
    with pytest.raises(BudgetExhausted):
        reads.get_contract_overview(ctx, run_limits, "op-3", POLICY)
    assert len(core.calls) == sent_before  # nothing was sent


def test_retry_is_skipped_when_budget_runs_out_and_first_error_is_kept():
    reads, core, store, _, ctx, run_limits = setup(core_read_requests_max=1)
    core.script["list_contracts"] = [CoreError("TIMEOUT")]
    result = reads.list_contracts(ctx, run_limits, "op-1")
    assert result["status"] == "ERROR" and core.count("list_contracts") == 1


def test_rereading_same_arguments_after_transient_failure_is_allowed_within_budget():
    reads, core, store, _, ctx, run_limits = setup()
    core.script["get_contract_overview"] = [CoreError("TIMEOUT"), CoreError("TIMEOUT")]
    assert reads.get_contract_overview(ctx, run_limits, "op-1", POLICY)["status"] == "ERROR"
    assert reads.get_contract_overview(ctx, run_limits, "op-2", POLICY)["status"] == "OK"
    assert requests_used(store, ctx) == 3


def test_wait_policy_sleeps_between_attempts_and_skips_retry_near_deadline():
    reads, core, _, clock, ctx, run_limits = setup(wait=0.5)
    core.script["list_contracts"] = [CoreError("TIMEOUT")]
    assert reads.list_contracts(ctx, run_limits, "op-1")["status"] == "OK"
    assert clock.sleeps == [0.5]
    reads, core, _, clock, ctx, run_limits = setup(wait=5.0, deadline_at=(NOW + timedelta(seconds=4)).isoformat())
    core.script["list_contracts"] = [CoreError("TIMEOUT")]
    assert reads.list_contracts(ctx, run_limits, "op-1")["status"] == "ERROR"
    assert clock.sleeps == [] and core.count("list_contracts") == 1


def test_no_request_after_deadline():
    reads, core, _, clock, ctx, run_limits = setup()
    clock.advance(120)
    assert reads.list_contracts(ctx, run_limits, "op-1")["status"] == "ERROR"
    assert core.count("list_contracts") == 0


def test_limits_require_values_left_open_until_g4():
    from life_agent.config import ConfigError
    with pytest.raises(ConfigError):
        RunLimits.from_contract(limits(model_calls_max=None))
