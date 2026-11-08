// Isolated real-stack browser fixtures. Private stdin/stdout, no credentials logged.
const { readFileSync } = require('node:fs');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { PrismaClient, Prisma } = require('../../dist/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { hashPassword } = require('../../dist/accounts/utils/password');
const PDFDocument = require('pdfkit');
const { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { action, runId } = JSON.parse(readFileSync(0, 'utf8'));
if (!/^[0-9a-f-]{36}$/.test(runId) || !['setup', 'cleanup', 'inspect', 'conflict', 'revoke', 'restore', 'remove-object', 'restore-object', 'deactivate', 'expire-sessions'].includes(action)) throw new Error('Invalid fixture intent');
const prefix = `staff-browser/${runId}/`, marker = `SE-${runId}`, suffix = `.${runId}@synthetic.invalid`;
const bucket = process.env.STORAGE_BUCKET, hash = value => createHash('sha256').update(value).digest('hex');
const db = new PrismaClient({ adapter: new PrismaPg({ host: process.env.PGHOST, database: process.env.I01_TEST_DATABASE,
  user: 'admin_runtime', password: readFileSync('/credentials/admin/password', 'utf8').trim() }) });
function storage(role) { return new S3Client({ endpoint: 'http://minio:9000', region: process.env.STORAGE_REGION, forcePathStyle: true,
  credentials: { accessKeyId: readFileSync(`/credentials/${role}/access-key`, 'utf8').trim(), secretAccessKey: readFileSync(`/credentials/${role}/secret-key`, 'utf8').trim() } }); }
const writer = storage('storage-writer'), cleaner = storage('storage-test-cleanup');
const ownUsers = () => db.user.findMany({ where: { email: { endsWith: suffix } }, orderBy: { email: 'asc' } });
async function pdf(label) { return new Promise(resolve => {
  const doc = new PDFDocument({ compress: false, info: { Title: `Synthetic staff verification ${label}` } }), chunks = [];
  doc.on('data', part => chunks.push(part)); doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.text(`Fully synthetic isolated staff browser fixture ${runId}, ${label}. Not an issued contract.`); doc.end();
}); }
async function upload() {
  const versions = await db.documentVersion.findMany({ where: { document: { product: { productCode: { startsWith: marker } } } } });
  for (const version of versions) {
    const bytes = await pdf(version.versionNumber);
    await writer.send(new PutObjectCommand({ Bucket: bucket, Key: version.storageObjectKey, Body: bytes, ContentType: 'application/pdf' }));
    await db.documentVersion.update({ where: { id: version.id }, data: { checksumSha256: hash(bytes) } });
  }
}
async function cleanup() {
  let token;
  do {
    const listed = await cleaner.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    for (const object of listed.Contents ?? []) {
      if (!object.Key.startsWith(prefix)) throw new Error('Unsafe fixture object');
      await cleaner.send(new DeleteObjectCommand({ Bucket: bucket, Key: object.Key }));
    }
    token = listed.NextContinuationToken;
  } while (token);
  await db.$transaction(async tx => {
    const users = await ownUsers(), ids = users.map(u => u.id);
    if (ids.length) await tx.$queryRaw`SELECT id FROM business.users WHERE id::text IN (${Prisma.join([...ids].sort())}) ORDER BY id FOR UPDATE`;
    const convs = (await tx.conversation.findMany({ where: { customerId: { in: ids } }, select: { id: true } })).map(c => c.id);
    const tickets = (await tx.supportTicket.findMany({ where: { customerId: { in: ids } }, select: { id: true } })).map(t => t.id);
    await tx.notification.deleteMany({ where: { OR: [{ recipientStaffId: { in: ids } }, { conversationId: { in: convs } }, { ticketId: { in: tickets } }] } });
    await tx.outboxEvent.deleteMany({ where: { OR: [{ aggregateType: 'CONVERSATION', aggregateId: { in: convs } }, { aggregateType: 'TICKET', aggregateId: { in: tickets } }] } });
    await tx.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { targetId: { in: ids } }, { operatorId: runId }] } });
    await tx.supportTicket.deleteMany({ where: { id: { in: tickets } } });
    await tx.conversationCommandReceipt.deleteMany({ where: { actorId: { in: ids } } });
    await tx.message.deleteMany({ where: { conversationId: { in: convs } } });
    await tx.conversationHandoff.deleteMany({ where: { conversationId: { in: convs } } });
    await tx.conversation.deleteMany({ where: { id: { in: convs } } });
    const docs = (await tx.document.findMany({ where: { product: { productCode: { startsWith: marker } } }, select: { id: true } })).map(d => d.id);
    await tx.document.updateMany({ where: { id: { in: docs } }, data: { currentVersion: null } });
    await tx.documentVersion.deleteMany({ where: { documentId: { in: docs } } });
    await tx.document.deleteMany({ where: { id: { in: docs } } });
    await tx.insurancePolicy.deleteMany({ where: { customerId: { in: ids } } });
    await tx.insuranceProduct.deleteMany({ where: { productCode: { startsWith: marker } } });
    await tx.authSession.deleteMany({ where: { userId: { in: ids } } });
    const fixtureEmails = ['staff', 'other-staff', 'foreign', ...Array.from({ length: 12 }, (_, i) => `customer-${String(i + 1).padStart(2, '0')}`)]
      .map(slot => slot + suffix);
    await tx.rateLimitBucket.deleteMany({ where: { clientToken: { in: [...ids, ...fixtureEmails].map(hash) } } });
    await tx.staffAssignment.deleteMany({ where: { customerId: { in: ids } } });
    await tx.customerProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.staffProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.user.deleteMany({ where: { id: { in: ids } } });
  }, { timeout: 30000 });
  return { users: (await ownUsers()).length, products: await db.insuranceProduct.count({ where: { productCode: { startsWith: marker } } }),
    objects: (await cleaner.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }))).KeyCount ?? 0 };
}
async function setup() {
  const password = `Synthetic-${randomBytes(12).toString('hex')}!`, passwordHash = await hashPassword(password);
  async function actor(role, slot) {
    const id = randomUUID(), token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex');
    const accountCode = `${role === 'STAFF' ? 'STF' : 'CUS'}-${BigInt('0x' + id.replaceAll('-', '')).toString().slice(0, 22)}`;
    const email = `${slot}${suffix}`, fullName = `${marker} ${slot}`;
    await db.user.create({ data: { id, role, accountCode, email, passwordHash, passwordChangeRecommended: false,
      ...(role === 'STAFF' ? { staffProfile: { create: { fullName } } } : { customerProfile: { create: { fullName, assignmentVersion: 1 } } }) } });
    await db.authSession.create({ data: { userId: id, tokenHash: hash(token), csrfTokenHash: hash(csrf), expiresAt: new Date(Date.now() + 3600000) } });
    return { id, token, csrf, email, fullName, accountCode, password };
  }
  try {
    const staff = await actor('STAFF', 'staff'), otherStaff = await actor('STAFF', 'other-staff'), customers = [];
    for (let i = 1; i <= 12; i++) {
      const customer = await actor('CUSTOMER', `customer-${String(i).padStart(2, '0')}`); customers.push(customer);
      await db.staffAssignment.create({ data: { customerId: customer.id, staffId: staff.id, operatorId: runId } });
    }
    const foreign = await actor('CUSTOMER', 'foreign');
    await db.staffAssignment.create({ data: { customerId: foreign.id, staffId: otherStaff.id, operatorId: runId } });
    const owner = customers[0], policies = [];
    for (let i = 1; i <= 12; i++) {
      const product = await db.insuranceProduct.create({ data: { productCode: `${marker}-${i}`, name: `${marker} Product ${i}` } });
      policies.push(await db.insurancePolicy.create({ data: { customerId: owner.id, productId: product.id, policyNumber: `${marker}-P${String(i).padStart(2, '0')}`,
        status: 'ACTIVE', premiumAmount: '6000000.00', paymentFrequency: 'SEMI_ANNUAL', sumAssured: '750000000.00', nextDueDate: new Date('2027-01-01') } }));
    }
    const main = await db.document.create({ data: { title: `${marker} Main contract`, accessScope: 'PRIVATE_POLICY', policyId: policies[0].id, ownerCustomerId: owner.id, productId: policies[0].productId } });
    const terms = await db.document.create({ data: { title: `${marker} Applied terms`, accessScope: 'PUBLIC', productId: policies[0].productId } });
    const versions = [];
    for (const doc of [main, terms]) {
      for (const versionNumber of ['1.0', '2.0']) {
        versions.push(await db.documentVersion.create({ data: { documentId: doc.id, versionNumber, storageBucket: bucket,
          storageObjectKey: `${prefix}${doc.id}-${versionNumber}.pdf`, checksumSha256: '0'.repeat(64) } }));
      }
      await db.document.update({ where: { id: doc.id }, data: { currentVersion: '2.0' } });
    }
    await db.insurancePolicy.update({ where: { id: policies[0].id }, data: { benefitsSnapshot: { schemaVersion: 1, currency: 'VND', riders: [], ridersComplete: true,
      documents: { main: { documentId: main.id, version: '1.0', kind: 'POLICY' }, terms: { documentId: terms.id, version: '1.0', kind: 'TERMS' } } } } });
    await upload();
    const assignment = await db.staffAssignment.findFirstOrThrow({ where: { customerId: owner.id, isActive: true } });
    const conversation = await db.conversation.create({ data: { customerId: owner.id, channelType: 'CUSTOMER_SUPPORT', status: 'STAFF_ACTIVE', supportOrigin: 'DIRECT',
      createdByCustomerId: owner.id, directAssignmentId: assignment.id, assignedStaffId: staff.id, subject: `${marker} Direct support`, lastCustomerFacingActivityAt: new Date() } });
    const hidden = await db.conversation.create({ data: { customerId: owner.id, channelType: 'CUSTOMER_SUPPORT', status: 'AI_ACTIVE', supportOrigin: 'AI', createdByCustomerId: owner.id, subject: `${marker} Private AI must stay hidden` } });
    const ticket = await db.supportTicket.create({ data: { customerId: owner.id, assignedStaffId: staff.id, ticketCode: `${marker}-TK`, title: `${marker} Support ticket`, status: 'ASSIGNED', idempotencyKey: runId, confirmedAt: new Date() } });
    const version = await db.documentVersion.findUniqueOrThrow({ where: { id: versions[0].id } });
    return { staff, otherStaff, owner, customers, foreign, search: marker, policy: policies[0], mainId: main.id, versionId: version.id,
      otherVersionId: versions[1].id, termsId: terms.id, checksum: version.checksumSha256, conversationId: conversation.id, hiddenId: hidden.id, ticketId: ticket.id };
  } catch (error) { await cleanup(); throw error; }
}
async function main() {
  if (action === 'setup') return setup();
  if (action === 'cleanup') return cleanup();
  const staff = await db.user.findUniqueOrThrow({ where: { email: `staff${suffix}` } });
  const owner = await db.user.findUniqueOrThrow({ where: { email: `customer-01${suffix}` } });
  if (action === 'conflict') { await db.$transaction(async tx => {
    await tx.user.update({ where: { id: staff.id }, data: { phone: null } });
    await tx.staffProfile.update({ where: { userId: staff.id }, data: { fullName: `${marker} Concurrent edit` } });
  }); return { changed: true }; }
  if (action === 'revoke' || action === 'restore') {
    await db.staffAssignment.updateMany({ where: { customerId: owner.id, staffId: staff.id }, data: { isActive: action === 'restore', endedAt: action === 'revoke' ? new Date() : null } });
    return { changed: true };
  }
  if (action === 'expire-sessions') { await db.authSession.updateMany({ where: { userId: staff.id }, data: { revokedAt: new Date() } }); return { changed: true }; }
  if (action === 'restore-object') { await upload(); return { changed: true }; }
  const document = await db.document.findFirstOrThrow({ where: { ownerCustomerId: owner.id, accessScope: 'PRIVATE_POLICY' } });
  const version = await db.documentVersion.findUniqueOrThrow({ where: { documentId_versionNumber: { documentId: document.id, versionNumber: '1.0' } } });
  if (action === 'remove-object') { await cleaner.send(new DeleteObjectCommand({ Bucket: bucket, Key: version.storageObjectKey })); return { changed: true }; }
  if (action === 'deactivate') { await db.documentVersion.update({ where: { id: version.id }, data: { isActive: false } }); return { changed: true }; }
  return { staff: { fullName: (await db.staffProfile.findUniqueOrThrow({ where: { userId: staff.id } })).fullName, phone: staff.phone },
    profileAudits: await db.auditLog.count({ where: { actorId: staff.id, action: 'STAFF_PROFILE_UPDATED' } }),
    checksum: version.checksumSha256, policies: await db.insurancePolicy.count({ where: { customerId: owner.id } }) };
}
main().then(result => process.stdout.write(JSON.stringify(result))).catch(error => {
    process.stderr.write(`Isolated staff browser fixture failed (${error.name}, ${error.code ?? 'NO_CODE'}, model ${error.meta?.modelName ?? 'unknown'}, cause ${error.meta?.driverAdapterError?.cause?.kind ?? 'unknown'}, constraint ${JSON.stringify(error.meta?.driverAdapterError?.cause?.constraint ?? null)}).\n`); process.exitCode = 1;
  })
  .finally(async () => { await db.$disconnect(); writer.destroy(); cleaner.destroy(); });
