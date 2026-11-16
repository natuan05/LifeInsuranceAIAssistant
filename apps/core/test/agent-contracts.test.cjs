// Contract tests for agent-v1 (Task 1). Pure schema checks: no build, DB or credentials needed.
// Run from repo root: node --test apps/core/test/agent-contracts.test.cjs
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Ajv2020 = require('ajv/dist/2020').default;

const root = path.resolve(__dirname, '..', '..', '..');
const schemaPath = path.join(root, 'contracts', 'agent-v1.schema.json');
const fixturePath = path.join(root, 'contracts', 'fixtures', 'agent-v1.json');

function load() {
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  // Formats stay annotations: identifiers/timestamps are enforced by `pattern`, so TS and Python validators agree.
  const ajv = new Ajv2020({ strict: true, allErrors: true, validateFormats: false });
  ajv.addSchema(schema);
  const cache = new Map();
  const validator = type => {
    if (!schema.$defs[type]) throw new Error(`Unknown contract type ${type}`);
    if (!cache.has(type)) cache.set(type, ajv.compile({ $ref: `${schema.$id}#/$defs/${type}` }));
    return cache.get(type);
  };
  const isValid = (type, value) => validator(type)(value);
  const byName = name => {
    const found = fixture.cases.filter(c => c.name === name);
    assert.equal(found.length, 1, `fixture case ${name} must exist exactly once`);
    return found[0];
  };
  return { schema, fixture, isValid, validator, byName };
}

const PLAN_TYPES = ['ConversationCreate', 'ConversationSummary', 'ConversationHistoryPage', 'RunSummary', 'RunRequest',
  'AgentEvent', 'DurableAck', 'ExecutionContext', 'HistoryView', 'LinkedHistoryView', 'TicketHandoffSummary',
  'TicketProposalAction', 'DocumentScope', 'AgentResult', 'RetrievalResult', 'ContractSummary', 'ContractOverview'];
// LLM token counters (input_tokens, turn_token_budget) are allowed; auth material is not.
const FORBIDDEN_KEY = /session|cookie|secret|password|passwd|signature|hmac|credential|api_?key|authorization|bearer|csrf|(access|refresh|auth|id|bearer)_?token/i;

function propertyNames(node, out = new Set()) {
  if (Array.isArray(node)) node.forEach(item => propertyNames(item, out));
  else if (node && typeof node === 'object') {
    if (node.properties && typeof node.properties === 'object') Object.keys(node.properties).forEach(k => out.add(k));
    Object.values(node).forEach(v => propertyNames(v, out));
  }
  return out;
}
function valueKeys(node, out = new Set()) {
  if (Array.isArray(node)) node.forEach(item => valueKeys(item, out));
  else if (node && typeof node === 'object') Object.entries(node).forEach(([k, v]) => { out.add(k); valueKeys(v, out); });
  return out;
}
function expect(ctx, name) {
  const c = ctx.byName(name);
  assert.equal(ctx.isValid(c.type, c.value), c.valid, `${name}: expected ${c.valid ? 'valid' : 'invalid'}`);
  return c;
}

test('schema_compiles_strict_and_declares_plan_types', () => {
  const { schema, validator } = load();
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.match(schema.$id, /agent-v1/);
  for (const type of PLAN_TYPES) assert.ok(schema.$defs[type], `missing $defs.${type}`);
  for (const type of Object.keys(schema.$defs)) validator(type);
});

test('fixture_cases_match_expected_validity', () => {
  const { fixture, isValid } = load();
  assert.equal(fixture.schema, 'agent-v1');
  assert.ok(fixture.cases.length > 0);
  const names = new Set();
  for (const c of fixture.cases) {
    assert.ok(!names.has(c.name), `duplicate fixture name ${c.name}`);
    names.add(c.name);
    assert.equal(isValid(c.type, c.value), c.valid, `${c.name} (${c.type}) expected ${c.valid ? 'valid' : 'invalid'}`);
  }
  for (const type of PLAN_TYPES) {
    assert.ok(fixture.cases.some(c => c.type === type && c.valid), `no valid example for ${type}`);
  }
});

test('no_session_token_or_credential_fields_anywhere', () => {
  const { schema, fixture } = load();
  for (const key of propertyNames(schema)) assert.doesNotMatch(key, FORBIDDEN_KEY, `schema property ${key}`);
  for (const c of fixture.cases.filter(x => x.valid)) {
    for (const key of valueKeys(c.value)) assert.doesNotMatch(key, FORBIDDEN_KEY, `${c.name} key ${key}`);
  }
});

test('retrieval_result_has_exactly_six_fields_and_five_statuses', () => {
  const ctx = load();
  const def = ctx.schema.$defs.RetrievalResult;
  assert.deepEqual(Object.keys(def.properties).sort(), ['conflicts', 'degraded', 'error', 'evidence', 'missing', 'status']);
  assert.deepEqual([...def.required].sort(), ['conflicts', 'degraded', 'error', 'evidence', 'missing', 'status']);
  assert.equal(def.additionalProperties, false);
  assert.deepEqual(ctx.schema.$defs.RetrievalStatus.enum, ['OK', 'NO_MATCH', 'NO_SOURCE', 'DENIED', 'ERROR']);
  for (const name of ['retrieval_ok_markdown_anchor', 'retrieval_no_match_degraded', 'retrieval_no_source_valid_empty_scope',
    'retrieval_denied', 'retrieval_error_scope_timeout', 'retrieval_extra_field_rejected', 'retrieval_ok_without_evidence_rejected',
    'retrieval_error_with_raw_sql_rejected', 'retrieval_error_status_without_error_rejected',
    'retrieval_denied_degraded_rejected', 'retrieval_missing_semantic_assessment_rejected']) expect(ctx, name);
});

test('evidence_markdown_anchor_has_no_fake_pages', () => {
  const ctx = load();
  const ok = expect(ctx, 'evidence_markdown_anchor');
  assert.equal(ok.value.location.pages, undefined);
  assert.ok(ok.value.location.anchor);
  expect(ctx, 'evidence_empty_pages_rejected');
  expect(ctx, 'evidence_without_location_rejected');
  expect(ctx, 'evidence_pdf_pages_and_clause');
});

test('contract_overview_missing_completeness_flag_is_not_true', () => {
  const ctx = load();
  expect(ctx, 'overview_unmapped_riders_incomplete');
  expect(ctx, 'overview_missing_riders_complete_rejected');
  expect(ctx, 'overview_string_riders_complete_rejected');
  expect(ctx, 'contract_summary_minimal');
});

test('tool_arguments_reject_actor_scope_and_customer_ids', () => {
  const ctx = load();
  for (const name of ['decision_list_contracts', 'decision_get_contract_overview', 'decision_retrieve_public',
    'decision_retrieve_private', 'decision_list_contracts_with_customer_id_rejected',
    'decision_overview_with_actor_rejected', 'decision_private_with_scope_rejected',
    'decision_public_with_policy_number_rejected', 'decision_unknown_tool_rejected',
    'decision_history_tool_rejected']) expect(ctx, name);
});

test('decision_rejects_multiple_tools_in_one_step', () => {
  const ctx = load();
  expect(ctx, 'decision_two_tools_array_rejected');
  expect(ctx, 'decision_tool_calls_list_rejected');
  expect(ctx, 'decision_answer_draft');
  expect(ctx, 'decision_tool_and_answer_mixed_rejected');
});

test('agent_result_has_exactly_four_fields', () => {
  const ctx = load();
  const def = ctx.schema.$defs.AgentResult;
  assert.deepEqual(Object.keys(def.properties).sort(), ['actions', 'citations', 'message', 'response_type']);
  assert.equal(def.additionalProperties, false);
  assert.deepEqual(ctx.schema.$defs.ResponseType.enum, ['ANSWER', 'CLARIFICATION', 'REFUSAL']);
  for (const name of ['agent_result_answer_with_citation', 'agent_result_clarification', 'agent_result_extra_field_rejected',
    'agent_result_citation_without_metadata_rejected']) expect(ctx, name);
});

test('conversation_create_and_resume_contract', () => {
  const ctx = load();
  for (const name of ['conversation_create_customer', 'conversation_create_staff_copilot',
    'conversation_create_customer_with_target_rejected', 'conversation_create_customer_with_role_rejected',
    'conversation_create_with_session_rejected', 'conversation_summary_with_queued_run',
    'conversation_summary_idle', 'conversation_list_page', 'conversation_history_page',
    'conversation_history_bad_cursor_rejected', 'run_summary_completed', 'run_summary_running_with_result_rejected',
    'run_summary_completed_without_result_rejected', 'message_submit', 'message_submit_ack']) expect(ctx, name);
  const summary = ctx.byName('conversation_summary_with_queued_run').value;
  assert.match(summary.conversationId, /^[0-9a-f-]{36}$/);
  assert.equal(summary.currentRun.status, 'QUEUED');
  assert.ok(Object.prototype.hasOwnProperty.call(ctx.byName('conversation_list_page').value, 'nextCursor'));
});

test('copilot_linked_view_and_ticket_summary_contract', () => {
  const ctx = load();
  for (const name of ['run_request_customer', 'run_request_copilot_with_linked_view', 'run_request_copilot_without_link',
    'run_request_customer_with_linked_view_rejected', 'run_request_customer_role_staff_rejected',
    'execution_context_copilot', 'execution_context_with_hmac_rejected', 'linked_history_view',
    'ticket_handoff_summary_full', 'ticket_handoff_summary_missing_group_rejected',
    'ticket_verified_finding_from_customer_message_rejected', 'ticket_verified_finding_without_source_rejected',
    'ticket_proposal_action', 'agent_result_send_to_customer_action_rejected',
    'agent_result_draft_reply_action_rejected', 'handoff_proposal_action']) expect(ctx, name);
  const summaryDef = ctx.schema.$defs.TicketHandoffSummary;
  assert.deepEqual(Object.keys(summaryDef.properties).sort(),
    ['attempted_steps', 'context', 'customer_statements', 'pending_issues', 'request', 'verified_findings']);
});

test('unverified_conditions_live_in_message_work_not_tool_missing', () => {
  const ctx = load();
  const work = ctx.schema.$defs.MessageWork;
  assert.ok(work.properties.unverified_conditions, 'MessageWork.unverified_conditions');
  assert.ok(work.properties.agent_assessment, 'MessageWork.agent_assessment');
  const missingCodes = ctx.schema.$defs.RetrievalIssueCode.enum;
  assert.ok(!missingCodes.some(code => /UNVERIFIED|INSUFFICIENT|SUFFICIENT|PARTIAL/.test(code)));
  for (const name of ['message_work_with_unverified_condition', 'conversation_context_pending_clarification',
    'conversation_context_proposed_clarification', 'message_work_counters_negative_rejected']) expect(ctx, name);
});

test('scope_events_and_acks_are_distinguishable', () => {
  const ctx = load();
  for (const name of ['document_scope_public', 'document_scope_private', 'document_scope_valid_empty',
    'document_scope_denied', 'document_scope_private_without_policy_rejected', 'document_scope_denied_with_documents_rejected',
    'agent_event_progress', 'agent_event_result', 'agent_event_error', 'agent_event_result_without_result_rejected',
    'agent_event_sequence_zero_rejected', 'durable_ack_accepted', 'durable_ack_ignored_stale', 'durable_ack_conflict',
    'durable_ack_unknown_outcome_rejected', 'contract_list_result_empty_ok', 'contract_overview_result_not_found',
    'contract_overview_result_error']) expect(ctx, name);
  assert.deepEqual(ctx.schema.$defs.DurableAck.properties.outcome.enum,
    ['ACCEPTED', 'DUPLICATE', 'IGNORED_STALE', 'CONFLICT', 'REJECTED']);
  assert.deepEqual(ctx.schema.$defs.RunStatus.enum, ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']);
});
