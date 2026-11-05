require('reflect-metadata');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient, Prisma } = require('../dist/generated/prisma/client');
const { TicketAccessService } = require('../dist/tickets/services/ticket-access.service');
const { ConversationAccessService } = require('../dist/conversations/services/conversation-access.service');

const runId = randomUUID(), users = [], tickets = [], conversations = [];
function client(role, file) {
  return new PrismaClient({ adapter: new PrismaPg({ host: process.env.PGHOST,
    database: process.env.I01_TEST_DATABASE, user: role, password: readFileSync(file, 'utf8').trim(), max: 4 }) });
}
const admin = client('admin_runtime', '/credentials/admin/password');
const core = client('core_runtime', '/credentials/core/password');
const access = new TicketAccessService(), chatAccess = new ConversationAccessService();
const read = work => core.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
const denied = failure => failure.getStatus?.() === 404;
let staffA, staffB;
async function user(role) {
  const id = randomUUID();
  const row = await admin.user.create({ data: { id, role,
    accountCode: `${role === 'STAFF' ? 'STF' : 'CUS'}-${BigInt('0x' + id.replaceAll('-', '')).toString().slice(0, 22)}`,
    email: `${id}@synthetic.invalid`, passwordHash: 'synthetic-ticket-fixture-not-for-login',
    ...(role === 'STAFF' ? { staffProfile: { create: { fullName: 'Synthetic Ticket Staff' } } }
      : { customerProfile: { create: { fullName: 'Synthetic Ticket Customer' } } }) } });
  users.push(id); return row;
}
async function fixture(recipient = staffA.id, status = 'ASSIGNED') {
  const customer = await user('CUSTOMER');
  const assignment = await admin.staffAssignment.create({ data: { staffId: staffA.id, customerId: customer.id, operatorId: runId } });
  const id = randomUUID();
  const ticket = await admin.supportTicket.create({ data: { id, ticketCode: `TK-${id}`, customerId: customer.id,
    assignedStaffId: recipient, status, title: 'Synthetic Ticket', aiSummary: 'Synthetic unverified summary',
    extractedDetails: { synthetic: true, confirmedContent: 'Not confirmation evidence' },
    idempotencyKey: id, confirmedAt: new Date('2026-01-01T00:00:00Z') } });
  tickets.push(id); return { customer, assignment, ticket };
}
before(async () => { staffA = await user('STAFF'); staffB = await user('STAFF'); });
after(async () => {
  try {
    await admin.$transaction(async tx => {
      await tx.supportTicket.deleteMany({ where: { id: { in: tickets } } });
      await tx.conversation.deleteMany({ where: { id: { in: conversations } } });
      await tx.staffAssignment.deleteMany({ where: { customerId: { in: users } } });
      await tx.customerProfile.deleteMany({ where: { userId: { in: users } } });
      await tx.staffProfile.deleteMany({ where: { userId: { in: users } } });
      await tx.user.deleteMany({ where: { id: { in: users } } });
    });
    assert.equal(await admin.supportTicket.count({ where: { id: { in: tickets } } }), 0);
    assert.equal(await admin.user.count({ where: { id: { in: users } } }), 0);
  } finally { await Promise.all([admin.$disconnect(), core.$disconnect()]); }
});

test('recipient and active assignment are both required before ticket projection', async () => {
  const { ticket, customer } = await fixture();
  const value = await read(tx => access.requireTicket(tx, staffA.id, ticket.id));
  assert.equal(value.version, 0); assert.equal(value.allowedActions.accept, true);
  assert.deepEqual(Object.keys(value).sort(), ['allowedActions', 'assignedStaffId', 'confirmationSource', 'confirmedContent', 'customerId', 'id', 'status', 'version']);
  await assert.rejects(read(tx => access.requireTicket(tx, staffB.id, ticket.id)), denied);
  await assert.rejects(read(tx => access.requireTicket(tx, customer.id, ticket.id)), denied);
  await assert.rejects(read(tx => access.requireTicket(tx, staffA.id, randomUUID())), denied);
  const wrongRecipient = await fixture(staffB.id);
  for (const actor of [staffA.id, staffB.id]) await assert.rejects(read(tx => access.requireTicket(tx, actor, wrongRecipient.ticket.id)), denied);
});
test('unassigned OPEN tickets do not create a global or customer-assignment queue', async () => {
  const { ticket } = await fixture(null, 'OPEN');
  await assert.rejects(read(tx => access.requireTicket(tx, staffA.id, ticket.id)), denied);
  assert.equal(await read(tx => tx.supportTicket.count({ where: access.staffScope(staffA.id) })),
    await admin.supportTicket.count({ where: access.staffScope(staffA.id) }));
});
test('only ASSIGNED has the future accept capability; status does not grant chat', async () => {
  for (const status of ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']) {
    const { ticket } = await fixture(staffA.id, status);
    assert.equal((await read(tx => access.requireTicket(tx, staffA.id, ticket.id))).allowedActions.accept, false);
  }
});
test('assignment revocation and reassignment do not transfer ticket recipient authority', async () => {
  const { ticket, assignment, customer } = await fixture();
  await admin.$transaction(async tx => {
    await tx.staffAssignment.update({ where: { id: assignment.id }, data: { isActive: false, endedAt: new Date() } });
    await tx.staffAssignment.create({ data: { staffId: staffB.id, customerId: customer.id, operatorId: runId } });
  });
  for (const actor of [staffA.id, staffB.id]) await assert.rejects(read(tx => access.requireTicket(tx, actor, ticket.id)), denied);
});
test('locked Staff loses ticket scope; a locked customer can still receive Staff service', async () => {
  const { ticket, customer } = await fixture();
  await admin.user.update({ where: { id: customer.id }, data: { status: 'LOCKED' } });
  assert.equal((await read(tx => access.requireTicket(tx, staffA.id, ticket.id))).id, ticket.id);
  for (const data of [{ status: 'LOCKED' }, { status: 'ACTIVE', lockedUntil: new Date(Date.now() + 60000) }]) {
    try {
      await admin.user.update({ where: { id: staffA.id }, data });
      await assert.rejects(read(tx => access.requireTicket(tx, staffA.id, ticket.id)), denied);
    } finally { await admin.user.update({ where: { id: staffA.id }, data: { status: 'ACTIVE', lockedUntil: null } }); }
  }
});
test('Ticket linked to private AI never opens metadata/history or mutates chat', async () => {
  const { customer, ticket } = await fixture();
  const conversation = await admin.conversation.create({ data: { customerId: customer.id, channelType: 'CUSTOMER_SUPPORT',
    status: 'AI_ACTIVE', supportOrigin: 'AI', createdByCustomerId: customer.id } });
  conversations.push(conversation.id);
  await admin.supportTicket.update({ where: { id: ticket.id }, data: { conversationId: conversation.id } });
  await read(tx => access.requireTicket(tx, staffA.id, ticket.id));
  await assert.rejects(read(tx => chatAccess.requireMetadata(tx, staffA.id, conversation.id)), denied);
  await assert.rejects(read(tx => chatAccess.requireTranscript(tx, staffA.id, conversation.id)), denied);
  const after = await admin.conversation.findUnique({ where: { id: conversation.id } });
  assert.equal(after.status, 'AI_ACTIVE'); assert.equal(after.controlVersion, conversation.controlVersion);
  assert.equal(await admin.conversationHandoff.count({ where: { conversationId: conversation.id } }), 0);
});
test('confirmation time/AI fields are preserved and never projected as reviewed content', async () => {
  const { ticket } = await fixture();
  const projected = await read(tx => access.requireTicket(tx, staffA.id, ticket.id));
  assert.equal(projected.confirmationSource, 'LEGACY_UNVERIFIED'); assert.equal(projected.confirmedContent, null);
  assert.equal('aiSummary' in projected, false); assert.equal('extractedDetails' in projected, false);
  const current = await admin.supportTicket.findUnique({ where: { id: ticket.id } });
  assert.equal(current.aiSummary, ticket.aiSummary); assert.deepEqual(current.extractedDetails, ticket.extractedDetails);
  assert.equal(current.confirmedAt.toISOString(), ticket.confirmedAt.toISOString()); assert.equal(current.version, 0);
});
