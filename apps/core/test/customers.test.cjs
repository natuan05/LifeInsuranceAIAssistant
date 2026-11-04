require('reflect-metadata');
const { readFileSync } = require('node:fs');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('../dist/generated/prisma/client');
const { DatabaseService } = require('../dist/database/database.service');
const { AuthService, tokenHash } = require('../dist/auth/services/auth.service');
const { AuthController } = require('../dist/auth/controllers/auth.controller');
const { CustomerController } = require('../dist/customers/controllers/customer.controller');
const { CustomerService } = require('../dist/customers/services/customer.service');
const { configureHttp } = require('../dist/http/http-foundation');
const { AccountProvisioningService } = require('../dist/accounts/services/account-provisioning.service');
const input = JSON.parse(readFileSync(0, 'utf8'));
const origin = 'http://localhost:3000';
process.env.NODE_ENV = 'test'; process.env.CORS_ORIGINS = origin;
const adapter = (user, password) => new PrismaPg({ host: '127.0.0.1', port: input.port, database: 'life_insurance', user, password, max: 3 });
const admin = new PrismaClient({ adapter: adapter('admin_runtime', input.password) });
const core = new PrismaClient({ adapter: adapter('core_runtime', input.corePassword) });
class TestModule {}
Module({ controllers: [AuthController, CustomerController], providers: [AuthService, CustomerService, { provide: DatabaseService, useValue: { prisma: core } }] })(TestModule);
const accounts = [], sessions = {};
const suffix = Date.now().toString();
const password = 'Synthetic-Profile-12345';
let app, base;
const get = (path, cookie = '', headers = {}) => fetch(`${base}/api/v1/${path}`, { headers: { Cookie: cookie, ...headers } });
async function login(account) {
  const response = await fetch(`${base}/api/v1/auth/${account.role === 'STAFF' ? 'staff/login' : 'login'}`, { method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Auth-Request': '1' }, body: JSON.stringify({ email: account.email, password }) });
  assert.equal(response.status, 200);
  return response.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
}
async function json(path, cookie) {
  const response = await get(path, cookie); assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.doesNotMatch(JSON.stringify(body), /passwordHash|tokenHash|csrfToken|citizenId|operatorId|assignmentVersion|lockedUntil/);
  return body;
}
before(async () => {
  const service = new AccountProvisioningService(admin);
  const context = { operatorId: 'synthetic-customer-test', requestId: randomUUID() };
  for (let i = 0; i < 6; i++) {
    const role = i < 2 ? 'STAFF' : 'CUSTOMER';
    const account = await service.create({ accountCode: `${role === 'STAFF' ? 'STF' : 'CUS'}-${suffix}${i}`,
      email: `profile.${suffix}.${i}@synthetic.invalid`, role, fullName: `Synthetic Profile ${i}`, password,
      ...(i === 2 || i === 3 ? { staffId: accounts[0].id } : i === 4 ? { staffId: accounts[1].id } : {}) }, context);
    accounts.push(account);
  }
  await admin.customerProfile.update({ where: { userId: accounts[2].id }, data: { birth: new Date('1990-01-02'), address: 'Synthetic Address A', citizenId: `SYN-${suffix}` } });
  app = await NestFactory.create(TestModule, { logger: false }); configureHttp(app, { origins: [origin], docsEnabled: false });
  await app.listen(0, '127.0.0.1'); base = await app.getUrl();
  for (const account of accounts) sessions[account.id] = await login(account);
});
after(async () => {
  await app?.close();
  const ids = accounts.map(a => a.id);
  if (ids.length) await admin.$transaction(async tx => {
    await tx.authSession.deleteMany({ where: { userId: { in: ids } } });
    await tx.staffAssignment.deleteMany({ where: { OR: [{ staffId: { in: ids } }, { customerId: { in: ids } }] } });
    await tx.auditLog.deleteMany({ where: { targetId: { in: ids } } });
    await tx.customerProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.staffProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.user.deleteMany({ where: { id: { in: ids } } });
    await tx.rateLimitBucket.deleteMany({ where: { clientToken: { in: accounts.map(a => tokenHash(a.email)) }, endpointGroup: 'AUTH_LOGIN' } });
  });
  await core.$disconnect(); await admin.$disconnect();
});

test('authentication, role checks and strict query/UUID validation prevent identity injection', async () => {
  const [a, , ca] = accounts;
  for (const path of ['customers/me', 'staff/customers', `staff/customers/${ca.id}`]) assert.equal((await get(path)).status, 401);
  assert.equal((await get('customers/me', sessions[a.id])).status, 403);
  assert.equal((await get('staff/customers', sessions[ca.id])).status, 403);
  assert.equal((await get(`staff/customers/${ca.id}`, sessions[ca.id])).status, 403);
  for (const query of ['page=0', 'page=abc', 'pageSize=51', 'pageSize=0', 'page=1&page=2', `staffId=${accounts[1].id}`, 'role=STAFF',
    'query=unapproved', 'search=a&search=b', 'search=%00', 'search=' + 'a'.repeat(101)]) {
    assert.equal((await get('staff/customers?' + query, sessions[a.id])).status, 400);
  }
  assert.equal((await get(`customers/me?customerId=${accounts[4].id}`, sessions[ca.id])).status, 400);
  assert.equal((await get('staff/customers/not-a-uuid', sessions[a.id])).status, 400);
  assert.equal((await fetch(`${base}/api/v1/customers/me`, { method: 'PATCH', headers: { Cookie: sessions[ca.id] } })).status, 404);
});

test('Customer reads only own allowlisted profile, current Staff contact and unassigned state', async () => {
  const [a, , ca, , cb, unassigned] = accounts;
  const own = await json('customers/me', sessions[ca.id]);
  assert.equal(own.customer.id, ca.id); assert.equal(own.customer.birth, '1990-01-02'); assert.equal(own.customer.address, 'Synthetic Address A');
  assert.equal(own.staff.id, a.id); assert.equal(own.assignmentStatus, 'ASSIGNED');
  const other = await json('customers/me', sessions[cb.id]); assert.equal(other.customer.id, cb.id); assert.notEqual(other.customer.id, ca.id);
  const empty = await json('customers/me', sessions[unassigned.id]); assert.equal(empty.staff, null); assert.equal(empty.assignmentStatus, 'UNASSIGNED');
});

test('Staff list/count/pagination and detail enforce active assignments; unknown and foreign IDs share 404', async () => {
  const [a, b, ca, ca2, cb, unassigned] = accounts;
  const first = await json('staff/customers?pageSize=1', sessions[a.id]);
  const second = await json('staff/customers?pageSize=1&page=2', sessions[a.id]);
  assert.equal(first.total, 2); assert.equal(first.items.length, 1); assert.equal(second.items.length, 1);
  assert.deepEqual([first.items[0].id, second.items[0].id].sort(), [ca.id, ca2.id].sort());
  assert.deepEqual((await json('staff/customers?page=3&pageSize=1', sessions[a.id])).items, []);
  assert.equal((await json(`staff/customers/${ca.id}`, sessions[a.id])).customer.id, ca.id);
  for (const id of [cb.id, unassigned.id, randomUUID()]) assert.equal((await get(`staff/customers/${id}`, sessions[a.id])).status, 404);
  const own = await get('staff/customers', sessions[a.id], { 'X-User-ID': b.id, 'X-Role': 'STAFF' });
  assert.equal((await own.json()).total, 2);
  assert.equal((await json('staff/customers', sessions[b.id])).total, 1);
});

test('Search filters the entire assigned set before pagination/count and cannot reveal foreign customers', async () => {
  const [a, b, ca, ca2, cb, unassigned] = accounts;
  const cookie = sessions[a.id];
  const search = (value, extra = '') => json('staff/customers?search=' + encodeURIComponent(value) + extra, cookie);
  const first = await json('staff/customers?pageSize=1', cookie);
  const beyondFirstPage = first.items[0].id === ca.id ? ca2 : ca;
  const found = await search(beyondFirstPage.accountCode.toLowerCase(), '&pageSize=1');
  assert.equal(found.total, 1); assert.equal(found.items[0].id, beyondFirstPage.id);
  const all = await search('  sYnThEtIc PrOfIlE  ', '&pageSize=1');
  assert.equal(all.total, 2); assert.equal(all.items.length, 1);
  const next = await search('Synthetic Profile', '&pageSize=1&page=2');
  assert.equal(next.total, 2); assert.notEqual(next.items[0].id, all.items[0].id);
  assert.equal((await search(ca.email.toUpperCase())).items[0].id, ca.id);
  for (const foreign of [cb, unassigned, b]) {
    const absent = await search(foreign.email);
    assert.equal(absent.total, 0); assert.deepEqual(absent.items, []);
  }
  assert.equal((await search('   ')).total, 2);
  assert.equal((await search('no-match-' + suffix)).total, 0);
  assert.equal((await get('staff/customers?search=Synthetic', sessions[ca.id])).status, 403);
});

test('Phone search and LIKE wildcard characters are literal, not a way to broaden the assignment scope', async () => {
  const [a, , ca] = accounts;
  const original = await admin.customerProfile.findUniqueOrThrow({ where: { userId: ca.id } });
  const phone = '+84' + suffix.slice(-10);
  try {
    await admin.user.update({ where: { id: ca.id }, data: { phone } });
    await admin.customerProfile.update({ where: { userId: ca.id }, data: { fullName: 'Synthetic 100%_Literal\\Name' } });
    for (const term of [phone, '%', '_', '\\', '100%_Literal\\']) {
      const body = await json('staff/customers?search=' + encodeURIComponent(term), sessions[a.id]);
      assert.equal(body.total, 1, term); assert.equal(body.items[0].id, ca.id);
    }
  } finally {
    await admin.customerProfile.update({ where: { userId: ca.id }, data: { fullName: original.fullName } });
    await admin.user.update({ where: { id: ca.id }, data: { phone: null } });
  }
});

test('committed reassignment/unassignment takes effect on the next request without re-login', async () => {
  const [a, b, ca] = accounts;
  await admin.$transaction(async tx => {
    await tx.staffAssignment.updateMany({ where: { customerId: ca.id, isActive: true }, data: { isActive: false, endedAt: new Date() } });
    await tx.staffAssignment.create({ data: { customerId: ca.id, staffId: b.id, operatorId: 'synthetic-customer-test' } });
    await tx.customerProfile.update({ where: { userId: ca.id }, data: { assignmentVersion: { increment: 1 } } });
  });
  assert.equal((await get(`staff/customers/${ca.id}`, sessions[a.id])).status, 404);
  assert.equal((await json('staff/customers', sessions[a.id])).total, 1);
  assert.equal((await json('staff/customers?search=' + encodeURIComponent(ca.email), sessions[a.id])).total, 0);
  assert.equal((await json('staff/customers?search=' + encodeURIComponent(ca.email), sessions[b.id])).total, 1);
  assert.equal((await json(`staff/customers/${ca.id}`, sessions[b.id])).customer.id, ca.id);
  assert.equal((await json('customers/me', sessions[ca.id])).staff.id, b.id);
  await admin.staffAssignment.updateMany({ where: { customerId: ca.id, isActive: true }, data: { isActive: false, endedAt: new Date() } });
  assert.equal((await get(`staff/customers/${ca.id}`, sessions[b.id])).status, 404);
  assert.equal((await json('customers/me', sessions[ca.id])).assignmentStatus, 'UNASSIGNED');
});

test('locked/revoked/expired actors cannot read; unavailable Staff contact and empty lists are explicit', async () => {
  const [, b, , , cb, unassigned] = accounts;
  await admin.user.update({ where: { id: b.id }, data: { status: 'LOCKED' } });
  assert.equal((await get('staff/customers', sessions[b.id])).status, 401);
  assert.equal((await get(`staff/customers/${cb.id}`, sessions[b.id])).status, 401);
  const profile = await json('customers/me', sessions[cb.id]); assert.equal(profile.staff, null); assert.equal(profile.assignmentStatus, 'STAFF_UNAVAILABLE');
  await admin.user.update({ where: { id: b.id }, data: { status: 'ACTIVE' } });
  await admin.staffAssignment.updateMany({ where: { staffId: b.id, isActive: true }, data: { isActive: false, endedAt: new Date() } });
  assert.equal((await json('staff/customers', sessions[b.id])).total, 0);
  await admin.authSession.updateMany({ where: { userId: b.id }, data: { revokedAt: new Date() } });
  assert.equal((await get('staff/customers', sessions[b.id])).status, 401);
  await admin.authSession.updateMany({ where: { userId: unassigned.id }, data: { createdAt: new Date(Date.now() - 60000), expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await get('customers/me', sessions[unassigned.id])).status, 401);
});
