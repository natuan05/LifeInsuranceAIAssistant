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
const { configureHttp } = require('../dist/http/http-foundation');
const { AccountProvisioningService } = require('../dist/accounts/services/account-provisioning.service');
const input = JSON.parse(readFileSync(0, 'utf8'));
const origin = 'http://localhost:3000';
process.env.NODE_ENV = 'test'; process.env.CORS_ORIGINS = origin;
const adapter = (user, password) => new PrismaPg({ host: '127.0.0.1', port: input.port, database: 'life_insurance', user, password, max: 3 });
const admin = new PrismaClient({ adapter: adapter('admin_runtime', input.password) });
const core = new PrismaClient({ adapter: adapter('core_runtime', readFileSync('.local/dev/core-password', 'utf8').trim()) });
class TestModule {}
Module({ controllers: [AuthController], providers: [AuthService, { provide: DatabaseService, useValue: { prisma: core } }] })(TestModule);
let app, base, staff, customer;
const suffix = Date.now().toString();
const password = 'Synthetic-Login-12345';
const headers = { Origin: origin, 'Content-Type': 'application/json', 'X-Auth-Request': '1' };
async function start() {
  app = await NestFactory.create(TestModule, { logger: false });
  configureHttp(app, { origins: [origin], docsEnabled: false });
  await app.listen(0, '127.0.0.1'); base = await app.getUrl();
}
const post = (route, body = {}, cookie = '', extra = {}) => fetch(`${base}/api/v1/auth/${route}`, {
  method: 'POST', headers: { ...headers, Cookie: cookie, ...extra }, body: JSON.stringify(body),
});
const me = cookie => fetch(`${base}/api/v1/auth/me`, { headers: { Cookie: cookie, Origin: origin } });
async function signIn(email, oldCookie = '') {
  const response = await post(email.trim().toLowerCase() === staff.email ? 'staff/login' : 'login', { email, password }, oldCookie);
  assert.equal(response.status, 200);
  const cookies = response.headers.getSetCookie();
  assert.equal(cookies.length, 2);
  cookies.forEach(cookie => { assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/); assert.match(cookie, /Path=\/api\/v1;/); assert.match(cookie, /Max-Age=28800/); assert.doesNotMatch(cookie, /Domain=/); });
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ['actor', 'csrfToken']);
  assert.doesNotMatch(JSON.stringify(body.actor), /passwordHash|tokenHash|csrfToken|sessions/);
  return { body, cookie: cookies.map(c => c.split(';')[0]).join('; ') };
}
before(async () => {
  const service = new AccountProvisioningService(admin);
  const context = { operatorId: 'synthetic-auth-test', requestId: randomUUID() };
  staff = await service.create({ accountCode: `STF-${suffix}`, email: `auth.staff.${suffix}@synthetic.invalid`, role: 'STAFF', fullName: 'Synthetic Auth Staff', password }, context);
  customer = await service.create({ accountCode: `CUS-${suffix}`, email: `auth.customer.${suffix}@synthetic.invalid`, role: 'CUSTOMER', fullName: 'Synthetic Auth Customer', password }, context);
  await start();
});
after(async () => {
  await app?.close();
  const ids = [staff?.id, customer?.id].filter(Boolean);
  if (ids.length) await admin.$transaction(async tx => {
    await tx.authSession.deleteMany({ where: { userId: { in: ids } } });
    await tx.auditLog.deleteMany({ where: { targetId: { in: ids } } });
    await tx.customerProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.staffProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.rateLimitBucket.deleteMany({ where: { clientToken: { in: ids.map(tokenHash) }, endpointGroup: 'AUTH_PASSWORD_CHANGE' } });
    await tx.user.deleteMany({ where: { id: { in: ids } } });
    await tx.rateLimitBucket.deleteMany({ where: { clientToken: { in: [staff, customer].filter(Boolean).flatMap(a => [tokenHash(a.email), tokenHash(a.accountCode.toLowerCase())]) }, endpointGroup: 'AUTH_LOGIN' } });
  });
  await core.$disconnect(); await admin.$disconnect();
});

test('email-only portal login, safe actor role, hashed sessions, session replacement and Core restart', async () => {
  const first = await signIn(`  ${staff.email.toUpperCase()}  `);
  assert.equal(first.body.actor.role, 'STAFF');
  const raw = first.cookie.match(/li_session=([a-f0-9]{64})/)[1];
  const stored = await admin.authSession.findUnique({ where: { tokenHash: tokenHash(raw) } });
  assert.ok(stored); assert.notEqual(stored.tokenHash, raw);
  assert.equal((await me(first.cookie)).status, 200);
  await app.close(); await start();
  assert.equal((await me(first.cookie)).status, 200);
  const second = await signIn(customer.email, first.cookie);
  assert.equal(second.body.actor.role, 'CUSTOMER');
  assert.equal((await me(first.cookie)).status, 401);
  assert.equal((await me(second.cookie)).status, 200);
});

test('portal isolation, email-only DTO and rejection of account codes', async () => {
  for (const [route, account] of [['login', staff], ['staff/login', customer]]) {
    const response = await post(route, { email: account.email, password });
    assert.equal(response.status, 401);
    assert.equal(response.headers.getSetCookie().length, 0);
  }
  for (const route of ['login', 'staff/login']) {
    assert.equal((await post(route, { email: 'STF-000001', password })).status, 400);
    assert.equal((await post(route, { identifier: staff.email, password })).status, 400);
    assert.equal((await post(route, { email: staff.email, password, role: 'STAFF' })).status, 400);
  }
});

test('Origin/custom header/CSRF enforcement and logout invalidates replayed cookies', async () => {
  const login = await signIn(staff.email);
  assert.equal((await post('staff/login', { email: staff.email, password }, '', { Origin: 'https://untrusted.invalid' })).status, 403);
  assert.equal((await post('staff/login', { email: staff.email, password }, '', { 'X-Auth-Request': '' })).status, 403);
  assert.equal((await post('logout', {}, login.cookie)).status, 403);
  assert.equal((await post('logout', {}, login.cookie, { 'X-CSRF-Token': '0'.repeat(64) })).status, 403);
  assert.equal((await me(login.cookie)).status, 200);
  const result = await post('logout', {}, login.cookie, { 'X-CSRF-Token': login.body.csrfToken });
  assert.equal(result.status, 200);
  assert.ok(result.headers.getSetCookie().every(cookie => cookie.includes('Max-Age=0')));
  assert.equal((await me(login.cookie)).status, 401);
});

test('locked, expired and revoked sessions fail; DTO rejects role injection; no public registration', async () => {
  const current = await signIn(customer.email);
  await admin.user.update({ where: { id: customer.id }, data: { status: 'LOCKED' } });
  assert.equal((await me(current.cookie)).status, 401);
  assert.equal((await post('login', { email: customer.email, password })).status, 401);
  await admin.user.update({ where: { id: customer.id }, data: { status: 'ACTIVE' } });
  const token = current.cookie.match(/li_session=([a-f0-9]{64})/)[1];
  await admin.authSession.update({ where: { tokenHash: tokenHash(token) }, data: { createdAt: new Date(Date.now() - 60000), expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await me(current.cookie)).status, 401);
  assert.equal((await post('login', { email: customer.email, password, role: 'STAFF' })).status, 400);
  assert.equal((await post('register', { email: 'fake@synthetic.invalid' })).status, 404);
  assert.equal((await me('')).status, 401);
});

const change = (session, currentPassword, newPassword, confirmPassword = newPassword, extra = {}) => post('change-password',
  { currentPassword, newPassword, confirmPassword }, session.cookie, { 'X-CSRF-Token': session.body.csrfToken, ...extra });
async function changedSession(response) {
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.actor.passwordChangeRecommended, false);
  assert.deepEqual(Object.keys(body).sort(), ['actor', 'csrfToken']);
  assert.doesNotMatch(JSON.stringify(body), /passwordHash|sessionToken|tokenHash/);
  const cookies = response.headers.getSetCookie();
  assert.equal(cookies.length, 2);
  cookies.forEach(c => assert.match(c, /HttpOnly/));
  return { body, cookie: cookies.map(c => c.split(';')[0]).join('; ') };
}

test('Staff and Customer self-change: validation, CSRF, all old sessions revoked, bcrypt, reminder and audit', async () => {
  for (const account of [staff, customer]) {
    await admin.rateLimitBucket.deleteMany({ where: { clientToken: tokenHash(account.email), endpointGroup: 'AUTH_LOGIN' } });
    const first = await signIn(account.email), second = await signIn(account.email);
    const next = 'Ab6!xy';
    assert.equal((await change(first, password, next, next, { Origin: 'https://untrusted.invalid' })).status, 403);
    assert.equal((await change(first, password, next, next, { 'X-CSRF-Token': '' })).status, 403);
    assert.equal((await change(first, password, next, next, { 'X-Auth-Request': '' })).status, 403);
    assert.equal((await post('change-password', { currentPassword: password, newPassword: next, confirmPassword: next })).status, 401);
    for (const invalid of [
      { currentPassword: password, newPassword: 'short', confirmPassword: 'short' },
      { currentPassword: password, newPassword: '🔐'.repeat(19), confirmPassword: '🔐'.repeat(19) },
      { currentPassword: password, newPassword: next, confirmPassword: next, userId: staff.id },
    ]) assert.equal((await post('change-password', invalid, first.cookie, { 'X-CSRF-Token': first.body.csrfToken })).status, 400);
    const before = await admin.user.findUnique({ where: { id: account.id } });
    assert.equal((await change(first, password, next, 'Synthetic-Mismatch-123')).status, 400);
    assert.equal((await change(first, 'wrong-password', next)).status, 400);
    assert.equal((await change(first, password, password)).status, 400);
    assert.equal((await admin.user.findUnique({ where: { id: account.id } })).passwordHash, before.passwordHash);
    assert.equal((await me(second.cookie)).status, 200);
    const updated = await changedSession(await change(first, password, next));
    assert.notEqual(updated.cookie, first.cookie); assert.notEqual(updated.body.csrfToken, first.body.csrfToken);
    assert.equal((await me(first.cookie)).status, 401);
    assert.equal((await me(second.cookie)).status, 401);
    assert.equal((await me(updated.cookie)).status, 200);
    assert.equal((await change(first, password, next)).status, 401);
    const saved = await admin.user.findUnique({ where: { id: account.id } });
    assert.ok(saved.passwordHash.startsWith('$2b$12$')); assert.ok(saved.passwordChangedAt);
    assert.equal(await admin.authSession.count({ where: { userId: account.id, revokedAt: null } }), 1);
    const route = account.role === 'STAFF' ? 'staff/login' : 'login';
    assert.equal((await post(route, { email: account.email, password })).status, 401);
    assert.equal((await post(route, { email: account.email, password: next })).status, 200);
    await app.close(); await start();
    assert.equal((await me(updated.cookie)).status, 200);
    const audit = await admin.auditLog.findMany({ where: { targetId: account.id, action: { in: ['PASSWORD_CHANGED', 'PASSWORD_CHANGE_FAILED'] } } });
    assert.ok(audit.some(row => row.action === 'PASSWORD_CHANGED' && row.actorId === account.id && row.outcome === 'SUCCESS'));
    assert.ok(audit.some(row => row.action === 'PASSWORD_CHANGE_FAILED' && row.actorId === account.id));
    assert.ok(audit.every(row => !JSON.stringify(row).includes(next) && !JSON.stringify(row).includes('wrong-password')));
    await changedSession(await change(updated, next, password));
  }
});

test('concurrent password changes allow one winner; rate limit stays in DB', async () => {
  const current = await signIn(customer.email);
  const candidates = ['Synthetic-Concurrent-A-123', 'Synthetic-Concurrent-B-123'];
  const results = await Promise.all(candidates.map(next => change(current, password, next)));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 401]);
  const winner = results.findIndex(r => r.status === 200);
  const session = await changedSession(results[winner]);
  assert.equal((await me(current.cookie)).status, 401);
  assert.equal((await me(session.cookie)).status, 200);
  await changedSession(await change(session, candidates[winner], password));
  const active = await signIn(customer.email);
  await admin.rateLimitBucket.upsert({ where: { clientToken_endpointGroup: { clientToken: tokenHash(customer.id), endpointGroup: 'AUTH_PASSWORD_CHANGE' } },
    create: { clientToken: tokenHash(customer.id), endpointGroup: 'AUTH_PASSWORD_CHANGE', requestCount: 10 }, update: { requestCount: 10, windowStart: new Date() } });
  const before = await admin.user.findUnique({ where: { id: customer.id } });
  assert.equal((await change(active, password, candidates[0])).status, 429);
  assert.equal((await admin.user.findUnique({ where: { id: customer.id } })).passwordHash, before.passwordHash);
});

test('legacy scrypt hash upgrades on successful login without resetting password state', async () => {
  const { scryptSync, randomBytes } = require('node:crypto');
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
  const legacy = ['scrypt', 131072, 8, 1, salt.toString('hex'), key.toString('hex')].join('$');
  await admin.user.update({ where: { id: staff.id }, data: { passwordHash: legacy } });
  const previous = await admin.user.findUnique({ where: { id: staff.id } });
  assert.equal((await post('login', { email: staff.email, password })).status, 401);
  assert.equal((await admin.user.findUnique({ where: { id: staff.id } })).passwordHash, legacy);
  await signIn(staff.email);
  const upgraded = await admin.user.findUnique({ where: { id: staff.id } });
  assert.ok(upgraded.passwordHash.startsWith('$2b$12$'));
  assert.deepEqual(upgraded.passwordChangedAt, previous.passwordChangedAt);
  assert.equal(upgraded.passwordChangeRecommended, previous.passwordChangeRecommended);
});

test('failed logins persist counters/temporary lock; rate limiting persists in DB', async () => {
  await admin.rateLimitBucket.deleteMany({ where: { clientToken: { in: [staff.email, customer.email].map(tokenHash) }, endpointGroup: 'AUTH_LOGIN' } });
  const missingEmail = suffix + '@missing.invalid';
  const missing = await post('login', { email: missingEmail, password });
  assert.equal(missing.status, 401);
  for (let i = 0; i < 5; i++) assert.equal((await post('staff/login', { email: staff.email, password: 'wrong-password' })).status, 401);
  const locked = await admin.user.findUnique({ where: { id: staff.id } });
  assert.equal(locked.failedLoginAttempts, 5); assert.ok(locked.lockedUntil > new Date());
  assert.equal((await post('staff/login', { email: staff.email, password })).status, 401);
  await admin.rateLimitBucket.upsert({ where: { clientToken_endpointGroup: { clientToken: tokenHash(customer.email), endpointGroup: 'AUTH_LOGIN' } },
    create: { clientToken: tokenHash(customer.email), endpointGroup: 'AUTH_LOGIN', requestCount: 10 }, update: { requestCount: 10, windowStart: new Date() } });
  assert.equal((await post('login', { email: customer.email, password })).status, 429);
  await admin.rateLimitBucket.deleteMany({ where: { clientToken: tokenHash(missingEmail), endpointGroup: 'AUTH_LOGIN' } });
});
