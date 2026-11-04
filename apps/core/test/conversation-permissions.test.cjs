// Runs only in the explicit Docker core-tests profile. No host HTTP server,
// password export, shared seed, or mutation of existing team accounts.
require('reflect-metadata');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient, Prisma } = require('../dist/generated/prisma/client');
const { UnauthorizedException } = require('@nestjs/common');
const { ConversationAccessService } = require('../dist/conversations/services/conversation-access.service');
const { ConversationCommandService } = require('../dist/conversations/services/conversation-command.service');
const { ConversationMessageService } = require('../dist/conversations/services/conversation-message.service');
const { AccountManagementService } = require('../dist/accounts/services/account-management.service');
const runId = `i01-${randomUUID()}`;
const userIds = [], conversationIds = [];
function client(role, file) {
  return new PrismaClient({ adapter: new PrismaPg({ host: process.env.PGHOST, database: process.env.I01_TEST_DATABASE,
    user: role, password: readFileSync(file, 'utf8').trim(), max: 8 }) });
}
const admin = client('admin_runtime', '/credentials/admin/password');
const core = client('core_runtime', '/credentials/core/password');
const access = new ConversationAccessService();
const commands = new ConversationCommandService({ prisma: core });
const messages = new ConversationMessageService(access, commands);
const accounts = new AccountManagementService(admin);
const authorized = async () => {};
let staffA, staffB;
const status = expected => error => error.getStatus?.() === expected;

async function user(role) {
  const id = randomUUID(), suffix = BigInt('0x' + id.replaceAll('-', '')).toString();
  const row = await admin.user.create({ data: { id, accountCode: `${role === 'STAFF' ? 'STF' : 'CUS'}-${suffix.slice(0, 22)}`,
    email: `${id}@synthetic.invalid`, passwordHash: 'synthetic-service-fixture-not-for-login', role,
    ...(role === 'STAFF' ? { staffProfile: { create: { fullName: 'Synthetic I01 Staff' } } }
      : { customerProfile: { create: { fullName: 'Synthetic I01 Customer' } } }) } });
  userIds.push(id); return { id: row.id, role };
}
async function customer() {
  const actor = await user('CUSTOMER');
  const assignment = await admin.staffAssignment.create({ data: { customerId: actor.id, staffId: staffA.id, operatorId: runId } });
  return { actor, assignment };
}
async function conversation(owner, kind = 'AI') {
  const data = { customerId: owner.actor.id, channelType: kind === 'COPILOT' ? 'STAFF_COPILOT' : 'CUSTOMER_SUPPORT',
    status: ['DIRECT', 'LEGACY', 'COPILOT'].includes(kind) ? 'STAFF_ACTIVE' : 'AI_ACTIVE',
    supportOrigin: kind === 'COPILOT' ? null : kind === 'LEGACY' ? 'LEGACY_UNKNOWN' : kind,
    createdByCustomerId: ['AI', 'DIRECT'].includes(kind) ? owner.actor.id : null,
    assignedStaffId: ['DIRECT', 'LEGACY', 'COPILOT'].includes(kind) ? staffA.id : null,
    ...(kind === 'DIRECT' ? { directAssignmentId: owner.assignment.id } : {}) };
  const row = await admin.conversation.create({ data }); conversationIds.push(row.id); return row;
}
async function handoff(owner, conv, accepted = false) {
  const now = new Date();
  await admin.conversation.update({ where: { id: conv.id }, data: { status: accepted ? 'STAFF_ACTIVE' : 'PENDING_HANDOFF',
    assignedStaffId: accepted ? staffA.id : null, controlVersion: { increment: 1 } } });
  return admin.conversationHandoff.create({ data: { conversationId: conv.id, customerId: owner.actor.id,
    assignmentId: owner.assignment.id, recipientStaffId: staffA.id, state: accepted ? 'ACCEPTED' : 'PENDING',
    sharedSubject: 'Synthetic request', consentScope: 'ENTIRE_CUSTOMER_VISIBLE_CONVERSATION', consentTextVersion: 'handoff-v1',
    confirmedByCustomerId: owner.actor.id, confirmedAt: now,
    ...(accepted ? { acceptedByStaffId: staffA.id, acceptedAt: now } : {}) } });
}
const read = work => core.$transaction(work, { isolationLevel: 'RepeatableRead' });

before(async () => { staffA = await user('STAFF'); staffB = await user('STAFF'); });
after(async () => {
  try {
    assert.ok(userIds.every(id => /^[a-f0-9-]{36}$/.test(id)) && runId.startsWith('i01-'));
    const messageIds = (await admin.message.findMany({ where: { conversationId: { in: conversationIds } }, select: { id: true } })).map(m => m.id);
    await admin.$transaction(async tx => {
      await tx.auditLog.deleteMany({ where: { OR: [{ actorId: { in: userIds } }, { operatorId: runId }, { targetId: { in: messageIds } }] } });
      await tx.outboxEvent.deleteMany({ where: { aggregateType: 'CONVERSATION', aggregateId: { in: conversationIds } } });
      await tx.conversationCommandReceipt.deleteMany({ where: { actorId: { in: userIds } } });
      await tx.message.deleteMany({ where: { conversationId: { in: conversationIds } } });
      await tx.conversationHandoff.deleteMany({ where: { conversationId: { in: conversationIds } } });
      await tx.conversation.deleteMany({ where: { id: { in: conversationIds } } });
      await tx.staffAssignment.deleteMany({ where: { customerId: { in: userIds } } });
      await tx.customerProfile.deleteMany({ where: { userId: { in: userIds } } });
      await tx.staffProfile.deleteMany({ where: { userId: { in: userIds } } });
      await tx.user.deleteMany({ where: { id: { in: userIds } } });
    }, { timeout: 15000 });
  } finally { await Promise.all([admin.$disconnect(), core.$disconnect()]); }
});

test('AI private, Copilot and legacy controller never imply Staff visibility', async () => {
  const owner = await customer();
  const rows = await Promise.all(['AI', 'COPILOT', 'LEGACY'].map(kind => conversation(owner, kind)));
  for (const row of rows) {
    await assert.rejects(read(tx => access.requireMetadata(tx, staffA.id, row.id)), status(404));
    await assert.rejects(read(tx => access.requireTranscript(tx, staffA.id, row.id)), status(404));
  }
  assert.equal(await core.conversation.count({ where: { id: { in: rows.map(r => r.id) }, AND: [access.staffScope(staffA.id)] } }), 0);
});

test('pending is metadata only; wrong Staff and send remain denied', async () => {
  const owner = await customer(), conv = await conversation(owner);
  await handoff(owner, conv);
  const grant = await read(tx => access.requireMetadata(tx, staffA.id, conv.id));
  assert.equal(grant.capability, 'REQUEST_METADATA'); assert.equal(grant.canAccept, true); assert.equal(grant.canSend, false);
  await assert.rejects(read(tx => access.requireTranscript(tx, staffA.id, conv.id)), status(404));
  await assert.rejects(read(tx => access.requireMetadata(tx, staffB.id, conv.id)), status(404));
  await assert.rejects(messages.send(staffA, conv.id, randomUUID(), 1, 'Synthetic denied', authorized), status(404));
});

test('accepted handoff permits all Customer-facing history from before consent', async () => {
  const owner = await customer(), conv = await conversation(owner);
  await messages.send(owner.actor, conv.id, randomUUID(), 0, 'Synthetic earlier customer', authorized);
  await messages.appendAI(owner.actor.id, conv.id, randomUUID(), 0, 'Synthetic earlier AI', authorized);
  await handoff(owner, conv, true);
  assert.equal((await read(tx => access.requireTranscript(tx, staffA.id, conv.id))).canSend, true);
  const history = await core.message.findMany({ where: { conversationId: conv.id, audience: 'CUSTOMER_VISIBLE' }, orderBy: { sequence: 'asc' } });
  assert.deepEqual(history.map(m => m.senderType), ['CUSTOMER', 'AI_AGENT']);
  await assert.rejects(read(tx => access.requireTranscript(tx, staffB.id, conv.id)), status(404));
});

test('Direct needs current provenance; DB refuses flag flips and cross-customer handoffs', async () => {
  const owner = await customer(), other = await customer(), conv = await conversation(owner, 'DIRECT');
  assert.equal((await read(tx => access.requireTranscript(tx, staffA.id, conv.id))).capability, 'TRANSCRIPT');
  const ai = await conversation(owner);
  await assert.rejects(admin.conversation.update({ where: { id: ai.id }, data: { supportOrigin: 'DIRECT', directAssignmentId: owner.assignment.id } }));
  await assert.rejects(admin.conversationHandoff.create({ data: { conversationId: conv.id, customerId: other.actor.id,
    assignmentId: other.assignment.id, recipientStaffId: staffA.id, sharedSubject: 'Synthetic invalid',
    consentScope: 'ENTIRE_CUSTOMER_VISIBLE_CONVERSATION', consentTextVersion: 'handoff-v1', confirmedByCustomerId: other.actor.id } }));
});

test('DB guards audience, acceptance actor, one current request and immutable consent', async () => {
  const owner = await customer(), copilot = await conversation(owner, 'COPILOT');
  await assert.rejects(admin.message.create({ data: { conversationId: copilot.id, sequence: 1n,
    audience: 'CUSTOMER_VISIBLE', senderType: 'SYSTEM', content: 'Synthetic forbidden' } }));
  const conv = await conversation(owner), evidence = await handoff(owner, conv);
  await assert.rejects(admin.conversationHandoff.update({ where: { id: evidence.id }, data: { state: 'ACCEPTED', acceptedAt: new Date(), acceptedByStaffId: staffB.id } }));
  await assert.rejects(admin.conversationHandoff.update({ where: { id: evidence.id }, data: { sharedSubject: 'Rewritten consent' } }));
  const { id, ...duplicate } = evidence;
  await assert.rejects(admin.conversationHandoff.create({ data: duplicate }));
});

test('concurrent sends use unique ordered sequences without bumping controlVersion', async () => {
  const owner = await customer(), conv = await conversation(owner, 'DIRECT');
  const replies = await Promise.all(Array.from({ length: 8 }, (_, i) => messages.send(staffA, conv.id, randomUUID(), 0, `Synthetic ${i}`, authorized)));
  assert.deepEqual(replies.map(r => Number(r.message.sequence)).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal((await core.conversation.findUnique({ where: { id: conv.id } })).controlVersion, 0);
});

test('same key concurrent retries commit one message, receipt, audit and outbox', async () => {
  const owner = await customer(), conv = await conversation(owner, 'DIRECT'), key = randomUUID();
  const replies = await Promise.all(Array.from({ length: 6 }, () => messages.send(staffA, conv.id, key, 0, 'Synthetic same intent', authorized)));
  assert.equal(new Set(replies.map(r => r.message.id)).size, 1);
  assert.equal(replies.filter(r => !r.replayed).length, 1);
  assert.equal(await core.message.count({ where: { conversationId: conv.id } }), 1);
  assert.equal(await core.conversationCommandReceipt.count({ where: { actorId: staffA.id, clientRequestId: key } }), 1);
  assert.equal(await core.auditLog.count({ where: { targetId: replies[0].message.id } }), 1);
  assert.equal(await core.outboxEvent.count({ where: { aggregateId: conv.id } }), 1);
  await assert.rejects(messages.send(staffA, conv.id, key, 0, 'Different content', authorized), status(409));
});

test('replay bypasses stale original version but never bypasses current session authorization', async () => {
  const owner = await customer(), conv = await conversation(owner, 'DIRECT'), key = randomUUID();
  const original = await messages.send(staffA, conv.id, key, 0, 'Synthetic replay', authorized);
  await admin.conversation.update({ where: { id: conv.id }, data: { controlVersion: 1 } });
  assert.equal((await messages.send(staffA, conv.id, key, 0, 'Synthetic replay', authorized)).message.id, original.message.id);
  await assert.rejects(messages.send(staffA, conv.id, key, 0, 'Synthetic replay', async () => { throw new UnauthorizedException(); }), status(401));
  await assert.rejects(messages.send(staffA, conv.id, randomUUID(), 0, 'Synthetic stale', authorized), status(409));
});

test('outbox failure rolls back message, counter, activity, audit and receipt', async () => {
  const owner = await customer(), conv = await conversation(owner, 'DIRECT');
  const receiptsBefore = await core.conversationCommandReceipt.count({ where: { actorId: staffA.id } });
  const auditBefore = await core.auditLog.count({ where: { actorId: staffA.id } });
  const failingCommands = new ConversationCommandService({ prisma: core });
  failingCommands.transaction = work => core.$transaction(tx => work(new Proxy(tx, { get(target, property) {
    if (property === 'outboxEvent') return { create: async () => { throw new Error('Synthetic injected failure'); } };
    const value = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value;
  } })));
  const failing = new ConversationMessageService(access, failingCommands);
  await assert.rejects(failing.send(staffA, conv.id, randomUUID(), 0, 'Synthetic rollback', authorized), /injected failure/);
  assert.equal(await core.message.count({ where: { conversationId: conv.id } }), 0);
  const current = await core.conversation.findUnique({ where: { id: conv.id } });
  assert.equal(current.nextMessageSequence, 0n); assert.equal(current.lastCustomerFacingActivityAt, null);
  assert.equal(await core.conversationCommandReceipt.count({ where: { actorId: staffA.id } }), receiptsBefore);
  assert.equal(await core.auditLog.count({ where: { actorId: staffA.id } }), auditBefore);
  assert.equal(await core.outboxEvent.count({ where: { aggregateId: conv.id } }), 0);
});

test('AI is fenced at pending, even for old internal operation retries', async () => {
  const owner = await customer(), conv = await conversation(owner), key = randomUUID();
  const first = await messages.appendAI(owner.actor.id, conv.id, key, 0, 'Synthetic AI', authorized);
  assert.equal((await messages.appendAI(owner.actor.id, conv.id, key, 0, 'Synthetic AI', authorized)).id, first.id);
  await handoff(owner, conv);
  await assert.rejects(messages.appendAI(owner.actor.id, conv.id, key, 0, 'Synthetic AI', authorized), status(409));
  await assert.rejects(messages.appendAI(owner.actor.id, conv.id, randomUUID(), 1, 'Synthetic late', authorized), status(409));
  const pending = await admin.conversationHandoff.findFirst({ where: { conversationId: conv.id } });
  await admin.conversationHandoff.update({ where: { id: pending.id }, data: { state: 'ACCEPTED', acceptedAt: new Date(), acceptedByStaffId: staffA.id } });
  await admin.conversation.update({ where: { id: conv.id }, data: { status: 'STAFF_ACTIVE', assignedStaffId: staffA.id, controlVersion: 2 } });
  await assert.rejects(messages.appendAI(owner.actor.id, conv.id, randomUUID(), 2, 'Synthetic after Accept', authorized), status(409));
  assert.equal(await core.message.count({ where: { conversationId: conv.id } }), 1);
});

test('a locked recipient loses metadata, transcript and send capability', async () => {
  const owner = await customer(), conv = await conversation(owner, 'DIRECT');
  await admin.user.update({ where: { id: staffA.id }, data: { lockedUntil: new Date(Date.now() + 60000) } });
  try {
    await assert.rejects(read(tx => access.requireMetadata(tx, staffA.id, conv.id)), status(404));
    await assert.rejects(messages.send(staffA, conv.id, randomUUID(), 0, 'Synthetic denied', authorized), status(404));
  } finally { await admin.user.update({ where: { id: staffA.id }, data: { lockedUntil: null } }); }
});

test('assignment revoke and reassignment to the same Staff never restore old grants or receipts', async () => {
  const owner = await customer(), direct = await conversation(owner, 'DIRECT'), transferred = await conversation(owner);
  const evidence = await handoff(owner, transferred, true), key = randomUUID();
  await messages.send(staffA, transferred.id, key, 1, 'Synthetic pre-revoke', authorized);
  await accounts.assign(owner.actor.id, { expectedVersion: 0, staffId: staffB.id }, { operatorId: runId, requestId: randomUUID() });
  for (const actor of [staffA, staffB]) for (const conv of [direct, transferred])
    await assert.rejects(read(tx => access.requireTranscript(tx, actor.id, conv.id)), status(404));
  assert.equal((await core.conversationHandoff.findUnique({ where: { id: evidence.id } })).state, 'REVOKED');
  await accounts.assign(owner.actor.id, { expectedVersion: 1, staffId: staffA.id }, { operatorId: runId, requestId: randomUUID() });
  await assert.rejects(messages.send(staffA, transferred.id, key, 1, 'Synthetic pre-revoke', authorized), status(404));
  await assert.rejects(read(tx => access.requireTranscript(tx, staffA.id, direct.id)), status(404));
  assert.equal(await core.message.count({ where: { conversationId: transferred.id } }), 1);
  await assert.rejects(messages.appendAI(owner.actor.id, transferred.id, randomUUID(), 2, 'No implicit AI resume', authorized), status(409));
});

test('send racing reassignment either commits before revoke or is denied, never afterward', async () => {
  const owner = await customer(), conv = await conversation(owner, 'DIRECT');
  const results = await Promise.allSettled([
    messages.send(staffA, conv.id, randomUUID(), 0, 'Synthetic race', authorized),
    accounts.assign(owner.actor.id, { expectedVersion: 0, staffId: staffB.id }, { operatorId: runId, requestId: randomUUID() }),
  ]);
  assert.equal(results[1].status, 'fulfilled');
  if (results[0].status === 'rejected') assert.equal(results[0].reason.getStatus(), 404);
  await assert.rejects(messages.send(staffA, conv.id, randomUUID(), 1, 'Synthetic after revoke', authorized), status(404));
  assert.equal((await core.conversation.findUnique({ where: { id: conv.id } })).assignedStaffId, null);
});

test('locked Customer removes Staff visibility and prevents writes', async () => {
  const owner = await customer(), conv = await conversation(owner, 'DIRECT');
  await admin.user.update({ where: { id: owner.actor.id }, data: { status: 'LOCKED' } });
  await assert.rejects(read(tx => access.requireTranscript(tx, staffA.id, conv.id)), status(404));
  await assert.rejects(messages.send(owner.actor, conv.id, randomUUID(), 0, 'Synthetic denied', authorized), status(404));
});

test('canonical hashes and Unicode validation are stable; projection excludes tool payload', async () => {
  assert.equal(commands.hash({ b: 2, a: [1, null] }), commands.hash({ a: [1, null], b: 2 }));
  assert.throws(() => commands.hash({ unsupported: undefined }));
  const owner = await customer(), conv = await conversation(owner, 'DIRECT');
  const sent = await messages.send(owner.actor, conv.id, randomUUID(), 0, '😀'.repeat(4000), authorized);
  assert.equal([...sent.message.content].length, 4000);
  assert.ok(!('toolCallsMetadata' in sent.message) && !('citations' in sent.message));
  await assert.rejects(messages.send(owner.actor, conv.id, randomUUID(), 0, '😀'.repeat(4001), authorized), status(400));
  await assert.rejects(messages.send(owner.actor, conv.id, randomUUID(), 0, '  \n ', authorized), status(400));
});

test('transaction retries are bounded and only retry serialization/deadlock failures', async () => {
  let attempts = 0;
  const conflict = () => new Prisma.PrismaClientKnownRequestError('Synthetic serialization', { code: 'P2034', clientVersion: 'test' });
  const retrying = new ConversationCommandService({ prisma: { $transaction: async work => {
    if (++attempts < 3) throw conflict(); return work({});
  } } });
  assert.equal(await retrying.transaction(async () => 42), 42); assert.equal(attempts, 3);
  attempts = 0;
  const bounded = new ConversationCommandService({ prisma: { $transaction: async () => { attempts++; throw conflict(); } } });
  await assert.rejects(bounded.transaction(async () => 42)); assert.equal(attempts, 3);
  attempts = 0;
  const normal = new ConversationCommandService({ prisma: { $transaction: async () => { attempts++; throw new Error('Synthetic non-retryable'); } } });
  await assert.rejects(normal.transaction(async () => 42), /non-retryable/); assert.equal(attempts, 1);
});
