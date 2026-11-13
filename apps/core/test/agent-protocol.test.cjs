// Protocol model tests (plan Task 2). They check the transition tables of contracts/agent-v1.md section 12 through the
// test-only reference reducer. Passing proves the proposal is consistent, NOT that a DB/network implementation is safe.
// Run from repo root: node --test apps/core/test/agent-protocol.test.cjs
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { initialState, transition } = require('./helpers/agent-protocol-model.cjs');

const CAPS = { retrieval_calls: 3, core_read_requests: 4, model_calls: 6, model_tokens: 1000 };
const RESULT = { response_type: 'ANSWER', message: 'Thông tin tham khảo.', citations: [], actions: [] };

function harness() {
  let state = initialState();
  const step = command => {
    const before = JSON.stringify(state);
    const { state: next, outcome } = transition(state, command);
    assert.equal(JSON.stringify(state), before, 'transition must not mutate its input');
    state = next;
    return outcome;
  };
  return { step, get state() { return state; } };
}

// submit -> claim -> Agent accepts -> Core sees the ACK; returns ids and the lease
function started(h, conversationId = 'c1', clientMessageId = 'k1') {
  const { runId } = h.step({ type: 'SUBMIT', conversationId, clientMessageId, payload: { text: 'Thời gian chờ?' } });
  const dispatch = h.step({ type: 'CLAIM_NEXT', conversationId });
  assert.equal(dispatch.kind, 'DISPATCH');
  const { ack } = h.step({ type: 'ACCEPT_RUN', request: dispatch.request, caps: CAPS });
  assert.equal(ack.outcome, 'ACCEPTED');
  h.step({ type: 'DISPATCH_ACKED', attemptId: dispatch.request.attemptId, ack });
  const { lease } = h.step({ type: 'CLAIM_EXECUTION', attemptId: dispatch.request.attemptId });
  return { runId, request: dispatch.request, attemptId: dispatch.request.attemptId, lease };
}

function deliver(h, event) {
  return h.step({ type: 'APPLY_EVENT', event }).ack;
}

// ------------------------------------------------------------------------------------------------ receipts / fingerprints

test('same_request_key_and_payload_returns_same_run', () => {
  const h = harness();
  const first = h.step({ type: 'SUBMIT', conversationId: 'c1', clientMessageId: 'k1', payload: { text: 'A' } });
  const again = h.step({ type: 'SUBMIT', conversationId: 'c1', clientMessageId: 'k1', payload: { text: 'A' } });
  assert.deepEqual(again, { kind: 'REPLAYED', runId: first.runId });
  assert.equal(Object.keys(h.state.runs).length, 1);
  const other = h.step({ type: 'SUBMIT', conversationId: 'c1', clientMessageId: 'k1', payload: { text: 'B' } });
  assert.deepEqual(other, { kind: 'CONFLICT', reason: 'PAYLOAD_MISMATCH' });
});

test('same_run_attempt_with_different_payload_conflicts_at_the_agent', () => {
  const h = harness();
  const { request } = started(h);
  const duplicate = h.step({ type: 'ACCEPT_RUN', request, caps: CAPS });
  assert.equal(duplicate.ack.outcome, 'DUPLICATE');
  const tampered = { ...request, payload: { text: 'khác' } }; // keep the sender's stale hash
  assert.equal(h.step({ type: 'ACCEPT_RUN', request: tampered, caps: CAPS }).ack.reason, 'PAYLOAD_MISMATCH');
});

test('receipt_fingerprint_covers_received_identity_views_and_limits', () => {
  const h = harness();
  const { request } = started(h);
  for (const change of [
    { runId: 'run-other' }, { conversationId: 'c-other' }, { messageId: 'msg-other' },
    { channelType: 'STAFF_COPILOT' }, { actor: { id: 'actor-other', role: 'CUSTOMER' } },
    { targetCustomerId: 'customer-other' },
    { historyView: { conversation_id: 'c1', current_message_id: request.messageId, through_cursor: 'new-cursor' } },
    { linkedHistoryView: { conversation_id: 'linked-chat', through_cursor: 'linked-cursor' } },
    { limits: { ...request.limits, model_calls_max: 99 } },
  ]) {
    const before = structuredClone(h.state);
    assert.equal(h.step({ type: 'ACCEPT_RUN', request: { ...request, ...change }, caps: CAPS }).ack.outcome,
      'CONFLICT', JSON.stringify(change));
    assert.deepEqual(h.state, before, 'conflicting request cannot change a receipt, owner or ledger');
  }
});

test('receiver_canonicalizes_object_keys_but_preserves_payload_array_order', () => {
  const h = harness();
  const { request } = started(h);
  const complex = { ...request, attemptId: 'att-complex', payload: { text: 'A', choices: ['first', 'second'] },
    actor: { id: 'customer', role: 'CUSTOMER' } };
  assert.equal(h.step({ type: 'ACCEPT_RUN', request: complex, caps: CAPS }).ack.outcome, 'ACCEPTED');
  const reordered = { ...complex, payload: { choices: ['first', 'second'], text: 'A' },
    actor: { role: 'CUSTOMER', id: 'customer' }, fingerprint: 'untrusted-hash', headers: { nonce: 'new' }, threadId: 'derived' };
  assert.equal(h.step({ type: 'ACCEPT_RUN', request: reordered, caps: CAPS }).ack.outcome, 'DUPLICATE');
  assert.equal(h.step({ type: 'ACCEPT_RUN', request: { ...complex,
    payload: { text: 'A', choices: ['second', 'first'] } }, caps: CAPS }).ack.outcome, 'CONFLICT');
});

test('dispatch_ack_must_match_the_pending_request_and_complete_wire_shape', () => {
  const h = harness();
  h.step({ type: 'SUBMIT', conversationId: 'c1', clientMessageId: 'k1', payload: { text: 'A' } });
  const { request } = h.step({ type: 'CLAIM_NEXT', conversationId: 'c1' });
  const { ack } = h.step({ type: 'ACCEPT_RUN', request, caps: CAPS });
  const b = started(h, 'c2');
  const otherAck = h.step({ type: 'ACCEPT_RUN', request: b.request, caps: CAPS }).ack;
  const invalid = [otherAck, null, {}, { ...ack, run_id: b.runId }, { ...ack, attempt_id: b.attemptId },
    { ...ack, event_id: 'evt-other' }, { ...ack, outcome: 'UNKNOWN' }, { ...ack, reason: 'AUTH_FAILED' },
    { ...ack, extra: true }, ...Object.keys(ack).map(key => { const copy = { ...ack }; delete copy[key]; return copy; })];
  for (const bad of invalid) {
    const before = structuredClone(h.state);
    h.step({ type: 'DISPATCH_ACKED', attemptId: request.attemptId, ack: bad });
    assert.deepEqual(h.state, before, JSON.stringify(bad));
  }
  h.step({ type: 'DISPATCH_ACKED', attemptId: request.attemptId, ack });
  assert.equal(h.state.attempts[request.attemptId].state, 'ACCEPTED');
});

test('lost_dispatch_ack_resend_is_duplicate_and_returns_pending_events', () => {
  const h = harness();
  const { attemptId, lease, request } = started(h);
  const { event } = h.step({ type: 'PERSIST_FINAL', lease, outcome: { result: RESULT } });
  const resend = h.step({ type: 'RECONCILE', attemptId });
  assert.deepEqual(resend.request, request, 'reconcile must resend the exact stored request');
  const again = h.step({ type: 'ACCEPT_RUN', request: resend.request, caps: CAPS });
  assert.equal(again.ack.outcome, 'DUPLICATE');
  assert.deepEqual(again.pendingEvents, [event.event_id]); // redelivery of the stored event, never a new run
  assert.equal(h.step({ type: 'RECOVER' }).resume.includes(attemptId), false);
});

// ------------------------------------------------------------------------------------------------ events

test('duplicate_event_keeps_one_result', () => {
  const h = harness();
  const { lease } = started(h);
  const { event } = h.step({ type: 'PERSIST_FINAL', lease, outcome: { result: RESULT } });
  assert.equal(deliver(h, event).outcome, 'ACCEPTED');
  assert.equal(deliver(h, event).outcome, 'DUPLICATE');
  const state = h.state;
  assert.equal(state.results.length, 1);
  assert.equal(deliver(h, { ...event, payload: { result: { ...RESULT, message: 'khác' } } }).reason, 'PAYLOAD_MISMATCH');
});

test('terminal_result_ignores_late_progress', () => {
  const h = harness();
  const { runId, lease } = started(h);
  const progress = h.step({ type: 'PERSIST_PROGRESS', lease, stage: 'LOOKING_UP' }).event;
  const result = h.step({ type: 'PERSIST_FINAL', lease, outcome: { result: RESULT } }).event;
  assert.equal(deliver(h, result).outcome, 'ACCEPTED'); // RESULT is complete without waiting for progress
  assert.equal(deliver(h, progress).outcome, 'IGNORED_STALE');
  const next = h.state.runs[runId];
  assert.equal(next.status, 'COMPLETED');
});

test('lower_sequence_progress_does_not_regress', () => {
  const h = harness();
  const { runId, lease } = started(h);
  const first = h.step({ type: 'PERSIST_PROGRESS', lease, stage: 'PREPARING' }).event;
  const second = h.step({ type: 'PERSIST_PROGRESS', lease, stage: 'COMPOSING' }).event;
  deliver(h, second);
  assert.equal(deliver(h, first).outcome, 'ACCEPTED');
  assert.deepEqual(h.state.runs[runId].progress, { sequence: 2, stage: 'COMPOSING' });
  const clash = { ...first, event_id: 'evt-forged', payload: { stage: 'LOOKING_UP' } };
  assert.equal(deliver(h, clash).reason, 'SEQUENCE_CONFLICT');
});

test('sequences are unique per attempt across progress and final writers', () => {
  const h = harness();
  const { attemptId, lease } = started(h);
  const sequences = ['PREPARING', 'LOOKING_UP', 'COMPOSING'].map(stage => h.step({ type: 'PERSIST_PROGRESS', lease, stage }).event.sequence);
  const final = h.step({ type: 'PERSIST_FINAL', lease, outcome: { result: RESULT } });
  assert.deepEqual([...sequences, final.event.sequence], [1, 2, 3, 4]);
  const again = h.step({ type: 'PERSIST_FINAL', lease, outcome: { result: { ...RESULT, message: 'lần hai' } } });
  assert.equal(again.existing, true);
  assert.equal(again.event.event_id, final.event.event_id); // immutable: a second Finalize returns the stored event
  assert.equal(h.state.agent.sequences[attemptId], 4);
});

test('unknown run or attempt is rejected without side effects', () => {
  const h = harness();
  started(h);
  const ack = deliver(h, { schema_version: 'agent-v1', run_id: 'run-x', attempt_id: 'att-x', event_id: 'evt-x', sequence: 1,
    kind: 'RESULT', payload: { result: RESULT } });
  assert.equal(ack.reason, 'UNKNOWN_RUN');
  assert.equal(h.state.results.length, 0);
});

// ------------------------------------------------------------------------------------------------ FIFO

test('fifo_one_running_run_per_conversation_others_proceed', () => {
  const h = harness();
  const a = started(h, 'c1', 'k1');
  h.step({ type: 'SUBMIT', conversationId: 'c1', clientMessageId: 'k2', payload: { text: 'B' } });
  assert.deepEqual(h.step({ type: 'CLAIM_NEXT', conversationId: 'c1' }), { kind: 'NOOP', reason: 'BUSY' });
  started(h, 'c2', 'k1'); // independent conversation runs concurrently
  deliver(h, h.step({ type: 'PERSIST_FINAL', lease: a.lease, outcome: { result: RESULT } }).event);
  const next = h.step({ type: 'CLAIM_NEXT', conversationId: 'c1' });
  assert.equal(next.kind, 'DISPATCH');
  assert.notEqual(next.request.runId, a.runId);
});

// ------------------------------------------------------------------------------------------------ revoke / fencing

for (const reason of ['CANCELLED_BY_CORE', 'PERMISSION_CHANGED']) {
  test(`${reason.toLowerCase()}_cancels_without_retry_and_releases_fifo_only_after_revoke_ack`, () => {
    const h = harness();
    const a = started(h);
    const queued = h.step({ type: 'SUBMIT', conversationId: 'c1', clientMessageId: 'k2', payload: { text: 'B' } }).runId;
    const revoke = h.step({ type: 'INVALIDATE', attemptId: a.attemptId, reason });
    assert.equal(h.state.runs[a.runId].status, 'CANCELLED');
    assert.equal(h.state.runs[a.runId].failure?.code, reason === 'PERMISSION_CHANGED' ? 'PERMISSION_DENIED' : 'CANCELLED_BY_CORE');
    assert.equal(h.step({ type: 'TOOL_CALL', attemptId: a.attemptId }).kind, 'DENIED');
    assert.equal(h.step({ type: 'CLAIM_NEXT', conversationId: 'c1' }).reason, 'REVOKE_PENDING');
    const { ack } = h.step({ type: 'REVOKE', runId: a.runId, attemptId: a.attemptId, threadId: revoke.threadId });
    assert.equal(h.step({ type: 'REVOKE_ACKED', attemptId: a.attemptId, ack }).kind, 'OK');
    assert.equal(h.state.runs[a.runId].attempts.length, 1);
    assert.equal(h.step({ type: 'WRITE_CHECKPOINT', lease: a.lease, expectedVersion: 0 }).kind, 'STALE_WRITER');
    const next = h.step({ type: 'CLAIM_NEXT', conversationId: 'c1' });
    assert.equal(next.request.runId, queued);
  });
}

test('revoke_ack_must_match_the_pending_attempt_before_opening_the_writer_barrier', () => {
  const h = harness();
  const a = started(h);
  const b = started(h, 'c2');
  const revokeA = h.step({ type: 'INVALIDATE', attemptId: a.attemptId, reason: 'DEADLINE' });
  const revokeB = h.step({ type: 'INVALIDATE', attemptId: b.attemptId, reason: 'DEADLINE' });
  const otherAck = h.step({ type: 'REVOKE', runId: b.runId, attemptId: b.attemptId, threadId: revokeB.threadId }).ack;
  // B's real durable revoke cannot prove that A's old writer has stopped.
  const before = structuredClone(h.state);
  h.step({ type: 'REVOKE_ACKED', attemptId: a.attemptId, ack: otherAck });
  assert.deepEqual(h.state, before);
  assert.equal(h.step({ type: 'WRITE_CHECKPOINT', lease: a.lease, expectedVersion: 0 }).kind, 'OK');
  const { ack } = h.step({ type: 'REVOKE', runId: a.runId, attemptId: a.attemptId, threadId: revokeA.threadId });
  assert.deepEqual(ack, { outcome: 'REVOKED', run_id: a.runId, attempt_id: a.attemptId, writer_epoch: 3, reason: null });
  const invalid = [null, {}, { ...ack, run_id: b.runId }, { ...ack, attempt_id: b.attemptId },
    { ...ack, event_id: null }, { ...ack, writer_epoch: null }, { ...ack, writer_epoch: -1 },
    { ...ack, writer_epoch: 1.5 }, { ...ack, reason: 'AUTH_FAILED' }, { ...ack, outcome: 'UNKNOWN' },
    ...Object.keys(ack).map(key => { const copy = { ...ack }; delete copy[key]; return copy; })];
  for (const bad of invalid) {
    const prior = structuredClone(h.state);
    h.step({ type: 'REVOKE_ACKED', attemptId: a.attemptId, ack: bad });
    assert.deepEqual(h.state, prior, JSON.stringify(bad));
    assert.equal(h.step({ type: 'CLAIM_NEXT', conversationId: 'c1' }).reason, 'REVOKE_PENDING');
  }
  assert.equal(h.step({ type: 'REVOKE_ACKED', attemptId: a.attemptId, ack }).kind, 'OK');
  assert.equal(h.state.attempts[a.attemptId].revokedEpoch, 3);
});

test('stale_writer_cannot_checkpoint_reserve_or_finalize_after_revoke_ack', () => {
  const h = harness();
  const { attemptId, lease, runId } = started(h);
  assert.equal(h.step({ type: 'WRITE_CHECKPOINT', lease, expectedVersion: 0 }).kind, 'OK');
  const { threadId } = h.step({ type: 'INVALIDATE', attemptId, reason: 'RETRY' });
  assert.equal(h.step({ type: 'TOOL_CALL', attemptId }).kind, 'DENIED'); // Core refuses at once
  const { ack } = h.step({ type: 'REVOKE', runId, attemptId, threadId });
  assert.equal(ack.outcome, 'REVOKED');
  for (const command of [{ type: 'WRITE_CHECKPOINT', lease, expectedVersion: 1 },
    { type: 'RESERVE', lease, kind: 'model_calls', operationId: 'model-9' },
    { type: 'PERSIST_FINAL', lease, outcome: { result: RESULT } }]) assert.equal(h.step(command).kind, 'STALE_WRITER');
  const retry = h.step({ type: 'REVOKE_ACKED', attemptId, ack });
  assert.equal(retry.kind, 'DISPATCH');
  assert.equal(retry.request.runId, runId);
  h.step({ type: 'ACCEPT_RUN', request: retry.request, caps: CAPS });
  const leaseB = h.step({ type: 'CLAIM_EXECUTION', attemptId: retry.request.attemptId }).lease;
  assert.equal(h.step({ type: 'WRITE_CHECKPOINT', lease: leaseB, expectedVersion: 1 }).kind, 'OK');
  assert.equal(h.step({ type: 'WRITE_CHECKPOINT', lease, expectedVersion: 2 }).kind, 'STALE_WRITER'); // reconnecting A
  assert.equal(h.state.agent.checkpoints[threadId].attemptId, retry.request.attemptId);
});

test('new_attempt_and_next_message_wait_for_the_revoke_ack', () => {
  const h = harness();
  const { attemptId, runId } = started(h);
  h.step({ type: 'SUBMIT', conversationId: 'c1', clientMessageId: 'k2', payload: { text: 'B' } });
  h.step({ type: 'INVALIDATE', attemptId, reason: 'DEADLINE' });
  assert.deepEqual(h.step({ type: 'CLAIM_NEXT', conversationId: 'c1' }), { kind: 'NOOP', reason: 'REVOKE_PENDING' });
  assert.equal(h.step({ type: 'REVOKE_ACKED', attemptId, ack: { outcome: 'TIMEOUT' } }).kind, 'NOOP'); // no ACK: still blocked
  assert.equal(h.step({ type: 'CLAIM_NEXT', conversationId: 'c1' }).reason, 'REVOKE_PENDING');
  const ack = h.step({ type: 'REVOKE', runId, attemptId, threadId: 'conv:c1' }).ack;
  h.step({ type: 'REVOKE_ACKED', attemptId, ack });
  assert.equal(h.step({ type: 'CLAIM_NEXT', conversationId: 'c1' }).kind, 'DISPATCH');
});

test('revoke_before_dispatch_arrives_leaves_a_tombstone', () => {
  const h = harness();
  h.step({ type: 'SUBMIT', conversationId: 'c1', clientMessageId: 'k1', payload: { text: 'A' } });
  const { request } = h.step({ type: 'CLAIM_NEXT', conversationId: 'c1' });
  const revoke = h.step({ type: 'INVALIDATE', attemptId: request.attemptId, reason: 'TAKEOVER' });
  const first = h.step({ type: 'REVOKE', runId: request.runId, attemptId: request.attemptId, threadId: revoke.threadId }).ack;
  assert.deepEqual(first, { outcome: 'REVOKED', run_id: request.runId, attempt_id: request.attemptId, writer_epoch: 0, reason: null });
  assert.equal(h.state.agent.receipts[request.attemptId].runId, null, 'tombstone must satisfy receipt_tombstone DDL');
  const again = h.step({ type: 'REVOKE', runId: request.runId, attemptId: request.attemptId, threadId: revoke.threadId }).ack;
  assert.deepEqual(again, { ...first, outcome: 'ALREADY_REVOKED' });
  const late = h.step({ type: 'ACCEPT_RUN', request, caps: CAPS }); // the in-flight dispatch lands after the revoke
  assert.equal(late.ack.outcome, 'IGNORED_STALE');
  assert.equal(h.step({ type: 'CLAIM_EXECUTION', attemptId: request.attemptId }).kind, 'REFUSED');
});

test('tombstone_ack_echoes_control_request_without_loading_a_core_run', () => {
  const h = harness();
  const control = { type: 'REVOKE', runId: 'run-control', attemptId: 'att-unknown', threadId: 'conv:unknown' };
  const first = h.step(control).ack;
  assert.deepEqual(first, { outcome: 'REVOKED', run_id: 'run-control', attempt_id: 'att-unknown', writer_epoch: 0, reason: null });
  assert.equal(h.state.agent.receipts['att-unknown'].runId, null);
  assert.deepEqual(h.step(control).ack, { ...first, outcome: 'ALREADY_REVOKED' });
  // No receipt payload exists to validate a run id; a trusted control request is correlated by its own run id.
  assert.deepEqual(h.step({ ...control, runId: 'run-control-retry' }).ack,
    { ...first, outcome: 'ALREADY_REVOKED', run_id: 'run-control-retry' });
  assert.deepEqual(h.state.runs, {});
  const before = structuredClone(h.state);
  assert.deepEqual(h.step({ ...control, threadId: 'conv:other' }).ack,
    { ...first, outcome: 'REJECTED', writer_epoch: null, reason: 'UNKNOWN_RUN' });
  assert.deepEqual(h.state, before, 'a wrong thread cannot alter the tombstone');

  const known = started(h, 'c-known');
  for (const mismatch of [{ runId: 'run-other' }, { threadId: 'conv:other' }]) {
    const prior = structuredClone(h.state);
    assert.equal(h.step({ type: 'REVOKE', runId: known.runId, attemptId: known.attemptId,
      threadId: known.request.threadId, ...mismatch }).ack.outcome, 'REJECTED');
    assert.deepEqual(h.state, prior, 'a known receipt must match both run and thread');
  }
});

test('takeover_cancels_the_run_and_ignores_its_late_result', () => {
  const h = harness();
  const { attemptId, lease, runId } = started(h);
  const final = h.step({ type: 'PERSIST_FINAL', lease, outcome: { result: RESULT } }).event; // finished before revoke
  const queued = h.step({ type: 'SUBMIT', conversationId: 'c1', clientMessageId: 'k0', payload: { text: 'chờ' } }).runId;
  const { threadId } = h.step({ type: 'INVALIDATE', attemptId, reason: 'TAKEOVER' });
  assert.equal(h.state.runs[runId].status, 'CANCELLED');
  assert.equal(h.state.runs[queued].status, 'CANCELLED'); // queued Agent work of a taken-over chat is not dispatched
  assert.equal(deliver(h, final).outcome, 'IGNORED_STALE'); // stored result does not grant publication
  assert.equal(h.state.results.length, 0);
  assert.equal(h.step({ type: 'REVOKE', runId, attemptId, threadId }).ack.outcome, 'REVOKED'); // still owner: fenced now
  assert.equal(h.step({ type: 'REVOKE', runId, attemptId, threadId }).ack.outcome, 'ALREADY_REVOKED'); // control retry
  assert.equal(h.step({ type: 'WRITE_CHECKPOINT', lease, expectedVersion: 0 }).kind, 'STALE_WRITER');
  h.step({ type: 'SUBMIT', conversationId: 'c1', clientMessageId: 'k2', payload: { text: 'B' } });
  assert.equal(h.state.runs[runId].status, 'CANCELLED');
  assert.equal(h.step({ type: 'CLAIM_NEXT', conversationId: 'c1' }).reason, 'NOT_AGENT_CONTROLLED');
});

test('a new attempt accepted on the thread fences the previous owner even without a revoke', () => {
  const h = harness();
  const a = started(h);
  const forged = { ...a.request, attemptId: 'att-other', fingerprint: 'f' };
  h.step({ type: 'ACCEPT_RUN', request: forged, caps: CAPS });
  assert.equal(h.step({ type: 'WRITE_CHECKPOINT', lease: a.lease, expectedVersion: 0 }).kind, 'STALE_WRITER');
});

test('a second claim of the same attempt fences the first process', () => {
  const h = harness();
  const { attemptId, lease } = started(h);
  const second = h.step({ type: 'CLAIM_EXECUTION', attemptId }).lease; // restart or expired lease taken over
  assert.equal(h.step({ type: 'WRITE_CHECKPOINT', lease, expectedVersion: 0 }).kind, 'STALE_WRITER');
  assert.equal(h.step({ type: 'WRITE_CHECKPOINT', lease: second, expectedVersion: 0 }).kind, 'OK');
});

// ------------------------------------------------------------------------------------------------ ledger

test('reservation_cap_and_replay_never_regrant_budget', () => {
  const h = harness();
  const { lease, attemptId, request } = started(h);
  for (let i = 1; i <= 4; i += 1) {
    assert.equal(h.step({ type: 'RESERVE', lease, kind: 'core_read_requests', operationId: `op-${i}` }).kind, 'RESERVED');
  }
  // crash after the 4th send, before any checkpoint: replay of the same operation is not a new grant
  const replay = h.step({ type: 'RESERVE', lease, kind: 'core_read_requests', operationId: 'op-4' });
  assert.deepEqual([replay.replay, replay.used], [true, 4]);
  assert.equal(h.step({ type: 'RESERVE', lease, kind: 'core_read_requests', operationId: 'op-5' }).kind, 'BUDGET_EXHAUSTED');
  // Core retries the same message with a new attempt: same ledger, no fresh budget
  const { threadId } = h.step({ type: 'INVALIDATE', attemptId, reason: 'RETRY' });
  const ack = h.step({ type: 'REVOKE', runId: request.runId, attemptId, threadId }).ack;
  const retry = h.step({ type: 'REVOKE_ACKED', attemptId, ack }).request;
  h.step({ type: 'ACCEPT_RUN', request: retry, caps: CAPS });
  const leaseB = h.step({ type: 'CLAIM_EXECUTION', attemptId: retry.attemptId }).lease;
  assert.equal(h.step({ type: 'RESERVE', lease: leaseB, kind: 'core_read_requests', operationId: 'op-6' }).kind, 'BUDGET_EXHAUSTED');
  assert.equal(h.state.agent.ledgers[request.messageId].used.core_read_requests, 4);
});

test('token reservations are spent even when usage is unknown after a crash', () => {
  const h = harness();
  const { lease, request } = started(h);
  for (const [op, amount] of [['summary-1', 300], ['model-1', 400], ['repair-1', 250]]) {
    assert.equal(h.step({ type: 'RESERVE', lease, kind: 'model_tokens', operationId: op, amount }).kind, 'RESERVED');
  }
  assert.equal(h.step({ type: 'RESERVE', lease, kind: 'model_tokens', operationId: 'model-2', amount: 100 }).kind, 'BUDGET_EXHAUSTED');
  assert.equal(h.step({ type: 'RESERVE', lease, kind: 'model_tokens', operationId: 'model-1', amount: 400 }).replay, true);
  assert.equal(h.state.agent.ledgers[request.messageId].used.model_tokens, 950);
});

// ------------------------------------------------------------------------------------------------ recovery

test('recovery_redelivers_finalized_events_and_resumes_only_unfinished_owners', () => {
  const h = harness();
  const done = started(h, 'c1');
  const running = started(h, 'c2');
  const event = h.step({ type: 'PERSIST_FINAL', lease: done.lease, outcome: { result: RESULT } }).event;
  const recovery = h.step({ type: 'RECOVER' });
  assert.deepEqual(recovery.resume, [running.attemptId]);
  assert.deepEqual(recovery.deliver, [event.event_id]);
  h.step({ type: 'EVENT_ACKED', eventId: event.event_id, ack: deliver(h, event) });
  assert.deepEqual(h.step({ type: 'RECOVER' }).deliver, []);
});

test('event_ack_must_match_all_event_ids_and_shape_or_delivery_remains_pending', () => {
  const h = harness();
  const a = started(h);
  const b = started(h, 'c2');
  const event = h.step({ type: 'PERSIST_FINAL', lease: a.lease, outcome: { result: RESULT } }).event;
  const other = h.step({ type: 'PERSIST_FINAL', lease: b.lease, outcome: { result: RESULT } }).event;
  const ack = deliver(h, event);
  const invalid = [deliver(h, other), null, {}, { ...ack, run_id: b.runId }, { ...ack, attempt_id: b.attemptId },
    { ...ack, event_id: other.event_id }, { ...ack, event_id: null }, { ...ack, outcome: 'UNKNOWN' },
    { ...ack, reason: 'AUTH_FAILED' }, { ...ack, outcome: 'CONFLICT' }, { ...ack, outcome: 'IGNORED_STALE' },
    { ...ack, outcome: 'CONFLICT', reason: 'AUTH_FAILED' }, { ...ack, extra: true },
    ...Object.keys(ack).map(key => { const copy = { ...ack }; delete copy[key]; return copy; })];
  for (const bad of invalid) {
    const before = structuredClone(h.state);
    assert.equal(h.step({ type: 'EVENT_ACKED', eventId: event.event_id, ack: bad }).kind, 'KEEP');
    assert.deepEqual(h.state, before, JSON.stringify(bad));
    assert.equal(h.step({ type: 'RECOVER' }).deliver.includes(event.event_id), true);
    assert.deepEqual(h.state.agent.outbound[event.event_id].event, event);
  }
  assert.equal(h.step({ type: 'EVENT_ACKED', eventId: event.event_id, ack }).kind, 'STOP_SENDING');
  assert.equal(h.step({ type: 'RECOVER' }).deliver.includes(event.event_id), false);
});

test('non_string_ack_outcome_cannot_drop_a_pending_event', () => {
  const h = harness();
  const { lease } = started(h);
  const event = h.step({ type: 'PERSIST_FINAL', lease, outcome: { result: RESULT } }).event;
  for (const outcome of [['REJECTED'], ['ACCEPTED'], ['DUPLICATE'], ['CONFLICT'], ['IGNORED_STALE'], [], {}, 0, true, null]) {
    const ack = { outcome, run_id: event.run_id, attempt_id: event.attempt_id, event_id: event.event_id,
      reason: Array.isArray(outcome) && outcome[0] === 'REJECTED' ? 'AUTH_FAILED' : null };
    const before = structuredClone(h.state);
    assert.equal(h.step({ type: 'EVENT_ACKED', eventId: event.event_id, ack }).kind, 'KEEP', JSON.stringify(outcome));
    assert.deepEqual(h.state, before);
    assert.deepEqual(h.step({ type: 'RECOVER' }).deliver, [event.event_id]);
  }
});

test('rejected acknowledgement keeps the event for an incident instead of dropping it', () => {
  const h = harness();
  const { lease } = started(h);
  const event = h.step({ type: 'PERSIST_FINAL', lease, outcome: { result: RESULT } }).event;
  const ack = { outcome: 'REJECTED', run_id: event.run_id, attempt_id: event.attempt_id,
    event_id: event.event_id, reason: 'AUTH_FAILED' };
  assert.equal(h.step({ type: 'EVENT_ACKED', eventId: event.event_id, ack }).kind, 'KEEP');
  assert.deepEqual(h.step({ type: 'RECOVER' }).deliver, [event.event_id]);
});
