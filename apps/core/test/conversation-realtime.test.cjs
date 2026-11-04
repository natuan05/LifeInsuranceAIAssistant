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
const runId = `i06-${randomUUID()}`, userIds = [], products = [];
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
  assert.equal(response.status, expected, `Unexpected status on ${method} test route: ${response.status}`);
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
before(async () => { app = await createConversationTestApp(core, { realtime: true }); base = await app.getUrl(); });
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


const { WebSocket } = require('ws');
const { ConversationEventService } = require('../dist/conversations/services/conversation-event.service');
const { RealtimeService } = require('../dist/realtime/realtime.service');
const { OutboxDispatcherService } = require('../dist/outbox/services/outbox-dispatcher.service');
const events = () => app.get(ConversationEventService);
const eventFor = (id, eventType) => admin.outboxEvent.findFirstOrThrow({ where: { aggregateId: id, eventType }, orderBy: { createdAt: 'desc' } });
async function eventually(check) { for (let i = 0; i < 150; i++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 10)); } assert.fail('Timed out waiting for synthetic realtime assertion'); }
async function socket(who) {
  const frames = [], ws = new WebSocket(base.replace('http:', 'ws:') + '/api/v1/realtime', { headers: { Cookie: who.cookie, Origin: 'http://localhost:8080' } });
  ws.on('message', data => frames.push(JSON.parse(String(data)))); ws.on('error', () => {});
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  await eventually(() => frames.some(frame => frame.type === 'ready'));
  return { ws, frames };
}

test('Accept appends one durable SYSTEM with Staff name, ordered with history, retry never duplicates', async () => {
  const g = await group(), id = (await create(g)).conversation.id;
  await api(g.c, 'POST', `${owned}/${id}/messages`, { clientMessageId: randomUUID(), expectedVersion: 0, content: 'Synthetic before consent' }, 201);
  await request(g, id); const key = randomUUID(); await accept(g, id, key); await accept(g, id, key, 1, 200);
  const owner = await api(g.c, 'GET', `${owned}/${id}/messages`), visible = owner.items.filter(row => row.senderType === 'SYSTEM');
  assert.equal(visible.length, 1); assert.match(visible[0].content, /Synthetic Workflow Staff.*accepted.*respond as soon as possible/);
  assert.ok(BigInt(visible[0].sequence) > BigInt(owner.items[0].sequence));
  const staffHistory = await api(g.a, 'GET', `${staff}/${id}/messages`);
  assert.equal(staffHistory.items.find(row => row.senderType === 'SYSTEM').id, visible[0].id);
  assert.equal(await admin.supportTicket.count({ where: { customerId: g.c.id } }), 0);
});
test('failure inserting SYSTEM rolls back acceptance, controller, receipt and sequence', async () => {
  const g = await group(), id = (await create(g)).conversation.id; await request(g, id);
  const commands = app.get(ConversationCommandService), original = commands.transaction.bind(commands);
  commands.transaction = work => core.$transaction(tx => work(new Proxy(tx, { get(target, key) {
    if (key === 'message') return { ...target.message, findUnique: target.message.findUnique.bind(target.message), create: async () => { throw new Error('Synthetic system failure'); } };
    const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
  } })));
  try { await accept(g, id, randomUUID(), 1, 500); } finally { commands.transaction = original; }
  const current = await admin.conversation.findUnique({ where: { id } });
  assert.equal(current.status, 'PENDING_HANDOFF'); assert.equal(current.controlVersion, 1); assert.equal(current.nextMessageSequence, 0n);
  assert.equal(await admin.message.count({ where: { conversationId: id } }), 0);
  assert.equal(await admin.conversationCommandReceipt.count({ where: { actorId: g.a.id, operation: 'ACCEPT_HANDOFF' } }), 0);
});
test('Direct has no accepted SYSTEM; a new consent/Accept after revoke gets a distinct system message', async () => {
  const g = await group(), direct = (await create(g, 'DIRECT')).conversation.id;
  assert.equal(await admin.message.count({ where: { conversationId: direct, senderType: 'SYSTEM' } }), 0);
  const id = (await create(g)).conversation.id; await request(g, id); await accept(g, id);
  await assign(g, g.b, 0); await request(g, id, handoffBody(3, 1));
  await api(g.b, 'POST', `${staff}/${id}/accept`, { clientRequestId: randomUUID(), expectedVersion: 4 });
  assert.equal(await admin.message.count({ where: { conversationId: id, senderType: 'SYSTEM' } }), 2);
});
test('events target owner only for AI/private and pending messages; accepted history targets current Staff', async () => {
  const g = await group(), id = (await create(g)).conversation.id;
  const event = { id: randomUUID(), aggregateId: id, eventType: 'MESSAGE_COMMITTED' };
  assert.deepEqual((await events().route(event)).map(row => row.actorId), [g.c.id]);
  await request(g, id); assert.deepEqual((await events().route(event)).map(row => row.actorId), [g.c.id]);
  await accept(g, id); const active = await events().route(event);
  assert.equal(active.length, 2); assert.ok(active.some(row => row.actorId === g.a.id && row.transcript));
  await assign(g, g.b, 0);
  const revoked = await events().route({ ...event, eventType: 'CONVERSATION_ACCESS_REVOKED' });
  assert.ok(revoked.some(row => row.actorId === g.a.id && row.scope)); assert.ok(!revoked.some(row => row.actorId === g.b.id));
});
test('handoff notification deduplicates, has generic content and scope before pagination; read is not Accept', async () => {
  const g = await group(), id = (await create(g)).conversation.id; await request(g, id);
  const event = await eventFor(id, 'HANDOFF_REQUESTED'); await events().route(event); await events().route(event);
  const list = await api(g.a, 'GET', '/api/v1/staff/notifications?limit=1'); assert.equal(list.items.length, 1);
  const item = list.items[0]; assert.equal(item.title, 'Staff support requested'); assert.equal(item.kind, 'HANDOFF_REQUESTED'); assert.equal(item.isRead, false);
  assert.equal(await admin.notification.count({ where: { conversationId: id } }), 1);
  await api(g.a, 'POST', `/api/v1/staff/notifications/${item.id}/read`, {}, 200);
  await api(g.a, 'POST', `/api/v1/staff/notifications/${item.id}/read`, {}, 200);
  assert.equal((await api(g.a, 'GET', `${staff}/${id}`)).conversation.allowedActions.readMessages, false);
  await api(g.b, 'POST', `/api/v1/staff/notifications/${item.id}/read`, {}, 404);
  await api(g.a, 'POST', `/api/v1/staff/notifications/${item.id}/read`, {}, 403, { noCsrf: true });
  await assign(g, g.b, 0);
  assert.equal((await api(g.a, 'GET', '/api/v1/staff/notifications')).items.length, 0);
  await api(g.a, 'POST', `/api/v1/staff/notifications/${item.id}/read`, {}, 404);
});
test('late pending event after Accept does not create a stale request notification', async () => {
  const g = await group(), id = (await create(g)).conversation.id; await request(g, id); const event = await eventFor(id, 'HANDOFF_REQUESTED'); await accept(g, id);
  await events().route(event);
  // Any notification created while genuinely pending remains safe; routing this late event creates none.
  const existing = await admin.notification.count({ where: { conversationId: id } }); await events().route(event);
  assert.equal(await admin.notification.count({ where: { conversationId: id } }), existing);
  const g2 = await group(), id2 = (await create(g2)).conversation.id; await request(g2, id2);
  const pendingEvent = await eventFor(id2, 'HANDOFF_REQUESTED');
  const commands = app.get(ConversationCommandService), original = commands.lock.bind(commands);
  let entered, release, first = true;
  const ready = new Promise(resolve => { entered = resolve; }), resume = new Promise(resolve => { release = resolve; });
  commands.lock = async (...args) => { if (first) { first = false; entered(); await resume; } return original(...args); };
  let routing;
  try {
    routing = events().route(pendingEvent); await ready; await accept(g2, id2); release();
    assert.ok((await routing).every(recipient => !recipient.notification));
  } finally { release(); commands.lock = original; }
});
test('notification cursor is actor-bound and limits/unknown fields are rejected', async () => {
  const g = await group();
  for (let i = 0; i < 2; i++) { const id = (await create(g)).conversation.id; await request(g, id); await events().route(await eventFor(id, 'HANDOFF_REQUESTED')); }
  const first = await api(g.a, 'GET', '/api/v1/staff/notifications?limit=1'); assert.equal(first.pageInfo.hasMore, true);
  const second = await api(g.a, 'GET', `/api/v1/staff/notifications?limit=1&cursor=${first.pageInfo.nextCursor}`);
  assert.notEqual(first.items[0].id, second.items[0].id);
  await api(g.b, 'GET', `/api/v1/staff/notifications?cursor=${first.pageInfo.nextCursor}`, undefined, 400);
  await api(g.a, 'GET', '/api/v1/staff/notifications?limit=51', undefined, 400);
  await api(g.a, 'GET', '/api/v1/staff/notifications?counts=true', undefined, 400);
  await api(g.c, 'GET', '/api/v1/staff/notifications', undefined, 403);
});
test('worker crash after notification commit retries to one notification; failed attempts reach DLQ safely', async () => {
  const g = await group(), id = (await create(g)).conversation.id; await request(g, id);
  const event = await eventFor(id, 'HANDOFF_REQUESTED');
  const worker = new OutboxDispatcherService({ prisma: core }, events(), { publishChat: async () => { throw new Error('Synthetic transient'); } });
  await admin.outboxEvent.update({ where: { id: event.id }, data: { status: 'PROCESSING', leaseOwner: worker.owner, leaseExpiresAt: new Date(Date.now() + 60000), retryCount: 1 } });
  await worker.process({ ...event, retryCount: 1 });
  const failed = await admin.outboxEvent.findUnique({ where: { id: event.id } }); assert.equal(failed.status, 'PENDING'); assert.equal(failed.lastError, 'DISPATCH_FAILED');
  assert.equal(await admin.notification.count({ where: { conversationId: id } }), 1);
  await admin.outboxEvent.update({ where: { id: event.id }, data: { status: 'PROCESSING', leaseOwner: worker.owner, leaseExpiresAt: new Date(Date.now() + 60000), retryCount: 8 } });
  await worker.process({ ...event, retryCount: 8 }); assert.equal((await admin.outboxEvent.findUnique({ where: { id: event.id } })).status, 'FAILED_DLQ');
  const ok = new OutboxDispatcherService({ prisma: core }, events(), { publishChat: async () => {} });
  await admin.outboxEvent.update({ where: { id: event.id }, data: { status: 'PROCESSING', leaseOwner: ok.owner, leaseExpiresAt: new Date(Date.now() + 60000) } });
  await ok.process({ ...event, retryCount: 1 }); await ok.process({ ...event, retryCount: 1 });
  assert.equal((await admin.outboxEvent.findUnique({ where: { id: event.id } })).status, 'PUBLISHED');
  assert.equal(await admin.notification.count({ where: { conversationId: id } }), 1);
});
test('two claimers never hold the same valid lease; expired claims recover and another owner cannot mark', async () => {
  const g = await group(), id = (await create(g)).conversation.id, event = await eventFor(id, 'CONVERSATION_CREATED');
  const one = new OutboxDispatcherService({ prisma: core }, events(), { publishChat: async () => {} });
  const two = new OutboxDispatcherService({ prisma: core }, events(), { publishChat: async () => {} });
  await admin.outboxEvent.update({ where: { id: event.id }, data: { status: 'PROCESSING', leaseOwner: 'expired-synthetic', leaseExpiresAt: new Date(0) } });
  const claimed = (await Promise.all([one.claim(), two.claim()])).flat().filter(row => row.id === event.id); assert.ok(claimed.length <= 1);
  const held = await admin.outboxEvent.findUnique({ where: { id: event.id } }); assert.ok(['PROCESSING', 'PUBLISHED'].includes(held.status));
  await admin.outboxEvent.update({ where: { id: event.id }, data: { status: 'PROCESSING', leaseOwner: one.owner, leaseExpiresAt: new Date(Date.now() + 60000) } });
  await two.process({ ...event, retryCount: 1 }); assert.equal((await admin.outboxEvent.findUnique({ where: { id: event.id } })).leaseOwner, one.owner);
});
test('socket projection has no content/sequence; session revoke and receive-only policy stay enforced', async () => {
  const g = await group(), id = (await create(g, 'DIRECT')).conversation.id;
  const connection = await socket(g.a);
  try {
    const event = { id: randomUUID(), aggregateId: id, eventType: 'MESSAGE_COMMITTED' };
    await app.get(RealtimeService).publishChat(event, await events().route(event));
    await eventually(() => connection.frames.some(row => row.eventId === event.id));
    const frame = connection.frames.find(row => row.eventId === event.id);
    assert.deepEqual(Object.keys(frame).sort(), ['conversationId', 'eventId', 'type']);
    const closed = new Promise(resolve => connection.ws.once('close', code => resolve(code))); connection.ws.send('{}'); assert.equal(await closed, 1008);
  } finally { connection.ws.terminate(); }
  const revoked = await socket(g.a);
  try {
    await admin.authSession.update({ where: { id: g.a.sessionId }, data: { revokedAt: new Date() } });
    const closed = new Promise(resolve => revoked.ws.once('close', code => resolve(code)));
    await app.get(RealtimeService).publishChat({ id: randomUUID(), aggregateId: id, eventType: 'MESSAGE_COMMITTED' }, [{ actorId: g.a.id, role: 'STAFF', transcript: true }]);
    assert.equal(await closed, 4001); assert.equal(revoked.frames.filter(row => row.type === 'chat-invalidated').length, 0);
  } finally { revoked.ws.terminate(); }
});
test('socket rechecks grant immediately before send, even if a recipient was resolved before reassignment', async () => {
  const g = await group(), id = (await create(g, 'DIRECT')).conversation.id, event = { id: randomUUID(), aggregateId: null, eventType: 'MESSAGE_COMMITTED' }; event.aggregateId = id;
  const recipients = await events().route(event), connection = await socket(g.a);
  try { await assign(g, g.b, 0); await app.get(RealtimeService).publishChat(event, recipients); assert.equal(connection.frames.filter(row => row.type === 'chat-invalidated').length, 0); }
  finally { connection.ws.terminate(); }
});
