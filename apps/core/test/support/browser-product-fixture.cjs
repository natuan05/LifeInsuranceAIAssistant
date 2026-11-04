// Private stdin/stdout protocol for browser E2E; session tokens stay in memory.
const { readFileSync } = require('node:fs');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const PDFDocument = require('pdfkit');
const { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { PrismaClient } = require('../../dist/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { action, runId } = JSON.parse(readFileSync(0, 'utf8'));
if (!['setup', 'publish', 'cleanup'].includes(action) || !/^[0-9a-f-]{36}$/.test(runId)) throw new Error('Invalid synthetic fixture command');
const hash = value => createHash('sha256').update(value).digest('hex'), prefix = `p03-browser/${runId}/`, code = `P03-${runId}-`;
const bucket = process.env.STORAGE_BUCKET;
const db = new PrismaClient({ adapter: new PrismaPg({ host: process.env.PGHOST, database: process.env.I01_TEST_DATABASE,
  user: 'admin_runtime', password: readFileSync('/credentials/admin/password', 'utf8').trim() }) });
function storage(role) { return new S3Client({ endpoint: 'http://minio:9000', region: process.env.STORAGE_REGION, forcePathStyle: true,
  credentials: { accessKeyId: readFileSync(`/credentials/${role}/access-key`, 'utf8').trim(), secretAccessKey: readFileSync(`/credentials/${role}/secret-key`, 'utf8').trim() } }); }
const writer = storage('storage-writer'), cleanupStorage = storage('storage-test-cleanup');
const emails = ['STAFF', 'CUSTOMER'].map(role => `${runId}.p03.${role.toLowerCase()}@synthetic.invalid`);
async function cleanup() {
  const objects = await cleanupStorage.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
  for (const object of objects.Contents ?? []) {
    if (!object.Key.startsWith(prefix)) throw new Error('Unsafe fixture key');
    await cleanupStorage.send(new DeleteObjectCommand({ Bucket: bucket, Key: object.Key }));
  }
  await db.$transaction(async tx => {
    const products = await tx.insuranceProduct.findMany({ where: { productCode: { startsWith: code } }, select: { id: true } });
    const productIds = products.map(p => p.id), users = await tx.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
    const userIds = users.map(u => u.id), docs = await tx.document.findMany({ where: { productId: { in: productIds } }, select: { id: true } });
    const docIds = docs.map(d => d.id);
    await tx.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await tx.document.updateMany({ where: { id: { in: docIds } }, data: { currentVersion: null } });
    await tx.documentVersion.deleteMany({ where: { documentId: { in: docIds } } });
    await tx.document.deleteMany({ where: { id: { in: docIds } } });
    await tx.insurancePolicy.deleteMany({ where: { productId: { in: productIds } } });
    await tx.insuranceProduct.deleteMany({ where: { id: { in: productIds } } });
    await tx.authSession.deleteMany({ where: { userId: { in: userIds } } });
    await tx.rateLimitBucket.deleteMany({ where: { clientToken: { in: userIds.map(id => hash(id.toLowerCase())) } } });
    await tx.customerProfile.deleteMany({ where: { userId: { in: userIds } } });
    await tx.staffProfile.deleteMany({ where: { userId: { in: userIds } } });
    await tx.user.deleteMany({ where: { id: { in: userIds } } });
  });
  return { objects: (await cleanupStorage.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }))).KeyCount,
    users: await db.user.count({ where: { email: { in: emails } } }), products: await db.insuranceProduct.count({ where: { productCode: { startsWith: code } } }) };
}
async function actor(role) {
  const id = randomUUID(), token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex');
  await db.user.create({ data: { id, role, accountCode: `${role === 'STAFF' ? 'STF' : 'CUS'}-${BigInt('0x' + id.replaceAll('-', '')).toString().slice(0, 22)}`,
    email: emails[role === 'STAFF' ? 0 : 1], passwordHash: 'synthetic-browser-fixture-not-for-login', passwordChangeRecommended: false,
    ...(role === 'STAFF' ? { staffProfile: { create: { fullName: 'Synthetic P03 Staff' } } } : { customerProfile: { create: { fullName: 'Synthetic P03 Customer' } } }) } });
  await db.authSession.create({ data: { userId: id, tokenHash: hash(token), csrfTokenHash: hash(csrf), expiresAt: new Date(Date.now() + 3600000) } });
  return { id, token, csrf };
}
function pdf(label) { return new Promise(resolve => {
  const document = new PDFDocument({ compress: false, info: { Title: 'Synthetic P03 ' + label } }), chunks = [];
  document.on('data', chunk => chunks.push(chunk)); document.on('end', () => resolve(Buffer.concat(chunks)));
  document.text(`Fully synthetic product terms ${label}. Local browser test only.`); document.end();
}); }
async function setup() {
  try {
    const staff = await actor('STAFF'), customer = await actor('CUSTOMER'), products = [];
    for (let i = 1; i <= 12; i++) products.push(await db.insuranceProduct.create({ data: { productCode: code + String(i).padStart(2, '0'),
      name: `Synthetic P03 Product ${String(i).padStart(2, '0')}`, summary: 'Fully synthetic product summary for browser verification.', isActive: i !== 12 } }));
    const main = await db.document.create({ data: { title: 'Synthetic P03 product terms', accessScope: 'PUBLIC', productId: products[0].id } });
    const versions = [];
    for (const versionNumber of ['1.0', '2.0']) {
      const bytes = await pdf(versionNumber), key = `${prefix}${versionNumber}.pdf`;
      await writer.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: 'application/pdf' }));
      versions.push(await db.documentVersion.create({ data: { documentId: main.id, versionNumber, storageBucket: bucket, storageObjectKey: key, checksumSha256: hash(bytes) } }));
    }
    await db.document.update({ where: { id: main.id }, data: { currentVersion: '1.0' } });
    const policy = await db.insurancePolicy.create({ data: { customerId: customer.id, productId: products[0].id, policyNumber: `P03-${runId}`, status: 'ACTIVE' } });
    const privateDocument = await db.document.create({ data: { title: 'PRIVATE_P03_MUST_NOT_APPEAR', accessScope: 'PRIVATE_POLICY', productId: products[0].id, policyId: policy.id, ownerCustomerId: customer.id } });
    const hidden = await db.documentVersion.create({ data: { documentId: privateDocument.id, versionNumber: '1.0', storageBucket: bucket, storageObjectKey: prefix + 'private-not-uploaded.pdf', checksumSha256: '0'.repeat(64) } });
    await db.document.update({ where: { id: privateDocument.id }, data: { currentVersion: '1.0' } });
    return { staff, customer, productId: products[0].id, search: code, title: main.title, documentId: main.id,
      versionId: versions[0].id, checksum: versions[0].checksumSha256, checksumV2: versions[1].checksumSha256, privateDocumentId: privateDocument.id, privateVersionId: hidden.id };
  } catch (error) { await cleanup(); throw error; }
}
async function main() {
  if (action === 'setup') return setup();
  if (action === 'cleanup') return cleanup();
  const product = await db.insuranceProduct.findUniqueOrThrow({ where: { productCode: code + '01' } });
  const document = await db.document.findFirstOrThrow({ where: { productId: product.id, accessScope: 'PUBLIC' } });
  await db.document.update({ where: { id: document.id }, data: { currentVersion: '2.0' } });
  return { published: true };
}
main().then(result => process.stdout.write(JSON.stringify(result))).catch(() => { process.stderr.write('Synthetic product browser fixture failed.\n'); process.exitCode = 1; })
  .finally(async () => { await db.$disconnect(); writer.destroy(); cleanupStorage.destroy(); });
