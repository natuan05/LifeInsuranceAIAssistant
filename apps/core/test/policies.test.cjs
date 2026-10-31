require('reflect-metadata');
const { readFileSync } = require('node:fs');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('../dist/generated/prisma/client');
const { DatabaseService } = require('../dist/database/database.service');
const { AuthService, tokenHash } = require('../dist/auth/services/auth.service');
const { AccountProvisioningService } = require('../dist/accounts/services/account-provisioning.service');
const { PolicyService } = require('../dist/policies/services/policy.service');
const { PolicyStorageService } = require('../dist/policies/services/policy-storage.service');
const { StaffPolicyController } = require('../dist/policies/controllers/staff-policy.controller');
const { configureHttp } = require('../dist/http/http-foundation');
const input = JSON.parse(readFileSync(0, 'utf8'));
process.env.NODE_ENV = 'test'; process.env.CORS_ORIGINS = 'http://localhost:8080';
const adapter = (user, password) => new PrismaPg({ host: '127.0.0.1', port: input.port, database: 'life_insurance', user, password, max: 4 });
const admin = new PrismaClient({ adapter: adapter('admin_runtime', input.password) });
const core = new PrismaClient({ adapter: adapter('core_runtime', input.corePassword) });
class TestModule {}
const storageCalls = [];
Module({ controllers: [StaffPolicyController], providers: [PolicyService, AuthService, { provide: PolicyStorageService, useValue: {
  access: async (...args) => { storageCalls.push(args); return { url: 'http://localhost:9000/synthetic-test-only', expiresAt: new Date(Date.now() + 900000).toISOString() }; },
} }, { provide: DatabaseService, useValue: { prisma: core } }] })(TestModule);
const suffix = Date.now().toString();
const accounts = [], cookies = new Map(), sessions = new Map();
const productIds = [randomUUID(), randomUUID()], policyIds = [randomUUID(), randomUUID(), randomUUID()];
const docIds = Array.from({ length: 8 }, () => randomUUID());
const versionIds = {};
let app, base, snapshot;
const get = (path, cookie = '', headers = {}) => fetch(base + '/api/v1/' + path, { headers: { Cookie: cookie, ...headers } });
const paths = (customer, policy) => [`staff/customers/${customer}/policies`, `staff/policies/${policy}`, `staff/policies/${policy}/documents`];
const binding = (index, kind, version = '1.0') => ({ documentId: docIds[index], version, kind });
async function ok(path, cookie) {
  const response = await get(path, cookie); assert.equal(response.status, 200, path);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.doesNotMatch(JSON.stringify(body), /storageBucket|storageObjectKey|checksumSha256|SYNTHETIC_INTERNAL_SECRET|citizenId|passwordHash|tokenHash|fixtureBatch|policyHolder|annualInternalNote|secretAccessKey|https:\/\/private/);
  return body;
}
async function resetSnapshot(value = snapshot) { await admin.insurancePolicy.update({ where: { id: policyIds[0] }, data: { benefitsSnapshot: value } }); }
before(async () => {
  const provisioning = new AccountProvisioningService(admin);
  for (let index = 0; index < 6; index++) {
    const role = index < 2 ? 'STAFF' : 'CUSTOMER';
    const account = await provisioning.create({ accountCode: `${role === 'STAFF' ? 'STF' : 'CUS'}-${suffix}${index}`,
      email: `policy.api.${suffix}.${index}@synthetic.invalid`, fullName: `Synthetic Policy API ${index}`, role,
      password: 'Synthetic-Policy-Test-2026!', ...(index === 2 || index === 3 ? { staffId: accounts[0].id } : index === 4 ? { staffId: accounts[1].id } : {}) },
    { operatorId: 'synthetic-policy-api-test', requestId: randomUUID() });
    accounts.push(account);
    const token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex');
    const session = await admin.authSession.create({ data: { userId: account.id, tokenHash: tokenHash(token), csrfTokenHash: tokenHash(csrf), expiresAt: new Date(Date.now() + 3600000) } });
    cookies.set(account.id, `li_session=${token}; li_csrf=${csrf}`); sessions.set(account.id, session.id);
  }
  await admin.insuranceProduct.createMany({ data: productIds.map((id, index) => ({ id, productCode: `TEST-POLICY-${suffix}-${index}`,
    name: `Synthetic Policy Product ${index}`, summary: 'Synthetic product description', isActive: index !== 0 })) });
  await admin.insurancePolicy.createMany({ data: [
    { id: policyIds[0], policyNumber: `TEST-POLICY-${suffix}-A`, customerId: accounts[2].id, productId: productIds[0], status: 'ACTIVE',
      premiumAmount: '12345678.91', sumAssured: '9999999999999.99', paymentFrequency: 'QUARTERLY', nextDueDate: new Date('2027-01-01'),
      effectiveDate: new Date('2026-01-01'), expiryDate: new Date('2046-01-01'), createdAt: new Date('2026-01-01T00:00:00Z') },
    { id: policyIds[1], policyNumber: `TEST-POLICY-${suffix}-PENDING`, customerId: accounts[2].id, productId: productIds[0], status: 'PENDING', createdAt: new Date('2026-01-01T00:00:00Z') },
    { id: policyIds[2], policyNumber: `TEST-POLICY-${suffix}-FOREIGN`, customerId: accounts[4].id, productId: productIds[0], status: 'LAPSED' },
  ] });
  for (let index = 0; index < docIds.length; index++) {
    const publicDoc = [2, 3, 5].includes(index);
    await admin.document.create({ data: { id: docIds[index], title: index === 4 ? 'FOREIGN_PRIVATE_TITLE' : index === 5 ? 'OTHER_PRODUCT_TITLE' : `Synthetic document ${index}`,
      accessScope: publicDoc ? 'PUBLIC' : 'PRIVATE_POLICY', productId: [5, 7].includes(index) ? productIds[1] : productIds[0],
      ...(publicDoc ? {} : { policyId: index === 4 ? policyIds[2] : policyIds[0], ownerCustomerId: index === 4 ? accounts[4].id : accounts[2].id }) } });
    for (const version of [0, 2].includes(index) ? ['1.0', '2.0'] : ['1.0']) {
      const row = await admin.documentVersion.create({ data: { documentId: docIds[index], versionNumber: version,
        storageBucket: 'SYNTHETIC_INTERNAL_SECRET', storageObjectKey: 'https://private/SYNTHETIC_INTERNAL_SECRET.pdf', checksumSha256: 'a'.repeat(64), isActive: index !== 6 } });
      versionIds[`${index}:${version}`] = row.id;
    }
    await admin.document.update({ where: { id: docIds[index] }, data: { currentVersion: [0, 2].includes(index) ? '2.0' : '1.0' } });
  }
  snapshot = { currency: 'VND', snapshotAsOf: '2026-10-31', insuranceTermYears: 20, premiumTermYears: 15, annualPremium: '49382715.64',
    benefits: [{ code: 'LIFE', name: 'Synthetic protection benefit', amount: '9999999999999.99', unit: 'VND', maxDays: 30, annualInternalNote: 'SYNTHETIC_INTERNAL_SECRET' }],
    policyHolder: { citizenId: 'SYNTHETIC_INTERNAL_SECRET' }, secretAccessKey: 'SYNTHETIC_INTERNAL_SECRET',
    documents: { main: binding(0, 'POLICY'), terms: binding(2, 'TERMS'), guide: binding(3, 'PRODUCT_GUIDE'), endorsements: [binding(1, 'ENDORSEMENT')] } };
  await resetSnapshot();
  app = await NestFactory.create(TestModule, { logger: false }); configureHttp(app, { origins: ['http://localhost:8080'], docsEnabled: false });
  await app.listen(0, '127.0.0.1'); base = await app.getUrl();
});
after(async () => {
  await app?.close();
  await admin.$transaction(async tx => {
    await tx.document.updateMany({ where: { id: { in: docIds } }, data: { currentVersion: null } });
    await tx.documentVersion.deleteMany({ where: { documentId: { in: docIds } } });
    await tx.document.deleteMany({ where: { id: { in: docIds } } });
    await tx.insurancePolicy.deleteMany({ where: { id: { in: policyIds } } });
    await tx.insuranceProduct.deleteMany({ where: { id: { in: productIds } } });
    const ids = accounts.map(x => x.id);
    await tx.authSession.deleteMany({ where: { userId: { in: ids } } });
    await tx.staffAssignment.deleteMany({ where: { OR: [{ staffId: { in: ids } }, { customerId: { in: ids } }] } });
    await tx.auditLog.deleteMany({ where: { OR: [{ targetId: { in: ids } }, { actorId: { in: ids } }] } });
    await tx.customerProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.staffProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.user.deleteMany({ where: { id: { in: ids } } });
  });
  await core.$disconnect(); await admin.$disconnect();
});

test('all three endpoints enforce session/role and reject UUID, pagination and query injection', async () => {
  const [a, , ca] = accounts, allowed = paths(ca.id, policyIds[0]);
  for (const path of allowed) { assert.equal((await get(path)).status, 401); assert.equal((await get(path, cookies.get(ca.id))).status, 403); }
  const cookie = cookies.get(a.id);
  for (const query of ['page=0', 'page=-1', 'page=abc', 'page=100001', 'pageSize=0', 'pageSize=51', 'page=1&page=2', 'pageSize=1&pageSize=2', 'pageSize=1.5', 'search=foreign', 'role=STAFF', `staffId=${accounts[1].id}`]) {
    assert.equal((await get(allowed[0] + '?' + query, cookie)).status, 400, query);
  }
  for (const path of ['staff/customers/not-uuid/policies', 'staff/policies/not-uuid', 'staff/policies/not-uuid/documents', allowed[1] + '?customerId=' + ca.id, allowed[2] + '?version=2.0']) assert.equal((await get(path, cookie)).status, 400, path);
  assert.equal((await get(allowed[0], cookies.get(a.id).replace(/li_csrf=[a-f0-9]+/, 'li_csrf=' + '0'.repeat(64)))).status, 401);
});

test('list scopes before counting/pagination, has stable ties, preserves decimal strings/nulls and empty assigned customers', async () => {
  const [a, b, ca, empty, cb, unassigned] = accounts, cookie = cookies.get(a.id), path = `staff/customers/${ca.id}/policies`;
  const first = await ok(path + '?pageSize=1', cookie), second = await ok(path + '?pageSize=1&page=2', cookie);
  assert.equal(first.total, 2); assert.equal(first.page, 1); assert.equal(first.pageSize, 1);
  assert.deepEqual([first.items[0].id, second.items[0].id], [...policyIds.slice(0, 2)].sort());
  const all = await ok(path, cookie), active = all.items.find(x => x.id === policyIds[0]), pending = all.items.find(x => x.id === policyIds[1]);
  assert.equal(active.premiumAmount, '12345678.91'); assert.equal(active.sumAssured, '9999999999999.99'); assert.equal(active.nextDueDate, '2027-01-01'); assert.equal(active.currency, 'VND'); assert.equal(active.product.isActive, false);
  for (const field of ['premiumAmount', 'paymentFrequency', 'sumAssured', 'nextDueDate', 'effectiveDate', 'expiryDate', 'currency']) assert.equal(pending[field], null, field);
  assert.deepEqual((await ok(path + '?page=99', cookie)).items, []);
  assert.equal((await ok(`staff/customers/${empty.id}/policies`, cookie)).total, 0);
  for (const id of [cb.id, unassigned.id, randomUUID()]) assert.equal((await get(`staff/customers/${id}/policies`, cookie)).status, 404);
  assert.equal((await get(path, cookies.get(b.id), { 'X-User-ID': a.id, 'X-Role': 'STAFF' })).status, 404);
});

test('detail is allowlisted, precise and tolerates missing/invalid financial snapshot without inventing benefits', async () => {
  const [a, b] = accounts, cookie = cookies.get(a.id), path = `staff/policies/${policyIds[0]}`;
  const { policy } = await ok(path, cookie);
  assert.equal(policy.customer.id, accounts[2].id); assert.deepEqual(Object.keys(policy.customer).sort(), ['accountCode', 'fullName', 'id']);
  assert.equal(policy.product.summary, 'Synthetic product description'); assert.equal(policy.benefitsSnapshotStatus, 'AVAILABLE');
  assert.equal(policy.benefitsSnapshot.annualPremium, '49382715.64'); assert.equal(policy.benefitsSnapshot.benefits[0].amount, '9999999999999.99');
  const pending = (await ok(`staff/policies/${policyIds[1]}`, cookie)).policy;
  assert.equal(pending.benefitsSnapshot, null); assert.equal(pending.benefitsSnapshotStatus, 'NOT_PROVIDED');
  assert.equal((await get(path, cookies.get(b.id))).status, 404); assert.equal((await get(`staff/policies/${randomUUID()}`, cookie)).status, 404);
  try {
    for (const invalid of [['unexpected'], { ...snapshot, benefits: [{ name: 'Bad amount', amount: 'not-a-number' }] }, { ...snapshot, snapshotAsOf: '2026-02-30' }]) {
      await resetSnapshot(invalid); const view = (await ok(path, cookie)).policy; assert.equal(view.benefitsSnapshot, null); assert.equal(view.benefitsSnapshotStatus, 'INVALID');
    }
  } finally { await resetSnapshot(); }
});

test('catalog returns only active exact bound versions; public currentVersion never replaces the applied version', async () => {
  const response = await ok(`staff/policies/${policyIds[0]}/documents`, cookies.get(accounts[0].id));
  assert.equal(response.total, 4); assert.equal(response.availability, 'AVAILABLE'); assert.equal(response.mainDocumentStatus, 'AVAILABLE'); assert.deepEqual(response.issues, []);
  assert.deepEqual(response.items.map(x => x.kind), ['POLICY', 'TERMS', 'PRODUCT_GUIDE', 'ENDORSEMENT']);
  assert.equal(response.items[0].versionId, versionIds['0:1.0']); assert.equal(response.items[1].versionId, versionIds['2:1.0']);
  assert.ok(response.items.every(x => x.versionNumber === '1.0')); assert.ok(response.items.every(x => !('currentVersion' in x)));
  assert.equal(response.items[0].accessScope, 'PRIVATE_POLICY'); assert.equal(response.items[1].accessScope, 'PUBLIC');
});

test('catalog fails closed on cross-owner/product, inactive, missing or malformed bindings without leaking foreign metadata', async () => {
  const cookie = cookies.get(accounts[0].id), path = `staff/policies/${policyIds[0]}/documents`;
  try {
    await resetSnapshot({ documents: { main: binding(4, 'POLICY'), terms: binding(5, 'TERMS'), guide: binding(3, 'PRODUCT_GUIDE'), endorsements: [binding(6, 'ENDORSEMENT'), { documentId: 'invalid-uuid', kind: 'ENDORSEMENT', version: '1.0' }] } });
    const partial = await ok(path, cookie); assert.equal(partial.total, 1); assert.equal(partial.availability, 'PARTIAL'); assert.equal(partial.mainDocumentStatus, 'UNAVAILABLE'); assert.equal(partial.issues.length, 4);
    assert.equal(partial.items[0].kind, 'PRODUCT_GUIDE');
    for (const token of [docIds[4], docIds[5], docIds[6], 'FOREIGN_PRIVATE_TITLE', 'OTHER_PRODUCT_TITLE']) assert.ok(!JSON.stringify(partial).includes(token));
    await resetSnapshot({ documents: { main: binding(7, 'POLICY'), terms: binding(2, 'TERMS', 'not-present') } });
    const unavailable = await ok(path, cookie); assert.deepEqual(unavailable.items, []); assert.equal(unavailable.availability, 'UNAVAILABLE');
    await resetSnapshot({ documents: { main: binding(0, 'POLICY'), endorsements: [binding(0, 'ENDORSEMENT')] } });
    const duplicate = await ok(path, cookie); assert.equal(duplicate.total, 1); assert.equal(duplicate.issues[0].reason, 'DUPLICATE_BINDING');
  } finally { await resetSnapshot(); }
});

test('catalog distinguishes missing bindings, no issued PDF and an explicitly empty document set', async () => {
  const cookie = cookies.get(accounts[0].id);
  const absent = await ok(`staff/policies/${policyIds[1]}/documents`, cookie);
  assert.equal(absent.availability, 'UNAVAILABLE'); assert.equal(absent.mainDocumentStatus, 'NOT_PROVIDED'); assert.equal(absent.issues[0].reason, 'BINDINGS_NOT_PROVIDED');
  try {
    await resetSnapshot({ documents: { main: null, terms: null, guide: null, endorsements: [] } });
    const empty = await ok(`staff/policies/${policyIds[0]}/documents`, cookie); assert.equal(empty.availability, 'EMPTY'); assert.equal(empty.total, 0);
    await resetSnapshot({ documents: { main: null, terms: binding(2, 'TERMS') } });
    const termsOnly = await ok(`staff/policies/${policyIds[0]}/documents`, cookie); assert.equal(termsOnly.mainDocumentStatus, 'NOT_PROVIDED'); assert.equal(termsOnly.items[0].kind, 'TERMS');
  } finally { await resetSnapshot(); }
});

test('PDF access enforces CSRF, policy assignment and exact applied active document version; audit records intent without URL', async () => {
  const cookie = cookies.get(accounts[0].id);
  const csrf = cookie.split(';').map(x => x.trim()).find(x => x.startsWith('li_csrf=')).slice(8);
  const path = `staff/documents/${docIds[0]}/versions/${versionIds['0:1.0']}`;
  const post = (target, body = { policyId: policyIds[0] }, cookieValue = cookie, headers = {}) => fetch(base + '/api/v1/' + target, {
    method: 'POST', headers: { Cookie: cookieValue, Origin: 'http://localhost:8080', 'Content-Type': 'application/json', 'X-Auth-Request': '1', 'X-CSRF-Token': csrf, ...headers }, body: JSON.stringify(body),
  });
  assert.equal((await post(path + '/view', undefined, '')).status, 401);
  assert.equal((await post(path + '/view', undefined, cookies.get(accounts[2].id))).status, 403);
  assert.equal((await post(path + '/view', undefined, cookie, { 'X-CSRF-Token': '' })).status, 403);
  assert.equal((await post(path + '/view', undefined, cookie, { Origin: 'http://evil.invalid' })).status, 403);
  assert.equal((await post(path + '/view', { policyId: policyIds[2] })).status, 404);
  assert.equal((await post(path + '/view', { policyId: policyIds[0], storageObjectKey: 'injected' })).status, 400);
  assert.equal((await post(`staff/documents/${docIds[0]}/versions/${versionIds['0:2.0']}/view`)).status, 404);
  assert.equal((await post(`staff/documents/${docIds[4]}/versions/${versionIds['4:1.0']}/view`)).status, 404);
  assert.equal(storageCalls.length, 0);
  for (const intent of ['view', 'download']) {
    const response = await post(path + '/' + intent); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json(); assert.deepEqual(Object.keys(body).sort(), ['expiresAt', 'url']);
    assert.equal(storageCalls.at(-1)[2], intent);
    const audit = await admin.auditLog.findFirst({ where: { targetId: versionIds['0:1.0'], action: intent === 'view' ? 'POLICY_PDF_VIEW_ISSUED' : 'POLICY_PDF_DOWNLOAD_ISSUED' } });
    assert(audit); assert.equal(audit.actorId, accounts[0].id); assert(!JSON.stringify(audit.metadata).includes('http'));
  }
  await admin.documentVersion.update({ where: { id: versionIds['0:1.0'] }, data: { isActive: false } });
  try { assert.equal((await post(path + '/view')).status, 404); } finally { await admin.documentVersion.update({ where: { id: versionIds['0:1.0'] }, data: { isActive: true } }); }
});

test('all endpoints observe committed reassignment/unassignment on the next request without re-login', async () => {
  const [a, b, ca] = accounts;
  await admin.$transaction(async tx => {
    await tx.staffAssignment.updateMany({ where: { customerId: ca.id, isActive: true }, data: { isActive: false, endedAt: new Date() } });
    await tx.staffAssignment.create({ data: { customerId: ca.id, staffId: b.id, operatorId: 'synthetic-policy-api-test' } });
  });
  for (const path of paths(ca.id, policyIds[0])) { assert.equal((await get(path, cookies.get(a.id))).status, 404); await ok(path, cookies.get(b.id)); }
  await admin.staffAssignment.updateMany({ where: { customerId: ca.id, isActive: true }, data: { isActive: false, endedAt: new Date() } });
  for (const path of paths(ca.id, policyIds[0])) assert.equal((await get(path, cookies.get(b.id))).status, 404);
});

test('locked/revoked/expired Staff cannot read; assigned Staff may still service a locked Customer', async () => {
  const [a, b, , , cb] = accounts, targets = paths(cb.id, policyIds[2]);
  await admin.user.update({ where: { id: cb.id }, data: { status: 'LOCKED' } });
  for (const path of targets) await ok(path, cookies.get(b.id));
  await admin.user.update({ where: { id: b.id }, data: { status: 'LOCKED' } });
  for (const path of targets) assert.equal((await get(path, cookies.get(b.id))).status, 401);
  await admin.user.update({ where: { id: b.id }, data: { status: 'ACTIVE' } });
  await admin.authSession.update({ where: { id: sessions.get(b.id) }, data: { revokedAt: new Date() } });
  for (const path of targets) assert.equal((await get(path, cookies.get(b.id))).status, 401);
  await admin.authSession.update({ where: { id: sessions.get(a.id) }, data: { createdAt: new Date(Date.now() - 60000), expiresAt: new Date(Date.now() - 1000) } });
  for (const path of targets) assert.equal((await get(path, cookies.get(a.id))).status, 401);
});
