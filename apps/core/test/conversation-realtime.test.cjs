require('reflect-metadata');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
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
  database: process.env.I01_TEST_DATABASE, user: role, password: readFileSync(path, 'utf8').trim(), max: 8 }),
  log: role === 'core_runtime' ? [{ emit: 'event', level: 'query' }] : [] }); }
const admin = client('admin_runtime', '/credentials/admin/password'), core = client('core_runtime', '/credentials/core/password');
let measuredQueries = null;
core.$on('query', () => { if (measuredQueries !== null) measuredQueries++; });
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

for (const role of ['CUSTOMER', 'STAFF']) test(`A4 ${role} legacy reconciliation stays bounded across 50000 messages and durable cycle transitions`, async () => {
  const g = await group(), id = (await create(g, 'DIRECT')).conversation.id;
  try {
  const sender = role === 'CUSTOMER' ? g.a : g.c, recipient = role === 'CUSTOMER' ? g.c : g.a;
  const kind = role === 'CUSTOMER' ? 'STAFF_MESSAGE_UNREAD' : 'CUSTOMER_MESSAGE_UNREAD';
  const base = 9007199254740992n, first = base + 49999n, last = base + 50000n;
  const stateKey = { recipientUserId_conversationId_kind: { recipientUserId: recipient.id, conversationId: id, kind } };
  await admin.$executeRaw`INSERT INTO business.messages
    (id,conversation_id,sender_type,sender_id,sequence,audience,content,read_at)
    SELECT gen_random_uuid(),${id}::uuid,${sender.role}::business."SenderType",${sender.id}::uuid,
      ${base}::bigint+n,'CUSTOMER_VISIBLE','Synthetic large legacy history',now()
    FROM generate_series(1,50000) n`;
  await admin.message.createMany({ data: [
    { conversationId: id, sequence: base + 50001n, senderType: sender.role, senderId: sender.id, audience: 'INTERNAL', content: 'Synthetic internal exclusion' },
    { conversationId: id, sequence: base + 50002n, senderType: recipient.role, senderId: recipient.id, audience: 'CUSTOMER_VISIBLE', content: 'Synthetic opposite direction' },
  ] });
  const event = await admin.outboxEvent.create({ data: { aggregateId: id, aggregateType: 'CONVERSATION',
    eventType: 'MESSAGE_COMMITTED', payload: { schemaVersion: 1 }, status: 'PROCESSING',
    leaseOwner: 'synthetic-large-legacy-held', leaseExpiresAt: new Date(Date.now() + 3600000) } });
  const route = async () => {
    measuredQueries = 0;
    const start = Date.now();
    try {
      const recipients = await events().route(event);
      assert.ok(measuredQueries <= 80, `Legacy routing used ${measuredQueries} database queries`);
      return { recipients, queries: measuredQueries, elapsedMs: Date.now() - start };
    } finally { measuredQueries = null; }
  };
  for (const mode of ['fresh', 'processed', 'read-ahead', 'all-read']) {
    await admin.notification.deleteMany({ where: { conversationId: id } });
    await admin.conversationNotificationState.deleteMany({ where: { conversationId: id } });
    await admin.message.updateMany({ where: { conversationId: id, senderType: sender.role, audience: 'CUSTOMER_VISIBLE' }, data: { readAt: new Date() } });
    if (mode !== 'all-read') await admin.message.update({ where: { conversationId_sequence: { conversationId: id, sequence: first } }, data: { readAt: null } });
    const through = mode === 'read-ahead' ? first : mode === 'processed' ? base + 49997n : 0n;
    if (mode === 'processed' || mode === 'read-ahead') await admin.conversationNotificationState.create({ data: {
      recipientUserId: recipient.id, conversationId: id, kind, readThroughSequence: through, lastProcessedSequence: base + 49998n,
    } });
    const result = await route();
    console.log(JSON.stringify({ legacyReconciliation: role, mode, ...result, recipients: undefined }));
    const state = await admin.conversationNotificationState.findUniqueOrThrow({ where: stateKey });
    assert.equal(state.lastProcessedSequence, last);
    assert.equal(state.readThroughSequence, through);
    const notices = await admin.notification.findMany({ where: { conversationId: id, kind } });
    if (mode === 'read-ahead' || mode === 'all-read') {
      assert.equal(notices.length, 0); assert.equal(state.activeNotificationId, null); continue;
    }
    assert.equal(notices.length, 1); assert.equal(state.cycleStartSequence, first);
    assert.equal(state.activeNotificationId, notices[0].id);
    assert.equal(notices[0].dedupKey, `cycle:${recipient.id}:${id}:${kind}:${first}`);
    assert.equal(notices[0].isRead, false);
    await admin.notification.update({ where: { id: notices[0].id }, data: { isRead: true } });
    await route();
    const replayed = await admin.notification.findUniqueOrThrow({ where: { id: notices[0].id } });
    assert.equal(replayed.isRead, true); assert.equal(+replayed.createdAt, +notices[0].createdAt);
    await admin.notification.delete({ where: { id: replayed.id } });
    await route(); assert.equal(await admin.notification.count({ where: { conversationId: id, kind } }), 0);
  }
  // A large entirely unread backlog also folds to one cycle, retaining its first sequence.
  await admin.conversationNotificationState.deleteMany({ where: { conversationId: id } });
  await admin.notification.deleteMany({ where: { conversationId: id } });
  await admin.message.updateMany({ where: { conversationId: id, senderType: sender.role, audience: 'CUSTOMER_VISIBLE' }, data: { readAt: null } });
  await route();
  const backlog = await admin.conversationNotificationState.findUniqueOrThrow({ where: stateKey });
  assert.equal(backlog.cycleStartSequence, base + 1n); assert.equal(backlog.lastProcessedSequence, last);
  await app.get(ConversationCommandService).transaction(async tx => {
    await app.get(ConversationCommandService).lock(tx, recipient.id, id);
    await app.get(ConversationMessageService).markAsRead(tx, recipient, id);
  });
  await route();
  assert.equal(await admin.notification.count({ where: { conversationId: id, kind, isRead: false } }), 0);
  assert.equal((await admin.message.findUniqueOrThrow({ where: { conversationId_sequence: { conversationId: id, sequence: base + 50001n } } })).readAt, null);
  const next = base + 50003n;
  await admin.message.create({ data: { conversationId: id, sequence: next, senderType: sender.role, senderId: sender.id, audience: 'CUSTOMER_VISIBLE', content: 'Synthetic new cycle after legacy backlog' } });
  await route();
  const newCycle = await admin.conversationNotificationState.findUniqueOrThrow({ where: stateKey });
  assert.equal(newCycle.cycleStartSequence, next); assert.equal(newCycle.lastProcessedSequence, next);
  assert.notEqual(newCycle.activeNotificationId, backlog.activeNotificationId);
  assert.equal(await admin.notification.count({ where: { conversationId: id, kind } }), 2);
  if (role === 'STAFF') {
    await assign(g, g.b, 0);
    await admin.message.create({ data: { conversationId: id, sequence: next + 1n, senderType: sender.role, senderId: sender.id, audience: 'CUSTOMER_VISIBLE', content: 'Synthetic revoked legacy recipient' } });
    const { recipients } = await route();
    assert.ok(!recipients.some(r => r.actorId === g.a.id || r.actorId === g.b.id));
    assert.equal((await admin.conversationNotificationState.findUniqueOrThrow({ where: stateKey })).lastProcessedSequence, next);
  }
  } finally { await admin.message.deleteMany({ where: { conversationId: id } }); }
});
async function eventually(check) { for (let i = 0; i < 150; i++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 10)); } assert.fail('Timed out waiting for synthetic realtime assertion'); }
async function socket(who) {
  const frames = [], ws = new WebSocket(base.replace('http:', 'ws:') + '/api/v1/realtime', { headers: { Cookie: who.cookie, Origin: 'http://localhost:8080' } });
  ws.on('message', data => frames.push(JSON.parse(String(data)))); ws.on('error', () => {});
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  await eventually(() => frames.some(frame => frame.type === 'ready'));
  return { ws, frames };
}

for(const role of ['CUSTOMER','STAFF']) test(`A4 ${role} read-state is bounded, read-only, bigint-safe and permission gated`,async()=>{
 const g=await group(),id=(await create(g,'DIRECT')).conversation.id;
 const who=role==='CUSTOMER'?g.c:g.a,recipient=role==='CUSTOMER'?g.a:g.c;
 const route=`/api/v1/conversations/${id}/read-state`;
 await api(null,'GET',route,undefined,401);
 await api(g.b,'GET',route,undefined,404);
 const foreign=await actor('CUSTOMER');await api(foreign,'GET',route,undefined,404);
 await api(who,'GET',route+'?role=STAFF',undefined,400);
 assert.deepEqual(await api(who,'GET',route),{readThroughSequence:'0'});
 const base=9007199254740992n;
 const make=(offset,senderType,audience,readAt)=>({conversationId:id,sequence:base+BigInt(offset),senderType,
  senderId:senderType===role?who.id:recipient.id,audience,readAt,content:'Synthetic bounded receipt projection'});
 await admin.message.createMany({data:[make(1,role,'CUSTOMER_VISIBLE',new Date()),make(2,role,'INTERNAL',null),
  make(3,role,'CUSTOMER_VISIBLE',null),make(4,role,'CUSTOMER_VISIBLE',new Date()),
  make(5,recipient.role,'CUSTOMER_VISIBLE',null)]});
 const before=await admin.outboxEvent.count({where:{aggregateId:id}});
 assert.deepEqual(await api(who,'GET',route),{readThroughSequence:(base+2n).toString()});
 assert.equal(await admin.message.count({where:{conversationId:id,readAt:null}}),3);
 assert.equal(await admin.outboxEvent.count({where:{aggregateId:id}}),before);
 await api(recipient,'POST',`/api/v1/conversations/${id}/read`,{},200);
 assert.deepEqual(await api(who,'GET',route),{readThroughSequence:(base+4n).toString()});
 assert.equal(await admin.message.count({where:{conversationId:id,audience:'INTERNAL',readAt:null}}),1);
 const ai=(await create(g)).conversation.id;
 await api(g.a,'GET',`/api/v1/conversations/${ai}/read-state`,undefined,404);
 await assign(g,g.b,0);
 await api(g.a,'GET',route,undefined,404);
 await api(g.b,'GET',route,undefined,404);
 await api(g.c,'GET',route);
});

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
  await admin.outboxEvent.create({data:{...{id:event.id,aggregateId:id,eventType:event.eventType},aggregateType:'CONVERSATION',payload:{schemaVersion:2,reason:'MESSAGES_READ',readThroughSequence:'0'},status:'PUBLISHED'}});
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

for(const role of ['CUSTOMER','STAFF']) test(`A4 ${role} message publish retry invalidates the bell without changing read state`,async()=>{
 const g=await group(),id=(await create(g,'DIRECT')).conversation.id;
 const sender=role==='CUSTOMER'?g.a:g.c,recipient=role==='CUSTOMER'?g.c:g.a;
 const message=await admin.message.create({data:{conversationId:id,sequence:1n,senderType:sender.role,senderId:sender.id,
  content:'Synthetic message delivery retry',audience:'CUSTOMER_VISIBLE'}});
 const event=await admin.outboxEvent.create({data:{aggregateType:'CONVERSATION',aggregateId:id,eventType:'MESSAGE_COMMITTED',
  payload:{schemaVersion:2,reason:'MESSAGE_APPENDED',messageId:message.id,sequence:'1',controlVersion:0},
  status:'PROCESSING',leaseOwner:'synthetic-held',leaseExpiresAt:new Date(Date.now()+3600000)}});
 const flags=[],connection=await socket(recipient);
 try{
  const worker=new OutboxDispatcherService({prisma:core},events(),{publishChat:async(e,recipients)=>{
   flags.push(recipients.find(r=>r.actorId===recipient.id)?.notification);
   if(flags.length===1)throw Error('Synthetic first publish failure');
   await app.get(RealtimeService).publishChat(e,recipients);
  }},{});
  await admin.outboxEvent.update({where:{id:event.id},data:{leaseOwner:worker.owner}});
  await worker.process({...event,retryCount:1});
  assert.equal((await admin.outboxEvent.findUniqueOrThrow({where:{id:event.id}})).status,'PENDING');
  const notice=await admin.notification.findFirstOrThrow({where:{conversationId:id,kind:role==='CUSTOMER'?'STAFF_MESSAGE_UNREAD':'CUSTOMER_MESSAGE_UNREAD'}});
  // A user can read the bell while a delivery retry is pending.
  await admin.notification.update({where:{id:notice.id},data:{isRead:true}});
  await admin.outboxEvent.update({where:{id:event.id},data:{status:'PROCESSING',leaseOwner:worker.owner}});
  await worker.process({...event,retryCount:2});
  assert.deepEqual(flags,[true,true]);
  await eventually(()=>connection.frames.some(f=>f.type==='notifications-invalidated'&&f.eventId===event.id));
  assert.equal((await admin.notification.findUniqueOrThrow({where:{id:notice.id}})).isRead,true);
  assert.equal(await admin.notification.count({where:{conversationId:id,kind:notice.kind}}),1);
  assert.equal((await admin.outboxEvent.findUniqueOrThrow({where:{id:event.id}})).status,'PUBLISHED');
  const commands=app.get(ConversationCommandService);
  await commands.transaction(async tx=>{await commands.lock(tx,recipient.id,id);await app.get(ConversationMessageService).markAsRead(tx,recipient,id);});
  const readEvent=await admin.outboxEvent.findFirstOrThrow({where:{aggregateId:id,payload:{path:['reason'],equals:'MESSAGES_READ'}}});
  const readRecipients=await events().route(readEvent);
  assert.equal(readRecipients.find(r=>r.actorId===recipient.id)?.notification,true);
  await app.get(RealtimeService).publishChat(readEvent,readRecipients);
  await eventually(()=>connection.frames.some(f=>f.type==='notifications-invalidated'&&f.eventId===readEvent.id));
  assert.equal(await admin.notification.count({where:{conversationId:id,kind:notice.kind}}),1);
 }finally{connection.ws.terminate();}
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
    await admin.outboxEvent.create({data:{id:event.id,aggregateId:id,aggregateType:'CONVERSATION',eventType:'MESSAGE_COMMITTED',payload:{schemaVersion:2,reason:'MESSAGES_READ',readThroughSequence:'0'},status:'PUBLISHED'}});
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
  await admin.outboxEvent.upsert({where:{id:event.id},create:{id:event.id,aggregateId:id,aggregateType:'CONVERSATION',eventType:'MESSAGE_COMMITTED',payload:{schemaVersion:2,reason:'MESSAGES_READ',readThroughSequence:'0'},status:'PUBLISHED'},update:{}});
  const recipients = await events().route(event), connection = await socket(g.a);
  try { await assign(g, g.b, 0); await app.get(RealtimeService).publishChat(event, recipients); assert.equal(connection.frames.filter(row => row.type === 'chat-invalidated').length, 0); }
  finally { connection.ws.terminate(); }
});

test('Staff socket invalidates visible sources when an assigned Customer is locked', async () => {
  const g = await group(), id = (await create(g, 'DIRECT')).conversation.id;
  const connection = await socket(g.a);
  try {
    await api(g.a, 'GET', `${staff}/${id}/messages`);
    const changed = once(connection.ws, 'message', { signal: AbortSignal.timeout(7000) });
    await admin.user.update({ where: { id: g.c.id }, data: { lockedUntil: new Date(Date.now() + 60000) } });
    const [frame] = await changed;
    assert.deepEqual(JSON.parse(frame.toString()), { type: 'invalidate' });
    await api(g.a, 'GET', `${staff}/${id}/messages`, undefined, 404);
  } finally { connection.ws.terminate(); }
});


test('A4 durable cycles survive bell reads, retries, cleanup and consumer restart for both roles', async () => {
 const g=await group(),id=(await create(g,'DIRECT')).conversation.id;
 for(const [sender,recipient,root,kind] of [[g.a,g.c,staff,'STAFF_MESSAGE_UNREAD'],[g.c,g.a,owned,'CUSTOMER_MESSAGE_UNREAD']]) {
  const send=async()=>{
   const result=await api(sender,'POST',`${root}/${id}/messages`,{clientMessageId:randomUUID(),expectedVersion:0,content:'Synthetic A4 message'},201);
   const event=await admin.outboxEvent.findFirstOrThrow({where:{aggregateId:id,eventType:'MESSAGE_COMMITTED',payload:{path:['messageId'],equals:result.message.id}}});
   await admin.outboxEvent.update({where:{id:event.id},data:{status:'PROCESSING',leaseOwner:'synthetic-held',leaseExpiresAt:new Date(Date.now()+3600000)}});
   return event;
  };
  const first=await send();await Promise.all([events().route(first),events().route(first)]);
  let rows=await admin.notification.findMany({where:{conversationId:id,kind}});assert.equal(rows.length,1);
  const original=rows[0];await admin.notification.update({where:{id:original.id},data:{isRead:true}});
  await events().route(first);assert.equal((await admin.notification.findUniqueOrThrow({where:{id:original.id}})).isRead,true);
  const next=await send();await events().route(next);
  const updated=await admin.notification.findUniqueOrThrow({where:{id:original.id}});assert.equal(updated.isRead,false);assert.equal(+updated.createdAt,+original.createdAt);
  await admin.notification.delete({where:{id:original.id}});await events().route(next);assert.equal(await admin.notification.count({where:{conversationId:id,kind}}),0);
  const fresh=await send();await new ConversationEventService({prisma:core},app.get(require('../dist/conversations/services/conversation-access.service').ConversationAccessService),app.get(ConversationCommandService)).route(fresh);
  assert.equal(await admin.notification.count({where:{conversationId:id,kind}}),1);
  await app.get(ConversationCommandService).transaction(async tx=>{
   await app.get(ConversationCommandService).lock(tx,recipient.id,id);
   await app.get(ConversationMessageService).markAsRead(tx,{id:recipient.id,role:recipient.role},id);
  });
  const readEvent=await admin.outboxEvent.findFirstOrThrow({where:{aggregateId:id,payload:{path:['reason'],equals:'MESSAGES_READ'}},orderBy:{createdAt:'desc'}});
  await events().route(readEvent);await events().route(first);
  assert.equal(await admin.notification.count({where:{conversationId:id,kind,isRead:false}}),0);
  const afterRead=await send();await events().route(afterRead);
  assert.equal(await admin.notification.count({where:{conversationId:id,kind}}),2);
 }
});


test('A4 retention strict cutoff applies to both roles/read states, preserving state and source',async()=>{
 const g=await group(),id=(await create(g,'DIRECT')).conversation.id;
 const {NotificationsService}=require('../dist/notifications/notifications.service');
 await admin.$transaction(async tx=>{
  const ids=[];
  for(const role of ['CUSTOMER','STAFF'])for(const isRead of [true,false])for(const delta of [-1,0,1]) {
   const n=await tx.notification.create({data:{conversationId:id,kind:role==='CUSTOMER'?'STAFF_MESSAGE_UNREAD':'CUSTOMER_MESSAGE_UNREAD',title:'Synthetic retention',dedupKey:randomUUID(),isRead,...(role==='CUSTOMER'?{recipientCustomerId:g.c.id}:{recipientStaffId:g.a.id})}});
   ids.push({id:n.id,delta});
   await tx.$executeRaw`UPDATE business.notifications SET created_at=NOW()-INTERVAL '30 days'+${delta}*INTERVAL '1 millisecond' WHERE id=${n.id}::uuid`;
  }
  await new NotificationsService({prisma:tx}).cleanupExpiredNotifications();
  for(const row of ids)assert.equal(Boolean(await tx.notification.findUnique({where:{id:row.id}})),row.delta>=0);
  assert(await tx.conversation.findUnique({where:{id}}));
 });
});


test('A4 out-of-order delivery and read/send race respect durable boundary and revoked grants',async()=>{
 const g=await group(),id=(await create(g,'DIRECT')).conversation.id;
 const sending=async()=>api(g.c,'POST',`${owned}/${id}/messages`,{clientMessageId:randomUUID(),expectedVersion:0,content:'Synthetic race'},201);
 const a=await sending(),b=await sending();
 const source=async message=>admin.outboxEvent.findFirstOrThrow({where:{aggregateId:id,payload:{path:['messageId'],equals:message.id}}});
 const early=await source(a.message),late=await source(b.message);
 await events().route(late);await events().route(early);
 assert.equal(await admin.notification.count({where:{conversationId:id,recipientStaffId:g.a.id,kind:'CUSTOMER_MESSAGE_UNREAD'}}),1);
 const commands=app.get(ConversationCommandService);
 const read=()=>commands.transaction(async tx=>{await commands.lock(tx,g.a.id,id);return app.get(ConversationMessageService).markAsRead(tx,{id:g.a.id,role:'STAFF'},id);});
 const [,c]=await Promise.all([read(),sending()]);
 const state=await admin.conversationNotificationState.findUniqueOrThrow({where:{recipientUserId_conversationId_kind:{recipientUserId:g.a.id,conversationId:id,kind:'CUSTOMER_MESSAGE_UNREAD'}}});
 const message=await admin.message.findUniqueOrThrow({where:{id:c.message.id}});
 assert.equal(Boolean(message.readAt),message.sequence<=state.readThroughSequence);
 await events().route(await source(c.message));
 assert.equal(await admin.notification.count({where:{conversationId:id,recipientStaffId:g.a.id,isRead:false}}),message.sequence>state.readThroughSequence?1:0);
 await assign(g,g.b,0);
 assert(!(await events().route(late)).some(r=>r.actorId===g.a.id||r.actorId===g.b.id));
});
