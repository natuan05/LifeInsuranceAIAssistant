import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const binding = process.env.CHECK_WEB_ORIGIN ? undefined : spawnSync('docker', ['compose', 'port', 'gateway', '80'], { cwd: root, encoding: 'utf8', windowsHide: true });
if (binding && (binding.status !== 0 || !/^127\.0\.0\.1:\d+$/.test(binding.stdout.trim()))) throw new Error('Start the local Docker gateway before checking its connection.');
const webOrigin = process.env.CHECK_WEB_ORIGIN ?? `http://${binding.stdout.trim()}`;
const coreUrl = process.env.CHECK_CORE_URL ?? `${webOrigin}/api/v1`;

async function request(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
}

async function main() {
  const page = await request(`${webOrigin}/connection`);
  assert.equal(page.status, 200, 'Next.js must respond with HTTP 200');
  const html = await page.text();
  assert.match(html, /<html\b/, 'Next.js must return the application shell');
  // The authenticated client shell may render before route content on the server.
  const script = html.match(/<script[^>]+src="([^"]+)"/);
  assert.ok(script, 'The application shell must include its client runtime');
  assert.equal((await request(new URL(script[1], webOrigin))).status, 200);
  console.log('PASS Next.js page and client runtime through gateway');

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
  console.log('Gateway/HTTP checks passed.');
}

main().catch((error) => {
  console.error(`FAIL ${error.message}`);
  console.error('Start the Docker stack with docker compose up -d --build --wait. Check gateway ports if customized.');
  process.exitCode = 1;
});
