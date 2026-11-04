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
const { createConversationTestApp } = require('./support/conversation-test.module.cjs');
process.env.NODE_ENV = 'test'; process.env.CORS_ORIGINS = 'http://localhost:8080';
const runId = `i05-${randomUUID()}`, userIds = [], products = [];
const hash = value => createHash('sha256').update(value).digest('hex');
function client(role, path) { return new PrismaClient({ adapter: new PrismaPg({ host: process.env.PGHOST,
  database: process.env.I01_TEST_DATABASE, user: role, password: readFileSync(path, 'utf8').trim(), max: 8 }) }); }
const admin = client('admin_runtime', '/credentials/admin/password'), core = client('core_runtime', '/credentials/core/password');
let app, base;
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
  const response = await fetch((options.gateway ? 'http://gateway' : base) + path,
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
before(async () => { app = await createConversationTestApp(core); base = await app.getUrl(); });
after(async () => {
  await app?.close();
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
