// Reference model of the Core <-> Agent durable protocol proposal (plan Task 2, contracts/agent-v1.md section 12).
// TEST-ONLY oracle of the transition tables: pure functions, no I/O, no imports from production code. It checks that the
// proposal is internally consistent (fingerprints, terminal states, duplicates/stale events, fencing, ledger caps). It
// does NOT model DB locks, network safety or real concurrency; those are proven by DB/process tests in Tasks 3/4/6.
'use strict';

const RUN_TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);

function initialState() {
  return {
    // Core (business schema, owner of run lifecycle)
    conversations: {}, // id -> { queue: [runId], controlVersion, takenOver }
    submissions: {}, // `${conversationId}:${clientMessageId}` -> { runId, fingerprint }
    runs: {}, // id -> { conversationId, messageId, payload, status, currentAttemptId, attempts, progress, result, failure }
    attempts: {}, // id -> { runId, state, fingerprint, reason }
    coreEvents: {}, // eventId -> { attemptId, sequence, fingerprint, applied }
    results: [], // accepted Agent results (one Message each)
    // Agent (separate schema/role; owner of receipts, checkpoint, ledger, outbound events)
    agent: {
      receipts: {}, // attemptId -> { runId, messageId, threadId, fingerprint, status: ACCEPTED|FINALIZED|REVOKED, finalEventId }
      owners: {}, // threadId -> { attemptId, epoch, revoked }
      checkpoints: {}, // threadId -> { attemptId, epoch, version }
      ledgers: {}, // messageId -> { caps, used, reservations }
      sequences: {}, // attemptId -> last sequence
      outbound: {}, // eventId -> { event, fingerprint, acked }
    },
    nextId: 1,
  };
}

// Stable canonical JSON + FNV-1a: enough for a model; production uses SHA-256 over canonical bytes.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function fingerprint(value) {
  let hash = 0x811c9dc5;
  for (const ch of canonical(value)) {
    hash ^= ch.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function id(state, prefix) {
  const value = `${prefix}-${state.nextId}`;
  state.nextId += 1;
  return value;
}
const threadOf = conversationId => `conv:${conversationId}`;

function runRequest(state, attemptId) {
  const attempt = state.attempts[attemptId];
  const run = state.runs[attempt.runId];
  return { runId: attempt.runId, attemptId, conversationId: run.conversationId, messageId: run.messageId,
    threadId: threadOf(run.conversationId), payload: run.payload, fingerprint: attempt.fingerprint };
}

function newAttempt(state, runId) {
  const attemptId = id(state, 'att');
  const run = state.runs[runId];
  state.attempts[attemptId] = { runId, state: 'DISPATCHING', fingerprint: null, reason: null };
  state.attempts[attemptId].fingerprint = fingerprint({ runId, attemptId, messageId: run.messageId, payload: run.payload });
  run.currentAttemptId = attemptId;
  run.attempts.push(attemptId);
  return attemptId;
}

function conversationBlocked(state, conversationId) {
  return Object.values(state.attempts).some(a => a.state === 'INVALIDATING' && state.runs[a.runId].conversationId === conversationId);
}

function attemptIsCurrent(state, attemptId) {
  const attempt = state.attempts[attemptId];
  if (!attempt) return false;
  const run = state.runs[attempt.runId];
  return run.currentAttemptId === attemptId && ['DISPATCHING', 'ACCEPTED'].includes(attempt.state) && run.status === 'RUNNING' &&
    !state.conversations[run.conversationId].takenOver;
}

// ------------------------------------------------------------------------------------------------ Core commands

const core = {
  // Customer/Staff message: durable message + run in one transaction (conversation row locked).
  SUBMIT(state, { conversationId, clientMessageId, payload }) {
    const conversation = state.conversations[conversationId] ??= { queue: [], controlVersion: 0, takenOver: false };
    const key = `${conversationId}:${clientMessageId}`;
    const fp = fingerprint(payload);
    const previous = state.submissions[key];
    if (previous) return previous.fingerprint === fp ? { kind: 'REPLAYED', runId: previous.runId } : { kind: 'CONFLICT', reason: 'PAYLOAD_MISMATCH' };
    if (conversation.takenOver) return { kind: 'REJECTED', reason: 'STAFF_ACTIVE' };
    const runId = id(state, 'run');
    state.runs[runId] = { conversationId, messageId: id(state, 'msg'), payload, status: 'QUEUED', currentAttemptId: null,
      attempts: [], progress: { sequence: 0, stage: null }, result: null, failure: null };
    state.submissions[key] = { runId, fingerprint: fp };
    conversation.queue.push(runId);
    return { kind: 'ACCEPTED', runId };
  },

  // Dispatcher: one RUNNING run per conversation, FIFO; commit the attempt before any HTTP send.
  CLAIM_NEXT(state, { conversationId }) {
    const conversation = state.conversations[conversationId];
    if (!conversation || conversation.takenOver) return { kind: 'NOOP', reason: 'NOT_AGENT_CONTROLLED' };
    if (conversationBlocked(state, conversationId)) return { kind: 'NOOP', reason: 'REVOKE_PENDING' };
    if (conversation.queue.some(r => state.runs[r].status === 'RUNNING')) return { kind: 'NOOP', reason: 'BUSY' };
    const runId = conversation.queue.find(r => state.runs[r].status === 'QUEUED');
    if (!runId) return { kind: 'NOOP', reason: 'EMPTY' };
    state.runs[runId].status = 'RUNNING';
    const attemptId = newAttempt(state, runId);
    return { kind: 'DISPATCH', request: runRequest(state, attemptId) };
  },

  // Reconcile: resend the same request (same attempt, fingerprint) while the attempt is current and unacknowledged.
  RECONCILE(state, { attemptId }) {
    if (!attemptIsCurrent(state, attemptId)) return { kind: 'NOOP', reason: 'ATTEMPT_NOT_CURRENT' };
    return { kind: 'DISPATCH', request: runRequest(state, attemptId) };
  },

  DISPATCH_ACKED(state, { attemptId, ack }) {
    const attempt = state.attempts[attemptId];
    if (attempt.state === 'DISPATCHING' && ['ACCEPTED', 'DUPLICATE'].includes(ack.outcome)) attempt.state = 'ACCEPTED';
    return { kind: 'OK', attemptState: attempt.state };
  },

  // Internal Business/scope/history API gate: current attempt only.
  TOOL_CALL(state, { attemptId }) {
    return attemptIsCurrent(state, attemptId) ? { kind: 'ALLOWED' } : { kind: 'DENIED', reason: 'ATTEMPT_INVALID' };
  },

  APPLY_EVENT(state, { event }) {
    const ack = (outcome, reason = null) => ({ kind: 'ACK', ack: { outcome, run_id: event.run_id, attempt_id: event.attempt_id,
      event_id: event.event_id, reason } });
    const attempt = state.attempts[event.attempt_id];
    if (!attempt || attempt.runId !== event.run_id) return ack('REJECTED', 'UNKNOWN_RUN');
    const fp = fingerprint(event);
    const seen = state.coreEvents[event.event_id];
    if (seen) return seen.fingerprint === fp ? ack('DUPLICATE') : ack('CONFLICT', 'PAYLOAD_MISMATCH');
    const sameSequence = Object.entries(state.coreEvents).find(([, e]) => e.attemptId === event.attempt_id && e.sequence === event.sequence);
    if (sameSequence) return ack('CONFLICT', 'SEQUENCE_CONFLICT');
    const run = state.runs[event.run_id];
    const current = run.currentAttemptId === event.attempt_id && ['DISPATCHING', 'ACCEPTED'].includes(attempt.state);
    state.coreEvents[event.event_id] = { attemptId: event.attempt_id, sequence: event.sequence, fingerprint: fp, applied: false };
    if (!current || RUN_TERMINAL.has(run.status)) return ack('IGNORED_STALE', 'ATTEMPT_NOT_CURRENT');
    state.coreEvents[event.event_id].applied = true;
    if (event.kind === 'PROGRESS') {
      if (event.sequence > run.progress.sequence) run.progress = { sequence: event.sequence, stage: event.payload.stage };
      return ack('ACCEPTED');
    }
    // RESULT/ERROR are complete on their own: no wait for missing progress events. Same transaction: run terminal +
    // attempt finished + (RESULT) one Message; re-checked against takeover/permissions in the real Core.
    attempt.state = 'FINISHED';
    if (event.kind === 'RESULT') {
      run.status = 'COMPLETED';
      run.result = event.payload.result;
      state.results.push({ runId: event.run_id, eventId: event.event_id });
    } else {
      run.status = 'FAILED';
      run.failure = event.payload.failure;
    }
    return ack('ACCEPTED');
  },

  // Core stops an attempt. Its tools/callbacks are refused immediately (INVALIDATING); a new writer for the same thread is
  // only dispatched after the Agent store has durably revoked the old one (REVOKE_ACKED).
  INVALIDATE(state, { attemptId, reason }) {
    const attempt = state.attempts[attemptId];
    if (!attempt || !['DISPATCHING', 'ACCEPTED'].includes(attempt.state)) return { kind: 'NOOP', reason: 'NOT_ACTIVE' };
    const run = state.runs[attempt.runId];
    attempt.state = 'INVALIDATING';
    attempt.reason = reason;
    if (reason === 'TAKEOVER') {
      const conversation = state.conversations[run.conversationId];
      conversation.takenOver = true;
      conversation.controlVersion += 1;
      run.status = 'CANCELLED';
      for (const queued of conversation.queue) if (state.runs[queued].status === 'QUEUED') state.runs[queued].status = 'CANCELLED';
    } else if (reason === 'DEADLINE') {
      run.status = 'FAILED';
      run.failure = { code: 'DEADLINE_EXCEEDED', retryable: false };
    }
    return { kind: 'REVOKE_REQUIRED', attemptId, threadId: threadOf(run.conversationId) };
  },

  REVOKE_ACKED(state, { attemptId, ack }) {
    const attempt = state.attempts[attemptId];
    if (attempt.state !== 'INVALIDATING' || !['REVOKED', 'ALREADY_REVOKED'].includes(ack.outcome)) return { kind: 'NOOP' };
    attempt.state = 'INVALIDATED';
    const run = state.runs[attempt.runId];
    if (attempt.reason === 'RETRY' && run.status === 'RUNNING') {
      const next = newAttempt(state, attempt.runId); // same run, same message ledger at the Agent
      return { kind: 'DISPATCH', request: runRequest(state, next) };
    }
    return { kind: 'OK' };
  },
};

// ------------------------------------------------------------------------------------------------ Agent commands

function fenced(state, lease) {
  const receipt = state.agent.receipts[lease.attemptId];
  const owner = receipt && state.agent.owners[receipt.threadId];
  return Boolean(owner && owner.attemptId === lease.attemptId && owner.epoch === lease.epoch && !owner.revoked &&
    receipt.status !== 'REVOKED');
}

function emit(state, attemptId, kind, payload) {
  const receipt = state.agent.receipts[attemptId];
  const sequence = (state.agent.sequences[attemptId] ?? 0) + 1;
  state.agent.sequences[attemptId] = sequence;
  const event = { schema_version: 'agent-v1', run_id: receipt.runId, attempt_id: attemptId, event_id: id(state, 'evt'),
    sequence, kind, payload };
  state.agent.outbound[event.event_id] = { event, fingerprint: fingerprint(event), acked: null };
  return event;
}

const agent = {
  // Receipt + ownership transfer + ledger open in one Agent transaction, then ACK.
  ACCEPT_RUN(state, { request, caps }) {
    const ack = (outcome, reason = null) => ({ outcome, run_id: request.runId, attempt_id: request.attemptId, event_id: null, reason });
    const existing = state.agent.receipts[request.attemptId];
    if (existing) {
      if (existing.status === 'REVOKED' && !existing.fingerprint) return { kind: 'ACK', ack: ack('IGNORED_STALE', 'ATTEMPT_NOT_CURRENT') };
      if (existing.fingerprint !== request.fingerprint) return { kind: 'ACK', ack: ack('CONFLICT', 'PAYLOAD_MISMATCH') };
      if (existing.status === 'REVOKED') return { kind: 'ACK', ack: ack('IGNORED_STALE', 'ATTEMPT_NOT_CURRENT') };
      const pending = Object.values(state.agent.outbound).filter(o => o.event.attempt_id === request.attemptId && !o.acked)
        .map(o => o.event.event_id);
      return { kind: 'ACK', ack: ack('DUPLICATE'), pendingEvents: pending };
    }
    const previous = state.agent.owners[request.threadId];
    if (previous && previous.attemptId !== request.attemptId) {
      const old = state.agent.receipts[previous.attemptId];
      if (old && old.status === 'ACCEPTED') old.status = 'REVOKED'; // defence in depth: a new attempt fences the old one
    }
    state.agent.owners[request.threadId] = { attemptId: request.attemptId, epoch: (previous?.epoch ?? 0) + 1, revoked: false };
    state.agent.receipts[request.attemptId] = { runId: request.runId, messageId: request.messageId, threadId: request.threadId,
      fingerprint: request.fingerprint, status: 'ACCEPTED', finalEventId: null };
    state.agent.ledgers[request.messageId] ??= { caps: { ...caps }, used: Object.fromEntries(Object.keys(caps).map(k => [k, 0])),
      reservations: {} };
    return { kind: 'ACK', ack: ack('ACCEPTED') };
  },

  // Control request from Core. Unknown attempts get a tombstone so a dispatch still in flight is refused later.
  REVOKE(state, { attemptId, threadId }) {
    const receipt = state.agent.receipts[attemptId];
    if (!receipt) {
      state.agent.receipts[attemptId] = { runId: null, messageId: null, threadId, fingerprint: null, status: 'REVOKED', finalEventId: null };
      return { kind: 'REVOKE_ACK', ack: { outcome: 'REVOKED', attempt_id: attemptId } };
    }
    const owner = state.agent.owners[receipt.threadId];
    const owns = owner?.attemptId === attemptId;
    const already = receipt.status === 'REVOKED' || !owns || owner.revoked;
    if (owns && !owner.revoked) {
      owner.epoch += 1; // also fences a FINALIZED attempt: no checkpoint write after its final record
      owner.revoked = true;
    }
    if (receipt.status === 'ACCEPTED') receipt.status = 'REVOKED';
    return { kind: 'REVOKE_ACK', ack: { outcome: already ? 'ALREADY_REVOKED' : 'REVOKED', attempt_id: attemptId } };
  },

  CLAIM_EXECUTION(state, { attemptId }) {
    const receipt = state.agent.receipts[attemptId];
    if (!receipt || receipt.status !== 'ACCEPTED') return { kind: 'REFUSED', reason: receipt?.status === 'FINALIZED' ? 'FINALIZED' : 'STALE_WRITER' };
    const owner = state.agent.owners[receipt.threadId];
    if (!owner || owner.attemptId !== attemptId || owner.revoked) return { kind: 'REFUSED', reason: 'STALE_WRITER' };
    // Every claim (first start, restart, lease takeover by another process) raises the epoch, so a process still
    // running the same attempt from an earlier claim is fenced as well.
    owner.epoch += 1;
    return { kind: 'LEASE', lease: { attemptId, epoch: owner.epoch } };
  },

  WRITE_CHECKPOINT(state, { lease, expectedVersion }) {
    if (!fenced(state, lease)) return { kind: 'STALE_WRITER' };
    const threadId = state.agent.receipts[lease.attemptId].threadId;
    const head = state.agent.checkpoints[threadId] ?? { version: 0 };
    if (head.version !== expectedVersion) return { kind: 'VERSION_CONFLICT', version: head.version };
    state.agent.checkpoints[threadId] = { attemptId: lease.attemptId, epoch: lease.epoch, version: head.version + 1 };
    return { kind: 'OK', version: head.version + 1 };
  },

  // Reserve before the external call; the same operation id never gets a second grant (replay after crash).
  RESERVE(state, { lease, kind, operationId, amount = 1 }) {
    if (!fenced(state, lease)) return { kind: 'STALE_WRITER' };
    const ledger = state.agent.ledgers[state.agent.receipts[lease.attemptId].messageId];
    const key = `${kind}:${operationId}`;
    if (key in ledger.reservations) return { kind: 'RESERVED', replay: true, used: ledger.used[kind] };
    if (ledger.used[kind] + amount > ledger.caps[kind]) return { kind: 'BUDGET_EXHAUSTED' };
    ledger.used[kind] += amount;
    ledger.reservations[key] = amount;
    return { kind: 'RESERVED', replay: false, used: ledger.used[kind] };
  },

  PERSIST_PROGRESS(state, { lease, stage }) {
    if (!fenced(state, lease)) return { kind: 'STALE_WRITER' };
    return { kind: 'EVENT', event: emit(state, lease.attemptId, 'PROGRESS', { stage }) };
  },

  // Final result/failure + immutable event + sequence + completion marker in one Agent transaction.
  PERSIST_FINAL(state, { lease, outcome }) {
    const receipt = state.agent.receipts[lease.attemptId];
    if (receipt?.status === 'FINALIZED') return { kind: 'EVENT', event: state.agent.outbound[receipt.finalEventId].event, existing: true };
    if (!fenced(state, lease)) return { kind: 'STALE_WRITER' };
    const event = 'result' in outcome ? emit(state, lease.attemptId, 'RESULT', { result: outcome.result })
      : emit(state, lease.attemptId, 'ERROR', { failure: outcome.failure });
    receipt.status = 'FINALIZED';
    receipt.finalEventId = event.event_id;
    return { kind: 'EVENT', event, existing: false };
  },

  EVENT_ACKED(state, { eventId, ack }) {
    const record = state.agent.outbound[eventId];
    if (ack.outcome === 'REJECTED') return { kind: 'KEEP' }; // auth/schema problem: incident, not silent drop
    record.acked = ack.outcome;
    return { kind: 'STOP_SENDING', incident: ack.outcome === 'CONFLICT' };
  },

  // After a restart: resume only accepted, unfinished receipts that still own their thread; deliver stored events as is.
  RECOVER(state) {
    const resume = Object.entries(state.agent.receipts)
      .filter(([attemptId, r]) => r.status === 'ACCEPTED' && state.agent.owners[r.threadId]?.attemptId === attemptId)
      .map(([attemptId]) => attemptId);
    const deliver = Object.values(state.agent.outbound).filter(o => !o.acked).map(o => o.event.event_id);
    return { kind: 'RECOVERY', resume, deliver };
  },
};

function transition(state, command) {
  const handler = core[command.type] ?? agent[command.type];
  if (!handler) throw new Error(`unknown command ${command.type}`);
  const next = structuredClone(state);
  const outcome = handler(next, command);
  return { state: next, outcome };
}

module.exports = { initialState, transition, fingerprint, canonical, RUN_TERMINAL };
