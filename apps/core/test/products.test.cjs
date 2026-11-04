require('reflect-metadata');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { PrismaClient } = require('../dist/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { DatabaseService } = require('../dist/database/database.service');
const { AuthService, tokenHash } = require('../dist/auth/services/auth.service');
const { ProductService } = require('../dist/products/services/product.service');
const { ProductController } = require('../dist/products/controllers/product.controller');
const { PolicyService } = require('../dist/policies/services/policy.service');
const { PolicyStorageService } = require('../dist/policies/services/policy-storage.service');
const { StaffPolicyController } = require('../dist/policies/controllers/staff-policy.controller');
const { configureHttp } = require('../dist/http/http-foundation');

process.env.NODE_ENV = 'test'; process.env.CORS_ORIGINS = 'http://localhost:8080';
const runId = `p01-${randomUUID().slice(0, 12)}`, userIds = [], productIds = [], policyIds = [];
function client(role, path) {
  return new PrismaClient({ adapter: new PrismaPg({ host: process.env.PGHOST, database: process.env.I01_TEST_DATABASE,
    user: role, password: readFileSync(path, 'utf8').trim(), max: 5 }) });
}
const admin = client('admin_runtime', '/credentials/admin/password'), core = client('core_runtime', '/credentials/core/password');
let app, base, staff, otherStaff, customer, unassigned, afterCount;
// Force a real committed publication change between count and page reads. This
// catches a split-snapshot implementation without changing the production API.
const prisma = new Proxy(core, { get(target, key) {
  if (key === '$transaction') return (work, options) => target.$transaction(async tx => {
    const wrapped = new Proxy(tx, { get(transaction, member) {
      if (member !== 'insuranceProduct') return transaction[member];
      return new Proxy(transaction.insuranceProduct, { get(model, method) {
        if (method !== 'count') return model[method];
        return async (...args) => {
          const count = await model.count(...args);
          if (afterCount) { const callback = afterCount; afterCount = null; await callback(); }
          return count;
        };
      } });
    } });
    return work(wrapped);
  }, options);
  const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
} });
class TestModule {}
Module({ controllers: [ProductController, StaffPolicyController], providers: [AuthService, ProductService, PolicyService,
  { provide: DatabaseService, useValue: { prisma } }, { provide: PolicyStorageService, useValue: {} }] })(TestModule);

async function actor(role) {
  const id = randomUUID(); userIds.push(id);
  await admin.user.create({ data: { id, role, accountCode: `${role === 'STAFF' ? 'STF' : 'CUS'}-${BigInt('0x' + id.replaceAll('-', '')).toString().slice(0, 22)}`,
    email: `${id}@synthetic.invalid`, passwordHash: 'synthetic-fixture-not-a-login-password',
    ...(role === 'STAFF' ? { staffProfile: { create: { fullName: 'Synthetic Product Staff' } } }
      : { customerProfile: { create: { fullName: 'Synthetic Product Customer' } } }) } });
  const token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex');
  const session = await admin.authSession.create({ data: { userId: id, tokenHash: tokenHash(token), csrfTokenHash: tokenHash(csrf),
    expiresAt: new Date(Date.now() + 3600000) } });
  return { id, cookie: `li_session=${token}; li_csrf=${csrf}`, sessionId: session.id };
}
async function get(path, who = staff, expected = 200, gateway = false) {
  const response = await fetch((gateway ? 'http://gateway' : base) + '/api/v1/' + path,
    { headers: { ...(who ? { Cookie: who.cookie } : {}), 'X-Request-ID': randomUUID() }, signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, expected, `Unexpected HTTP status ${response.status}; expected ${expected} on synthetic test path ${path}`);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.doesNotMatch(JSON.stringify(body), /passwordHash|citizenId|tokenHash|storageBucket|storageObjectKey|checksumSha256|secretAccessKey|PRIVATE_PRODUCT_SENTINEL/);
  if (expected >= 400) assert.deepEqual(Object.keys(body).sort(), ['code', 'message', 'requestId', 'statusCode', 'timestamp']);
  return { body, response };
}
const list = (extra = '', search = runId) => `products?search=${encodeURIComponent(search)}${extra}`;
const productKeys = ['id', 'isActive', 'name', 'productCode', 'summary'];
function projection(item) { assert.deepEqual(Object.keys(item).sort(), productKeys); assert.equal(item.isActive, true); }

before(async () => {
  staff = await actor('STAFF'); otherStaff = await actor('STAFF');
  customer = await actor('CUSTOMER'); unassigned = await actor('CUSTOMER');
  await admin.staffAssignment.create({ data: { staffId: staff.id, customerId: customer.id, operatorId: runId } });
  for (let i = 0; i < 14; i++) productIds.push(randomUUID());
  await admin.insuranceProduct.createMany({ data: productIds.map((id, i) => ({ id, productCode: `${runId}-${String(i).padStart(2, '0')}`,
    name: i === 9 ? `${runId} Ánh %_\\` : i === 10 ? `${runId} Ánh XY` : i === 11 ? `${runId} Ánh _tag`
      : i === 12 ? `${runId} Ánh Ztag` : `Synthetic ${runId} Product ${i}`,
    summary: i === 1 ? `${runId}-SUMMARY-ONLY` : null, isActive: i !== 13, createdAt: new Date('2026-01-01T00:00:00Z') })) });
  const policyId = randomUUID(); policyIds.push(policyId);
  await admin.insurancePolicy.create({ data: { id: policyId, policyNumber: `${runId}-HISTORICAL`, customerId: customer.id,
    productId: productIds[13], status: 'ACTIVE', benefitsSnapshot: { private: 'PRIVATE_PRODUCT_SENTINEL' } } });
  app = await NestFactory.create(TestModule, { logger: false });
  configureHttp(app, { origins: ['http://localhost:8080'], docsEnabled: true });
  await app.listen(0, '127.0.0.1'); base = await app.getUrl();
});
after(async () => {
  try {
    await app?.close();
    await admin.$transaction(async tx => {
      await tx.insurancePolicy.deleteMany({ where: { id: { in: policyIds } } });
      await tx.insuranceProduct.deleteMany({ where: { id: { in: productIds } } });
      await tx.authSession.deleteMany({ where: { userId: { in: userIds } } });
      await tx.rateLimitBucket.deleteMany({ where: { clientToken: { in: userIds.map(id => tokenHash(id.toLowerCase())) }, endpointGroup: 'PRODUCT_READ' } });
      await tx.staffAssignment.deleteMany({ where: { customerId: { in: userIds } } });
      await tx.customerProfile.deleteMany({ where: { userId: { in: userIds } } });
      await tx.staffProfile.deleteMany({ where: { userId: { in: userIds } } });
      await tx.user.deleteMany({ where: { id: { in: userIds } } });
    });
  } finally { await admin.$disconnect(); await core.$disconnect(); }
});

test('authenticated roles see the same active catalog without an assignment gate', async () => {
  const bodies = [];
  for (const who of [staff, otherStaff, customer, unassigned]) bodies.push((await get(list('&pageSize=50'), who)).body);
  for (const body of bodies) {
    assert.deepEqual(body, bodies[0]); assert.equal(body.total, 13); assert.equal(body.items.length, 13);
    assert.deepEqual(Object.keys(body).sort(), ['items', 'page', 'pageSize', 'total']); body.items.forEach(projection);
  }
});
test('name/code search is case-insensitive, trimmed, literal and does not search summary', async () => {
  assert.equal((await get(list('', `  ${runId.toUpperCase()}-01  `))).body.items[0].id, productIds[1]);
  for (const term of [`${runId} Ánh %`, `${runId} Ánh %_\\`]) {
    assert.deepEqual((await get(list('', term))).body.items.map(x => x.id), [productIds[9]]);
  }
  assert.deepEqual((await get(list('', `${runId} Ánh _`))).body.items.map(x => x.id), [productIds[11]]);
  assert.equal((await get(list('', `${runId} ánh`))).body.total, 4);
  for (const term of [`${runId} Anh`, `${runId}-SUMMARY-ONLY`, `${runId}' OR 1=1 --`]) assert.equal((await get(list('', term))).body.total, 0);
});
test('pagination counts the filtered active set and keeps deterministic code order across pages', async () => {
  const ids = [];
  for (let page = 1; page <= 3; page++) {
    const { body } = await get(list(`&page=${page}&pageSize=5`));
    assert.equal(body.total, 13); assert.equal(body.page, page); assert.equal(body.pageSize, 5);
    assert.equal(body.items.length, page === 3 ? 3 : 5); ids.push(...body.items.map(x => x.id));
  }
  assert.deepEqual(ids, productIds.slice(0, 13));
  assert.equal(new Set(ids).size, 13);
  const { body } = await get(list('&page=20&pageSize=5')); assert.deepEqual(body.items, []); assert.equal(body.total, 13);
  const defaults = (await get(list())).body; assert.equal(defaults.page, 1); assert.equal(defaults.pageSize, 10);
  assert.equal((await get('products?search=%20%20')).body.total, (await get('products')).body.total);
});
test('count and page use one snapshot even if a product is deactivated between their queries', async () => {
  afterCount = () => admin.insuranceProduct.update({ where: { id: productIds[12] }, data: { isActive: false } });
  try {
    const { body } = await get(list('&pageSize=50')); assert.equal(body.total, 13); assert.equal(body.items.length, 13);
    assert.equal((await get(list('&pageSize=50'))).body.total, 12);
  } finally { afterCount = null; await admin.insuranceProduct.update({ where: { id: productIds[12] }, data: { isActive: true } }); }
});
test('detail has only public fields, preserves null and omits all policy/document relations', async () => {
  const { body } = await get(`products/${productIds[0]}`, unassigned);
  assert.deepEqual(Object.keys(body), ['product']); projection(body.product); assert.equal(body.product.summary, null);
  assert.equal((await get(`products/${productIds[1]}`)).body.product.summary, `${runId}-SUMMARY-ONLY`);
});
test('inactive and missing products return equivalent safe404; historical Staff policy still reads', async () => {
  const a = (await get(`products/${productIds[13]}`, customer, 404)).body;
  const b = (await get(`products/${randomUUID()}`, customer, 404)).body;
  assert.equal(a.code, b.code); assert.equal(a.message, b.message);
  const { body } = await get(`staff/policies/${policyIds[0]}`); assert.equal(body.policy.product.isActive, false);
  await get(`staff/policies/${policyIds[0]}`, otherStaff, 404);
});
test('unsupported, duplicate and malformed query fields and UUIDs are rejected', async () => {
  for (const query of ['page=0', 'page=-1', 'page=1.2', 'page=1e3', 'page=100001', 'page=1&page=2', 'pageSize=0', 'pageSize=51',
    'search=x&search=y', 'search[]=x', 'search=%00', 'search=x%0Ay', `search=${'x'.repeat(101)}`,
    'isActive=false', 'status=ACTIVE', 'customerId=any', 'role=STAFF', 'sort=name', 'cursor=any']) await get(`products?${query}`, staff, 400);
  await get('products/not-a-uuid', staff, 400);
  await get(`products/${productIds[0]}?role=CUSTOMER`, staff, 400);
});
test('anonymous, malformed, expired, revoked and locked sessions cannot read products', async () => {
  await get('products', null, 401); await get(`products/${productIds[0]}`, null, 401);
  await get('products', { cookie: 'li_session=bad; li_csrf=bad' }, 401);
  for (const state of ['expired', 'revoked', 'locked']) {
    const who = await actor('CUSTOMER');
    if (state === 'locked') await admin.user.update({ where: { id: who.id }, data: { status: 'LOCKED' } });
    else await admin.authSession.update({ where: { id: who.sessionId }, data: state === 'expired'
      ? { createdAt: new Date(Date.now() - 7200000), expiresAt: new Date(Date.now() - 3600000) } : { revokedAt: new Date() } });
    await get(list(), who, 401); await get(`products/${productIds[0]}`, who, 401);
  }
});
test('read quota is shared by list/detail, actor-scoped, atomic and resets after its window', async () => {
  const who = await actor('CUSTOMER'), key = { clientToken: tokenHash(who.id.toLowerCase()), endpointGroup: 'PRODUCT_READ' };
  await admin.rateLimitBucket.create({ data: { ...key, windowStart: new Date(), requestCount: 118 } });
  const responses = await Promise.all(Array.from({ length: 4 }, (_, i) => fetch(base + '/api/v1/' + (i % 2 ? `products/${productIds[0]}` : list()),
    { headers: { Cookie: who.cookie } })));
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 200, 429, 429]);
  for (const response of responses) if (response.status === 429) {
    assert.ok(Number(response.headers.get('retry-after')) >= 1); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.json()).code, 'RATE_LIMITED');
  }
  await get(list(), unassigned);
  await admin.rateLimitBucket.update({ where: { clientToken_endpointGroup: key }, data: { windowStart: new Date(Date.now() - 61000) } });
  await get(list(), who);
  assert.equal((await admin.rateLimitBucket.findUniqueOrThrow({ where: { clientToken_endpointGroup: key } })).requestCount, 1);
});
test('Swagger documents the P01 cookie auth, fields and pagination limits', async () => {
  const spec = await (await fetch(base + '/api/v1/docs-json')).json();
  assert.deepEqual(spec.paths['/api/v1/products'].get.security, [{ session: [] }]);
  assert.ok(spec.paths['/api/v1/products/{productId}'].get.responses['404']);
  assert.deepEqual(Object.keys(spec.components.schemas.ProductDto.properties).sort(), productKeys);
  assert.equal(spec.paths['/api/v1/products'].get.parameters.find(x => x.name === 'page').schema.maximum, 100000);
  assert.equal(spec.paths['/api/v1/products'].get.parameters.find(x => x.name === 'pageSize').schema.maximum, 50);
});
test('gateway exposes the deployed Products module and both authenticated roles', { skip: process.env.P01_GATEWAY !== '1' }, async () => {
  for (const who of [staff, unassigned]) {
    assert.equal((await get(list(), who, 200, true)).body.total, 13);
    projection((await get(`products/${productIds[0]}`, who, 200, true)).body.product);
    await get(`products/${productIds[13]}`, who, 404, true);
  }
  await get('products', null, 401, true);
  assert.equal((await get('auth/me', staff, 200, true)).body.actor.id, staff.id);
  assert.equal((await get('auth/me', unassigned, 200, true)).body.actor.id, unassigned.id);
  await get('staff/me', staff, 200, true);
  assert.equal((await get('customers/me', customer, 200, true)).body.customer.id, customer.id);
  assert.ok((await get('staff/customers', staff, 200, true)).body.items.some(item => item.id === customer.id));
  await get(`staff/customers/${customer.id}`, staff, 200, true);
  await get(`staff/policies/${policyIds[0]}`, staff, 200, true);
  await get('staff/inbox/customers', staff, 200, true);
});
