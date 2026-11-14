// Runs in Docker core-tests with isolated synthetic rows; never resets shared data.
require('reflect-metadata');
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient, Prisma } = require('../dist/generated/prisma/client');
const { DatabaseService } = require('../dist/database/database.service');
const { AuthService, tokenHash } = require('../dist/auth/services/auth.service');
const { TicketDraftService } = require('../dist/tickets/services/ticket-draft.service');
const { TicketService } = require('../dist/tickets/services/ticket.service');
const { TicketAccessService } = require('../dist/tickets/services/ticket-access.service');
const { TicketCursorService } = require('../dist/tickets/services/ticket-cursor.service');
const { ConversationAccessService } = require('../dist/conversations/services/conversation-access.service');
const { ConversationCommandService } = require('../dist/conversations/services/conversation-command.service');
const { StaffTicketController } = require('../dist/tickets/controllers/staff-ticket.controller');
const { CustomerTicketController } = require('../dist/tickets/controllers/customer-ticket.controller');
const { configureHttp } = require('../dist/http/http-foundation');
process.env.NODE_ENV = 'test';
const users = [], conversations = [];
const client = role => new PrismaClient({ adapter: new PrismaPg({
  host: process.env.PGHOST, database: process.env.I01_TEST_DATABASE,
  user: role + '_runtime', password: readFileSync('/credentials/' + role + '/password', 'utf8').trim(), max: 3,
}) });
const admin = client('admin'), core = client('core');
class TestModule {}
Module({ controllers: [CustomerTicketController, StaffTicketController], providers: [
  AuthService, TicketDraftService, TicketService, TicketAccessService, TicketCursorService,
  ConversationAccessService, ConversationCommandService, { provide: DatabaseService, useValue: { prisma: core } },
] })(TestModule);
let app, base, owner, other, staff, conversationId, foreignConversationId, draft;
const content = { title: 'Synthetic draft', description: 'Synthetic service request' };
const origin = (process.env.TEST_CORS_ORIGINS || 'http://localhost:8080').split(',')[0].trim();
process.env.CORS_ORIGINS = origin;
async function actor(role) {
  const id = randomUUID(); users.push(id);
  await admin.user.create({ data: {
    id, role, accountCode: (role === 'STAFF' ? 'STF-' : 'CUS-') + BigInt('0x' + id.replaceAll('-', '')).toString().slice(0, 22),
    email: id + '@synthetic.invalid', passwordHash: 'synthetic-not-for-login',
    ...(role === 'STAFF' ? { staffProfile: { create: { fullName: 'Synthetic Staff' } } }
      : { customerProfile: { create: { fullName: 'Synthetic Customer' } } }),
  } });
  const token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex');
  const session = await admin.authSession.create({ data: {
    userId: id, tokenHash: tokenHash(token), csrfTokenHash: tokenHash(csrf), expiresAt: new Date(Date.now() + 3600000),
  } });
  return { id, csrf, sessionId: session.id, cookie: 'li_session=' + token + '; li_csrf=' + csrf };
}
async function conversation(customerId) {
  const id = randomUUID(); conversations.push(id);
  await admin.conversation.create({ data: { id, customerId, createdByCustomerId: customerId, channelType: 'CUSTOMER_SUPPORT',
    supportOrigin: 'AI', status: 'AI_ACTIVE', subject: 'Synthetic Phase 0' } });
  return id;
}
const path = (id = draft.id, conv = conversationId) => '/customers/me/conversations/' + conv + '/ticket-drafts/' + id;
async function call(method, route, who, body, expected, code, override = {}, gateway = false) {
  const headers = { ...(who ? { Cookie: who.cookie } : {}), ...(method === 'GET' ? {} : {
    Origin: origin, 'Content-Type': 'application/json',
    'X-Auth-Request': '1', 'X-CSRF-Token': who?.csrf ?? '',
  }), ...override };
  for (const key of Object.keys(headers)) if (headers[key] === null) delete headers[key];
  const response = await fetch((gateway ? 'http://gateway' : base) + '/api/v1' + route, { method, headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
  const data = await response.json();
  assert.equal(response.status, expected, method + ' ' + route + ': ' + JSON.stringify(data));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  if (expected >= 400) {
    assert.deepEqual(Object.keys(data).sort(), ['code', 'message', 'requestId', 'statusCode', 'timestamp']);
    if (code) assert.equal(data.code, code);
    assert.doesNotMatch(JSON.stringify(data), /passwordHash|tokenHash|SELECT|UPDATE|Prisma|Synthetic service request|Synthetic draft/);
  }
  return data;
}
before(async () => {
  owner = await actor('CUSTOMER'); other = await actor('CUSTOMER'); staff = await actor('STAFF');
  conversationId = await conversation(owner.id); foreignConversationId = await conversation(other.id);
  draft = await admin.ticketDraft.create({ data: { customerId: owner.id, conversationId, ...content,
    expiresAt: new Date(Date.now() + 1800000) } });
  app = await NestFactory.create(TestModule, { logger: false });
  configureHttp(app, { origins: [origin], docsEnabled: true });
  await app.listen(0, '127.0.0.1'); base = await app.getUrl();
});
beforeEach(async () => { await admin.rateLimitBucket.deleteMany({ where: { clientToken: { in: users.map(tokenHash) }, endpointGroup: 'CUSTOMER_TICKET_WRITE' } }); });

after(async () => {
  try {
    await app?.close();
    if (users.length) await admin.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM business.users WHERE id::text IN (${Prisma.join([...users].sort())}) ORDER BY id FOR UPDATE`;
      const tickets = await tx.supportTicket.findMany({ where: { customerId: { in: users } }, select: { id: true } });
      const ticketIds = tickets.map(ticket => ticket.id);
      await tx.notification.deleteMany({ where: { OR: [
        { ticketId: { in: ticketIds } }, { conversationId: { in: conversations } },
      ] } });
      await tx.outboxEvent.deleteMany({ where: { aggregateId: { in: [...ticketIds, ...conversations] } } });
      await tx.auditLog.deleteMany({ where: { OR: [{ actorId: { in: users } }, { targetId: { in: ticketIds } }] } });
      await tx.supportTicket.deleteMany({ where: { customerId: { in: users } } });
      await tx.ticketDraft.deleteMany({ where: { customerId: { in: users } } });
      await tx.conversation.deleteMany({ where: { id: { in: conversations } } });
      await tx.authSession.deleteMany({ where: { userId: { in: users } } });
      await tx.staffAssignment.deleteMany({ where: { OR: [{ customerId: { in: users } }, { staffId: { in: users } }] } });
      await tx.customerProfile.deleteMany({ where: { userId: { in: users } } });
      await tx.staffProfile.deleteMany({ where: { userId: { in: users } } });
      await tx.rateLimitBucket.deleteMany({ where: { clientToken: { in: users.map(tokenHash) } } });
      await tx.user.deleteMany({ where: { id: { in: users } } });
    });
    assert.equal(await admin.ticketDraft.count({ where: { customerId: { in: users } } }), 0);
    assert.equal(await admin.user.count({ where: { id: { in: users } } }), 0);
  } finally { await Promise.all([admin.$disconnect(), core.$disconnect()]); }
});
test('A0-02: all draft routes enforce session, Customer role and write headers before accessing data', async () => {
  const routes = [
    ['GET', path(), undefined],
    ['PUT', path(), { expectedVersion: 1, ...content }],
    ['POST', path('propose'), content],
  ];
  const before = await admin.ticketDraft.count({ where: { customerId: { in: users } } });
  for (const [method, route, body] of routes) {
    await call(method, route, null, body, 401);
    await call(method, route, staff, body, 403);
    await admin.authSession.update({ where: { id: owner.sessionId }, data: { revokedAt: new Date() } });
    await call(method, route, owner, body, 401);
    await admin.authSession.update({ where: { id: owner.sessionId }, data: {
      revokedAt: null, createdAt: new Date(Date.now() - 60000), expiresAt: new Date(Date.now() - 1000),
    } });
    await call(method, route, owner, body, 401);
    await admin.authSession.update({ where: { id: owner.sessionId }, data: { expiresAt: new Date(Date.now() + 3600000) } });
    if (method !== 'GET') for (const headers of [
      { Origin: null }, { Origin: 'https://outside.synthetic.invalid' },
      { 'X-CSRF-Token': null }, { 'X-CSRF-Token': '0'.repeat(64) }, { 'X-Auth-Request': null },
    ]) await call(method, route, owner, body, 403, undefined, headers);
  }
  assert.equal(await admin.ticketDraft.count({ where: { customerId: { in: users } } }), before);
  assert.equal((await admin.ticketDraft.findUniqueOrThrow({ where: { id: draft.id } })).version, 1);
});
test('A0-03: owner and conversation binding share safe 404 responses; valid read/write still work', async () => {
  await call('GET', path(), other, undefined, 404);
  await call('GET', path(draft.id, foreignConversationId), owner, undefined, 404);
  await call('GET', path(randomUUID()), owner, undefined, 404);
  await call('PUT', path(), other, { expectedVersion: 1, ...content }, 404);
  await call('PUT', path(draft.id, foreignConversationId), owner, { expectedVersion: 1, ...content }, 404);
  await call('POST', path('propose', foreignConversationId), owner, content, 404);
  const read = await call('GET', path(), owner, undefined, 200);
  assert.equal(read.draft.id, draft.id); assert.equal(read.confirmation.textVersion, 'ticket-v1');
  const edited = await call('PUT', path(), owner, { expectedVersion: 1, ...content, title: 'Updated synthetic draft' }, 200);
  assert.equal(edited.draft.version, 2);
  const created = await call('POST', path('propose'), owner, content, 201);
  assert.equal(created.draft.conversationId, conversationId);
  assert.equal((await admin.ticketDraft.findUniqueOrThrow({ where: { id: created.draft.id } })).customerId, owner.id);
});
test('A0-03: all four draft conflicts survive the real HTTP safe-error filter', async () => {
  const expired = await admin.ticketDraft.create({ data: { customerId: owner.id, conversationId, ...content,
    expiresAt: new Date(Date.now() - 1000) } });
  const confirmed = await admin.ticketDraft.create({ data: { customerId: owner.id, conversationId, ...content,
    state: 'CONFIRMED', expiresAt: new Date(Date.now() + 1800000) } });
  await call('GET', path(expired.id), owner, undefined, 409, 'DRAFT_EXPIRED');
  await call('PUT', path(expired.id), owner, { expectedVersion: 1, ...content }, 409, 'DRAFT_EXPIRED');
  await call('PUT', path(), owner, { expectedVersion: 999, ...content }, 409, 'STALE_DRAFT');
  await call('PUT', path(confirmed.id), owner, { expectedVersion: 1, ...content }, 409, 'DRAFT_NOT_EDITABLE');
  const confirm = draftId => ({ clientRequestId: randomUUID(), draftId, expectedDraftVersion: 1,
    confirmation: { confirmed: true, textVersion: 'ticket-v1' } });
  await call('POST', '/customers/me/tickets', owner, confirm(confirmed.id), 409, 'DRAFT_ALREADY_CONFIRMED');
  await call('POST', '/customers/me/tickets', owner, confirm(expired.id), 409, 'DRAFT_EXPIRED');
  assert.equal(await admin.supportTicket.count({ where: { customerId: { in: users } } }), 0);
});
test('A0 Docker gateway: deployed module uses the same Customer draft boundaries', async () => {
  await call('GET', path(), null, undefined, 401, undefined, {}, true);
  await call('GET', path(), staff, undefined, 403, undefined, {}, true);
  await call('GET', path(), other, undefined, 404, undefined, {}, true);
  const read = await call('GET', path(), owner, undefined, 200, undefined, {}, true);
  await call('PUT', path(), owner, { expectedVersion: read.draft.version, ...content }, 200, undefined, {}, true);
  await call('POST', path('propose'), owner, content, 201, undefined, {}, true);
});
test('A0 expired draft GET stays read-only while a concurrent writer holds its row lock', async () => {
  const expired = await admin.ticketDraft.create({ data: { customerId: owner.id, conversationId, ...content,
    expiresAt: new Date(Date.now() - 1000) } });
  let release, acquired, timer, request;
  const hold = new Promise(resolve => { release = resolve; });
  const ready = new Promise(resolve => { acquired = resolve; });
  const locker = admin.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM business.ticket_drafts WHERE id=${expired.id}::uuid FOR UPDATE`;
    acquired();
    await hold;
  }, { timeout: 10000 });
  try {
    await Promise.race([ready, locker.then(() => { throw new Error('Row lock ended before acquisition'); })]);
    request = call('GET', path(expired.id), owner, undefined, 409, 'DRAFT_EXPIRED');
    await Promise.race([request, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Expired draft GET waited for a writer lock')), 3000);
    })]);
  } finally {
    clearTimeout(timer); release(); await locker;
    await request?.catch(() => {});
  }
  assert.equal((await admin.ticketDraft.findUniqueOrThrow({ where: { id: expired.id } })).state, 'DRAFT');
});


const manual = (key = randomUUID(), extra = {}) => ({ clientRequestId: key, title: '  Synthetic request  ', description: '  Synthetic detail  ', policyId: '', ...extra });
const confirmRequest = (id, key = randomUUID(), version = 1) => ({ clientRequestId: key, draftId: id, expectedDraftVersion: version, confirmation: { confirmed: true, textVersion: 'ticket-v1' } });
const resetWrites = () => admin.rateLimitBucket.deleteMany({ where: { clientToken: tokenHash(owner.id), endpointGroup: 'CUSTOMER_TICKET_WRITE' } });
async function proposed(title = 'Synthetic revision') {
  return (await call('POST', path('propose'), owner, { title, description: 'Synthetic detail' }, 201)).draft;
}
test('A2-01 normalized input and exact confirmation reject invalid creates without business side effects', async () => {
  const count = await admin.supportTicket.count({ where: { customerId: owner.id } });
  for (const extra of [{ title: '  ' }, { description: '\t  ' }, { unexpected: true }]) await call('POST', '/customers/me/tickets/manual', owner, manual(undefined, extra), 400);
  const d = await proposed();
  for (const confirmation of [{ confirmed: false, textVersion: 'ticket-v1' }, { confirmed: true, textVersion: 'wrong' }, { textVersion: 'ticket-v1' }]) {
    await call('POST', '/customers/me/tickets', owner, { ...confirmRequest(d.id), confirmation }, 400);
  }
  assert.equal(await admin.supportTicket.count({ where: { customerId: owner.id } }), count);
});
test('A2-02 manual fingerprint replays normalized input, rejects changed input/operation and hides another actor receipt', async () => {
  const dto = manual();
  const created = await call('POST', '/customers/me/tickets/manual', owner, dto, 200);
  const replay = await call('POST', '/customers/me/tickets/manual', owner, { ...dto, title: dto.title.trim(), description: dto.description.trim(), policyId: null }, 200);
  assert.equal(replay.replayed, true); assert.equal(replay.ticket.id, created.ticket.id);
  await call('POST', '/customers/me/tickets/manual', owner, { ...dto, title: 'Different' }, 409, 'IDEMPOTENCY_CONFLICT');
  await call('POST', '/customers/me/tickets/manual', other, dto, 404);
  await call('GET', '/customers/me/tickets/by-client-request-id/' + dto.clientRequestId, other, undefined, 404);
  const receipt = await call('GET', '/customers/me/tickets/by-client-request-id/' + dto.clientRequestId, owner, undefined, 200);
  assert.equal(receipt.ticket.id, created.ticket.id);
  const d = await proposed();
  await call('POST', '/customers/me/tickets', owner, confirmRequest(d.id, dto.clientRequestId), 409, 'IDEMPOTENCY_CONFLICT');
  const saved = await admin.supportTicket.findUniqueOrThrow({ where: { id: created.ticket.id } });
  assert.match(saved.requestFingerprint, /^[a-f0-9]{64}$/); assert.equal(saved.title, 'Synthetic request');
});
test('A2-03 concurrent same-key creates commit exactly one Ticket, audit and outbox', async () => {
  const dto = manual();
  const responses = await Promise.all([call('POST', '/customers/me/tickets/manual', owner, dto, 200), call('POST', '/customers/me/tickets/manual', owner, dto, 200)]);
  assert.equal(responses[0].ticket.id, responses[1].ticket.id);
  assert.equal(responses.filter(r => !r.replayed).length, 1);
  const id = responses[0].ticket.id;
  assert.equal(await admin.auditLog.count({ where: { targetId: id, action: 'TICKET_CREATED' } }), 1);
  assert.equal(await admin.outboxEvent.count({ where: { aggregateId: id, eventType: 'TICKET_CREATED' } }), 1);
});
test('A2-03 competing confirmations and edits use the same lock/CAS and preserve immutable revision', async () => {
  const d = await proposed();
  const edit = { expectedVersion: 1, title: '  Edited revision  ', description: '  Edited detail  ', policyId: null };
  const send = (method, route, body) => fetch(base + '/api/v1' + route, { method, headers: { Cookie: owner.cookie, Origin: origin, 'Content-Type': 'application/json', 'X-Auth-Request': '1', 'X-CSRF-Token': owner.csrf }, body: JSON.stringify(body) });
  const edits = await Promise.all([send('PUT', path(d.id), edit), send('PUT', path(d.id), edit)]);
  assert.deepEqual(edits.map(r => r.status).sort(), [200, 409]);
  const saved = await admin.ticketDraft.findUniqueOrThrow({ where: { id: d.id } });
  const { ticketHash } = require('../dist/tickets/dto/ticket-content');
  assert.equal(saved.payloadHash, ticketHash({ title: 'Edited revision', description: 'Edited detail', policyId: null }));
  const payload = confirmRequest(d.id, randomUUID(), 2);
  const results = await Promise.all([send('POST', '/customers/me/tickets', payload), send('POST', '/customers/me/tickets', { ...payload, clientRequestId: randomUUID() })]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal(await admin.supportTicket.count({ where: { sourceDraftId: d.id } }), 1);
  const ticket = await admin.supportTicket.findUniqueOrThrow({ where: { sourceDraftId: d.id } });
  assert.equal(ticket.confirmedContent.draftVersion, 2); assert.equal(ticket.confirmedContent.description, 'Edited detail');
  const replay = await call('POST', '/customers/me/tickets', owner, payload, results[0].status === 200 ? 200 : 409, results[0].status === 200 ? undefined : 'DRAFT_ALREADY_CONFIRMED');
  if (replay.ticket) assert.equal(replay.ticket.id, ticket.id);
  await call('PUT', path(d.id), owner, { ...edit, expectedVersion: 2 }, 409, 'DRAFT_NOT_EDITABLE');
});
test('A2-03 edit versus confirm never overwrites a consumed draft', async () => {
  const d = await proposed();
  const send = (route, method, body) => fetch(base + '/api/v1' + route, { method, headers: { Cookie: owner.cookie, Origin: origin, 'Content-Type': 'application/json', 'X-Auth-Request': '1', 'X-CSRF-Token': owner.csrf }, body: JSON.stringify(body) });
  const responses = await Promise.all([send(path(d.id), 'PUT', { expectedVersion: 1, title: 'Changed', description: 'Changed' }), send('/customers/me/tickets', 'POST', confirmRequest(d.id))]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  const current = await admin.ticketDraft.findUniqueOrThrow({ where: { id: d.id } });
  const ticket = await admin.supportTicket.findUnique({ where: { sourceDraftId: d.id } });
  if (ticket) { assert.equal(current.state, 'CONFIRMED'); assert.equal(ticket.confirmedContent.title, 'Synthetic revision'); }
  else { assert.equal(current.version, 2); assert.equal(current.state, 'DRAFT'); }
});
test('A2-05 Customer list validates all query fields, uses stable ties and enforces a separate quota', async () => {
  for (const query of ['page=NaN', 'page=1.5', 'page=0', 'page=100001', 'pageSize=51', 'status=unknown', 'x=1', 'page=1&page=2', 'search=%00']) {
    await call('GET', '/customers/me/tickets?' + query, owner, undefined, 400);
  }
  await admin.supportTicket.updateMany({ where: { customerId: owner.id }, data: { createdAt: new Date('2027-01-01T00:00:00Z') } });
  const first = await call('GET', '/customers/me/tickets?pageSize=1', owner, undefined, 200);
  const second = await call('GET', '/customers/me/tickets?pageSize=1&page=2', owner, undefined, 200);
  assert.equal(first.total, second.total); assert.notEqual(first.items[0].id, second.items[0].id);
  const rows = await admin.supportTicket.findMany({ where: { customerId: owner.id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  assert.equal(first.items[0].id, rows[0].id); assert.equal(second.items[0].id, rows[1].id);
  for (let i = 0; i < 10; i++) await call('POST', '/customers/me/tickets/manual', owner, manual(), 200);
  const response = await fetch(base + '/api/v1/customers/me/tickets/manual', { method: 'POST', headers: { Cookie: owner.cookie, Origin: origin, 'Content-Type': 'application/json', 'X-Auth-Request': '1', 'X-CSRF-Token': owner.csrf }, body: JSON.stringify(manual()) });
  assert.equal(response.status, 429); assert.ok(Number(response.headers.get('retry-after')) > 0);
});
test('A2-06 Staff and Customer receive the same valid snapshot; legacy stays unverified', async () => {
  await admin.staffAssignment.create({ data: { staffId: staff.id, customerId: owner.id, operatorId: 'synthetic-phase2' } });
  const created = await call('POST', '/customers/me/tickets/manual', owner, manual(), 200);
  const own = await call('GET', '/customers/me/tickets/' + created.ticket.id, owner, undefined, 200);
  const assigned = await call('GET', '/staff/tickets/' + created.ticket.id, staff, undefined, 200);
  assert.equal(own.ticket.confirmationSource, 'CUSTOMER_SUBMITTED');
  assert.deepEqual(own.ticket.confirmedContent, assigned.ticket.confirmedContent);
  assert.equal(assigned.ticket.confirmationSource, 'CUSTOMER_SUBMITTED'); assert.equal(assigned.ticket.chatLink, null);
  await admin.supportTicket.update({ where: { id: created.ticket.id }, data: { confirmedContent: { title: 'Unverified' }, requestFingerprint: null } });
  const legacy = await call('GET', '/staff/tickets/' + created.ticket.id, staff, undefined, 200);
  assert.equal(legacy.ticket.confirmationSource, 'LEGACY_UNVERIFIED'); assert.equal(legacy.ticket.confirmedContent, null);
});

test('A2-01 policy ownership and policy removal preserve the reviewed revision', async () => {
  const product = await admin.insuranceProduct.create({ data: { productCode: 'P2-' + randomUUID(), name: 'Synthetic Phase 2 product' } });
  const policies = [];
  try {
    for (const who of [owner, other]) policies.push(await admin.insurancePolicy.create({ data: { policyNumber: 'P2-' + randomUUID(), customerId: who.id, productId: product.id, status: 'ACTIVE' } }));
    await call('POST', '/customers/me/tickets/manual', owner, manual(undefined, { policyId: policies[1].id }), 404);
    const d = (await call('POST', path('propose'), owner, { title: 'Policy review', description: 'Synthetic policy review', policyId: policies[0].id }, 201)).draft;
    assert.equal(d.policyId, policies[0].id);
    const edited = await call('PUT', path(d.id), owner, { expectedVersion: 1, title: 'Policy removed', description: 'Synthetic detail', policyId: '' }, 200);
    assert.equal(edited.draft.policyId, null); assert.equal(edited.confirmation.textVersion, 'ticket-v1');
    const created = await call('POST', '/customers/me/tickets', owner, confirmRequest(d.id, randomUUID(), 2), 200);
    const detail = await call('GET', '/customers/me/tickets/' + created.ticket.id, owner, undefined, 200);
    assert.equal(detail.ticket.confirmationSource, 'CUSTOMER_CONFIRMED'); assert.equal(detail.ticket.confirmedContent.policyId, null);
    assert.equal(detail.ticket.confirmedContent.draftVersion, 2);
  } finally {
    // Draft/Ticket fixture rows are kept until global teardown; detach only these
    // disposable policy references before removing this test's product.
    await admin.ticketDraft.updateMany({ where: { customerId: { in: [owner.id, other.id] }, policyId: { in: policies.map(p => p.id) } }, data: { policyId: null } });
    await admin.insurancePolicy.deleteMany({ where: { id: { in: policies.map(p => p.id) } } });
    await admin.insuranceProduct.delete({ where: { id: product.id } });
  }
});

test('A2-03 event failure rolls back Ticket, snapshot and audit; retry keeps the original key', async () => {
  const database = app.get(DatabaseService), dto = manual();
  const before = await admin.supportTicket.count({ where: { customerId: owner.id } });
  database.prisma = core.$extends({ query: { outboxEvent: { create() { throw new Error('Synthetic outbox failure'); } } } });
  try { await call('POST', '/customers/me/tickets/manual', owner, dto, 500); }
  finally { database.prisma = core; }
  assert.equal(await admin.supportTicket.count({ where: { customerId: owner.id } }), before);
  assert.equal(await admin.supportTicket.count({ where: { idempotencyKey: dto.clientRequestId } }), 0);
  const committed = await call('POST', '/customers/me/tickets/manual', owner, dto, 200);
  assert.equal(committed.replayed, false);
});

for (const change of ['logout', 'assignment']) {
 test(`A2-03 create rechecks ${change} after waiting for the routing lock`, async () => {
  const dto = manual(), before = await admin.supportTicket.count({ where: { customerId: owner.id } });
  let acquired, release;
  const ready = new Promise(resolve => { acquired = resolve; }), gate = new Promise(resolve => { release = resolve; });
  const writer = admin.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM business.users WHERE id=${owner.id}::uuid FOR UPDATE`;
    acquired(); await gate;
    if (change === 'logout') await tx.authSession.update({ where: { id: owner.sessionId }, data: { revokedAt: new Date() } });
    else await tx.staffAssignment.updateMany({ where: { customerId: owner.id, isActive: true }, data: { isActive: false, endedAt: new Date() } });
  }, { timeout: 15000 });
  let pending;
  try {
    await ready;
    pending = fetch(base + '/api/v1/customers/me/tickets/manual', { method: 'POST', headers: { Cookie: owner.cookie, Origin: origin, 'Content-Type': 'application/json', 'X-Auth-Request': '1', 'X-CSRF-Token': owner.csrf }, body: JSON.stringify(dto) });
    assert.equal(await Promise.race([pending.then(() => 'finished'), new Promise(resolve => setTimeout(() => resolve('waiting'), 200))]), 'waiting');
    release(); await writer;
    const response = await pending;
    assert.equal(response.status, change === 'logout' ? 401 : 200);
    if (change === 'logout') assert.equal(await admin.supportTicket.count({ where: { customerId: owner.id } }), before);
    else { const body = await response.json(); assert.equal((await admin.supportTicket.findUniqueOrThrow({ where: { id: body.ticket.id } })).assignedStaffId, null); }
  } finally {
    release(); await writer; if (pending) await pending;
    if (change === 'logout') await admin.authSession.update({ where: { id: owner.sessionId }, data: { revokedAt: null } });
    else await admin.staffAssignment.updateMany({ where: { customerId: owner.id, staffId: staff.id }, data: { isActive: true, endedAt: null } });
  }
 });
}

test('A2-03 ticket code collisions retry only three times and preserve atomicity', async () => {
  const database = app.get(DatabaseService), occupied = await call('POST', '/customers/me/tickets/manual', owner, manual(), 200);
  const existing = await admin.supportTicket.findUniqueOrThrow({ where: { id: occupied.ticket.id } });
  let attempts = 0;
  database.prisma = core.$extends({ query: { supportTicket: { create({ args, query }) {
    attempts++; if (attempts <= 2) args.data.ticketCode = existing.ticketCode;
    return query(args);
  } } } });
  try { await call('POST', '/customers/me/tickets/manual', owner, manual(), 200); assert.equal(attempts, 3); }
  finally { database.prisma = core; }
  const before = await admin.supportTicket.count({ where: { customerId: owner.id } }), dto = manual(); attempts = 0;
  database.prisma = core.$extends({ query: { supportTicket: { create({ args, query }) {
    attempts++; args.data.ticketCode = existing.ticketCode; return query(args);
  } } } });
  try { await call('POST', '/customers/me/tickets/manual', owner, dto, 503, 'TICKET_CODE_UNAVAILABLE'); assert.equal(attempts, 3); }
  finally { database.prisma = core; }
  assert.equal(await admin.supportTicket.count({ where: { customerId: owner.id } }), before);
  const retried = await call('POST', '/customers/me/tickets/manual', owner, dto, 200); assert.equal(retried.replayed, false);
});

test('A2-05 Customer read quota includes receipt and is independent of mutation quota', async () => {
  const key = { clientToken: tokenHash(owner.id), endpointGroup: 'CUSTOMER_TICKET_READ' };
  try {
    await admin.rateLimitBucket.upsert({ where: { clientToken_endpointGroup: key }, create: { ...key, requestCount: 120, windowStart: new Date() }, update: { requestCount: 120, windowStart: new Date() } });
    const response = await fetch(base + '/api/v1/customers/me/tickets/by-client-request-id/' + randomUUID(), { headers: { Cookie: owner.cookie } });
    assert.equal(response.status, 429); assert.ok(Number(response.headers.get('retry-after')) > 0);
    await call('POST', '/customers/me/tickets/manual', owner, manual(), 200);
  } finally { await admin.rateLimitBucket.deleteMany({ where: key }); }
});

test('A2-02 legacy replay requires enough original input and never backfills a fingerprint', async () => {
  const dto = manual(), created = await call('POST', '/customers/me/tickets/manual', owner, dto, 200);
  await admin.supportTicket.update({ where: { id: created.ticket.id }, data: { requestFingerprint: null, confirmedContent: {
    manual: true, title: dto.title.trim(), description: dto.description.trim(), policyId: null,
  } } });
  const replay = await call('POST', '/customers/me/tickets/manual', owner, dto, 200);
  assert.equal(replay.ticket.id, created.ticket.id); assert.equal(replay.replayed, true);
  await call('POST', '/customers/me/tickets/manual', owner, { ...dto, description: 'Different original input' }, 409, 'IDEMPOTENCY_CONFLICT');
  assert.equal((await admin.supportTicket.findUniqueOrThrow({ where: { id: created.ticket.id } })).requestFingerprint, null);
  const view = await call('GET', '/customers/me/tickets/' + created.ticket.id, owner, undefined, 200);
  assert.equal(view.ticket.confirmationSource, 'LEGACY_UNVERIFIED'); assert.equal(view.ticket.confirmedContent, null);
  const { projectTicketConfirmation } = require('../dist/tickets/dto/ticket-confirmation');
  const row = await admin.supportTicket.findUniqueOrThrow({ where: { id: created.ticket.id } });
  const malformed = projectTicketConfirmation({ ...row, requestFingerprint: 'a'.repeat(64), confirmedContent: { schemaVersion: 1, source: { toString: null } } });
  assert.equal(malformed.confirmationSource, 'LEGACY_UNVERIFIED'); assert.equal(malformed.confirmedContent, null);

});

test('A2-03 unique source-draft constraint remains a safe final guard for inconsistent legacy draft state', async () => {
  const d = await proposed();
  const committed = await call('POST', '/customers/me/tickets', owner, confirmRequest(d.id), 200);
  await admin.ticketDraft.update({ where: { id: d.id }, data: { state: 'DRAFT' } });
  await call('POST', '/customers/me/tickets', owner, confirmRequest(d.id), 409, 'DRAFT_ALREADY_CONFIRMED');
  assert.equal(await admin.supportTicket.count({ where: { sourceDraftId: d.id } }), 1);
  assert.equal((await admin.supportTicket.findUniqueOrThrow({ where: { id: committed.ticket.id } })).confirmedContent.draftVersion, 1);
});


test('A2-01 invalid PostgreSQL text characters are rejected before Ticket or draft writes', async () => {
  const beforeTickets=await admin.supportTicket.count({where:{customerId:owner.id}});
  const beforeDrafts=await admin.ticketDraft.count({where:{customerId:owner.id}});
  for (const invalid of ['\u0000', '\ud800', '\udfff']) {
    for (const field of ['title','description']) {
      const bad={...content,[field]:'Synthetic '+invalid};
      await call('POST','/customers/me/tickets/manual',owner,{clientRequestId:randomUUID(),...bad},400,'VALIDATION_ERROR');
      await call('POST',path('propose'),owner,bad,400,'VALIDATION_ERROR');
      await call('PUT',path(),owner,{expectedVersion:1,...bad},400,'VALIDATION_ERROR');
    }
  }
  assert.equal(await admin.supportTicket.count({where:{customerId:owner.id}}),beforeTickets);
  assert.equal(await admin.ticketDraft.count({where:{customerId:owner.id}}),beforeDrafts);
  const {ticketContent}=require('../dist/tickets/dto/ticket-content');
  for(const invalid of ['\u0000','\ud800','\udfff']) for(const field of ['title','description']) {
    assert.throws(()=>ticketContent({...content,[field]:'Synthetic '+invalid}),error=>error.getStatus()===400);
  }
  const valid={title:'Synthetic \u{1F600}',description:'Synthetic \u1ebf\nLine 2',policyId:null};
  const created=await call('POST','/customers/me/tickets/manual',owner,{clientRequestId:randomUUID(),...valid},200);
  const saved=await call('GET','/customers/me/tickets/'+created.ticket.id,owner,undefined,200);
  assert.equal(saved.ticket.confirmedContent.title,valid.title);assert.equal(saved.ticket.confirmedContent.description,valid.description);

});
