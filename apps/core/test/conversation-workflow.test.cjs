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
const runId = `i03-${randomUUID()}`, userIds = [], products = [];
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
async function seedMessage(input) {
  const message = await admin.message.create(input);
  await admin.conversation.update({ where: { id: message.conversationId }, data: { nextMessageSequence: message.sequence } });
  return message;
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

test('Customer creates AI-private and Direct with server provenance, routing and full consent text', async () => {
  const g = await group();
  const support = await api(g.c, 'GET', '/api/v1/customers/me/chat-support');
  assert.equal(support.availability, 'AVAILABLE'); assert.equal(support.assignmentVersion, 0);
  assert.equal(support.handoffConsent.scope, consent.scope);
  const ai = (await create(g)).conversation, direct = (await create(g, 'DIRECT')).conversation;
  assert.equal(ai.status, 'AI_ACTIVE'); assert.equal(direct.status, 'STAFF_ACTIVE');
  const row = await admin.conversation.findUnique({ where: { id: direct.id } });
  assert.equal(row.createdByCustomerId, g.c.id); assert.equal(row.directAssignmentId, g.assignment.id); assert.equal(row.assignedStaffId, g.a.id);
  await api(g.a, 'GET', `${staff}/${ai.id}`, undefined, 404);
  assert.equal((await api(g.a, 'GET', `${staff}/${direct.id}`)).conversation.entryType, 'DIRECT');
  assert.equal((await api(g.c, 'GET', owned)).items.length, 2);
});

test('no Staff, locked Staff, wrong routing, forged actor and invalid consent cannot create grants', async () => {
  const g = await group(false), ai = (await create(g)).conversation;
  assert.equal((await api(g.c, 'GET', '/api/v1/customers/me/chat-support')).availability, 'UNASSIGNED');
  assert.equal((await api(g.c, 'POST', owned, { kind: 'DIRECT', clientRequestId: randomUUID(), expectedAssignmentVersion: 0 }, 409)).code, 'STAFF_UNAVAILABLE');
  assert.equal((await request(g, ai.id, handoffBody(), 409)).code, 'STAFF_UNAVAILABLE');
  for (const invalid of [undefined, { ...consent, confirmed: false }, { ...consent, scope: 'PARTIAL' }, { ...consent, textVersion: 'bad' }, [consent]]) {
    const body = handoffBody(); if (invalid === undefined) delete body.consent; else body.consent = invalid;
    await request(g, ai.id, body, 400);
  }
  await api(g.c, 'POST', owned, { kind: 'AI', clientRequestId: randomUUID(), expectedAssignmentVersion: 0 }, 400);
  await api(g.c, 'POST', owned, { kind: 'AI', clientRequestId: randomUUID(), customerId: g.a.id }, 400);
  assert.equal(await admin.conversationHandoff.count({ where: { conversationId: ai.id } }), 0);
});

test('write endpoints require Customer/Staff role, CSRF, Origin and exact query/body fields', async () => {
  const g = await group();
  const body = { kind: 'AI', clientRequestId: randomUUID() };
  await api(g.c, 'POST', owned, body, 403, { noCsrf: true });
  await api(g.c, 'POST', owned, body, 403, { origin: 'http://untrusted.invalid' });
  await api(g.a, 'POST', owned, body, 403);
  await api(null, 'GET', owned, undefined, 401);
  await api(g.c, 'POST', owned + '?mode=direct', body, 400);
  await api(g.c, 'GET', owned + '?page=1', undefined, 400);
  const ai = (await create(g)).conversation;
  const other = await actor('CUSTOMER');
  await api(other, 'GET', `${owned}/${ai.id}`, undefined, 404);
  await api(other, 'POST', `${owned}/${ai.id}/handoff-requests`, handoffBody(), 404);
  await api(g.a, 'POST', `${staff}/${ai.id}/accept`, { clientRequestId: randomUUID(), expectedVersion: 0 }, 404);
});

test('create retry and same-key races return one conversation, audit, event and receipt', async () => {
  const g = await group(), key = randomUUID(), body = { kind: 'AI', clientRequestId: key, subject: 'Synthetic intent' };
  const responses = await Promise.all(Array.from({ length: 4 }, () => fetch(base + owned, { method: 'POST', headers: {
    Cookie: g.c.cookie, Origin: 'http://localhost:8080', 'Content-Type': 'application/json', 'X-Auth-Request': '1', 'X-CSRF-Token': g.c.csrf }, body: JSON.stringify(body) })));
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 200, 200, 201]);
  const replies = await Promise.all(responses.map(r => r.json()));
  assert.equal(new Set(replies.map(r => r.conversation.id)).size, 1);
  const id = replies[0].conversation.id;
  assert.equal(await admin.conversation.count({ where: { customerId: g.c.id } }), 1);
  assert.equal(await admin.outboxEvent.count({ where: { aggregateId: id } }), 1);
  assert.equal(await admin.auditLog.count({ where: { targetId: id } }), 1);
  assert.equal((await api(g.c, 'POST', owned, { ...body, subject: 'Different' }, 409)).code, 'IDEMPOTENCY_CONFLICT');
  const receipt = await api(g.c, 'GET', `/api/v1/customers/me/conversation-commands/${key}?operation=CREATE_AI`);
  assert.equal(receipt.conversationId, id);
  await api(g.c, 'GET', `/api/v1/customers/me/conversation-commands/${randomUUID()}?operation=CREATE_AI`, undefined, 404);
});

test('lookup 404 during in-flight create is unknown outcome; same-key retry recovers one commit', async () => {
  const g = await group(), key = randomUUID(), commands = app.get(ConversationCommandService), original = commands.transaction.bind(commands);
  let reached, release;
  const ready = new Promise(resolve => { reached = resolve; }), resume = new Promise(resolve => { release = resolve; });
  commands.transaction = work => original(tx => work(new Proxy(tx, { get(target, property) {
    if (property === 'outboxEvent') return { create: async input => { reached(); await resume; return target.outboxEvent.create(input); } };
    const value = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value;
  } })));
  let creating;
  try {
    creating = create(g, 'AI', key); await ready;
    await api(g.c, 'GET', `/api/v1/customers/me/conversation-commands/${key}?operation=CREATE_AI`, undefined, 404);
    release(); await creating;
  } finally { release(); commands.transaction = original; }
  const replay = await api(g.c, 'POST', owned, { kind: 'AI', clientRequestId: key }, 200);
  assert.equal(replay.replayed, true);
  assert.equal(await admin.conversation.count({ where: { customerId: g.c.id } }), 1);
});

test('Direct replay after rerouting never creates a new grant; a new stale intent conflicts', async () => {
  const g = await group(), key = randomUUID(), first = (await create(g, 'DIRECT', key)).conversation;
  await assign(g, g.b, 0);
  const old = await api(g.c, 'POST', owned, { kind: 'DIRECT', clientRequestId: key, expectedAssignmentVersion: 0 }, 200);
  assert.equal(old.conversation.id, first.id); assert.equal(old.conversation.allowedActions.send, false);
  assert.equal((await api(g.c, 'POST', owned, { kind: 'DIRECT', clientRequestId: randomUUID(), expectedAssignmentVersion: 0 }, 409)).code, 'ROUTING_CHANGED');
  await api(g.b, 'GET', `${staff}/${first.id}/messages`, undefined, 404);
});

test('request requires explicit full-history consent, exposes only shared metadata and creates no Ticket', async () => {
  const g = await group(), ai = (await create(g)).conversation;
  const sent = await request(g, ai.id);
  assert.equal(sent.conversation.status, 'PENDING_HANDOFF'); assert.equal(sent.conversation.controlVersion, 1);
  const metadata = (await api(g.a, 'GET', `${staff}/${ai.id}`)).conversation;
  assert.equal(metadata.subject, 'Synthetic customer-shared request'); assert.equal(metadata.allowedActions.readMessages, false);
  await api(g.a, 'GET', `${staff}/${ai.id}/messages`, undefined, 404);
  assert.equal(await admin.supportTicket.count({ where: { customerId: g.c.id } }), 0);
  assert.equal(await admin.notification.count({ where: { conversationId: ai.id } }), 0);
  const evidence = await admin.conversationHandoff.findUnique({ where: { id: sent.request.id } });
  assert.equal(evidence.confirmedByCustomerId, g.c.id); assert.equal(evidence.assignmentId, g.assignment.id);
  const event = await admin.outboxEvent.findFirst({ where: { aggregateId: ai.id, eventType: 'HANDOFF_REQUESTED' } });
  assert.deepEqual(Object.keys(event.payload).sort(), ['controlVersion', 'requestId', 'schemaVersion']);
});

test('request retry and lookup reconcile original commit; new keys do not create duplicate pending requests', async () => {
  const g = await group(), ai = (await create(g)).conversation, body = handoffBody();
  const first = await request(g, ai.id, body), replay = await request(g, ai.id, body, 200);
  assert.equal(first.request.id, replay.request.id); assert.equal(replay.replayed, true);
  assert.equal((await request(g, ai.id, handoffBody(), 409)).code, 'HANDOFF_ALREADY_PENDING');
  assert.equal((await request(g, ai.id, { ...body, sharedSubject: 'Different' }, 409)).code, 'IDEMPOTENCY_CONFLICT');
  assert.equal((await api(g.c, 'GET', `/api/v1/customers/me/conversation-commands/${body.clientRequestId}?operation=REQUEST_HANDOFF`)).resourceId, first.request.id);
  assert.equal(await admin.conversationHandoff.count({ where: { conversationId: ai.id } }), 1);
});

test('Accept commits current grant/control atomically, supports same-key retries and full-history reads', async () => {
  const g = await group(), ai = (await create(g)).conversation, key = randomUUID();
  await seedMessage({ data: { conversationId: ai.id, sequence: 1n, senderType: 'AI_AGENT', audience: 'CUSTOMER_VISIBLE', content: 'Synthetic before handoff', createdAt: new Date('2020-01-01') } });
  await request(g, ai.id); const accepted = await accept(g, ai.id, key);
  assert.equal(accepted.conversation.status, 'STAFF_ACTIVE'); assert.equal(accepted.conversation.controlVersion, 2);
  assert.equal(accepted.conversation.allowedActions.readMessages, true);
  assert.equal((await accept(g, ai.id, key)).replayed, true);
  assert.equal((await accept(g, ai.id, randomUUID(), 1, 409)).code, 'ALREADY_ACCEPTED');
  const receipt = await api(g.a, 'GET', `${staff}/${ai.id}/commands/${key}?operation=ACCEPT_HANDOFF`);
  assert.equal(receipt.conversationId, ai.id);
  const history = await api(g.a, 'GET', `${staff}/${ai.id}/messages`);
  assert.equal(history.items[0].content, 'Synthetic before handoff');
  await api(g.b, 'GET', `${staff}/${ai.id}/messages`, undefined, 404);
  await api(g.b, 'GET', `${staff}/${ai.id}/commands/${key}?operation=ACCEPT_HANDOFF`, undefined, 404);
  assert.equal(await admin.outboxEvent.count({ where: { aggregateId: ai.id, eventType: 'HANDOFF_ACCEPTED' } }), 1);
  assert.equal(await admin.supportTicket.count({ where: { customerId: g.c.id } }), 0);
});

test('stale versions and two concurrent Accept intents have exactly one transition', async () => {
  const g = await group(), ai = (await create(g)).conversation; await request(g, ai.id);
  assert.equal((await accept(g, ai.id, randomUUID(), 0, 409)).code, 'STALE_CONVERSATION');
  const send = () => fetch(base + `${staff}/${ai.id}/accept`, { method: 'POST', headers: {
    Cookie: g.a.cookie, Origin: 'http://localhost:8080', 'Content-Type': 'application/json', 'X-Auth-Request': '1', 'X-CSRF-Token': g.a.csrf },
    body: JSON.stringify({ clientRequestId: randomUUID(), expectedVersion: 1 }) });
  const results = await Promise.all([send(), send()]); assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal((await admin.conversation.findUnique({ where: { id: ai.id } })).controlVersion, 2);
});

test('Customer transcript has before/after scrolling across 130 old messages, internal gaps and large bigint keys', async () => {
  const g = await group(), ai = (await create(g)).conversation;
  const first = 9007199254740993n;
  await admin.message.createMany({ data: Array.from({ length: 132 }, (_, i) => ({ conversationId: ai.id, sequence: first + BigInt(i),
    senderType: i % 2 ? 'AI_AGENT' : 'CUSTOMER', senderId: i % 2 ? null : g.c.id,
    audience: i === 40 ? 'INTERNAL' : i === 41 ? 'LEGACY_REVIEW' : 'CUSTOMER_VISIBLE',
    content: i === 40 || i === 41 ? 'PRIVATE_INTERNAL_SENTINEL' : `Synthetic history ${i}`, toolCallsMetadata: { secret: 'PRIVATE_TOOL_SENTINEL' },
    createdAt: new Date('2020-01-01') })) });
  await admin.conversation.update({ where: { id: ai.id }, data: { nextMessageSequence: first + 131n } });
  const owner = await api(g.c, 'GET', `${owned}/${ai.id}/messages?limit=50`); assert.equal(owner.items.length, 50);
  await request(g, ai.id); await accept(g, ai.id);
  let body = await api(g.a, 'GET', `${staff}/${ai.id}/messages?limit=50`), all = [...body.items];
  const catchup = body.pageInfo.afterCursor;
  while (body.pageInfo.hasMoreBefore) {
    body = await api(g.a, 'GET', `${staff}/${ai.id}/messages?limit=50&before=${body.pageInfo.beforeCursor}`);
    all = [...body.items, ...all];
  }
  assert.equal(all.length, 131); assert.equal(new Set(all.map(m => m.id)).size, 131);
  assert.ok(all.every((m, i) => !i || BigInt(all[i - 1].sequence) < BigInt(m.sequence)));
  assert.doesNotMatch(JSON.stringify(all), /PRIVATE_INTERNAL_SENTINEL|PRIVATE_TOOL_SENTINEL|toolCallsMetadata|senderId/);
  await admin.message.createMany({ data: Array.from({ length: 8 }, (_, i) => ({ conversationId: ai.id, sequence: first + 133n + BigInt(i),
    senderType: 'AI_AGENT', audience: 'CUSTOMER_VISIBLE', content: 'Synthetic new history' })) });
  let cursor = catchup, fresh = [];
  do {
    body = await api(g.a, 'GET', `${staff}/${ai.id}/messages?limit=3&after=${cursor}`);
    fresh.push(...body.items); cursor = body.pageInfo.afterCursor;
  } while (body.pageInfo.hasMoreAfter);
  assert.equal(fresh.length, 8);
  await api(g.a, 'GET', `${staff}/${ai.id}/messages?before=${catchup}`, undefined, 400);
  await api(g.c, 'GET', `${owned}/${ai.id}/messages?after=${catchup}`, undefined, 400);
  await api(g.a, 'GET', `${staff}/${ai.id}/messages?before=${cursor}&after=${cursor}`, undefined, 400);
});

test('empty transcript has a real zero boundary for catch-up and cursor cannot bypass another conversation', async () => {
  const g = await group(), one = (await create(g, 'DIRECT')).conversation, two = (await create(g, 'DIRECT')).conversation;
  const empty = await api(g.a, 'GET', `${staff}/${one.id}/messages`);
  assert.deepEqual(empty.items, []); assert.equal(empty.pageInfo.beforeCursor, null); assert.ok(empty.pageInfo.afterCursor);
  await seedMessage({ data: { conversationId: one.id, sequence: 1n, senderType: 'AI_AGENT', audience: 'CUSTOMER_VISIBLE', content: 'Synthetic first' } });
  assert.equal((await api(g.a, 'GET', `${staff}/${one.id}/messages?after=${empty.pageInfo.afterCursor}`)).items.length, 1);
  await api(g.a, 'GET', `${staff}/${two.id}/messages?after=${empty.pageInfo.afterCursor}`, undefined, 400);
});

test('reassignment revokes old receipts and requires a new Customer confirmation and Accept', async () => {
  const g = await group(), ai = (await create(g)).conversation, oldKey = randomUUID(); await request(g, ai.id); await accept(g, ai.id, oldKey);
  await assign(g, g.b, 0);
  await api(g.a, 'GET', `${staff}/${ai.id}/messages`, undefined, 404);
  await api(g.a, 'GET', `${staff}/${ai.id}/commands/${oldKey}?operation=ACCEPT_HANDOFF`, undefined, 404);
  await api(g.b, 'GET', `${staff}/${ai.id}/messages`, undefined, 404);
  assert.equal((await request(g, ai.id, handoffBody(3, 0), 409)).code, 'ROUTING_CHANGED');
  await request(g, ai.id, handoffBody(3, 1));
  await api(g.b, 'POST', `${staff}/${ai.id}/accept`, { clientRequestId: randomUUID(), expectedVersion: 4 });
  await api(g.b, 'GET', `${staff}/${ai.id}/messages`);
  assert.equal((await api(g.c, 'GET', `${owned}/${ai.id}`)).conversation.entryType, 'TRANSFERRED');
});

test('revoked Direct keeps history ownership but cannot send until an explicit new handoff', async () => {
  const g = await group(), direct = (await create(g, 'DIRECT')).conversation;
  await assign(g, g.b, 0);
  const detail = (await api(g.c, 'GET', `${owned}/${direct.id}`)).conversation;
  assert.equal(detail.allowedActions.readMessages, true); assert.equal(detail.allowedActions.send, false); assert.equal(detail.allowedActions.requestStaff, true);
  await request(g, direct.id, handoffBody(1, 1));
  await api(g.b, 'POST', `${staff}/${direct.id}/accept`, { clientRequestId: randomUUID(), expectedVersion: 2 });
  assert.equal((await api(g.b, 'GET', `${staff}/${direct.id}`)).conversation.entryType, 'TRANSFERRED');
});

test('AI append is fenced immediately after request and after Accept', async () => {
  const g = await group(), ai = (await create(g)).conversation, service = app.get(ConversationMessageService);
  const before = await service.appendAI(g.c.id, ai.id, randomUUID(), 0, 'Synthetic earlier AI', async () => {});
  assert.ok(before.id); await request(g, ai.id);
  await assert.rejects(service.appendAI(g.c.id, ai.id, randomUUID(), 0, 'Synthetic late AI', async () => {}), e => e.getStatus() === 409);
  await accept(g, ai.id);
  await assert.rejects(service.appendAI(g.c.id, ai.id, randomUUID(), 2, 'Synthetic late AI', async () => {}), e => e.getStatus() === 409);
});

test('an injected failure after status update rolls back request, audit, outbox and receipt', async () => {
  const g = await group(), ai = (await create(g)).conversation;
  const commands = app.get(ConversationCommandService), original = commands.transaction.bind(commands);
  commands.transaction = work => core.$transaction(tx => work(new Proxy(tx, { get(target, key) {
    if (key === 'outboxEvent') return { create: async () => { throw new Error('Synthetic rollback'); } };
    const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
  } })));
  try { await request(g, ai.id, handoffBody(), 500); } finally { commands.transaction = original; }
  const current = await admin.conversation.findUnique({ where: { id: ai.id } });
  assert.equal(current.status, 'AI_ACTIVE'); assert.equal(current.controlVersion, 0);
  assert.equal(await admin.conversationHandoff.count({ where: { conversationId: ai.id } }), 0);
  assert.equal(await admin.auditLog.count({ where: { targetId: ai.id, action: 'HANDOFF_REQUESTED' } }), 0);
  assert.equal(await admin.conversationCommandReceipt.count({ where: { actorId: g.c.id, operation: 'REQUEST_HANDOFF' } }), 0);
});

test('uncommitted Accept grants no history; queued reassignment revokes the committed grant', async () => {
  const g = await group(), ai = (await create(g)).conversation; await request(g, ai.id);
  const commands = app.get(ConversationCommandService), original = commands.transaction.bind(commands);
  let reached, release;
  const atBarrier = new Promise(resolve => { reached = resolve; });
  const continueCommit = new Promise(resolve => { release = resolve; });
  commands.transaction = work => original(tx => work(new Proxy(tx, { get(target, key) {
    if (key === 'outboxEvent') return { create: async input => {
      if (input.data.eventType === 'HANDOFF_ACCEPTED') { reached(); await continueCommit; }
      return target.outboxEvent.create(input);
    } };
    const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
  } })));
  let receiving;
  try {
    receiving = accept(g, ai.id); await atBarrier;
    await api(g.a, 'GET', `${staff}/${ai.id}/messages`, undefined, 404);
    const changing = assign(g, g.b, 0); release();
    await receiving; await changing;
  } finally { release(); commands.transaction = original; }
  await api(g.a, 'GET', `${staff}/${ai.id}/messages`, undefined, 404);
  await api(g.b, 'GET', `${staff}/${ai.id}/messages`, undefined, 404);
  assert.equal((await admin.conversation.findUnique({ where: { id: ai.id } })).assignedStaffId, null);
});

test('Accept outbox failure rolls back acceptance, controller, controlVersion and receipt', async () => {
  const g = await group(), ai = (await create(g)).conversation; await request(g, ai.id);
  const commands = app.get(ConversationCommandService), original = commands.transaction.bind(commands);
  commands.transaction = work => original(tx => work(new Proxy(tx, { get(target, key) {
    if (key === 'outboxEvent') return { create: async () => { throw new Error('Synthetic Accept failure'); } };
    const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
  } })));
  try { await accept(g, ai.id, randomUUID(), 1, 500); } finally { commands.transaction = original; }
  const current = await admin.conversation.findUnique({ where: { id: ai.id } });
  assert.equal(current.status, 'PENDING_HANDOFF'); assert.equal(current.controlVersion, 1); assert.equal(current.assignedStaffId, null);
  const evidence = await admin.conversationHandoff.findFirst({ where: { conversationId: ai.id } });
  assert.equal(evidence.state, 'PENDING'); assert.equal(evidence.acceptedAt, null);
  assert.equal(await admin.conversationCommandReceipt.count({ where: { actorId: g.a.id, operation: 'ACCEPT_HANDOFF' } }), 0);
});

test('citations use current ownership and exact applied versions, never raw labels/storage or foreign policies', async () => {
  const g = await group(), other = await actor('CUSTOMER'), ai = (await create(g)).conversation;
  const product = await admin.insuranceProduct.create({ data: { productCode: `I03-${randomUUID()}`, name: 'Synthetic I03 product' } });
  products.push(product.id);
  const policy = await admin.insurancePolicy.create({ data: { policyNumber: `I03-${randomUUID()}`, productId: product.id, customerId: g.c.id, status: 'ACTIVE' } });
  const foreignPolicy = await admin.insurancePolicy.create({ data: { policyNumber: `I03-${randomUUID()}`, productId: product.id, customerId: other.id, status: 'ACTIVE' } });
  const ownDoc = await admin.document.create({ data: { title: 'Synthetic own policy', productId: product.id, accessScope: 'PRIVATE_POLICY', policyId: policy.id, ownerCustomerId: g.c.id } });
  const publicDoc = await admin.document.create({ data: { title: 'Synthetic public guide', productId: product.id, accessScope: 'PUBLIC' } });
  const foreignDoc = await admin.document.create({ data: { title: 'PRIVATE_FOREIGN_TITLE', productId: product.id, accessScope: 'PRIVATE_POLICY', policyId: foreignPolicy.id, ownerCustomerId: other.id } });
  const version = (documentId, versionNumber, isActive = true) => admin.documentVersion.create({ data: { documentId, versionNumber, isActive,
    storageBucket: 'synthetic-i03', storageObjectKey: `not-uploaded/${randomUUID()}.pdf`, checksumSha256: '0'.repeat(64) } });
  const correct = await version(ownDoc.id, '1.0'), wrong = await version(ownDoc.id, '2.0'), inactive = await version(ownDoc.id, '3.0', false);
  const pub = await version(publicDoc.id, '1.0'), foreign = await version(foreignDoc.id, '1.0');
  await admin.insurancePolicy.update({ where: { id: policy.id }, data: { benefitsSnapshot: { documents: {
    main: { documentId: ownDoc.id, version: '1.0', kind: 'POLICY' },
    guide: { documentId: publicDoc.id, version: '1.0', kind: 'PRODUCT_GUIDE' },
  } } } });
  await admin.conversation.update({ where: { id: ai.id }, data: { linkedPolicyId: policy.id } });
  const citation = v => ({ documentId: v.documentId, versionId: v.id, page: 1, label: 'PRIVATE_UNTRUSTED_LABEL', storageObjectKey: 'PRIVATE_KEY' });
  await seedMessage({ data: { conversationId: ai.id, sequence: 1n, senderType: 'AI_AGENT', audience: 'CUSTOMER_VISIBLE',
    content: 'Synthetic cited history', citations: [citation(correct), citation(wrong), citation(inactive), citation(pub), citation(foreign), { ...citation(correct), page: 0 }],
    toolCallsMetadata: { private: 'PRIVATE_TOOL_PAYLOAD' } } });
  const ownerHistory = await api(g.c, 'GET', `${owned}/${ai.id}/messages`);
  assert.deepEqual(ownerHistory.items[0].citations.map(c => c.versionId).sort(), [correct.id, pub.id].sort());
  const existingCatalog = await api(g.a, 'GET', `/api/v1/staff/policies/${policy.id}/documents`, undefined, 200, { gateway: true });
  assert.deepEqual(existingCatalog.items.map(v => v.versionId).sort(), [correct.id, pub.id].sort());
  await request(g, ai.id); await accept(g, ai.id);
  const staffHistory = await api(g.a, 'GET', `${staff}/${ai.id}/messages`);
  assert.deepEqual(staffHistory.items[0].citations, ownerHistory.items[0].citations);
  assert.doesNotMatch(JSON.stringify(staffHistory), /PRIVATE_FOREIGN_TITLE|PRIVATE_UNTRUSTED_LABEL|PRIVATE_KEY|PRIVATE_TOOL_PAYLOAD|storageObjectKey/);
  await admin.documentVersion.update({ where: { id: correct.id }, data: { isActive: false } });
  assert.deepEqual((await api(g.a, 'GET', `${staff}/${ai.id}/messages`)).items[0].citations.map(c => c.versionId), [pub.id]);
  const general = (await create(g)).conversation;
  await seedMessage({ data: { conversationId: general.id, sequence: 1n, senderType: 'AI_AGENT', audience: 'CUSTOMER_VISIBLE',
    content: 'Synthetic general public reference', citations: [citation(pub), citation(foreign), citation(wrong)] } });
  assert.deepEqual((await api(g.c, 'GET', `${owned}/${general.id}/messages`)).items[0].citations.map(c => c.versionId), [pub.id]);
});

test('legacy data remains review-only and Copilot is absent from Customer entry/history', async () => {
  const g = await group();
  const legacy = await admin.conversation.create({ data: { customerId: g.c.id, channelType: 'CUSTOMER_SUPPORT', supportOrigin: 'LEGACY_UNKNOWN', status: 'AI_ACTIVE' } });
  const copilot = await admin.conversation.create({ data: { customerId: g.c.id, channelType: 'STAFF_COPILOT', status: 'STAFF_ACTIVE', assignedStaffId: g.a.id } });
  assert.equal((await api(g.c, 'GET', `${owned}/${legacy.id}`)).conversation.availability, 'REVIEW_REQUIRED');
  await api(g.c, 'GET', `${owned}/${legacy.id}/messages`, undefined, 404);
  await request(g, legacy.id, handoffBody(), 404);
  await api(g.c, 'GET', `${owned}/${copilot.id}`, undefined, 404);
  assert.deepEqual((await api(g.c, 'GET', owned)).items.map(r => r.id), [legacy.id]);
});

test('routing unavailability, command quotas and receipt ownership are checked from current DB state', async () => {
  const g = await group();
  await admin.user.update({ where: { id: g.a.id }, data: { lockedUntil: new Date(Date.now() + 60000) } });
  assert.equal((await api(g.c, 'GET', '/api/v1/customers/me/chat-support')).availability, 'STAFF_UNAVAILABLE');
  assert.equal((await api(g.c, 'POST', owned, { kind: 'DIRECT', clientRequestId: randomUUID(), expectedAssignmentVersion: 0 }, 409)).code, 'STAFF_UNAVAILABLE');
  await admin.rateLimitBucket.upsert({ where: { clientToken_endpointGroup: { clientToken: hash(g.c.id), endpointGroup: 'CONVERSATION_CREATE' } },
    create: { clientToken: hash(g.c.id), endpointGroup: 'CONVERSATION_CREATE', requestCount: 10, windowStart: new Date() }, update: { requestCount: 10, windowStart: new Date() } });
  assert.equal((await api(g.c, 'POST', owned, { kind: 'AI', clientRequestId: randomUUID() }, 429)).code, 'RATE_LIMITED');
});

test('Customer list cursor stays actor-bound and excludes private fields and Copilot', async () => {
  const g = await group(); for (let i = 0; i < 3; i++) await create(g);
  const initial = await api(g.c, 'GET', owned + '?limit=1'); assert.ok(initial.pageInfo.hasMore);
  const next = await api(g.c, 'GET', owned + '?limit=1&cursor=' + initial.pageInfo.nextCursor);
  assert.notEqual(initial.items[0].id, next.items[0].id);
  const other = await actor('CUSTOMER'); await api(other, 'GET', owned + '?cursor=' + initial.pageInfo.nextCursor, undefined, 400);
  assert.doesNotMatch(JSON.stringify(initial), /aiSummary|toolCallsMetadata|passwordHash|"total"|"count"/);
});

test('deployed gateway runs full create/request/Accept/history with genuine sessions', async () => {
  const g = await group(), options = { gateway: true };
  const ai = (await create(g, 'AI', randomUUID(), options)).conversation;
  await seedMessage({ data: { conversationId: ai.id, sequence: 1n, senderType: 'AI_AGENT', audience: 'CUSTOMER_VISIBLE', content: 'Synthetic gateway history' } });
  await request(g, ai.id, handoffBody(), 201, options);
  await api(g.a, 'GET', `${staff}/${ai.id}/messages`, undefined, 404, options);
  await accept(g, ai.id, randomUUID(), 1, 200, options);
  const transcript = await api(g.a, 'GET', `${staff}/${ai.id}/messages`, undefined, 200, options);
  assert.equal(transcript.items[0].content, 'Synthetic gateway history');
  const spec = await (await fetch('http://gateway/api/v1/docs-json')).json();
  assert.ok(spec.paths[owned]?.post); assert.ok(spec.paths[`${staff}/{conversationId}/messages`]?.get);
  assert.ok(spec.paths[`${staff}/{conversationId}/messages`]?.post);
});
