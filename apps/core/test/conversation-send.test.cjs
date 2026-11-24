require('reflect-metadata');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { PrismaClient } = require('../dist/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { AccountManagementService } = require('../dist/accounts/services/account-management.service');
const { ConversationMessageService } = require('../dist/conversations/services/conversation-message.service');
const { ConversationHandoffService } = require('../dist/conversations/services/conversation-handoff.service');
const { ConversationCommandService } = require('../dist/conversations/services/conversation-command.service');
const { AgentRunService } = require('../dist/agent/services/agent-run.service');
const { AgentAccessService } = require('../dist/agent/services/agent-access.service');
const { AgentTransportService } = require('../dist/agent/services/agent-transport.service');
const { createConversationTestApp } = require('./support/conversation-test.module.cjs');
process.env.NODE_ENV = 'test'; process.env.CORS_ORIGINS = 'http://localhost:8080';
const runId = `i05-${randomUUID()}`, userIds = [], products = [];
const hash = value => createHash('sha256').update(value).digest('hex');
function client(role, path) { return new PrismaClient({ adapter: new PrismaPg({ host: process.env.PGHOST,
  database: process.env.I01_TEST_DATABASE, user: role, password: readFileSync(path, 'utf8').trim(), max: 8 }) }); }
const admin = client('admin_runtime', '/credentials/admin/password'), core = client('core_runtime', '/credentials/core/password');
let app, base, copilotApp, copilotBase;
const owned = '/api/v1/customers/me/conversations', staff = '/api/v1/staff/conversations';
const consent = { confirmed: true, textVersion: 'handoff-v1', scope: 'ENTIRE_CUSTOMER_VISIBLE_CONVERSATION' };
async function actor(role) {
  const id = randomUUID(), token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex');
  await admin.user.create({ data: { id, role, accountCode: `${role === 'STAFF' ? 'STF' : 'CUS'}-${BigInt('0x' + id.replaceAll('-', '')).toString().slice(0, 22)}`,
    email: `${id}@synthetic.invalid`, passwordHash: 'synthetic-workflow-fixture-not-for-login',
    ...(role === 'STAFF' ? { staffProfile: { create: { fullName: 'Synthetic Workflow Staff' } } }
      : { customerProfile: { create: { fullName: 'Synthetic Workflow Customer' } } }) } });
  userIds.push(id);
  const session = await admin.authSession.create({ data: { userId: id, tokenHash: hash(token), csrfTokenHash: hash(csrf), expiresAt: new Date(Date.now() + 3600000) } });
  return { id, role, cookie: `li_session=${token}; li_csrf=${csrf}`, csrf, sessionId: session.id };
}
async function group(assigned = true) {
  const a = await actor('STAFF'), b = await actor('STAFF'), c = await actor('CUSTOMER');
  const assignment = assigned ? await admin.staffAssignment.create({ data: { customerId: c.id, staffId: a.id, operatorId: runId } }) : null;
  return { a, b, c, assignment };
}
async function api(who, method, path, body, expected = 200, options = {}) {
  const headers = { ...(who ? { Cookie: who.cookie } : {}), Origin: 'http://localhost:8080' };
  if (method !== 'GET') Object.assign(headers, { 'Content-Type': 'application/json', 'X-Auth-Request': '1', 'X-CSRF-Token': who?.csrf ?? '' });
  if (options.noCsrf) delete headers['X-CSRF-Token'];
  if (options.origin) headers.Origin = options.origin;
  const response = await fetch((options.gateway ? 'http://gateway' : options.copilot ? copilotBase : base) + path,
    { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
  if (expected !== null) assert.equal(response.status, expected, `Unexpected status on ${method} test route: ${response.status}`);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return response.json();
}
async function create(g, kind = 'AI', key = randomUUID(), options = {}) {
  return api(g.c, 'POST', owned, { kind, clientRequestId: key, ...(kind === 'DIRECT' ? { expectedAssignmentVersion: 0 } : {}) }, 201, options);
}
function handoffBody(version = 0, assignmentVersion = 0, key = randomUUID()) {
  return { clientRequestId: key, expectedVersion: version, expectedAssignmentVersion: assignmentVersion,
    sharedSubject: 'Synthetic customer-shared request', sharedReason: 'Synthetic shared reason', consent };
}
async function request(g, id, input = handoffBody(), expected = 201, options = {}) {
  return api(g.c, 'POST', `${owned}/${id}/handoff-requests`, input, expected, options);
}
async function accept(g, id, key = randomUUID(), version = 1, expected = 200, options = {}) {
  return api(g.a, 'POST', `${staff}/${id}/accept`, { clientRequestId: key, expectedVersion: version }, expected, options);
}
async function assign(g, target, version) {
  return new AccountManagementService(admin).assign(g.c.id, { expectedVersion: version, staffId: target.id }, { operatorId: runId, requestId: randomUUID() });
}
before(async () => {
  app = await createConversationTestApp(core); base = await app.getUrl();
  copilotApp = await createConversationTestApp(core, { copilot: {
    dispatchRun: async () => ({ outcome: 'ACCEPTED' }), revokeAttempt: async () => null,
  } });
  copilotBase = await copilotApp.getUrl();
});
after(async () => {
  await Promise.all([app?.close(), copilotApp?.close()]);
  try {
    const convIds = (await admin.conversation.findMany({ where: { customerId: { in: userIds } }, select: { id: true } })).map(c => c.id);
    const msgIds = (await admin.message.findMany({ where: { conversationId: { in: convIds } }, select: { id: true } })).map(m => m.id);
    const docs = (await admin.document.findMany({ where: { productId: { in: products } }, select: { id: true } })).map(d => d.id);
    await admin.$transaction(async tx => {
      await tx.auditLog.deleteMany({ where: { OR: [{ actorId: { in: userIds } }, { operatorId: runId }, { targetId: { in: msgIds } }] } });
      await tx.outboxEvent.deleteMany({ where: { aggregateType: 'CONVERSATION', aggregateId: { in: convIds } } });
      await tx.conversationCommandReceipt.deleteMany({ where: { actorId: { in: userIds } } });
      await tx.notification.deleteMany({ where: { conversationId: { in: convIds } } });
      await tx.supportTicket.deleteMany({ where: { customerId: { in: userIds } } });
      await tx.agentRunEvent.deleteMany({ where: { run: { conversationId: { in: convIds } } } });
      await tx.agentRun.updateMany({ where: { conversationId: { in: convIds } }, data: { currentAttemptId: null } });
      await tx.agentAttempt.deleteMany({ where: { run: { conversationId: { in: convIds } } } });
      await tx.agentRun.deleteMany({ where: { conversationId: { in: convIds } } });
      await tx.message.deleteMany({ where: { conversationId: { in: convIds } } });
      await tx.conversationHandoff.deleteMany({ where: { conversationId: { in: convIds } } });
      await tx.conversation.deleteMany({ where: { id: { in: convIds } } });
      await tx.document.updateMany({ where: { id: { in: docs } }, data: { currentVersion: null } });
      await tx.documentVersion.deleteMany({ where: { documentId: { in: docs } } });
      await tx.document.deleteMany({ where: { id: { in: docs } } });
      await tx.insurancePolicy.deleteMany({ where: { productId: { in: products } } });
      await tx.insuranceProduct.deleteMany({ where: { id: { in: products } } });
      await tx.rateLimitBucket.deleteMany({ where: { clientToken: { in: userIds.map(hash) } } });
      await tx.authSession.deleteMany({ where: { userId: { in: userIds } } });
      await tx.staffAssignment.deleteMany({ where: { customerId: { in: userIds } } });
      await tx.customerProfile.deleteMany({ where: { userId: { in: userIds } } });
      await tx.staffProfile.deleteMany({ where: { userId: { in: userIds } } });
      await tx.user.deleteMany({ where: { id: { in: userIds } } });
    }, { timeout: 20000 });
  } finally { await Promise.all([core.$disconnect(), admin.$disconnect()]); }
});


const input = (content = 'Synthetic message', expectedVersion = 0, clientMessageId = randomUUID()) => ({ content, expectedVersion, clientMessageId });
const send = (who, root, id, body, status = 201, options = {}) => api(who, 'POST', `${root}/${id}/messages`, body, status, options);

const copilotApi = (who, method, id, body, status = 200, query = '') => api(who, method,
  `${staff}/${id}/copilot${method === 'POST' ? '/messages' : ''}${query}`, body, status, { copilot: true });
const question = content => ({ clientMessageId: randomUUID(), content });

async function currentAttempt(id) {
  for (let tries = 0; tries < 40; tries++) {
    const run = await admin.agentRun.findUniqueOrThrow({ where: { id } });
    if (run.currentAttemptId) return run;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.fail('Copilot did not claim the run.');
}

const answerEvent = (run, message) => ({ schema_version: 'agent-v1', run_id: run.id, attempt_id: run.currentAttemptId,
  event_id: randomUUID(), sequence: 1, kind: 'RESULT', payload: {
    result: { response_type: 'ANSWER', message, citations: [], actions: [] },
  } });

test('Copilot isolates staff threads, uses a frozen paged source and replays the correct run', async () => {
  const g = await group(), id = (await create(g, 'DIRECT')).conversation.id;
  const agent = copilotApp.get(AgentRunService), access = copilotApp.get(AgentAccessService);
  await copilotApi(g.c, 'GET', id, undefined, 403);
  await copilotApi(g.b, 'GET', id, undefined, 404);
  assert.deepEqual(await copilotApi(g.a, 'GET', id), { items: [], beforeCursor: null, activeRun: null });
  assert.equal(await admin.conversation.count({ where: { linkedContextConvId: id } }), 0);
  await admin.$transaction([
    admin.message.createMany({ data: Array.from({ length: 104 }, (_, index) => ({
      conversationId: id, sequence: BigInt(index + 1), senderType: index === 0 ? 'CUSTOMER' : index === 100 ? 'AI_AGENT' : 'SYSTEM',
      senderId: index === 0 ? g.c.id : null, audience: index >= 102 ? 'INTERNAL' : 'CUSTOMER_VISIBLE',
      content: index === 0 ? 'Synthetic pasted paragraph\fSecond line\tkept' : `Synthetic source ${index + 1}`,
    })) }),
    admin.conversation.update({ where: { id }, data: { nextMessageSequence: 104n } }),
  ]);
  const q = question('Which clause was discussed?');
  const [ack, retry] = await Promise.all([copilotApi(g.a, 'POST', id, q, null), copilotApi(g.a, 'POST', id, q, null)]);
  assert.equal(ack.id, retry.id);
  assert.equal(Number(ack.replayed) + Number(retry.replayed), 1);
  assert.equal((await copilotApi(g.a, 'POST', id, question('A different question'), 409)).code, 'COPILOT_BUSY');
  assert.equal((await copilotApi(g.a, 'POST', id, { ...q, content: 'Changed' }, 409)).code, 'IDEMPOTENCY_CONFLICT');
  const first = await currentAttempt(ack.id);
  assert.equal(first.linkedHistoryView.through_cursor, 'm1_102');
  assert.equal(await admin.conversation.count({ where: { linkedContextConvId: id } }), 1);
  await send(g.c, owned, id, input('Synthetic late message'));
  const p1 = await access.linkedHistory(first.id, first.currentAttemptId);
  const p2 = await access.linkedHistory(first.id, first.currentAttemptId, p1.nextCursor);
  assert.equal(p1.items.length, 100);
  assert.equal(p1.items[0].content, 'Synthetic pasted paragraph\nSecond line\tkept');
  assert.deepEqual(p2.items.map(({ senderType, position }) => [senderType, position]), [['AI_AGENT', '101'], ['SYSTEM', '102']]);
  assert.equal(p2.nextCursor, null);
  assert.equal((await admin.message.findUniqueOrThrow({ where: { id: p1.items[0].messageId } })).content,
    'Synthetic pasted paragraph\fSecond line\tkept');
  await admin.agentRun.update({ where: { id: first.id }, data: {
    linkedHistoryView: { ...first.linkedHistoryView, through_cursor: 'p1' },
  } });
  const legacy = await access.linkedHistory(first.id, first.currentAttemptId);
  assert.deepEqual(legacy.items.map(item => [item.kind, item.position, item.content]),
    [['USER_MESSAGE', '1', p1.items[0].content]]);
  await admin.agentRun.update({ where: { id: first.id }, data: { linkedHistoryView: first.linkedHistoryView } });
  assert.equal((await agent.applyEvent(answerEvent(first, 'Synthetic private Copilot answer'))).body.outcome, 'ACCEPTED');
  const history = await copilotApi(g.a, 'GET', id);
  assert.equal(history.items[0].answer.content, 'Synthetic private Copilot answer');
  assert.equal(history.items[0].sourceThroughSequence, '102');
  assert.equal(history.activeRun, null);
  await copilotApi(g.a, 'GET', first.conversationId, undefined, 404);
  const customerHistory = await api(g.c, 'GET', `${owned}/${id}/messages`);
  assert.doesNotMatch(JSON.stringify(customerHistory), /Synthetic private Copilot answer|Which clause was discussed/);

  const firstNew = question('What came next?'), secondNew = question('A competing tab');
  const sent = await Promise.all([copilotApi(g.a, 'POST', id, firstNew, null), copilotApi(g.a, 'POST', id, secondNew, null)]);
  assert.equal(sent.filter(result => result.code === 'COPILOT_BUSY').length, 1);
  const next = sent.find(result => result.id);
  const second = await currentAttempt(next.id);
  assert.equal(second.linkedHistoryView.through_cursor, 'm1_105');
  assert.deepEqual(await copilotApi(g.a, 'POST', id, q), { id: first.id, status: 'COMPLETED', replayed: true });
  assert.equal((await copilotApi(g.a, 'GET', id)).activeRun.id, second.id);
  const page = await copilotApi(g.a, 'GET', id, undefined, 200, '?limit=1');
  const older = await copilotApi(g.a, 'GET', id, undefined, 200, `?before=${page.beforeCursor}`);
  assert.deepEqual(older.items.map(turn => turn.id), [first.id]);

  await admin.agentRun.update({ where: { id: second.id }, data: { limits: { ...second.limits, deadline_at: new Date(0).toISOString() } } });
  const late = answerEvent(second, 'This expired result must not be published');
  assert.equal((await agent.applyEvent(late)).body.outcome, 'IGNORED_STALE');
  assert.equal((await agent.applyEvent(late)).body.outcome, 'DUPLICATE');
  const afterDeadline = await copilotApi(g.a, 'GET', id);
  assert.deepEqual(afterDeadline.items.map(turn => turn.status), ['COMPLETED', 'FAILED']);
  assert.equal(afterDeadline.items[1].answer, null);
});

test('Copilot source pages stay within the UTF-8 wire limit in both directions and cursor formats', async () => {
  const g = await group(), sourceId = (await create(g, 'DIRECT')).conversation.id;
  const access = copilotApp.get(AgentAccessService), { MAX_BODY_BYTES } = require('../dist/agent/hmac');
  const content = '\u1ec7\u{1f600}"\n'.repeat(1000);
  await admin.$transaction([
    admin.message.createMany({ data: Array.from({ length: 103 }, (_, index) => ({
      conversationId: sourceId, sequence: BigInt(index + 1), senderType: 'CUSTOMER', senderId: g.c.id, content,
      audience: index < 102 ? 'CUSTOMER_VISIBLE' : 'INTERNAL',
    })) }),
    admin.conversation.update({ where: { id: sourceId }, data: { nextMessageSequence: 103n } }),
  ]);
  const run = await currentAttempt((await copilotApi(g.a, 'POST', sourceId, question('Synthetic history question'), 201)).id);
  await send(g.c, owned, sourceId, input('Synthetic message after the watermark'));
  for (const legacy of [false, true]) {
    if (legacy) await admin.agentRun.update({ where: { id: run.id }, data: {
      linkedHistoryView: { ...run.linkedHistoryView, through_cursor: 'p203' },
    } });
    const positions = Array.from({ length: 102 }, (_, index) => String(legacy ? 2 * index + 1 : index + 1));
    for (const backward of [false, true]) {
      const read = cursor => access.linkedHistory(run.id, run.currentAttemptId, cursor, backward);
      const first = await read();
      const cursor = backward ? first.previousCursor : first.nextCursor;
      assert(Buffer.byteLength(JSON.stringify(first)) <= MAX_BODY_BYTES);
      assert(first.items.length < 100 && cursor);
      assert.equal(cursor, (legacy ? 'p' : 'm1_') + (backward ? first.items[0] : first.items.at(-1)).position);
      const second = await read(cursor);
      assert(Buffer.byteLength(JSON.stringify(second)) <= MAX_BODY_BYTES);
      assert.equal(backward ? second.previousCursor : second.nextCursor, null);
      const items = backward ? [...second.items, ...first.items] : [...first.items, ...second.items];
      assert.deepEqual(items.map(item => item.position), positions);
      assert(items.every(item => item.content === content));
    }
  }
});

test('Copilot recovers durable dispatch and revocation after a background rejection', async t => {
  const g = await group(), sourceId = (await create(g, 'DIRECT')).conversation.id;
  const agent = copilotApp.get(AgentRunService), access = copilotApp.get(AgentAccessService);
  const transport = copilotApp.get(AgentTransportService);
  const originalAuthorize = access.authorizeInTx.bind(access);
  let dispatchFailed;
  const dispatchFailure = new Promise(resolve => { dispatchFailed = resolve; });
  t.mock.method(access, 'authorizeInTx', async (...args) => {
    if (dispatchFailed) {
      dispatchFailed();
      dispatchFailed = null;
      throw new Error('Synthetic temporary database rejection');
    }
    return originalAuthorize(...args);
  });
  const ack = await copilotApi(g.a, 'POST', sourceId, question('Synthetic recoverable dispatch'), 201);
  const run = await currentAttempt(ack.id);
  await dispatchFailure;
  const attempt = () => admin.agentAttempt.findUniqueOrThrow({ where: { id: run.currentAttemptId } });
  assert.equal((await attempt()).state, 'DISPATCHING');
  await agent.reconcileTick();
  assert.equal((await attempt()).state, 'ACCEPTED');

  let revokeFailed;
  const revokeFailure = new Promise(resolve => { revokeFailed = resolve; });
  t.mock.method(transport, 'revokeAttempt', async () => {
    if (revokeFailed) {
      revokeFailed();
      revokeFailed = null;
      throw new Error('Synthetic temporary revocation rejection');
    }
    return { outcome: 'REVOKED', writer_epoch: '1' };
  });
  assert.equal(await agent.invalidateAttempt(run.currentAttemptId, 'CANCELLED_BY_CORE'), true);
  await revokeFailure;
  assert.equal((await attempt()).state, 'INVALIDATING');
  await agent.reconcileTick();
  assert.equal((await attempt()).state, 'INVALIDATED');
  assert.equal((await copilotApi(g.a, 'GET', sourceId)).items[0].status, 'CANCELLED');
});

test('Copilot reassignment cancels the old writer and expires a waiting run even without a revoke ACK', async () => {
  const g = await group(), id = (await create(g, 'AI')).conversation.id;
  await copilotApi(g.a, 'GET', id, undefined, 404);
  await request(g, id);
  await copilotApi(g.a, 'GET', id, undefined, 404);
  await accept(g, id);
  const q = question('Synthetic question before reassignment');
  const before = await currentAttempt((await copilotApi(g.a, 'POST', id, q, 201)).id);
  const agent = copilotApp.get(AgentRunService), access = copilotApp.get(AgentAccessService);
  await assign(g, g.b, 0);
  await copilotApi(g.a, 'POST', id, q, 404);
  await assert.rejects(() => access.linkedHistory(before.id, before.currentAttemptId), { code: 'INVALID_ATTEMPT' });
  await assert.rejects(() => access.linkedHistory(before.id, before.currentAttemptId, null, true), { code: 'INVALID_ATTEMPT' });
  assert.equal((await agent.applyEvent(answerEvent(before, 'Stale answer'))).body.outcome, 'IGNORED_STALE');
  await assign(g, g.a, 1);
  await request(g, id, handoffBody(3, 2));
  await accept(g, id, randomUUID(), 4);
  assert.deepEqual((await copilotApi(g.a, 'GET', id)).items.map(turn => [turn.id, turn.status]), [[before.id, 'CANCELLED']]);

  const waiting = await copilotApi(g.a, 'POST', id, question('Synthetic new question'), 201);
  const queued = await admin.agentRun.findUniqueOrThrow({ where: { id: waiting.id } });
  assert.equal(queued.status, 'QUEUED');
  await admin.agentRun.update({ where: { id: queued.id }, data: { limits: { ...queued.limits, deadline_at: new Date(0).toISOString() } } });
  await agent.reconcileTick();
  const failed = await admin.agentRun.findUniqueOrThrow({ where: { id: queued.id } });
  assert.equal(failed.status, 'FAILED');
  assert.equal(failed.currentAttemptId, null);
  assert.equal(await admin.outboxEvent.count({ where: { aggregateId: before.conversationId, eventType: 'COPILOT_RUN_CHANGED' } }), 2);
});

test('Copilot document scope distinguishes a missing policy from lost access to the linked transcript', async () => {
  const g = await group(), id = (await create(g, 'DIRECT')).conversation.id;
  const access = copilotApp.get(AgentAccessService);
  const run = await currentAttempt((await copilotApi(g.a, 'POST', id, question('Check policy terms'), 201)).id);
  const scope = (kind, policy_number = null) => access.scope(run.id, { attempt_id: run.currentAttemptId, kind, policy_number });
  const policyNumber = 'CP-' + randomUUID();
  assert.equal((await scope('PUBLIC')).decision, 'GRANTED');
  assert.equal((await scope('PRIVATE', policyNumber)).reason, 'NOT_AUTHORIZED');
  assert.deepEqual(await access.linkedHistory(run.id, run.currentAttemptId, run.linkedHistoryView.through_cursor),
    { items: [], nextCursor: null });

  // Lock the synthetic customer while the attempt stays current, so this exercises the source grant check.
  await admin.user.update({ where: { id: g.c.id }, data: { lockedUntil: new Date(Date.now() + 60000) } });
  await assert.rejects(() => access.linkedHistory(run.id, run.currentAttemptId), { code: 'NOT_AUTHORIZED' });
  for (const [kind, policy_number] of [['PUBLIC', null], ['PRIVATE', policyNumber]]) {
    assert.deepEqual(await scope(kind, policy_number), { decision: 'DENIED', kind, policy_number, reason: 'ATTEMPT_INVALID' });
  }
});

test('Copilot citations preserve source locators and pin the authorized document version', async () => {
  const g = await group(), id = (await create(g, 'DIRECT')).conversation.id;
  const agent = copilotApp.get(AgentRunService);
  const product = await admin.insuranceProduct.create({ data: { productCode: 'CP-' + randomUUID(), name: 'Synthetic citation product' } });
  products.push(product.id);
  const doc = await admin.document.create({ data: { title: 'Synthetic public terms', accessScope: 'PUBLIC', productId: product.id } });
  const version = (documentId, versionNumber) => admin.documentVersion.create({ data: { documentId, versionNumber,
    storageBucket: 'synthetic-tests', storageObjectKey: `not-uploaded/${randomUUID()}.pdf`, checksumSha256: '0'.repeat(64) } });
  const v1 = await version(doc.id, '1.0'), v2 = await version(doc.id, '2.0');
  const policy = await admin.insurancePolicy.create({ data: { policyNumber: 'CP-' + randomUUID(),
    productId: product.id, customerId: g.c.id, status: 'ACTIVE' } });
  const privateDoc = await admin.document.create({ data: { title: 'Synthetic policy contract', accessScope: 'PRIVATE_POLICY',
    ownerCustomerId: g.c.id, productId: product.id, policyId: policy.id } });
  const applied = await version(privateDoc.id, '1.0'), newer = await version(privateDoc.id, '2.0');
  const setApplied = version => admin.insurancePolicy.update({ where: { id: policy.id }, data: {
    benefitsSnapshot: { documents: { main: { documentId: privateDoc.id, kind: 'POLICY', version } } },
  } });
  await setApplied(applied.versionNumber);
  const setCurrent = currentVersion => admin.document.update({ where: { id: doc.id }, data: { currentVersion } });
  await setCurrent(v1.versionNumber);
  const run = await currentAttempt((await copilotApi(g.a, 'POST', id, question('Which terms apply?'), 201)).id);
  const location = { pages: [28, 29], clause: '4.2', anchor: 'limitations' };
  const event = answerEvent(run, 'Synthetic answer with source locators');
  const privateLocation = { anchor: 'claim-procedure' };
  event.payload.result.citations = [
    { evidence_id: 'synthetic-source', document_id: doc.id, document_version: v1.versionNumber,
      document_type: 'TERMS', title: 'Ignored agent title', location },
    { evidence_id: 'synthetic-policy', document_id: privateDoc.id, document_version: applied.versionNumber,
      document_type: 'CONTRACT', title: 'Ignored agent title', location: privateLocation },
  ];
  assert.equal((await agent.applyEvent(event)).body.outcome, 'ACCEPTED');
  const history = () => copilotApi(g.a, 'GET', id);
  const ref = { documentId: doc.id, versionId: v1.id, productId: product.id, policyId: null, label: doc.title };
  const privateRef = { documentId: privateDoc.id, versionId: applied.id, productId: product.id,
    policyId: policy.id, label: privateDoc.title, sourceLocation: privateLocation };
  assert.deepEqual((await history()).items[0].answer.citations, [{ ...ref, sourceLocation: location }, privateRef]);
  await setCurrent(v2.versionNumber);
  assert.deepEqual((await history()).items[0].answer.citations, [privateRef]);
  await setApplied(newer.versionNumber);
  assert.deepEqual((await history()).items[0].answer.citations, []);
  await setCurrent(v1.versionNumber);
  const { resultMessageId } = await admin.agentRun.findUniqueOrThrow({ where: { id: run.id } });
  await admin.message.update({ where: { id: resultMessageId }, data: { citations: [{ documentId: doc.id, versionId: v1.id, page: 28 }] } });
  assert.deepEqual((await history()).items[0].answer.citations, [{ ...ref, sourceLocation: null }]);
});

test('Reconcile claims eligible FIFO heads past a batch of blocked conversations', async () => {
  const g = await group(), sourceId = (await create(g, 'DIRECT')).conversation.id;
  const agent = copilotApp.get(AgentRunService);
  const blocked = Array.from({ length: 21 }, () => randomUUID());
  const ready = randomUUID(), copilot = randomUUID();
  const [head, following, staffRun, waiting] = await admin.$transaction(async tx => {
    await tx.conversation.createMany({ data: [...blocked, ready].map((id, i) => ({
      id, customerId: g.c.id, channelType: 'CUSTOMER_SUPPORT', supportOrigin: 'AI',
      createdByCustomerId: g.c.id, status: i === 20 ? 'STAFF_ACTIVE' : 'AI_ACTIVE', nextMessageSequence: 2n,
    })) });
    await tx.conversation.create({ data: { id: copilot, channelType: 'STAFF_COPILOT', customerId: g.c.id,
      assignedStaffId: g.a.id, linkedContextConvId: sourceId, status: 'AI_ACTIVE', nextMessageSequence: 1n } });
    async function enqueue(conversationId, sequence, linkedContextConversationId) {
      const message = await tx.message.create({ data: { conversationId, sequence: BigInt(sequence),
        senderId: linkedContextConversationId ? g.a.id : g.c.id, senderType: linkedContextConversationId ? 'STAFF' : 'CUSTOMER',
        audience: linkedContextConversationId ? 'INTERNAL' : 'CUSTOMER_VISIBLE',
        content: conversationId === ready && sequence === 1 ? 'Synthetic pasted text\fSecond line' : 'Synthetic recovery question' } });
      return agent.enqueueInTransaction(tx, { conversationId, messageId: message.id, queuePosition: BigInt(sequence), linkedContextConversationId });
    }
    const waitingIds = [];
    for (const [i, id] of blocked.entries()) {
      if (i < 20) {
        const old = await enqueue(id, 1);
        await tx.agentRun.update({ where: { id: old.id }, data: i < 10 ? { status: 'RUNNING' }
          : { status: 'CANCELLED', failure: { code: 'PERMISSION_DENIED', retryable: false } } });
        if (i >= 10) await tx.agentAttempt.create({ data: { runId: old.id, attemptNo: 1, state: 'INVALIDATING',
          request: {}, requestSha256: '0'.repeat(64), revocationReason: 'PERMISSION_CHANGED',
          nextDispatchAt: new Date(Date.now() + 60000) } });
      }
      waitingIds.push((await enqueue(id, 2)).id);
    }
    const second = await enqueue(ready, 2);
    return [await enqueue(ready, 1), second, await enqueue(copilot, 1, sourceId), waitingIds];
  }, { timeout: 15000 });
  await Promise.all([agent.reconcileTick(), agent.reconcileTick()]);
  const runningHead = await currentAttempt(head.id);
  assert.equal(runningHead.status, 'RUNNING');
  const attempt = await admin.agentAttempt.findUniqueOrThrow({ where: { id: runningHead.currentAttemptId } });
  assert.equal(attempt.request.message_text, 'Synthetic pasted text\nSecond line');
  assert.equal((await currentAttempt(staffRun.id)).status, 'RUNNING');
  assert.equal(await admin.agentAttempt.count({ where: { runId: { in: [head.id, staffRun.id] } } }), 2);
  assert.equal(await admin.agentRun.count({ where: { id: { in: [...waiting, following.id] }, status: 'QUEUED' } }), 22);
});

test('Direct two-way send, safe ACK projection, own-only lookup and no delivery claims', async () => {
  const g = await group(), id = (await create(g, 'DIRECT')).conversation.id;
  const body = input('Synthetic Customer message');
  const first = await send(g.c, owned, id, body);
  assert.equal(first.message.senderType, 'CUSTOMER'); assert.equal(first.message.content, body.content);
  assert.equal(first.message.clientMessageId, body.clientMessageId); assert.ok(first.message.sender.displayName);
  assert.equal(first.controlVersion, 0); assert.equal(first.replayed, false);
  assert.doesNotMatch(JSON.stringify(first), /senderId|toolCalls|audience|delivered|readAt/);
  const reply = await send(g.a, staff, id, input('Synthetic Staff reply'));
  assert.equal(reply.message.senderType, 'STAFF'); assert.ok(BigInt(reply.message.sequence) > BigInt(first.message.sequence));
  const found = await api(g.c, 'GET', `${owned}/${id}/messages/by-client-id/${body.clientMessageId}`);
  assert.equal(found.message.id, first.message.id);
  await api(g.a, 'GET', `${staff}/${id}/messages/by-client-id/${body.clientMessageId}`, undefined, 404);
  await send(g.b, staff, id, input(), 404);
});
test('pending Customer can send but Staff cannot read or send until Accept', async () => {
  const g = await group(), id = (await create(g)).conversation.id;
  await send(g.c, owned, id, input('Synthetic AI-private message'));
  await send(g.a, staff, id, input(), 404);
  await request(g, id);
  await send(g.c, owned, id, input('Synthetic pending message', 1));
  await send(g.a, staff, id, input('Synthetic denied', 1), 404);
  await api(g.a, 'GET', `${staff}/${id}/messages`, undefined, 404);
  await accept(g, id);
  const history = await api(g.a, 'GET', `${staff}/${id}/messages`);
  assert.ok(history.items.some(row => row.content === 'Synthetic AI-private message'));
  await send(g.a, staff, id, input('Synthetic accepted reply', 2));
});
test('concurrent same key makes one message/outbox/receipt; two keys same text remain separate', async () => {
  const g = await group(), id = (await create(g, 'DIRECT')).conversation.id, body = input();
  const result = await Promise.all(Array.from({ length: 4 }, () => api(g.c, 'POST', `${owned}/${id}/messages`, body, null).catch(e => { throw e; })));
  assert.equal(new Set(result.map(row => row.message.id)).size, 1);
  assert.equal(await admin.message.count({ where: { conversationId: id } }), 1);
  assert.equal(await admin.outboxEvent.count({ where: { aggregateId: id, eventType: 'MESSAGE_COMMITTED' } }), 1);
  await send(g.c, owned, id, input()); await send(g.c, owned, id, input());
  assert.equal(await admin.message.count({ where: { conversationId: id } }), 3);
});
test('replay normalizes CRLF, rejects changed payload/version and stale new intent', async () => {
  const g = await group(), id = (await create(g, 'DIRECT')).conversation.id, body = input('A\r\nB');
  const first = await send(g.c, owned, id, body);
  assert.equal(first.message.content, 'A\nB');
  const replay = await send(g.c, owned, id, { ...body, content: 'A\nB' }, 200);
  assert.equal(replay.message.id, first.message.id);
  assert.equal((await send(g.c, owned, id, { ...body, content: 'changed' }, 409)).code, 'IDEMPOTENCY_CONFLICT');
  await send(g.c, owned, id, { ...body, expectedVersion: 1 }, 409);
  assert.equal((await send(g.c, owned, id, input('stale', 99), 409)).code, 'STALE_CONVERSATION');
});
test('Unicode codepoint limit, blank and forged body validation', async () => {
  const g = await group(), id = (await create(g, 'DIRECT')).conversation.id;
  await send(g.c, owned, id, input('\u{1F600}'.repeat(4000)));
  for (const content of ['\u{1F600}'.repeat(4001), ' \n\t']) await send(g.c, owned, id, input(content), 400);
  for (const field of ['senderId', 'audience', 'citations', 'toolCallsMetadata', 'customerId']) await send(g.c, owned, id, { ...input(), [field]: 'forged' }, 400);
  await send(g.c, owned, id, input('<script>Synthetic text only</script>'));
});
test('CSRF, wrong origin/role and revoked session cannot send', async () => {
  const g = await group(), id = (await create(g, 'DIRECT')).conversation.id;
  await send(g.c, owned, id, input(), 403, { noCsrf: true });
  await send(g.c, owned, id, input(), 403, { origin: 'https://invalid.example' });
  await send(g.a, owned, id, input(), 403);
  await admin.authSession.update({ where: { id: g.c.sessionId }, data: { revokedAt: new Date() } });
  await send(g.c, owned, id, input(), 401);
});
test('reassignment denies old Staff replay and Direct Customer send', async () => {
  const g = await group(), id = (await create(g, 'DIRECT')).conversation.id, body = input();
  await send(g.a, staff, id, body); await assign(g, g.b, 0);
  await send(g.a, staff, id, body, 404);
  await api(g.a, 'GET', `${staff}/${id}/messages/by-client-id/${body.clientMessageId}`, undefined, 404);
  await send(g.c, owned, id, input(), 404);
});
test('outbox failure rolls back message, counter and receipt; same intent can then commit', async () => {
  const g = await group(), id = (await create(g, 'DIRECT')).conversation.id, body = input();
  const before = await admin.conversation.findUnique({ where: { id } });
  const commands = app.get(ConversationCommandService), original = commands.transaction.bind(commands);
  commands.transaction = work => core.$transaction(tx => work(new Proxy(tx, { get(target, key) {
    if (key === 'outboxEvent') return { create: async () => { throw new Error('Synthetic rollback'); } };
    const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
  } })));
  try { await send(g.c, owned, id, body, 500); } finally { commands.transaction = original; }
  assert.equal(await admin.message.count({ where: { conversationId: id } }), 0);
  assert.equal((await admin.conversation.findUnique({ where: { id } })).nextMessageSequence, before.nextMessageSequence);
  assert.equal(await admin.conversationCommandReceipt.count({ where: { actorId: g.c.id, operation: 'SEND_MESSAGE' } }), 0);
  await send(g.c, owned, id, body);
});
test('send quota is actor scoped and returns 429 without creating a message', async () => {
  const g = await group(), id = (await create(g, 'DIRECT')).conversation.id;
  await admin.rateLimitBucket.create({ data: { clientToken: hash(g.c.id), endpointGroup: 'CONVERSATION_SEND', requestCount: 60 } });
  await send(g.c, owned, id, input(), 429);
  await send(g.a, staff, id, input());
});
