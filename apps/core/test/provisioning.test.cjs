require('reflect-metadata');
const { readFileSync } = require('node:fs');
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, scryptSync } = require('node:crypto');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('../dist/generated/prisma/client');
const { AccountProvisioningService } = require('../dist/accounts/services/account-provisioning.service');
const { devAccounts, newDevManifest, bootstrapInTransaction, sharedDevPassword, upgradeLegacyDevPasswords } = require('../dist/cli/dev-accounts');
const { hashPassword, verifyPassword } = require('../dist/accounts/utils/password');
const input = JSON.parse(readFileSync(0, 'utf8'));
const client = new PrismaClient({ adapter: new PrismaPg({ host: '127.0.0.1', port: input.port,
  database: 'life_insurance', user: 'admin_runtime', password: input.password, max: 3 }) });
after(async () => client.$disconnect());
const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
const fixtures = devAccounts.map((account, index) => ({ ...account,
  accountCode: `${account.role === 'STAFF' ? 'STF' : 'CUS'}-${suffix}${index}`,
  email: `fixture.${index}.${suffix}@synthetic.invalid`,
  ...(account.staffCode ? { staffCode: `STF-${suffix}${index === 2 ? 0 : 1}` } : {}),
}));
const rollback = new Error('SYNTHETIC_TEST_ROLLBACK');
const context = { operatorId: 'synthetic-test', requestId: randomUUID() };

test('salted password hashes verify correctly and malformed hashes fail closed', async () => {
  const password = 'Synthetic-Password-123';
  const a = await hashPassword(password), b = await hashPassword(password);
  assert.notEqual(a, b);
  assert.equal(await verifyPassword(password, a), true);
  assert.equal(await verifyPassword('wrong-password', a), false);
  assert.equal(await verifyPassword(password, 'scrypt$999999999$8$1$bad$bad'), false);
  assert.ok(a.length <= 255);
  assert.match(a, /^\$2b\$12\$/);
  const unicode = '🔐'.repeat(18);
  assert.equal(await verifyPassword(unicode, await hashPassword(unicode)), true);
  await assert.rejects(hashPassword(unicode + 'a'));
  assert.equal(await verifyPassword(unicode + 'a', await hashPassword(unicode)), false);
});

test('bootstrap creates profiles, assignments and safe audit; retries preserve changed state/passwords', async () => {
  await assert.rejects(client.$transaction(async tx => {
    const manifest = newDevManifest(fixtures);
    const first = await bootstrapInTransaction(tx, client, manifest, fixtures);
    assert.equal(first.filter(row => row.created).length, 5);
    const users = await tx.user.findMany({ where: { accountCode: { in: fixtures.map(f => f.accountCode) } }, include: { customerProfile: true, staffProfile: true } });
    assert.equal(users.length, 5);
    for (const user of users) {
      assert.equal(user.passwordChangeRecommended, true);
      assert.equal(Boolean(user.staffProfile), user.role === 'STAFF');
      assert.equal(Boolean(user.customerProfile), user.role === 'CUSTOMER');
    }
    const customer = users.find(u => u.accountCode === fixtures[2].accountCode);
    assert.equal(await tx.staffAssignment.count({ where: { customerId: { in: users.map(u => u.id) }, isActive: true } }), 2);
    const changed = await hashPassword('Synthetic-Changed-456');
    await tx.user.update({ where: { id: customer.id }, data: { passwordHash: changed, passwordChangeRecommended: false, status: 'LOCKED' } });
    await tx.staffAssignment.updateMany({ where: { customerId: customer.id }, data: { isActive: false, endedAt: new Date() } });
    const salt = randomBytes(16);
    const legacy = ['scrypt', 131072, 8, 1, salt.toString('hex'), scryptSync(sharedDevPassword, salt, 64,
      { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }).toString('hex')].join('$');
    await tx.user.update({ where: { accountCode: fixtures[0].accountCode }, data: { passwordHash: legacy } });
    const retry = await bootstrapInTransaction(tx, client, manifest, fixtures);
    assert.equal(retry.filter(row => row.created).length, 0);
    assert.equal(retry.find(row => row.accountCode === customer.accountCode).initialPasswordValid, false);
    const upgraded = await tx.user.findUnique({ where: { accountCode: fixtures[0].accountCode } });
    assert.ok(upgraded.passwordHash.startsWith('$2b$12$'));
    assert.equal(await verifyPassword(sharedDevPassword, upgraded.passwordHash), true);
    const preserved = await tx.user.findUnique({ where: { id: customer.id } });
    assert.equal(preserved.passwordHash, changed);
    assert.equal(preserved.status, 'LOCKED');
    assert.equal(preserved.passwordChangeRecommended, false);
    assert.equal(await tx.staffAssignment.count({ where: { customerId: customer.id, isActive: true } }), 0);
    const audit = await tx.auditLog.findMany({ where: { targetId: { in: users.map(u => u.id) } } });
    assert.equal(audit.length, 5);
    assert.ok(audit.every(row => JSON.stringify(row.metadata) === JSON.stringify({ role: users.find(u => u.id === row.targetId).role })));
    throw rollback;
  }, { timeout: 120000 }), error => error === rollback);
  assert.equal(await client.user.count({ where: { accountCode: { in: fixtures.map(f => f.accountCode) } } }), 0);
});

test('invalid inputs rejected; failure after account creation rolls back user/profile/audit', async () => {
  const service = new AccountProvisioningService(client);
  const valid = { accountCode: `STF-${suffix}9`, email: `rollback.${suffix}@synthetic.invalid`, role: 'STAFF', fullName: 'Synthetic Rollback', password: 'Ab6!xy' };
  for (const invalid of [{ ...valid, role: 'CUSTOMER' }, { ...valid, password: 'short' }, { ...valid, password: '🔐'.repeat(19) }, { ...valid, surprise: 'unknown' }, { ...valid, staffId: randomUUID() }]) {
    await assert.rejects(service.create(invalid, context), error => error.getStatus?.() === 400);
  }
  // A failing second write rolls back the first user's profile and audit too.
  await assert.rejects(client.$transaction(async tx => {
    const result = await service.createInTransaction(tx, valid, context);
    assert.equal('passwordHash' in result, false);
    await service.createInTransaction(tx, valid, context);
  }, { timeout: 30000 }));
  assert.equal(await client.user.count({ where: { accountCode: valid.accountCode } }), 0);
  assert.equal(await client.auditLog.count({ where: { requestId: context.requestId } }), 0);
});

test('legacy initial credentials upgrade once; user-changed passwords remain untouched', async () => {
  await assert.rejects(client.$transaction(async tx => {
    const legacy = newDevManifest(fixtures);
    legacy.accounts.forEach(account => { account.password = `Legacy-${randomUUID()}`; });
    await bootstrapInTransaction(tx, client, legacy, fixtures);
    const changed = await hashPassword('Synthetic-User-Changed-789');
    await tx.user.update({ where: { accountCode: fixtures[0].accountCode }, data: { passwordHash: changed } });
    await tx.user.update({ where: { accountCode: fixtures[1].accountCode }, data: { passwordChangedAt: new Date() } });
    await upgradeLegacyDevPasswords(tx, legacy, fixtures);
    await upgradeLegacyDevPasswords(tx, legacy, fixtures);
    const users = await tx.user.findMany({ where: { accountCode: { in: fixtures.map(f => f.accountCode) } } });
    assert.equal(users.find(u => u.accountCode === fixtures[0].accountCode).passwordHash, changed);
    for (const fixture of fixtures.slice(2)) {
      assert.equal(await verifyPassword(sharedDevPassword, users.find(u => u.accountCode === fixture.accountCode).passwordHash), true);
    }
    assert.equal(await tx.auditLog.count({ where: { targetId: { in: users.map(u => u.id) }, action: 'DEV_FIXTURE_PASSWORD_SHARED' } }), 3);
    throw rollback;
  }, { timeout: 120000 }), error => error === rollback);
});
