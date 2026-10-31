require('reflect-metadata');
const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const { randomUUID } = require('node:crypto');
const { Body, Controller, Get, Module, Post, UnauthorizedException } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { IsEmail, IsInt, Min } = require('class-validator');
const { configureHttp } = require('../dist/http/http-foundation');
const { loadConfig } = require('../dist/config');
const { AppController } = require('../dist/app.controller');
const { DatabaseService } = require('../dist/database/database.service');
const { AppModule } = require('../dist/app.module');

// Fixture routes exist only in the test module, never in the shipped app.
class ExampleDto {}
IsEmail()(ExampleDto.prototype, 'email');
IsInt()(ExampleDto.prototype, 'count');
Min(1)(ExampleDto.prototype, 'count');
class FixtureController {
  validate(input) { return { count: input.count }; }
  crash() { throw new Error('SYNTHETIC_SECRET_SQL_PASSWORD'); }
  denied() { throw new UnauthorizedException('SYNTHETIC_SECRET_SQL_PASSWORD'); }
}
Controller('fixture')(FixtureController);
Post('validate')(FixtureController.prototype, 'validate', Object.getOwnPropertyDescriptor(FixtureController.prototype, 'validate'));
Body()(FixtureController.prototype, 'validate', 0);
Reflect.defineMetadata('design:paramtypes', [ExampleDto], FixtureController.prototype, 'validate');
for (const action of ['crash', 'denied']) Get(action)(FixtureController.prototype, action, Object.getOwnPropertyDescriptor(FixtureController.prototype, action));
class FixtureModule {}
Module({ controllers: [FixtureController, AppController], providers: [{ provide: DatabaseService, useValue: { isReady: async () => false } }] })(FixtureModule);

const logs = [];
const logger = { log: value => logs.push(String(value)), error: value => logs.push(String(value)), warn: () => {} };
let app, production, base, productionBase;
before(async () => {
  app = await NestFactory.create(FixtureModule, { logger });
  configureHttp(app, { origins: ['http://localhost:3000'], docsEnabled: true });
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  production = await NestFactory.create(FixtureModule, { logger });
  configureHttp(production, { origins: [], docsEnabled: false });
  await production.listen(0, '127.0.0.1');
  productionBase = await production.getUrl();
});
after(async () => { await app?.close(); await production?.close(); });

test('Public module graph starts with auth/customer routes and excludes operator routes', async () => {
  const previous = process.env.DATABASE_PASSWORD_FILE;
  process.env.DATABASE_PASSWORD_FILE = '';
  let actual;
  try {
    actual = await NestFactory.create(AppModule, { logger });
    configureHttp(actual, { origins: [], docsEnabled: true });
    await actual.listen(0, '127.0.0.1');
    const url = await actual.getUrl();
    assert.equal((await fetch(url + '/api/v1/health/live')).status, 200);
    assert.equal((await fetch(url + '/api/v1/health/ready')).status, 503);
    const spec = await (await fetch(url + '/api/v1/docs-json')).json();
    for (const route of ['/api/v1/auth/login', '/api/v1/auth/staff/login', '/api/v1/customers/me', '/api/v1/staff/customers', '/api/v1/staff/me']) {
      assert.ok(spec.paths[route], route);
    }
    assert.ok(spec.paths['/api/v1/staff/me'].patch);
    for (const route of ['/api/v1/staff/customers/{customerId}/policies', '/api/v1/staff/policies/{policyId}', '/api/v1/staff/policies/{policyId}/documents']) {
      assert.ok(spec.paths[route]?.get, route);
      assert.ok(spec.paths[route].get.responses['200'].content['application/json'].schema.$ref, 'Documented response DTO');
    }
    for (const route of ['/api/v1/auth/me', '/api/v1/customers/me', '/api/v1/staff/customers']) {
      assert.equal((await fetch(url + route)).status, 503, route);
    }
    for (const route of ['/ops/v1/accounts', '/api/v1/ops/v1/accounts']) {
      assert.equal((await fetch(url + route)).status, 404, route);
    }
    assert.ok(Object.keys(spec.paths).every(route => !route.includes('/ops/')));
  } finally {
    await actual?.close();
    if (previous === undefined) delete process.env.DATABASE_PASSWORD_FILE;
    else process.env.DATABASE_PASSWORD_FILE = previous;
  }
});

test('DTO rejects unknown fields and wrong types without reflecting submitted values', async () => {
  const send = body => fetch(`${base}/api/v1/fixture/validate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await send({ email: 'fake@synthetic.invalid', count: 2 })).status, 201);
  for (const input of [
    { email: 'SYNTHETIC_SECRET_SQL_PASSWORD', count: 2 },
    { email: 'fake@synthetic.invalid', count: '2' },
    { email: 'fake@synthetic.invalid', count: 2, password: 'SYNTHETIC_SECRET_SQL_PASSWORD' },
    {}, [],
  ]) {
    const response = await send(input);
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.code, 'VALIDATION_ERROR');
    assert.equal(body.requestId, response.headers.get('x-request-id'));
    assert.ok(Number.isFinite(Date.parse(body.timestamp)));
    assert.doesNotMatch(JSON.stringify(body), /SYNTHETIC_SECRET|fake@|stack|target/);
  }
});

test('request IDs, JSON parser failures, 404/401/500 and safe log fields', async () => {
  const requestId = randomUUID();
  const good = await fetch(`${base}/api/v1/health/live`, { headers: { 'x-request-id': requestId } });
  assert.equal(good.headers.get('x-request-id'), requestId);
  const replaced = await fetch(`${base}/api/v1/health/live`, { headers: { 'x-request-id': 'SYNTHETIC_SECRET_SQL_PASSWORD' } });
  assert.match(replaced.headers.get('x-request-id'), /^[a-f0-9-]{36}$/);
  for (const [route, status] of [['fixture/crash', 500], ['fixture/denied', 401], ['missing?token=SYNTHETIC_SECRET_SQL_PASSWORD', 404], ['health/ready', 503]]) {
    const response = await fetch(`${base}/api/v1/${route}`, { headers: { authorization: 'Bearer SYNTHETIC_SECRET_SQL_PASSWORD', cookie: 'session=SYNTHETIC_SECRET_SQL_PASSWORD' } });
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.statusCode, status);
    assert.equal(body.requestId, response.headers.get('x-request-id'));
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.doesNotMatch(JSON.stringify(body), /SYNTHETIC_SECRET|Bearer|stack|SELECT|token=/);
  }
  const malformed = await fetch(`${base}/api/v1/fixture/validate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"password":"SYNTHETIC_SECRET_SQL_PASSWORD"' });
  assert.equal(malformed.status, 400);
  assert.ok(malformed.headers.get('x-request-id'));
  assert.doesNotMatch(await malformed.text(), /SYNTHETIC_SECRET/);
  assert.doesNotMatch(logs.join('\n'), /SYNTHETIC_SECRET|Bearer|token=/);
  const entry = logs.map(line => { try { return JSON.parse(line); } catch { return null; } }).find(row => row?.event === 'http.request');
  assert.deepEqual(Object.keys(entry).sort(), ['durationMs', 'event', 'method', 'requestId', 'statusCode']);
});

test('Swagger assets/JSON available in dev and absent when disabled; CORS exposes request ID', async () => {
  const ui = await fetch(`${base}/api/v1/docs`);
  assert.equal(ui.status, 200);
  assert.match(await ui.text(), /swagger-ui/);
  assert.equal((await fetch(`${base}/api/v1/docs/swagger-ui-bundle.js`)).status, 200);
  const spec = await (await fetch(`${base}/api/v1/docs-json`)).json();
  assert.ok(spec.paths['/api/v1/health/live']);
  for (const path of ['docs', 'docs-json', 'docs/swagger-ui-bundle.js']) assert.equal((await fetch(`${productionBase}/api/v1/${path}`)).status, 404);
  const response = await fetch(`${base}/api/v1/health/live`, { headers: { origin: 'http://localhost:3000' } });
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:3000');
  assert.match(response.headers.get('access-control-expose-headers'), /X-Request-ID/i);
  const preflight = await fetch(`${base}/api/v1/health/live`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:3000', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'x-request-id' } });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers'), /X-Request-ID/i);
  assert.equal((await fetch(`${base}/api/v1/health/live`, { headers: { origin: 'https://untrusted.invalid' } })).headers.get('access-control-allow-origin'), null);
});

test('environment rejects invalid docs flags, production docs and invalid ports', () => {
  const keys = ['NODE_ENV', 'ENABLE_API_DOCS', 'PORT', 'CORS_ORIGINS'];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    process.env.CORS_ORIGINS = 'http://localhost:3000';
    process.env.PORT = '4000';
    process.env.NODE_ENV = 'production';
    delete process.env.ENABLE_API_DOCS;
    assert.equal(loadConfig().docsEnabled, false);
    process.env.ENABLE_API_DOCS = 'true';
    assert.throws(loadConfig, /disabled in production/);
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_API_DOCS = 'yes';
    assert.throws(loadConfig, /true or false/);
    process.env.ENABLE_API_DOCS = 'true';
    process.env.PORT = '70000';
    assert.throws(loadConfig, /PORT/);
  } finally { for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } }
});
