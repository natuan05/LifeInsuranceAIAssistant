import assert from 'node:assert/strict';

const webOrigin = process.env.CHECK_WEB_ORIGIN ?? 'http://localhost:3000';
const coreUrl = process.env.CHECK_CORE_URL ?? 'http://localhost:4000/api/v1';

async function request(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
}

async function main() {
  const page = await request(`${webOrigin}/connection`);
  assert.equal(page.status, 200, 'Next.js must respond with HTTP 200');
  assert.match(await page.text(), /Kiểm tra kết nối backend/, 'The connection check page must be available');
  console.log('PASS Next.js page');

  const preflight = await request(`${coreUrl}/health/live`, {
    method: 'OPTIONS',
    headers: {
      Origin: webOrigin,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'x-connection-check',
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), webOrigin);
  assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
  assert.match(preflight.headers.get('access-control-allow-methods') ?? '', /\bGET\b/);
  assert.match(preflight.headers.get('access-control-allow-headers') ?? '', /x-connection-check/i);
  console.log('PASS allowed-origin preflight with credentials and custom header');

  const health = await request(`${coreUrl}/health/live`, {
    headers: { Origin: webOrigin, 'X-Connection-Check': 'web' },
  });
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('access-control-allow-origin'), webOrigin);
  assert.equal(health.headers.get('access-control-allow-credentials'), 'true');
  assert.equal(health.headers.get('cache-control'), 'no-store');
  const body = await health.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.service, 'core');
  assert.ok(Number.isFinite(Date.parse(body.timestamp)));
  console.log('PASS NestJS health response and CORS headers');

  for (const origin of ['http://localhost:3001', 'https://untrusted.invalid', `${webOrigin}.untrusted.invalid`]) {
    for (const method of ['OPTIONS', 'GET']) {
      const response = await request(`${coreUrl}/health/live`, {
        method,
        headers: {
          Origin: origin,
          ...(method === 'OPTIONS' ? {
            'Access-Control-Request-Method': 'GET',
            'Access-Control-Request-Headers': 'x-connection-check',
          } : {}),
        },
      });
      assert.equal(response.headers.get('access-control-allow-origin'), null, `${origin} must not receive CORS permission`);
    }
  }
  console.log('PASS untrusted origins receive no CORS permission (GET and OPTIONS)');
  console.log('HTTP checks passed. Also click the connection button in a browser to verify browser CORS enforcement.');
}

main().catch((error) => {
  console.error(`FAIL ${error.message}`);
  console.error('Start both apps with npm run dev first. Check origins and ports if customized.');
  process.exitCode = 1;
});
