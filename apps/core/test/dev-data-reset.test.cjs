require('reflect-metadata');
const { readFileSync } = require('node:fs');
const { randomUUID, createHash } = require('node:crypto');
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('../dist/generated/prisma/client');
const { assertSeedObject, resetDevDataInTransaction } = require('../dist/cli/dev-data-reset');
const { loadPublicCorpus, publicProducts, publicTermsPdf } = require('../dist/cli/dev-policy-source');
const { loadPolicyPortfolio, validatePortfolio, portfolioContractPdf } = require('../dist/cli/dev-policy-portfolio');
const { replaceRetiredPolicyFixtures } = require('../dist/cli/dev-policy-reseed');
const { policySeedOperator } = require('../dist/cli/dev-policies');
const { renderFixturePdf } = require('../dist/cli/dev-policy-pdf');
const { devAccounts, sharedDevPassword, bootstrapInTransaction, newDevManifest } = require('../dist/cli/dev-accounts');
const { verifyPassword } = require('../dist/accounts/utils/password');
const client = new PrismaClient({ adapter: new PrismaPg({ host: 'postgres', port: 5432, database: 'life_insurance',
  user: 'local_owner', password: readFileSync('/credentials/bootstrap/password', 'utf8').trim(), max: 2 }) });
after(() => client.$disconnect());
const rollback = new Error('RESET_TEST_ROLLBACK');
function storage() {
  const objects = new Map();
  return { bucket: process.env.STORAGE_BUCKET || 'life-insurance-documents', objects,
    ensure: async (key, bytes, checksum) => {
      assert.equal(createHash('sha256').update(bytes).digest('hex'), checksum);
      if (objects.has(key)) { assert.equal(objects.get(key), checksum); return false; }
      objects.set(key, checksum); return true;
    } };
}
test('checked source retains all 25 Public markers; generated contract maps people and does not invent commercial riders', async () => {
  const source = loadPolicyPortfolio(), pdf = publicTermsPdf(loadPublicCorpus().find(row => row.product.code === 'PUB-HTHP-GTBV-V2').markdown);
  assert.equal(pdf.sourceKind, 'public-markdown'); assert.equal(pdf.sections.length, 26);
  assert.equal(loadPublicCorpus().length, 13); assert.equal(publicProducts.length, 7);
  assert(!JSON.stringify(pdf.sections).includes('<table'));
  assert(!JSON.stringify(pdf.sections).includes('<td'));
  assert(JSON.stringify(pdf.sections).includes('50%'));
  assert(source.portfolio.policies.every(policy => policy.riders.length === 0));
  const definition = portfolioContractPdf(source.portfolio, source.portfolio.policies[0], { id: randomUUID(), accountCode: 'CUS-000001', fullName: devAccounts[2].fullName }, 'BH-2024-01001');
  const text = JSON.stringify(definition);
  for (const value of [devAccounts[2].fullName, 'BH-2024-01001', '6.000.000', '750.000.000', '30.000.000']) assert(text.includes(value));
  assert(!text.includes('Khách hàng Demo An')); assert(!text.includes('SYN-POL-2024-0001'));
  const a = await renderFixturePdf(pdf), b = await renderFixturePdf(pdf);
  assert(a.equals(b)); assert(a.length > 50000);
});
test('storage cleanup refuses foreign bucket, traversal and non-fixture objects', () => {
  for (const object of [
    { bucket: 'other', key: 'dev-fixtures/policies-v1/a.pdf' },
    { bucket: 'bucket', key: 'data/private/a.pdf' },
    { bucket: 'bucket', key: 'local-fixtures/2026-10-31/../a.pdf' },
  ]) assert.throws(() => assertSeedObject(object, 'bucket'), /approved local seed/);
});

test('portfolio rejects clones, wrong product/variant, unbalanced beneficiary shares and inconsistent premium or dates', () => {
  const source = loadPolicyPortfolio().portfolio;
  const changes = [
    p => { p.policies.push(structuredClone(p.policies[0])); },
    p => { p.policies[1].termsPath = p.policies[0].termsPath; },
    p => { p.policies[3].termsPath = p.policies[3].termsPath.replace('UL049', 'ULP50'); },
    p => { p.policies[0].beneficiaries[0].sharePercent = 90; },
    p => { p.policies[0].premiumAmount = 8100000; },
    p => { p.policies[0].expiryDate = '2025-01-01'; },
    p => { p.policies[2].paidDueDates.push('2026-12-01'); },
  ];
  for (const change of changes) { const p = structuredClone(source); change(p); assert.throws(() => validatePortfolio(p)); }
});

test('policy-only replacement preserves accounts/profiles and historical chat/Ticket content, detaches retired links and queues exact cleanup', async () => {
  const suffix = Date.now().toString(), namespace = `R${suffix}`;
  const fixtures = devAccounts.map((row, i) => ({ ...row, accountCode: `${row.role === 'STAFF' ? 'STF' : 'CUS'}-${suffix}${i}`,
    email: `reseed.${suffix}.${i}@dev.example.invalid`, ...(row.staffCode ? { staffCode: `STF-${suffix}${i === 2 ? 0 : 1}` } : {}) }));
  await assert.rejects(client.$transaction(async tx => {
    await bootstrapInTransaction(tx, client, newDevManifest(fixtures), fixtures);
    const user = await tx.user.findUniqueOrThrow({ where: { accountCode: fixtures[2].accountCode }, include: { customerProfile: true } });
    const product = await tx.insuranceProduct.create({ data: { productCode: `RETIRED-${suffix}`, name: 'Retired synthetic test fixture' } });
    const old = await tx.insurancePolicy.create({ data: { policyNumber: `${namespace}-OLD-001`, customerId: user.id, productId: product.id,
      status: 'ACTIVE', benefitsSnapshot: { fixture: 'synthetic-manulife-v1' } } });
    await tx.auditLog.create({ data: { actorType: 'OPERATOR', operatorId: policySeedOperator, action: 'DEV_POLICY_CREATED',
      targetType: 'InsurancePolicy', targetId: old.id, outcome: 'SUCCESS', requestId: randomUUID() } });
    const doc = await tx.document.create({ data: { title: 'Retired private fixture', accessScope: 'PRIVATE_POLICY', ownerCustomerId: user.id, policyId: old.id } });
    const key = `dev-fixtures/synthetic-manulife-v1/test/${doc.id}/synthetic-v1.pdf`;
    await tx.documentVersion.create({ data: { documentId: doc.id, versionNumber: 'synthetic-v1', storageBucket: 'life-insurance-documents', storageObjectKey: key, checksumSha256: '0'.repeat(64) } });
    await tx.document.update({ where: { id: doc.id }, data: { currentVersion: 'synthetic-v1' } });
    const chat = await tx.conversation.create({ data: { customerId: user.id, channelType: 'CUSTOMER_SUPPORT', supportOrigin: 'AI',
      status: 'AI_ACTIVE', createdByCustomerId: user.id, linkedPolicyId: old.id, subject: 'Preserve historical subject' } });
    const evidence = { confirmedContent: 'Keep historical evidence unchanged' };
    const ticket = await tx.supportTicket.create({ data: { customerId: user.id, policyId: old.id, ticketCode: `TK-R-${suffix}`,
      status: 'OPEN', title: 'Keep historical Ticket', idempotencyKey: randomUUID(), confirmedAt: new Date(), extractedDetails: evidence } });
    const result = await replaceRetiredPolicyFixtures(tx, storage(), [], { fixtures, namespace, legacyIds: [old.id] });
    assert.equal(result.retiredPolicies, 1); assert.equal(result.policies.policiesCreated, 4);
    assert.equal(await tx.insurancePolicy.count({ where: { id: old.id } }), 0); assert.equal(await tx.document.count({ where: { id: doc.id } }), 0);
    assert.deepEqual(await tx.user.findUniqueOrThrow({ where: { id: user.id }, include: { customerProfile: true } }), user);
    const nextChat = await tx.conversation.findUniqueOrThrow({ where: { id: chat.id } });
    const nextTicket = await tx.supportTicket.findUniqueOrThrow({ where: { id: ticket.id } });
    assert.equal(nextChat.linkedPolicyId, null); assert.equal(nextChat.controlVersion, 1); assert.equal(nextChat.subject, chat.subject);
    assert.equal(nextTicket.policyId, null); assert.equal(nextTicket.version, 1); assert.deepEqual(nextTicket.extractedDetails, evidence);
    const audit = await tx.auditLog.findFirstOrThrow({ where: { targetId: result.cleanupId, action: 'DEV_POLICY_FIXTURE_REPLACED' } });
    assert.deepEqual(audit.metadata.cleanupObjects, [{ bucket: 'life-insurance-documents', key }]);
    const replay = await replaceRetiredPolicyFixtures(tx, storage(), [], { fixtures, namespace, legacyIds: [old.id] });
    assert.equal(replay.retiredPolicies, 0); assert.equal(replay.policies.policiesCreated, 0); assert.equal(replay.policies.policiesPreserved, 4);
    throw rollback;
  }, { timeout: 240000, maxWait: 120000 }), error => error === rollback);
});
test('explicit full reset creates canonical accounts/profiles/policies, clears activity, preserves migrations; transaction rollback restores prior data', async () => {
  const before = { users: await client.user.count(), policies: await client.insurancePolicy.count(), tickets: await client.supportTicket.count() };
  const migrations = await client.$queryRawUnsafe('SELECT count(*) AS count FROM business._prisma_migrations');
  await assert.rejects(client.$transaction(async tx => {
    const result = await resetDevDataInTransaction(tx, client, storage(), []);
    assert.equal(result.accountsCreated, 5); assert.equal(result.policies.policiesCreated, 4);
    assert.equal(await tx.user.count(), 5); assert.equal(await tx.insuranceProduct.count(), 7);
    assert.equal(await tx.documentVersion.count(), 17);
    assert.equal(await tx.conversation.count(), 0); assert.equal(await tx.message.count(), 0);
    assert.equal(await tx.supportTicket.count(), 0); assert.equal(await tx.notification.count(), 0);
    assert.equal(await tx.authSession.count(), 0); assert.equal(await tx.outboxEvent.count(), 0);
    for (const fixture of devAccounts) {
      const user = await tx.user.findUniqueOrThrow({ where: { accountCode: fixture.accountCode }, include: { staffProfile: true, customerProfile: true } });
      assert.equal(user.email, fixture.email); assert.equal(user.phone, fixture.phone);
      assert(await verifyPassword(sharedDevPassword, user.passwordHash));
      assert.equal((user.staffProfile || user.customerProfile).fullName, fixture.fullName);
      if (fixture.role === 'CUSTOMER') assert.equal(user.customerProfile.birth.toISOString().slice(0, 10), fixture.birth);
    }
    assert.deepEqual(await tx.$queryRawUnsafe('SELECT count(*) AS count FROM business._prisma_migrations'), migrations);
    throw rollback;
  }, { timeout: 240000, maxWait: 120000 }), error => error === rollback);
  assert.deepEqual({ users: await client.user.count(), policies: await client.insurancePolicy.count(), tickets: await client.supportTicket.count() }, before);
});
test('upload failure rolls the full reset back, including accounts and old policy rows', async () => {
  const before = { users: await client.user.count(), policies: await client.insurancePolicy.count() };
  await assert.rejects(client.$transaction(tx => resetDevDataInTransaction(tx, client,
    { bucket: 'life-insurance-documents', ensure: async () => { throw new Error('TEST_UPLOAD_FAILURE'); } }, []),
  { timeout: 240000, maxWait: 120000 }), /TEST_UPLOAD_FAILURE/);
  assert.deepEqual({ users: await client.user.count(), policies: await client.insurancePolicy.count() }, before);
});
