require('reflect-metadata');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { NestFactory } = require('@nestjs/core');
const { Module } = require('@nestjs/common');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('../dist/generated/prisma/client');
const { configureHttp } = require('../dist/http/http-foundation');
const { DatabaseService } = require('../dist/database/database.service');
const { AuthService, tokenHash } = require('../dist/auth/services/auth.service');
const { StaffInboxController } = require('../dist/conversations/controllers/staff-inbox.controller');
const { StaffConversationController } = require('../dist/conversations/controllers/staff-conversation.controller');
const { StaffInboxService } = require('../dist/conversations/services/staff-inbox.service');
const { ConversationAccessService } = require('../dist/conversations/services/conversation-access.service');
const { ConversationRateLimitService } = require('../dist/conversations/services/conversation-rate-limit.service');
const { inboxCursorScope } = require('../dist/conversations/services/inbox-cursor');
const { AccountManagementService } = require('../dist/accounts/services/account-management.service');
const { conversationTestProviders } = require('./support/conversation-test.module.cjs');
process.env.NODE_ENV = 'test'; process.env.CORS_ORIGINS = 'http://localhost:8080';
const runId = `i02-${randomUUID()}`, users = [], conversations = [];
const queryLog = [];
function client(role, file, observe = false) {
  const instance = new PrismaClient({ adapter: new PrismaPg({ host: process.env.PGHOST, database: process.env.I01_TEST_DATABASE,
    user: role, password: readFileSync(file, 'utf8').trim(), max: 8 }), ...(observe ? { log: [{ emit: 'event', level: 'query' }] } : {}) });
  if (observe) instance.$on('query', e => queryLog.push(e.query)); // memory only, never log SQL/parameters
  return instance;
}
const admin = client('admin_runtime', '/credentials/admin/password');
const core = client('core_runtime', '/credentials/core/password', true);
const access = new ConversationAccessService();
const database = { prisma: core };
class TestModule {}
Module({ controllers: [StaffInboxController, StaffConversationController], providers: conversationTestProviders(core) })(TestModule);
let app, base, staffA, staffB, x, privateOnly, outsider, pending, direct, transferred, privateAI, copilot, legacy;
const at = new Date('2026-01-03T00:00:00.000Z');

async function user(role, name) {
  const id = randomUUID();
  const number = BigInt('0x' + id.replaceAll('-', '')).toString().slice(0, 22);
  const row = await admin.user.create({ data: { id, role, accountCode: `${role === 'STAFF' ? 'STF' : 'CUS'}-${number}`,
    email: `${id}@synthetic.invalid`, passwordHash: 'synthetic-read-fixture-not-for-login',
    ...(role === 'STAFF' ? { staffProfile: { create: { fullName: name } } } : { customerProfile: { create: { fullName: name } } }) } });
  users.push(id);
  const token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex');
  const session = await admin.authSession.create({ data: { userId: id, tokenHash: tokenHash(token), csrfTokenHash: tokenHash(csrf),
    expiresAt: new Date(Date.now() + 3600000) } });
  return { id, role, name, code: row.accountCode, sessionId: session.id, cookie: `li_session=${token}; li_csrf=${csrf}` };
}
async function customer(name, staff = staffA) {
  const actor = await user('CUSTOMER', name);
  const assignment = await admin.staffAssignment.create({ data: { customerId: actor.id, staffId: staff.id, operatorId: runId } });
  return { ...actor, assignment, staff };
}
async function conversation(owner, kind = 'DIRECT') {
  const row = await admin.conversation.create({ data: { customerId: owner.id,
    channelType: kind === 'COPILOT' ? 'STAFF_COPILOT' : 'CUSTOMER_SUPPORT',
    status: ['DIRECT', 'TRANSFERRED', 'LEGACY', 'COPILOT'].includes(kind) ? 'STAFF_ACTIVE' : kind === 'REQUEST' ? 'PENDING_HANDOFF' : 'AI_ACTIVE',
    supportOrigin: kind === 'COPILOT' ? null : kind === 'LEGACY' ? 'LEGACY_UNKNOWN' : kind === 'DIRECT' ? 'DIRECT' : 'AI',
    createdByCustomerId: ['LEGACY', 'COPILOT'].includes(kind) ? null : owner.id,
    assignedStaffId: ['DIRECT', 'TRANSFERRED', 'LEGACY', 'COPILOT'].includes(kind) ? owner.staff.id : null,
    directAssignmentId: kind === 'DIRECT' ? owner.assignment.id : null,
    subject: ['AI', 'REQUEST'].includes(kind) ? 'PRIVATE_AI_SUBJECT_SENTINEL' : 'Synthetic visible subject',
    aiSummary: 'PRIVATE_SUMMARY_SENTINEL', createdAt: at, updatedAt: at,
    lastCustomerFacingActivityAt: at } });
  conversations.push(row.id);
  if (['REQUEST', 'TRANSFERRED'].includes(kind)) await admin.conversationHandoff.create({ data: {
    conversationId: row.id, customerId: owner.id, assignmentId: owner.assignment.id, recipientStaffId: owner.staff.id,
    state: kind === 'REQUEST' ? 'PENDING' : 'ACCEPTED', sharedSubject: 'Synthetic shared support request', sharedReason: 'Shared synthetic reason',
    consentScope: 'ENTIRE_CUSTOMER_VISIBLE_CONVERSATION', consentTextVersion: 'handoff-v1', confirmedByCustomerId: owner.id, confirmedAt: at,
    ...(kind === 'TRANSFERRED' ? { acceptedByStaffId: owner.staff.id, acceptedAt: at } : {}),
  } });
  return row;
}
function pathQuery(path, query = {}) { const params = new URLSearchParams(query); return path + (params.size ? '?' + params : ''); }
async function get(path, actor = staffA) {
  return fetch(base + path, { headers: actor ? { Cookie: actor.cookie } : {}, signal: AbortSignal.timeout(10000) });
}
async function json(path, actor = staffA) {
  const response = await get(path, actor);
  assert.equal(response.status, 200, `unexpected status for test endpoint: ${response.status}`);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return response.json();
}
function safe(body) {
  const forbidden = new Set(['total', 'count', 'counts', 'statusCounts', 'matchingConversationCount', 'conversationCode', 'lastSequence',
    'messageCount', 'messages', 'lastMessage', 'preview', 'aiSummary', 'toolCallsMetadata', 'citations', 'email', 'phone', 'citizenId', 'passwordHash']);
  const walk = value => { if (value && typeof value === 'object') for (const [key, v] of Object.entries(value)) { assert.ok(!forbidden.has(key), key); walk(v); } };
  walk(body); assert.doesNotMatch(JSON.stringify(body), /PRIVATE_AI_SUBJECT_SENTINEL|PRIVATE_SUMMARY_SENTINEL|PRIVATE_TRANSCRIPT_SENTINEL/);
}
const groupPath = '/api/v1/staff/inbox/customers';
const listPath = owner => `${groupPath}/${owner.id}/conversations`;
const detailPath = conv => `/api/v1/staff/conversations/${conv.id}`;

before(async () => {
  staffA = await user('STAFF', 'Synthetic I02 Staff A'); staffB = await user('STAFF', 'Synthetic I02 Staff B');
  x = await customer('Synthetic I02 Alpha %_\\ Ánh'); privateOnly = await customer('Only Private Customer');
  outsider = await customer('Outside Scope Customer', staffB);
  pending = await conversation(x, 'REQUEST'); direct = await conversation(x); transferred = await conversation(x, 'TRANSFERRED');
  privateAI = await conversation(x, 'AI'); copilot = await conversation(x, 'COPILOT'); legacy = await conversation(x, 'LEGACY');
  await conversation(privateOnly, 'AI'); await conversation(outsider);
  for (let i = 0; i < 7; i++) await conversation(x);
  for (let i = 0; i < 6; i++) await conversation(await customer(`Synthetic I02 Batch ${i}`));
  await admin.message.create({ data: { conversationId: pending.id, sequence: 1n, audience: 'CUSTOMER_VISIBLE', senderType: 'AI_AGENT', content: 'PRIVATE_TRANSCRIPT_SENTINEL' } });
  app = await NestFactory.create(TestModule, { logger: false });
  configureHttp(app, { origins: ['http://localhost:8080'], docsEnabled: true });
  await app.listen(0, '127.0.0.1'); base = await app.getUrl();
});
after(async () => {
  await app?.close();
  try {
    const tokens = users.map(id => createHash('sha256').update(id).digest('hex'));
    await admin.$transaction(async tx => {
      await tx.rateLimitBucket.deleteMany({ where: { clientToken: { in: tokens }, endpointGroup: 'INBOX_READ' } });
      await tx.auditLog.deleteMany({ where: { operatorId: runId } });
      await tx.outboxEvent.deleteMany({ where: { aggregateId: { in: conversations }, aggregateType: 'CONVERSATION' } });
      await tx.message.deleteMany({ where: { conversationId: { in: conversations } } });
      await tx.conversationHandoff.deleteMany({ where: { conversationId: { in: conversations } } });
      await tx.conversation.deleteMany({ where: { id: { in: conversations } } });
      await tx.authSession.deleteMany({ where: { userId: { in: users } } });
      await tx.staffAssignment.deleteMany({ where: { customerId: { in: users } } });
      await tx.customerProfile.deleteMany({ where: { userId: { in: users } } });
      await tx.staffProfile.deleteMany({ where: { userId: { in: users } } });
      await tx.user.deleteMany({ where: { id: { in: users } } });
    }, { timeout: 15000 });
  } finally { await Promise.all([core.$disconnect(), admin.$disconnect()]); }
});

test('groups hide private-only Customers and all filters are permission-first', async () => {
  const all = await json(groupPath), requests = await json(pathQuery(groupPath, { filter: 'requests' })), active = await json(pathQuery(groupPath, { filter: 'active' }));
  assert.equal(all.items.length, 7); assert.equal(active.items.length, 7);
  assert.deepEqual(requests.items.map(i => i.customer.id), [x.id]);
  assert.ok(!all.items.some(i => [privateOnly.id, outsider.id].includes(i.customer.id)));
  for (const body of [all, requests, active]) safe(body);
  assert.deepEqual((await json(pathQuery(groupPath, { customerId: outsider.id }))).items, []);
  assert.deepEqual((await json(pathQuery(groupPath, { search: privateOnly.code }))).items, []);
});

test('SQL visibility and I01 Prisma policy match for both actors and every filter', async () => {
  for (const actor of [staffA, staffB]) for (const filter of ['all', 'requests', 'active']) {
    const now = new Date();
    const orm = await core.conversation.findMany({ where: { id: { in: conversations }, AND: [access.staffScope(actor.id, filter, now)] }, select: { id: true } });
    const sql = await core.$queryRaw(access.staffSqlEntries(actor.id, filter, now));
    assert.deepEqual(sql.map(r => r.id).sort(), orm.map(r => r.id).sort());
  }
});

test('lazy list, entry types and metadata never return transcript or private previews', async () => {
  const rows = await json(pathQuery(listPath(x), { limit: 50 }));
  assert.equal(rows.items.length, 10);
  assert.ok(!rows.items.some(r => [privateAI.id, copilot.id, legacy.id].includes(r.id)));
  const p = (await json(detailPath(pending))).conversation;
  assert.equal(p.subject, 'Synthetic shared support request'); assert.equal(p.activityAt, at.toISOString());
  assert.deepEqual(p.allowedActions, { readMessages: false, accept: true, send: false });
  assert.deepEqual(Object.keys(p.request).sort(), ['id', 'requestedAt', 'sharedReason']);
  assert.equal((await json(detailPath(direct))).conversation.entryType, 'DIRECT');
  assert.equal((await json(detailPath(transferred))).conversation.entryType, 'TRANSFERRED');
  assert.equal((await json(detailPath(transferred))).conversation.allowedActions.readMessages, true);
  safe(rows); safe({ conversation: p });
});

test('private AI, Copilot, legacy and foreign IDs produce identical safe 404s', async () => {
  const missing = { id: randomUUID() };
  for (const conv of [privateAI, copilot, legacy, missing]) {
    const response = await get(detailPath(conv)); assert.equal(response.status, 404);
    const body = await response.json(); assert.equal(body.code, 'NOT_FOUND'); assert.equal(body.message, 'Not Found');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal((await get(detailPath(direct), staffB)).status, 404);
  assert.equal((await get(listPath(outsider))).status, 404);
  assert.deepEqual((await json(listPath(privateOnly))).items, []);
});

test('A10 denies pending; Accept and send require CSRF', async () => {
  assert.equal((await get(detailPath(pending) + '/messages')).status, 404);
  for (const suffix of ['/accept', '/messages']) {
    const response = await fetch(base + detailPath(pending) + suffix, { method: 'POST', headers: { Cookie: staffA.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(suffix === '/accept' ? { clientRequestId: randomUUID(), expectedVersion: 0 } : { clientMessageId: randomUUID(), expectedVersion: 0, content: 'Synthetic denied send' }) });
    assert.equal(response.status, 403);
  }
});

test('literal name/code search supports trim/case/accents and escapes %, _ and backslash', async () => {
  for (const search of ['  ALPHA  ', '%_\\', 'Ánh', x.code.toLowerCase()])
    assert.deepEqual((await json(pathQuery(groupPath, { search }))).items.map(i => i.customer.id), [x.id]);
  for (const search of ['Anh', x.id + '@synthetic.invalid', 'PRIVATE_TRANSCRIPT_SENTINEL'])
    assert.deepEqual((await json(pathQuery(groupPath, { search }))).items, []);
});

test('group and per-Customer keysets cover tied timestamps without duplicates', async () => {
  for (const endpoint of [groupPath, listPath(x)]) {
    const expected = (await json(pathQuery(endpoint, { limit: 50 }))).items.map(i => i.customer?.id ?? i.id);
    const actual = []; let cursor;
    do {
      const body = await json(pathQuery(endpoint, { limit: 1, ...(cursor ? { cursor } : {}) }));
      actual.push(...body.items.map(i => i.customer?.id ?? i.id));
      assert.equal(body.pageInfo.hasMore, body.pageInfo.nextCursor !== null);
      cursor = body.pageInfo.nextCursor;
      assert.ok(actual.length <= expected.length);
    } while (cursor);
    assert.deepEqual(actual, expected); assert.equal(new Set(actual).size, actual.length);
  }
});

test('cursor binding rejects another actor, query, filter, Customer or endpoint', async () => {
  const cursor = (await json(pathQuery(groupPath, { limit: 1 }))).pageInfo.nextCursor;
  const cases = [
    [pathQuery(groupPath, { cursor }), staffB],
    [pathQuery(groupPath, { cursor, search: 'Alpha' }), staffA],
    [pathQuery(groupPath, { cursor, filter: 'requests' }), staffA],
    [pathQuery(groupPath, { cursor, customerId: x.id }), staffA],
    [pathQuery(listPath(x), { cursor }), staffA],
  ];
  const listCursor = (await json(pathQuery(listPath(x), { limit: 1 }))).pageInfo.nextCursor;
  cases.push([pathQuery(listPath(privateOnly), { cursor: listCursor }), staffA]);
  for (const [path, actor] of cases) {
    const response = await get(path, actor); assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'INVALID_CURSOR');
  }
  for (const encoded of ['a', Buffer.from('null').toString('base64url'), Buffer.from('{}').toString('base64url')])
    assert.equal((await get(pathQuery(groupPath, { cursor: encoded }))).status, 400);
  for (const at of ['not-a-date', '0000-01-01T00:00:00.000Z', '-100000-01-01T00:00:00.000Z']) {
    const invalid = Buffer.from(JSON.stringify({ v: 1, scope: inboxCursorScope(staffA.id, 'groups', 'all'), at, id: x.id })).toString('base64url');
    const response = await get(pathQuery(groupPath, { cursor: invalid }));
    assert.equal(response.status, 400); assert.equal((await response.json()).code, 'INVALID_CURSOR');
  }
});

test('even a deliberately forged cursor with the right public binding cannot grant data', async () => {
  const cursor = Buffer.from(JSON.stringify({ v: 1, scope: inboxCursorScope(staffB.id, 'groups', 'all'),
    at: '2099-01-01T00:00:00.000Z', id: x.id })).toString('base64url');
  const body = await json(pathQuery(groupPath, { cursor }), staffB);
  assert.deepEqual(body.items.map(i => i.customer.id), [outsider.id]);
});

test('pending activity/title remain unchanged when private AI fields or messages change', async () => {
  const before = await json(detailPath(pending));
  await admin.conversation.update({ where: { id: pending.id }, data: {
    subject: 'PRIVATE_AI_SUBJECT_SENTINEL updated', aiSummary: 'PRIVATE_SUMMARY_SENTINEL updated',
    createdAt: new Date('2030-01-01'), updatedAt: new Date('2035-01-01'), lastCustomerFacingActivityAt: new Date('2040-01-01'),
  } });
  await admin.message.create({ data: { conversationId: pending.id, sequence: 2n, audience: 'CUSTOMER_VISIBLE', senderType: 'AI_AGENT', content: 'PRIVATE_TRANSCRIPT_SENTINEL' } });
  assert.deepEqual(await json(detailPath(pending)), before);
  assert.equal((await json(pathQuery(groupPath, { filter: 'requests' }))).items[0].lastActivityAt, at.toISOString());
});

test('validation rejects legacy filters, invalid limits, unknown or repeated parameters', async () => {
  const queries = [{ filter: 'new' }, { filter: 'AI_ACTIVE' }, { filter: 'CLOSED' }, { filter: 'request' },
    { limit: '0' }, { limit: '51' }, { limit: '1.5' }, { limit: '-1' }, { page: '1' }, { search: 'x'.repeat(101) },
    { customerId: 'invalid' }, { search: 'in\nvalid' }, { cursor: 'bad==' }];
  for (const query of queries) assert.equal((await get(pathQuery(groupPath, query))).status, 400);
  assert.equal((await get(groupPath + '?limit=1&limit=2')).status, 400);
  assert.equal((await get(groupPath + '?search=a&search=b')).status, 400);
  assert.equal((await get(pathQuery(listPath(x), { search: 'Alpha' }))).status, 400);
  assert.equal((await get(detailPath(pending) + '?include=messages')).status, 400);
  assert.equal((await get('/api/v1/staff/conversations/not-a-uuid')).status, 400);
});

test('auth roles, expired/revoked sessions and locked actors are enforced', async () => {
  assert.equal((await get(groupPath, null)).status, 401);
  assert.equal((await get(groupPath, x)).status, 403);
  const actor = await user('STAFF', 'Synthetic auth fixture');
  await admin.authSession.update({ where: { id: actor.sessionId }, data: { revokedAt: new Date() } });
  assert.equal((await get(groupPath, actor)).status, 401);
  await admin.authSession.update({ where: { id: actor.sessionId }, data: { revokedAt: null } });
  await admin.authSession.update({ where: { id: actor.sessionId }, data: {
    createdAt: new Date(Date.now() - 3600000), expiresAt: new Date(Date.now() - 1000),
  } });
  assert.equal((await get(groupPath, actor)).status, 401);
  await admin.authSession.update({ where: { id: actor.sessionId }, data: { createdAt: new Date(), expiresAt: new Date(Date.now() + 3600000) } });
  await admin.user.update({ where: { id: actor.id }, data: { status: 'LOCKED' } });
  assert.equal((await get(groupPath, actor)).status, 401);
});

test('reassignment between pages revokes old scope; the new Staff inherits no chat grant', async () => {
  const owner = await customer('Synthetic reassign'), first = await conversation(owner), second = await conversation(owner);
  const cursor = (await json(pathQuery(listPath(owner), { limit: 1 }))).pageInfo.nextCursor;
  await new AccountManagementService(admin).assign(owner.id, { staffId: staffB.id, expectedVersion: 0 }, { operatorId: runId, requestId: randomUUID() });
  assert.equal((await get(pathQuery(listPath(owner), { cursor }))).status, 404);
  for (const actor of [staffA, staffB]) for (const conv of [first, second]) assert.equal((await get(detailPath(conv), actor)).status, 404);
  assert.deepEqual((await json(listPath(owner), staffB)).items, []);
});

test('quota is actor-scoped, returns safe 429/Retry-After and resets its window', async () => {
  const actor = await user('STAFF', 'Synthetic quota fixture'), clientToken = tokenHash(actor.id);
  await admin.rateLimitBucket.create({ data: { clientToken, endpointGroup: 'INBOX_READ', windowStart: new Date(), requestCount: 240 } });
  const denied = await get(groupPath, actor); assert.equal(denied.status, 429);
  assert.ok(Number(denied.headers.get('retry-after')) >= 1 && Number(denied.headers.get('retry-after')) <= 60);
  assert.equal((await denied.json()).code, 'RATE_LIMITED');
  assert.equal((await get(groupPath, staffB)).status, 200);
  await admin.rateLimitBucket.update({ where: { clientToken_endpointGroup: { clientToken, endpointGroup: 'INBOX_READ' } }, data: { windowStart: new Date(Date.now() - 61000) } });
  assert.equal((await get(groupPath, actor)).status, 200);
});

test('read query counts stay bounded across page sizes and never read messages/count totals', async () => {
  const counts = [];
  for (const limit of [1, 50]) {
    queryLog.length = 0; await json(pathQuery(groupPath, { limit }));
    counts.push(queryLog.length);
    assert.ok(!queryLog.some(q => /\bCOUNT\s*\(|(?:FROM|JOIN)\s+(?:"?business"?\.)?"?messages"?\b/i.test(q)));
  }
  assert.equal(counts[0], counts[1]); assert.ok(counts[1] <= 16);
  const { Prisma } = require('../dist/generated/prisma/client');
  const plan = await core.$queryRaw(Prisma.sql`EXPLAIN (FORMAT JSON)
    WITH eligible AS (${access.staffSqlEntries(staffA.id, 'all', new Date())})
    SELECT customer_id,MAX(activity_at) FROM eligible GROUP BY customer_id LIMIT 51`);
  assert.doesNotMatch(JSON.stringify(plan), /"Relation Name":"messages"/);
});

test('GET changes no conversation control/status, history, grant or assignment', async () => {
  const snapshot = () => admin.conversation.findMany({ where: { id: { in: conversations } }, orderBy: { id: 'asc' } });
  const before = await snapshot();
  const handoffs = await admin.conversationHandoff.findMany({ where: { conversationId: { in: conversations } }, orderBy: { id: 'asc' } });
  await json(groupPath); await json(listPath(x)); await json(detailPath(pending));
  assert.deepEqual(await snapshot(), before);
  assert.deepEqual(await admin.conversationHandoff.findMany({ where: { conversationId: { in: conversations } }, orderBy: { id: 'asc' } }), handoffs);
});

test('Swagger describes metadata DTOs without counts; A10/Accept and public send exist', async () => {
  const spec = await (await get('/api/v1/docs-json', null)).json();
  for (const path of [groupPath, groupPath + '/{customerId}/conversations', '/api/v1/staff/conversations/{conversationId}'])
    assert.ok(spec.paths[path]?.get);
  assert.ok(spec.paths['/api/v1/staff/conversations/{conversationId}/messages']?.get);
  assert.ok(spec.paths['/api/v1/staff/conversations/{conversationId}/messages']?.post);
  for (const [name, value] of Object.entries(spec.components.schemas)) if (/Inbox|ConversationMetadata|HandoffRequestMetadata/.test(name)) {
    const encoded = JSON.stringify(value); assert.doesNotMatch(encoded, /"(?:total|counts|statusCounts|lastSequence|aiSummary|messages)"/);
  }
});

test('unexpected data failures keep the safe error envelope without SQL or Private content', async () => {
  const service = app.get(StaffInboxService), original = service.groups;
  service.groups = async () => { throw new Error('PRIVATE_SUMMARY_SENTINEL SQL synthetic failure'); };
  try {
    const response = await get(groupPath); assert.equal(response.status, 500);
    const body = await response.json(); assert.equal(body.code, 'INTERNAL_SERVER_ERROR');
    assert.ok(body.requestId && body.timestamp); assert.equal(response.headers.get('cache-control'), 'no-store'); safe(body);
  } finally { service.groups = original; }
});

test('Docker gateway serves deployed A08/A09 and existing auth/Customer/Policy APIs with real sessions', async () => {
  // Requires the current Core image deployed in the normal local stack. This is
  // gateway/Core/DB HTTP integration, not a browser or mock-network E2E test.
  const live = async (path, expected = 200) => {
    const response = await fetch('http://gateway' + path, { headers: { Cookie: staffA.cookie }, signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, expected); return response.json();
  };
  assert.equal((await live('/api/v1/auth/me')).actor.id, staffA.id);
  const groups = await live(groupPath); safe(groups);
  assert.ok(groups.items.some(i => i.customer.id === x.id));
  assert.ok(!groups.items.some(i => [privateOnly.id, outsider.id].includes(i.customer.id)));
  const request = await live(detailPath(pending)); safe(request);
  assert.equal(request.conversation.allowedActions.readMessages, false);
  assert.equal((await live(listPath(x))).items.length, 10);
  await live(detailPath(privateAI), 404); await live(detailPath(pending) + '/messages', 404);
  assert.ok((await live('/api/v1/staff/customers')).items.length > 0);
  assert.deepEqual((await live('/api/v1/staff/policies')).items, []);
});
