'use strict';
// LI-HMAC-SHA256-v1 shared vectors (contracts/fixtures/hmac-v1.json, contracts/agent-v1.md 12.9) checked with
// node:crypto only. This shows the profile is implementable on the Core side; the Core signer/verifier itself
// (apps/core/src/agent/hmac.ts) is part of Task 6 Core and waits for Task 3.
// Run: node --test apps/core/test/agent-hmac-vector.test.cjs
const assert = require('node:assert/strict');
const { createHash, createHmac, timingSafeEqual } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');

const vectors = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'contracts', 'fixtures', 'hmac-v1.json'), 'utf8'));
const SKEW_SECONDS = 120;

function stringToSign(method, target, timestamp, nonce, digest, keyId) {
  return [vectors.profile, method.toUpperCase(), target, timestamp, nonce, digest, keyId].join('\n');
}

function verify({ method, target, body, headers, now }) {
  const keyId = headers['X-LI-Key-Id'];
  const encoded = vectors.keys[keyId];
  if (!encoded) return false;
  if (Math.abs(now - Number(headers['X-LI-Timestamp'])) > SKEW_SECONDS) return false;
  const digest = createHash('sha256').update(body).digest('hex');
  if (digest !== headers['X-LI-Content-SHA256']) return false;
  const expected = createHmac('sha256', Buffer.from(encoded, 'base64url'))
    .update(stringToSign(method, target, headers['X-LI-Timestamp'], headers['X-LI-Nonce'], digest, keyId), 'utf8')
    .digest('base64url');
  const a = Buffer.from(expected);
  const b = Buffer.from(headers['X-LI-Signature']);
  return a.length === b.length && timingSafeEqual(a, b);
}

function request(change = {}) {
  const valid = vectors.valid;
  return {
    method: change.method ?? valid.method,
    target: change.target ?? valid.target,
    body: Buffer.from(change.body_utf8 ?? valid.body_utf8, 'utf8'),
    headers: { ...valid.headers, ...(change.headers ?? {}) },
    now: change.now ?? vectors.now,
  };
}

test('valid vector verifies and the string to sign matches', () => {
  const valid = vectors.valid;
  const digest = createHash('sha256').update(Buffer.from(valid.body_utf8, 'utf8')).digest('hex');
  assert.equal(digest, valid.headers['X-LI-Content-SHA256']);
  assert.equal(stringToSign(valid.method, valid.target, valid.headers['X-LI-Timestamp'], valid.headers['X-LI-Nonce'],
    digest, valid.headers['X-LI-Key-Id']), valid.string_to_sign);
  assert.equal(verify(request()), true);
});

for (const item of vectors.invalid) {
  test(`invalid vector is refused: ${item.name}`, () => {
    assert.equal(verify(request(item.change)), false);
  });
}
