require('reflect-metadata');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const http = require('node:http');
const PDFDocument = require('pdfkit');
const { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { PrismaClient } = require('../dist/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { DatabaseService } = require('../dist/database/database.service');
const { AuthService, tokenHash } = require('../dist/auth/services/auth.service');
const { ProductService } = require('../dist/products/services/product.service');
const { ProductDocumentService } = require('../dist/products/services/product-document.service');
const { ProductController } = require('../dist/products/controllers/product.controller');
const { ProductDocumentController } = require('../dist/products/controllers/product-document.controller');
const { PolicyService } = require('../dist/policies/services/policy.service');
const { PolicyStorageService } = require('../dist/policies/services/policy-storage.service');
const { StaffPolicyController } = require('../dist/policies/controllers/staff-policy.controller');
const { configureHttp } = require('../dist/http/http-foundation');

process.env.NODE_ENV = 'test'; process.env.CORS_ORIGINS = 'http://localhost:8080';
process.env.STORAGE_INTERNAL_ENDPOINT = 'http://minio:9000';
process.env.STORAGE_PUBLIC_ENDPOINT = 'http://minio:9000'; process.env.STORAGE_URL_TTL_SECONDS = '60';
const runId = randomUUID(), prefix = `p02-tests/${runId}/`, bucket = process.env.STORAGE_BUCKET;
assert.ok(bucket, 'Dedicated Docker test storage configuration is required');
const ids = { users: [], products: [], policies: [], documents: [] }, keys = [], versions = [];
const sha = data => createHash('sha256').update(data).digest('hex');
function credentials(role) { return { accessKeyId: readFileSync(`/credentials/${role}/access-key`, 'utf8').trim(),
  secretAccessKey: readFileSync(`/credentials/${role}/secret-key`, 'utf8').trim() }; }
const storageOptions = { endpoint: 'http://minio:9000', region: process.env.STORAGE_REGION, forcePathStyle: true, maxAttempts: 1 };
const writer = new S3Client({ ...storageOptions, credentials: credentials('storage-writer') });
const reader = new S3Client({ ...storageOptions, credentials: credentials('storage-reader') });
// Writer intentionally cannot delete published objects. Cleanup authority exists
// only in this dedicated test service and is restricted here to our UUID prefix.
const cleanup = new S3Client({ ...storageOptions, credentials: credentials('storage-test-cleanup') });
function db(role, path) { return new PrismaClient({ adapter: new PrismaPg({ host: process.env.PGHOST,
  database: process.env.I01_TEST_DATABASE, user: role, password: readFileSync(path, 'utf8').trim(), max: 6 }) }); }
const admin = db('admin_runtime', '/credentials/admin/password'), core = db('core_runtime', '/credentials/core/password');
let app, base, staff, customer, otherCustomer, product, secondProduct, inactiveProduct, emptyProduct, policy, main, missing, zero, nonPdf, privatePolicy, foreign, unpublished, inactive;
let signHook, storageCalls = 0, failAudit = false, validIds = [];
const actualStorage = new PolicyStorageService();
const storage = { access: async (...args) => { storageCalls++; return signHook ? signHook(...args) : actualStorage.access(...args); } };
const prisma = new Proxy(core, { get(target, key) {
  if (key === '$transaction') return (work, options) => target.$transaction(tx => work(new Proxy(tx, { get(t, member) {
    if (member !== 'auditLog') return t[member];
    return new Proxy(t.auditLog, { get(model, operation) {
      if (operation !== 'create') return model[operation];
      return args => { if (failAudit && args.data.outcome === 'SUCCESS') throw new Error('PRIVATE_SDK_SENTINEL'); return model.create(args); };
    } });
  } })), options);
  const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
} });
class TestModule {}
Module({ controllers: [ProductController, ProductDocumentController, StaffPolicyController],
  providers: [AuthService, ProductService, ProductDocumentService, PolicyService,
    { provide: DatabaseService, useValue: { prisma } }, { provide: PolicyStorageService, useValue: storage }] })(TestModule);

async function actor(role) {
  const id = randomUUID(); ids.users.push(id);
  await admin.user.create({ data: { id, role, accountCode: `${role === 'STAFF' ? 'STF' : 'CUS'}-${BigInt('0x' + id.replaceAll('-', '')).toString().slice(0, 22)}`,
    email: `${id}@synthetic.invalid`, passwordHash: 'synthetic-fixture-not-for-login',
    ...(role === 'STAFF' ? { staffProfile: { create: { fullName: 'Synthetic P02 Staff' } } }
      : { customerProfile: { create: { fullName: 'Synthetic P02 Customer' } } }) } });
  const token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex');
  const session = await admin.authSession.create({ data: { userId: id, tokenHash: tokenHash(token), csrfTokenHash: tokenHash(csrf), expiresAt: new Date(Date.now() + 3600000) } });
  return { id, csrf, cookie: `li_session=${token}; li_csrf=${csrf}`, sessionId: session.id };
}
async function pdf(label) {
  return new Promise(resolve => {
    const doc = new PDFDocument({ compress: false, info: { Title: `Synthetic P02 ${label}` } }), chunks = [];
    doc.on('data', c => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.text(`Fully synthetic product document ${label}. Local automated test only.`); doc.end();
  });
}
async function addVersion(documentId, versionNumber, body, options = {}) {
  const key = prefix + randomUUID() + '.pdf'; keys.push(key);
  if (!options.missing) await writer.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: options.mime ?? 'application/pdf' }));
  const version = await admin.documentVersion.create({ data: { documentId, versionNumber, storageBucket: bucket, storageObjectKey: key,
    checksumSha256: sha(body), isActive: options.active ?? true } });
  const value = { ...version, bytes: body, key }; versions.push(value); return value;
}
async function document(title, body, options = {}) {
  const id = randomUUID(); ids.documents.push(id);
  const row = await admin.document.create({ data: { id, title, accessScope: options.scope ?? 'PUBLIC',
    ...(options.scope === 'PRIVATE_POLICY'
      ? { ownerCustomerId: customer.id, policyId: policy.id, productId: product.id } : { productId: options.productId ?? product.id }) } });
  const version = await addVersion(id, '1.0', body, options);
  if (!options.unpublished) await admin.document.update({ where: { id }, data: { currentVersion: '1.0' } });
  return { ...row, version };
}
const docsPath = (p = product) => `products/${p.id}/documents`;
const accessPath = (doc = main, version = doc.version, intent = 'view', p = product) => `${docsPath(p)}/${doc.id}/versions/${version.id}/${intent}`;
async function api(path, options = {}) {
  const who = options.actor === undefined ? staff : options.actor, method = options.method ?? 'GET';
  const headers = { Origin: 'http://localhost:8080', ...(who ? { Cookie: who.cookie } : {}) };
  if (method === 'POST') Object.assign(headers, { 'Content-Type': 'application/json', 'X-Auth-Request': '1', 'X-CSRF-Token': who?.csrf ?? '' });
  Object.assign(headers, options.headers);
  const response = await fetch((options.gateway ? 'http://gateway' : base) + '/api/v1/' + path, { method, headers,
    ...(method === 'POST' ? { body: JSON.stringify(options.body ?? {}) } : {}), signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, options.status ?? 200, 'Unexpected status on synthetic product document request');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  if ((options.status ?? 200) >= 400) {
    assert.deepEqual(Object.keys(body).sort(), ['code', 'message', 'requestId', 'statusCode', 'timestamp']);
    assert.doesNotMatch(JSON.stringify(body), /X-Amz-|storageBucket|storageObjectKey|PRIVATE_SDK_SENTINEL/);
  }
  return { body, response };
}
async function objectRequest(url, headers = {}) {
  const u = new URL(url);
  // Connect inside Docker while retaining the signed Host header for gateway URLs.
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: 'minio', port: 9000, path: u.pathname + u.search,
      headers: { Host: u.host, Origin: 'http://localhost:8080', ...headers } }, response => {
      const chunks = []; response.on('data', c => chunks.push(c));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, bytes: Buffer.concat(chunks) }));
    });
    req.on('error', () => reject(new Error('Synthetic PDF transport failed'))); req.setTimeout(10000, () => req.destroy()); req.end();
  });
}
before(async () => {
  staff = await actor('STAFF'); customer = await actor('CUSTOMER'); otherCustomer = await actor('CUSTOMER');
  for (let i = 0; i < 4; i++) {
    const id = randomUUID(); ids.products.push(id);
    const row = await admin.insuranceProduct.create({ data: { id, productCode: `P02-${runId}-${i}`, name: `Synthetic P02 Product ${i}`, isActive: i !== 2 } });
    if (i === 0) product = row; if (i === 1) secondProduct = row; if (i === 2) inactiveProduct = row; if (i === 3) emptyProduct = row;
  }
  const policyId = randomUUID(); ids.policies.push(policyId);
  policy = await admin.insurancePolicy.create({ data: { id: policyId, customerId: customer.id, productId: product.id, policyNumber: `P02-${runId}`, status: 'ACTIVE' } });
  await admin.staffAssignment.create({ data: { staffId: staff.id, customerId: customer.id, operatorId: runId } });
  const firstPdf = await pdf('version one'), secondPdf = await pdf('version two');
  assert.ok(firstPdf.subarray(0, 5).equals(Buffer.from('%PDF-'))); assert.ok(firstPdf.includes(Buffer.from('/Type /Catalog')));
  main = await document('A Synthetic main terms', firstPdf);
  main.next = await addVersion(main.id, '2.0', secondPdf);
  await admin.insurancePolicy.update({ where: { id: policy.id }, data: { benefitsSnapshot: { documents: { terms: { kind: 'TERMS', documentId: main.id, version: '1.0' } } } } });
  validIds.push(main.id);
  for (let i = 0; i < 23; i++) validIds.push((await document(`B Synthetic terms ${Math.floor(i / 3)}`, firstPdf)).id);
  validIds.push((await document('😀'.repeat(255), firstPdf)).id);
  missing = await document('C Synthetic missing object', firstPdf, { missing: true }); validIds.push(missing.id);
  zero = await document('D Synthetic zero bytes', Buffer.alloc(0)); validIds.push(zero.id);
  nonPdf = await document('E Synthetic non PDF', Buffer.from('Synthetic non-PDF fixture'), { mime: 'text/plain' }); validIds.push(nonPdf.id);
  privatePolicy = await document('PRIVATE_POLICY_SENTINEL', firstPdf, { scope: 'PRIVATE_POLICY' });
  foreign = await document('FOREIGN_PRODUCT_SENTINEL', firstPdf, { productId: secondProduct.id });
  unpublished = await document('UNPUBLISHED_SENTINEL', firstPdf, { unpublished: true });
  inactive = await document('INACTIVE_VERSION_SENTINEL', firstPdf, { active: false });
  app = await NestFactory.create(TestModule, { logger: false }); configureHttp(app, { origins: ['http://localhost:8080'], docsEnabled: true });
  await app.listen(0, '127.0.0.1'); base = await app.getUrl();
});
after(async () => {
  try {
    await app?.close();
    for (const key of keys) {
      assert.ok(key.startsWith(prefix) && prefix === `p02-tests/${runId}/`);
      await cleanup.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    }
    assert.equal((await cleanup.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }))).KeyCount, 0);
  } finally {
    try {
      await admin.$transaction(async tx => {
        await tx.auditLog.deleteMany({ where: { actorId: { in: ids.users } } });
        await tx.document.updateMany({ where: { id: { in: ids.documents } }, data: { currentVersion: null } });
        await tx.documentVersion.deleteMany({ where: { documentId: { in: ids.documents } } });
        await tx.document.deleteMany({ where: { id: { in: ids.documents } } });
        await tx.insurancePolicy.deleteMany({ where: { id: { in: ids.policies } } });
        await tx.insuranceProduct.deleteMany({ where: { id: { in: ids.products } } });
        await tx.authSession.deleteMany({ where: { userId: { in: ids.users } } });
        await tx.rateLimitBucket.deleteMany({ where: { clientToken: { in: ids.users.map(id => tokenHash(id.toLowerCase())) }, endpointGroup: { in: ['PRODUCT_READ', 'PRODUCT_DOCUMENT_ACCESS'] } } });
        await tx.staffAssignment.deleteMany({ where: { customerId: { in: ids.users } } });
        await tx.customerProfile.deleteMany({ where: { userId: { in: ids.users } } });
        await tx.staffProfile.deleteMany({ where: { userId: { in: ids.users } } });
        await tx.user.deleteMany({ where: { id: { in: ids.users } } });
      });
      assert.equal(await admin.insuranceProduct.count({ where: { id: { in: ids.products } } }), 0);
      assert.equal(await admin.user.count({ where: { id: { in: ids.users } } }), 0);
    } finally { await admin.$disconnect(); await core.$disconnect(); writer.destroy(); reader.destroy(); cleanup.destroy(); }
  }
});

test('catalog is PUBLIC/current-only for both roles, no private metadata, counts or URLs', async () => {
  for (const who of [staff, customer, otherCustomer]) {
    const { body } = await api(docsPath() + '?limit=50', { actor: who });
    assert.deepEqual(Object.keys(body).sort(), ['items', 'pageInfo']); assert.equal(body.items.length, validIds.length);
    assert.deepEqual(new Set(body.items.map(x => x.documentId)), new Set(validIds));
    for (const row of body.items) assert.deepEqual(Object.keys(row).sort(), ['accessScope', 'documentId', 'title', 'versionCreatedAt', 'versionId', 'versionNumber']);
    assert.equal(body.items.find(x => x.documentId === main.id).versionId, main.version.id);
    assert.doesNotMatch(JSON.stringify(body), /PRIVATE_|FOREIGN_PRODUCT|UNPUBLISHED|INACTIVE_VERSION|storageBucket|storageObjectKey|checksumSha256|https?:/);
    assert.deepEqual(body.pageInfo, { hasMore: false, nextCursor: null });
  }
  assert.deepEqual((await api(docsPath(emptyProduct))).body.items, []);
  await api(docsPath(inactiveProduct), { status: 404 });
});
test('keyset covers multiple pages with tied titles and supports an actor/product/role/limit binding', async () => {
  let cursor, found = [];
  do {
    const { body } = await api(docsPath() + '?limit=7' + (cursor ? `&cursor=${cursor}` : ''));
    found.push(...body.items.map(x => x.documentId)); cursor = body.pageInfo.nextCursor;
    assert.equal(body.pageInfo.hasMore, cursor !== null);
  } while (cursor);
  assert.equal(found.length, validIds.length); assert.equal(new Set(found).size, validIds.length);
  const first = (await api(docsPath() + '?limit=7')).body.pageInfo.nextCursor;
  for (const [path, who] of [[docsPath() + '?limit=8', staff], [docsPath(secondProduct) + '?limit=7', staff], [docsPath() + '?limit=7', customer]]) {
    assert.equal((await api(path + `&cursor=${first}`, { actor: who, status: 400 })).body.code, 'INVALID_CURSOR');
  }
  const value = JSON.parse(Buffer.from(first, 'base64url'));
  value.id = privatePolicy.id; value.title = 'PRIVATE_POLICY_SENTINEL';
  const forged = Buffer.from(JSON.stringify(value)).toString('base64url');
  const result = (await api(docsPath() + '?limit=7&cursor=' + forged)).body;
  assert.ok(result.items.every(x => validIds.includes(x.documentId)));
  value.scope = 'bad'; await api(docsPath() + '?limit=7&cursor=' + Buffer.from(JSON.stringify(value)).toString('base64url'), { status: 400 });
});
test('both roles receive inline/attachment links to the exact same PDF; Range and CORS work', async () => {
  for (const who of [staff, otherCustomer]) for (const intent of ['view', 'download']) {
    const grant = (await api(accessPath(main, main.version, intent), { actor: who, method: 'POST' })).body;
    assert.deepEqual(Object.keys(grant).sort(), ['expiresAt', 'url']);
    assert.equal(new URL(grant.url).searchParams.get('X-Amz-Expires'), '60'); assert.ok(Date.parse(grant.expiresAt) > Date.now());
    const file = await objectRequest(grant.url);
    assert.equal(file.status, 200); assert.equal(sha(file.bytes), sha(main.version.bytes));
    assert.equal(file.headers['content-type'], 'application/pdf'); assert.equal(file.headers['access-control-allow-origin'], 'http://localhost:8080');
    assert.ok(file.headers['content-disposition'].startsWith(intent === 'view' ? 'inline;' : 'attachment;'));
    assert.ok(file.headers['content-disposition'].includes(main.id)); assert.equal(file.headers['cache-control'], 'private, no-store');
    const range = await objectRequest(grant.url, { Range: 'bytes=0-31' }); assert.equal(range.status, 206); assert.equal(range.bytes.length, 32);
  }
});
test('private, foreign, unknown and inactive versions fail before storage is called', async () => {
  const calls = storageCalls;
  for (const doc of [privatePolicy, foreign, unpublished, inactive]) await api(accessPath(doc), { method: 'POST', status: 404 });
  await api(accessPath(main, main.next), { method: 'POST', status: 404 });
  await api(accessPath(main, foreign.version), { method: 'POST', status: 404 });
  await api(accessPath(main, { id: randomUUID() }), { method: 'POST', status: 404 });
  assert.equal(storageCalls, calls);
});
test('publishing v2 changes the product catalog but preserves the policy-applied v1', async () => {
  await admin.document.update({ where: { id: main.id }, data: { currentVersion: '2.0' } });
  try {
    assert.equal((await api(docsPath() + '?limit=50')).body.items.find(x => x.documentId === main.id).versionId, main.next.id);
    await api(accessPath(), { method: 'POST', status: 404 });
    const grant = (await api(accessPath(main, main.next), { method: 'POST' })).body;
    assert.equal(sha((await objectRequest(grant.url)).bytes), sha(main.next.bytes));
    const applied = (await api(`staff/policies/${policy.id}/documents`)).body.items.find(x => x.documentId === main.id);
    assert.equal(applied.versionId, main.version.id);
    const oldGrant = (await api(`staff/documents/${main.id}/versions/${main.version.id}/view`, { method: 'POST', body: { policyId: policy.id } })).body;
    assert.equal(sha((await objectRequest(oldGrant.url)).bytes), sha(main.version.bytes));
  } finally { await admin.document.update({ where: { id: main.id }, data: { currentVersion: '1.0' } }); }
});
test('missing objects, empty files and non-PDF objects return safe404 without fallback', async () => {
  for (const doc of [missing, zero, nonPdf]) await api(accessPath(doc), { method: 'POST', status: 404 });
});
test('storage timeout returns safe503 and leaves policy/product summaries readable', async () => {
  const stalled = http.createServer(() => {}); await new Promise(resolve => stalled.listen(0, '127.0.0.1', resolve));
  process.env.STORAGE_INTERNAL_ENDPOINT = `http://127.0.0.1:${stalled.address().port}`;
  try {
    await api(accessPath(), { method: 'POST', status: 503 });
    await api(`products/${product.id}`); await api(`staff/policies/${policy.id}`);
  } finally { process.env.STORAGE_INTERNAL_ENDPOINT = 'http://minio:9000'; stalled.closeAllConnections(); await new Promise(resolve => stalled.close(resolve)); }
});
test('publication/product/session changes after signing discard the grant', async () => {
  for (const change of ['version', 'active', 'product', 'session', 'object']) {
    const who = await actor('CUSTOMER');
    signHook = async (...args) => {
      const result = await actualStorage.access(...args);
      if (change === 'version') await admin.document.update({ where: { id: main.id }, data: { currentVersion: '2.0' } });
      if (change === 'active') await admin.documentVersion.update({ where: { id: main.version.id }, data: { isActive: false } });
      if (change === 'product') await admin.insuranceProduct.update({ where: { id: product.id }, data: { isActive: false } });
      if (change === 'session') await admin.authSession.update({ where: { id: who.sessionId }, data: { revokedAt: new Date() } });
      if (change === 'object') await admin.documentVersion.update({ where: { id: main.version.id }, data: { storageObjectKey: main.next.key } });
      return result;
    };
    try { await api(accessPath(), { actor: who, method: 'POST', status: change === 'session' ? 401 : 404 }); }
    finally {
      signHook = null; await admin.document.update({ where: { id: main.id }, data: { currentVersion: '1.0' } });
      await admin.documentVersion.update({ where: { id: main.version.id }, data: { isActive: true, storageObjectKey: main.version.key } });
      await admin.insuranceProduct.update({ where: { id: product.id }, data: { isActive: true } });
    }
    assert.equal(await admin.auditLog.count({ where: { actorId: who.id, outcome: 'SUCCESS' } }), 0);
  }
});
test('POST enforces empty body, UUID/query validation, session, Origin, JSON marker and CSRF', async () => {
  for (const query of ['limit=0', 'limit=51', 'limit=1.5', 'limit=1&limit=2', 'search=x', 'cursor=bad', 'cursor=', 'cursor=' + 'x'.repeat(2732)]) {
    await api(docsPath() + '?' + query, { status: 400 });
  }
  await api('products/not-a-uuid/documents', { status: 400 });
  await api(docsPath(), { actor: null, status: 401 }); await api(accessPath(), { actor: null, method: 'POST', status: 401 });
  for (const headers of [{ Origin: 'https://untrusted.invalid' }, { 'X-CSRF-Token': 'bad' }, { 'X-Auth-Request': '' }, { 'Content-Type': 'text/plain' }]) {
    await api(accessPath(), { method: 'POST', headers, status: headers['Content-Type'] ? 400 : 403 });
  }
  for (const body of [{ policyId: policy.id }, { url: 'https://untrusted.invalid' }, { bucket }, [], 'invalid']) await api(accessPath(), { method: 'POST', body, status: 400 });
  await api(accessPath() + '?any=value', { method: 'POST', status: 400 });
});
test('access quota is shared by view/download, independent from reads, and actor-scoped', async () => {
  const who = await actor('CUSTOMER'), key = { clientToken: tokenHash(who.id.toLowerCase()), endpointGroup: 'PRODUCT_DOCUMENT_ACCESS' };
  await admin.rateLimitBucket.create({ data: { ...key, requestCount: 29, windowStart: new Date() } });
  await api(accessPath(), { actor: who, method: 'POST' });
  const blocked = await api(accessPath(main, main.version, 'download'), { actor: who, method: 'POST', status: 429 });
  assert.equal(blocked.body.code, 'RATE_LIMITED'); assert.ok(Number(blocked.response.headers.get('retry-after')) >= 1);
  await api(docsPath(), { actor: who }); await api(accessPath(), { actor: otherCustomer, method: 'POST' });
  await admin.rateLimitBucket.update({ where: { clientToken_endpointGroup: key }, data: { windowStart: new Date(Date.now() - 61000) } });
  await api(accessPath(), { actor: who, method: 'POST' });
});
test('audit is minimal and an audit commit failure never returns a signed URL', async () => {
  failAudit = true;
  try { await api(accessPath(), { method: 'POST', status: 500 }); } finally { failAudit = false; }
  const audits = await admin.auditLog.findMany({ where: { actorId: { in: ids.users }, action: { startsWith: 'PRODUCT_PDF_' } } });
  assert.ok(audits.some(x => x.outcome === 'SUCCESS')); assert.ok(audits.some(x => x.outcome === 'FAILURE'));
  for (const row of audits) {
    assert.deepEqual(Object.keys(row.metadata).sort(), ['documentId', 'intent', 'productId', 'versionId']);
    assert.doesNotMatch(JSON.stringify(row), /X-Amz-|storageObjectKey|storageBucket|PRIVATE_SDK_SENTINEL|Fully synthetic|secret-key/);
  }
});
test('storage denies anonymous, tampered and expired links; issued URLs retain their documented TTL', async () => {
  assert.equal((await objectRequest(`http://minio:9000/${bucket}/${main.version.key}`)).status, 403);
  const grant = (await api(accessPath(), { method: 'POST' })).body;
  const tampered = new URL(grant.url); tampered.searchParams.set('X-Amz-Signature', '0'.repeat(64));
  assert.equal((await objectRequest(tampered.toString())).status, 403);
  const expired = await getSignedUrl(reader, new GetObjectCommand({ Bucket: bucket, Key: main.version.key }), { expiresIn: 60, signingDate: new Date(Date.now() - 120000) });
  assert.equal((await objectRequest(expired)).status, 403);
  const who = await actor('CUSTOMER'), issued = (await api(accessPath(), { actor: who, method: 'POST' })).body;
  await admin.authSession.update({ where: { id: who.sessionId }, data: { revokedAt: new Date() } });
  assert.equal((await objectRequest(issued.url)).status, 200);
  await api(accessPath(), { actor: who, method: 'POST', status: 401 });
});
test('Swagger exposes catalog and two empty-body POST intents with no raw storage properties', async () => {
  const spec = await (await fetch(base + '/api/v1/docs-json')).json(), root = '/api/v1/products/{productId}/documents';
  assert.ok(spec.paths[root].get); for (const intent of ['view', 'download']) {
    const operation = spec.paths[root + '/{documentId}/versions/{versionId}/' + intent].post;
    assert.deepEqual(operation.security, [{ session: [] }]); assert.equal(operation.requestBody.content['application/json'].schema.additionalProperties, false);
  }
  assert.deepEqual(Object.keys(spec.components.schemas.ProductDocumentsResponseDto.properties).sort(), ['items', 'pageInfo']);
});
test('gateway grants real product PDF access to both roles and preserves policy applied versions', { skip: process.env.P02_GATEWAY !== '1' }, async () => {
  for (const who of [staff, otherCustomer]) {
    assert.equal((await api(docsPath() + '?limit=50', { actor: who, gateway: true })).body.items.length, validIds.length);
    for (const intent of ['view', 'download']) {
      const result = (await api(accessPath(main, main.version, intent), { actor: who, method: 'POST', gateway: true })).body;
      assert.equal(sha((await objectRequest(result.url)).bytes), sha(main.version.bytes));
    }
    await api(accessPath(privatePolicy), { actor: who, method: 'POST', gateway: true, status: 404 });
  }
  await api(`staff/policies/${policy.id}/documents`, { gateway: true });
  await api(docsPath(), { actor: null, gateway: true, status: 401 });
});
