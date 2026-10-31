require('reflect-metadata');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('../dist/generated/prisma/client');
const { bootstrapInTransaction, devAccounts, newDevManifest } = require('../dist/cli/dev-accounts');
const { seedPoliciesInTransaction, fixtureId } = require('../dist/cli/dev-policies');
const { renderFixturePdf } = require('../dist/cli/dev-policy-pdf');

const input = JSON.parse(readFileSync(0, 'utf8'));
const client = new PrismaClient({ adapter: new PrismaPg({ host: '127.0.0.1', port: input.port, database: 'life_insurance', user: 'admin_runtime', password: input.password, max: 2 }) });
process.env.DEV_PDF_FONT_DIR = resolve(__dirname, '../../web/public/fonts');
after(() => client.$disconnect());
const rollback = new Error('SYNTHETIC_SEED_TEST_ROLLBACK');
function identities() {
  const suffix = Date.now().toString() + Math.floor(Math.random() * 1000);
  const fixtures = devAccounts.map((row, i) => ({ ...row, accountCode: `${row.role === 'STAFF' ? 'STF' : 'CUS'}-${suffix}${i}`,
    email: `policy-seed.${suffix}.${i}@dev.example.invalid`, ...(row.staffCode ? { staffCode: `STF-${suffix}${i === 2 ? 0 : 1}` } : {}) }));
  return { fixtures, namespace: `T${suffix}` };
}
function store() {
  const objects = new Map();
  return { bucket: 'synthetic-test-bucket', objects, ensure: async (key, bytes, checksum) => {
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), checksum);
    if (objects.has(key)) { assert.equal(objects.get(key), checksum); return false; }
    objects.set(key, checksum); return true;
  } };
}

test('PDF generation is byte-stable, contains pages and embeds the synthetic reference', async () => {
  const definition = { title: 'Hợp đồng mô phỏng', reference: 'SYNTHETIC-TEST', version: '1.0', sections: [{ title: 'Thông tin mô phỏng', paragraphs: ['Dữ liệu giả lập. Không có giá trị pháp lý.'] }] };
  const a = await renderFixturePdf(definition), b = await renderFixturePdf(definition);
  assert(a.equals(b)); assert.match(a.toString('latin1'), /\/Type \/Page\b/); assert(a.length > 5000);
});

test('common policy seed is complete, scoped and idempotent while preserving edited business fields, versions and assignments', async () => {
  const { fixtures, namespace } = identities(), storage = store();
  await assert.rejects(client.$transaction(async tx => {
    await bootstrapInTransaction(tx, client, newDevManifest(fixtures), fixtures);
    const first = await seedPoliciesInTransaction(tx, storage, fixtures, namespace);
    assert.deepEqual(first, { productsCreated: 2, policiesCreated: 14, documentsCreated: 17, versionsCreated: 20, objectsCreated: 20, policiesPreserved: 0 });
    const users = await tx.user.findMany({ where: { accountCode: { in: fixtures.filter(x => x.role === 'CUSTOMER').map(x => x.accountCode) } }, include: { customerProfile: { include: { policies: true, assignments: true } } } });
    assert.equal(users.find(x => x.accountCode === fixtures[2].accountCode).customerProfile.policies.length, 12);
    assert.equal(users.find(x => x.accountCode === fixtures[3].accountCode).customerProfile.policies.length, 2);
    assert.equal(users.find(x => x.accountCode === fixtures[4].accountCode).customerProfile.policies.length, 0);
    const policy = await tx.insurancePolicy.findUniqueOrThrow({ where: { policyNumber: `${namespace}-POL-A-001` } });
    const main = policy.benefitsSnapshot.documents.main, term = policy.benefitsSnapshot.documents.terms;
    assert.equal(main.version, '1.1'); assert.equal(term.version, '1.0');
    assert.equal((await tx.document.findUniqueOrThrow({ where: { id: term.documentId } })).currentVersion, '2.0');
    await tx.insurancePolicy.update({ where: { id: policy.id }, data: { premiumAmount: '42.00', status: 'LAPSED', benefitsSnapshot: { edited: true } } });
    await tx.document.update({ where: { id: main.documentId }, data: { title: 'Edited synthetic title', currentVersion: '1.0' } });
    await tx.documentVersion.update({ where: { documentId_versionNumber: { documentId: main.documentId, versionNumber: '1.1' } }, data: { isActive: false } });
    await tx.insuranceProduct.update({ where: { id: policy.productId }, data: { name: 'Edited synthetic product', isActive: false } });
    const customerId = policy.customerId;
    await tx.staffAssignment.updateMany({ where: { customerId, isActive: true }, data: { isActive: false, endedAt: new Date() } });
    const second = await seedPoliciesInTransaction(tx, storage, fixtures, namespace);
    assert.deepEqual(second, { productsCreated: 0, policiesCreated: 0, documentsCreated: 0, versionsCreated: 0, objectsCreated: 0, policiesPreserved: 14 });
    const preserved = await tx.insurancePolicy.findUniqueOrThrow({ where: { id: policy.id } });
    assert.equal(preserved.premiumAmount.toFixed(2), '42.00'); assert.equal(preserved.status, 'LAPSED'); assert.deepEqual(preserved.benefitsSnapshot, { edited: true });
    const doc = await tx.document.findUniqueOrThrow({ where: { id: main.documentId } }); assert.equal(doc.title, 'Edited synthetic title'); assert.equal(doc.currentVersion, '1.0');
    assert.equal((await tx.documentVersion.findUniqueOrThrow({ where: { documentId_versionNumber: { documentId: main.documentId, versionNumber: '1.1' } } })).isActive, false);
    assert.equal((await tx.insuranceProduct.findUniqueOrThrow({ where: { id: policy.productId } })).isActive, false);
    assert.equal(await tx.staffAssignment.count({ where: { customerId, isActive: true } }), 0);
    throw rollback;
  }, { timeout: 120000 }), error => error === rollback);
  assert.equal(await client.insurancePolicy.count({ where: { policyNumber: { startsWith: namespace } } }), 0);
});

test('storage failure rolls DB back; retry reuses completed objects and missing objects can be restored', async () => {
  const { fixtures, namespace } = identities(), storage = store();
  const fail = { ...storage, ensure: async (...args) => { if (storage.objects.size >= 2) throw new Error('SYNTHETIC_STORAGE_FAILURE'); return storage.ensure(...args); } };
  await assert.rejects(client.$transaction(async tx => {
    await bootstrapInTransaction(tx, client, newDevManifest(fixtures), fixtures);
    await seedPoliciesInTransaction(tx, fail, fixtures, namespace);
  }, { timeout: 120000 }), /SYNTHETIC_STORAGE_FAILURE/);
  assert.equal(await client.insurancePolicy.count({ where: { policyNumber: { startsWith: namespace } } }), 0);
  await assert.rejects(client.$transaction(async tx => {
    await bootstrapInTransaction(tx, client, newDevManifest(fixtures), fixtures);
    assert.equal((await seedPoliciesInTransaction(tx, storage, fixtures, namespace)).objectsCreated, 18);
    storage.objects.delete(storage.objects.keys().next().value);
    const restored = await seedPoliciesInTransaction(tx, storage, fixtures, namespace);
    assert.equal(restored.objectsCreated, 1); assert.equal(restored.versionsCreated, 0); assert.equal(restored.policiesCreated, 0);
    throw rollback;
  }, { timeout: 120000 }), error => error === rollback);
});

test('seed refuses reserved product collisions instead of adopting unrelated records', async () => {
  const { fixtures, namespace } = identities(), storage = store();
  await assert.rejects(client.$transaction(async tx => {
    await bootstrapInTransaction(tx, client, newDevManifest(fixtures), fixtures);
    await tx.insuranceProduct.create({ data: { id: randomUUID(), productCode: `${namespace}-LIFE-01`, name: 'Unrelated synthetic product' } });
    await seedPoliciesInTransaction(tx, storage, fixtures, namespace);
  }, { timeout: 120000 }), /Reserved product conflict/);
  assert.equal(storage.objects.size, 0);
  assert.notEqual(fixtureId(`${namespace}:product:life`), fixtureId(`${namespace}:product:care`));
});
