// Private stdin/stdout protocol used only by browser integration tests inside core-tests.
// Never invoke setup interactively: its output contains short-lived synthetic session tokens.
const { readFileSync } = require('node:fs');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { PrismaClient } = require('../../dist/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const hash = value => createHash('sha256').update(value).digest('hex');
const db = new PrismaClient({ adapter: new PrismaPg({ host: process.env.PGHOST, database: process.env.I01_TEST_DATABASE, user: 'admin_runtime', password: readFileSync('/credentials/admin/password', 'utf8').trim() }) });
async function cleanup(runId) {
  if (!/^i04-[0-9a-f-]{36}$/.test(runId)) throw new Error('Invalid fixture namespace');
  const ids = (await db.user.findMany({ where: { email: { endsWith: `@${runId}.synthetic.invalid` } }, select: { id: true } })).map(row => row.id);
  const conversations = (await db.conversation.findMany({ where: { customerId: { in: ids } }, select: { id: true } })).map(row => row.id);
  const messages = (await db.message.findMany({ where: { conversationId: { in: conversations } }, select: { id: true } })).map(row => row.id);
  await db.$transaction(async tx => {
    await tx.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { operatorId: runId }, { targetId: { in: messages } }] } });
    await tx.outboxEvent.deleteMany({ where: { aggregateType: 'CONVERSATION', aggregateId: { in: conversations } } });
    await tx.conversationCommandReceipt.deleteMany({ where: { actorId: { in: ids } } });
    await tx.notification.deleteMany({ where: { conversationId: { in: conversations } } });
    await tx.message.deleteMany({ where: { conversationId: { in: conversations } } });
    await tx.conversationHandoff.deleteMany({ where: { conversationId: { in: conversations } } });
    await tx.conversation.deleteMany({ where: { id: { in: conversations } } });
    await tx.rateLimitBucket.deleteMany({ where: { clientToken: { in: ids.map(hash) } } });
    await tx.authSession.deleteMany({ where: { userId: { in: ids } } });
    await tx.staffAssignment.deleteMany({ where: { customerId: { in: ids } } });
    await tx.customerProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.staffProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.user.deleteMany({ where: { id: { in: ids } } });
  }, { timeout: 20000 });
}
async function actor(role, runId) {
  const id = randomUUID(), token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex');
  await db.user.create({ data: { id, role, email: `${id}@${runId}.synthetic.invalid`, accountCode: `${role === 'STAFF' ? 'STF' : 'CUS'}-${BigInt('0x' + id.replaceAll('-', '')).toString().slice(0, 22)}`, passwordHash: 'synthetic-browser-fixture-not-for-login', passwordChangeRecommended: false,
    ...(role === 'STAFF' ? { staffProfile: { create: { fullName: 'Synthetic I04 Staff' } } } : { customerProfile: { create: { fullName: 'Synthetic I04 Customer' } } }) } });
  await db.authSession.create({ data: { userId: id, tokenHash: hash(token), csrfTokenHash: hash(csrf), expiresAt: new Date(Date.now() + 3600000) } });
  return { id, token, csrf };
}
async function main() {
  const command = JSON.parse(readFileSync(0, 'utf8'));
  if (command.action === 'append' || command.action === 'reassign') {
    if (!/^i04-[0-9a-f-]{36}$/.test(command.runId)) throw new Error('Invalid fixture namespace');
    const conversation = await db.conversation.findFirst({ where: { id: command.conversationId, customer: { user: { email: { endsWith: `@${command.runId}.synthetic.invalid` } } } } });
    if (!conversation) throw new Error('Outside fixture namespace');
    if (command.action === 'reassign') {
      const target = await db.user.findFirst({ where: { id: command.staffId, role: 'STAFF', email: { endsWith: `@${command.runId}.synthetic.invalid` } } });
      if (!target) throw new Error('Outside fixture namespace');
      const { AccountManagementService } = require('../../dist/accounts/services/account-management.service');
      const assignment = await db.customerProfile.findUniqueOrThrow({ where: { userId: conversation.customerId }, select: { assignmentVersion: true } });
      await new AccountManagementService(db).assign(conversation.customerId, { expectedVersion: assignment.assignmentVersion, staffId: target.id }, { operatorId: command.runId, requestId: randomUUID() });
      return { changed: true };
    }
    if (!Number.isInteger(command.count) || command.count < 1 || command.count > 150) throw new Error('Invalid fixture batch');
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM business.conversations WHERE id=${conversation.id}::uuid FOR UPDATE`;
      const current = await tx.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
      await tx.message.createMany({ data: Array.from({ length: command.count }, (_, i) => ({ conversationId: current.id, sequence: current.nextMessageSequence + 1n + BigInt(i), senderType: 'CUSTOMER', senderId: current.customerId, audience: 'CUSTOMER_VISIBLE', content: `Synthetic reconnect backlog ${i}` })) });
      await tx.conversation.update({ where: { id: current.id }, data: { nextMessageSequence: { increment: command.count }, lastCustomerFacingActivityAt: new Date() } });
    });
    return { appended: command.count };
  }
  if (command.action === 'cleanup') { await cleanup(command.runId); return { cleaned: true }; }
  if (command.action !== 'setup') throw new Error('Unknown fixture action');
  const { runId } = command;
  if (!/^i04-[0-9a-f-]{36}$/.test(runId)) throw new Error('Invalid fixture namespace');
  try {
    const staff = await actor('STAFF', runId), other = await actor('STAFF', runId), customer = await actor('CUSTOMER', runId);
    await db.staffAssignment.create({ data: { customerId: customer.id, staffId: staff.id, operatorId: runId } });
    const api = async (path, body) => {
      const response = await fetch(`http://gateway/api/v1/customers/me/${path}`, { method: 'POST', headers: { Cookie: `li_session=${customer.token}; li_csrf=${customer.csrf}`, Origin: 'http://localhost:8080', 'Content-Type': 'application/json', 'X-Auth-Request': '1', 'X-CSRF-Token': customer.csrf }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(`Fixture API status ${response.status}`);
      return response.json();
    };
    const privateAi = (await api('conversations', { kind: 'AI', subject: 'Synthetic private AI', clientRequestId: randomUUID() })).conversation;
    const shared = (await api('conversations', { kind: 'AI', subject: 'Synthetic shared AI', clientRequestId: randomUUID() })).conversation;
    await db.message.createMany({ data: Array.from({ length: 125 }, (_, i) => ({ conversationId: shared.id, sequence: 9007199254740993n + BigInt(i), senderType: i % 2 ? 'AI_AGENT' : 'CUSTOMER', senderId: i % 2 ? null : customer.id, audience: 'CUSTOMER_VISIBLE', content: `Synthetic I04 history ${i}`, createdAt: new Date('2026-01-01') })) });
    await db.message.create({ data: { conversationId: shared.id, sequence: 9007199254741118n, senderType: 'AI_AGENT', audience: 'INTERNAL', content: 'I04_INTERNAL_MUST_NOT_APPEAR' } });
    await db.conversation.update({ where: { id: shared.id }, data: { nextMessageSequence: 9007199254741118n } });
    await api(`conversations/${shared.id}/handoff-requests`, { clientRequestId: randomUUID(), expectedVersion: 0, expectedAssignmentVersion: 0, sharedSubject: 'Synthetic I04 support', sharedReason: 'Synthetic I04 customer consent', consent: { confirmed: true, textVersion: 'handoff-v1', scope: 'ENTIRE_CUSTOMER_VISIBLE_CONVERSATION' } });
    return { staff, other, customer, conversationId: shared.id, privateId: privateAi.id };
  } catch (error) { await cleanup(runId); throw error; }
}
main().then(result => process.stdout.write(JSON.stringify(result))).catch(() => { process.stderr.write('Synthetic browser fixture failed\n'); process.exitCode = 1; }).finally(() => db.$disconnect());
