import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const bucket = process.env.STORAGE_BUCKET || 'life-insurance-documents';
if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error('Invalid local storage bucket.');
const endpoint = 'http://minio:9000';
const checkOrigin = (process.env.STORAGE_CHECK_ORIGIN || 'http://localhost:8080').split(',')[0].trim();
const directory = mkdtempSync(`${tmpdir()}/storage-init-`);
let phase = 'configuration';
const credential = (role, name) => readFileSync(`/credentials/${role}/${name}`, 'utf8');
const config = {};
for (const role of ['root', 'reader', 'writer']) config[role] = {
  url: endpoint, accessKey: credential(role, 'access-key'), secretKey: credential(role, 'secret-key'), api: 'S3v4', path: 'on',
};
writeFileSync(`${directory}/config.json`, JSON.stringify({ version: '10', aliases: config }), { mode: 0o600 });
function mc(args, { input, denied = false } = {}) {
  phase = args.slice(0, Math.min(2, args.length)).join(' ');
  const result = spawnSync('mc', ['--config-dir', directory, '--json', ...args], {
    encoding: 'utf8', input, env: { ...process.env, MC_NO_COLOR: '1' }, maxBuffer: 4 * 1024 * 1024,
  });
  if (denied) {
    assert.notEqual(result.status, 0, `Expected denied: ${args[0]}`);
    assert.match(result.stdout + result.stderr, /AccessDenied|Access Denied|access denied|Insufficient permissions/i);
  } else if (result.error || result.status !== 0) {
    // mc errors/arguments can contain credentials or signed URLs. Do not log them.
    throw new Error(`Storage command failed: ${args[0]}. Check service health/configuration; credential values hidden.`);
  }
  return result.stdout;
}
function policy(name, statements) {
  const path = `${directory}/${name}.json`;
  writeFileSync(path, JSON.stringify({ Version: '2012-10-17', Statement: statements }), { mode: 0o600 });
  mc(['admin', 'policy', 'create', 'root', name, path]);
}
async function check() {
  phase = 'console login';
  const login = await fetch('http://minio:9001/api/v1/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessKey: credential('root', 'access-key'), secretKey: credential('root', 'secret-key') }),
  });
  assert.ok(login.ok, 'Console login must succeed.');
  console.log('PASS console login with local admin credential; values hidden.');
  const key = `_checks/${randomUUID()}.txt`;
  const body = 'Synthetic local storage permission check.\n';
  try {
    mc(['pipe', `writer/${bucket}/${key}`], { input: body });
    assert.equal(mc(['cat', `reader/${bucket}/${key}`]), body);
    mc(['pipe', `reader/${bucket}/${key}`], { input: 'denied', denied: true });
    mc(['rm', `reader/${bucket}/${key}`], { denied: true });
    mc(['rm', `writer/${bucket}/${key}`], { denied: true });
    mc(['ls', 'reader'], { denied: true });
    mc(['admin', 'user', 'list', 'writer'], { denied: true });
    const anonymous = await fetch(`${endpoint}/${bucket}/${key}`);
    assert.equal(anonymous.status, 403);
    const listing = await fetch(`${endpoint}/${bucket}?list-type=2`);
    assert.equal(listing.status, 403);
    const share = JSON.parse(mc(['share', 'download', '--expire', '1m', `reader/${bucket}/${key}`]).trim());
    const url = share.share;
    assert.equal(typeof url, 'string');
    const signed = await fetch(url, { headers: { Range: 'bytes=0-8', Origin: checkOrigin } });
    assert.equal(signed.status, 206);
    assert.equal(await signed.text(), body.slice(0, 9));
    assert.equal(signed.headers.get('access-control-allow-origin'), checkOrigin);
    assert.match(signed.headers.get('content-range'), /^bytes 0-8\//);
    assert.match(signed.headers.get('access-control-expose-headers'), /Content-Range/i);
    const preflight = await fetch(`${endpoint}/${bucket}/${key}`, { method: 'OPTIONS', headers: {
      Origin: checkOrigin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'range',
    } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), checkOrigin);
    const tampered = new URL(url);
    tampered.searchParams.set('X-Amz-Signature', '0'.repeat(64));
    assert.equal((await fetch(tampered)).status, 403);
    console.log('PASS writer upload; reader read/signed Range/CORS; private anonymous access; denied reader writes/deletes and writer deletes/admin; tampered signature rejected.');
  } finally {
    const previousPhase = phase;
    mc(['rm', `root/${bucket}/${key}`]);
    phase = previousPhase;
  }
}
try {
  const action = process.argv[2];
  if (action === 'persistence-write' || action === 'persistence-read') {
    const key = process.argv[3];
    if (!/^_checks\/[a-f0-9-]+\.txt$/.test(key ?? '')) throw new Error('Invalid check key.');
    const body = 'Synthetic storage persistence check.\n';
    if (action === 'persistence-write') mc(['pipe', `writer/${bucket}/${key}`], { input: body });
    else {
      assert.equal(mc(['cat', `reader/${bucket}/${key}`]), body);
      mc(['rm', `root/${bucket}/${key}`]);
      console.log('PASS object and reader credential survive storage restart.');
    }
  } else if (action === 'check') {
    await check();
  } else if (process.argv[2] === 'credentials') {
    // Captured by the host helper directly into an ignored file, never inherited logs.
    process.stdout.write(JSON.stringify({ username: credential('root', 'access-key'), password: credential('root', 'secret-key') }));
  } else {
    mc(['mb', '--ignore-existing', `root/${bucket}`]);
    mc(['anonymous', 'set', 'none', `root/${bucket}`]);
    policy('documents-reader', [{ Effect: 'Allow', Action: ['s3:GetObject'], Resource: [`arn:aws:s3:::${bucket}/*`] }]);
    policy('documents-writer', [
      { Effect: 'Allow', Action: ['s3:GetObject', 's3:PutObject', 's3:AbortMultipartUpload', 's3:ListMultipartUploadParts'], Resource: [`arn:aws:s3:::${bucket}/*`] },
      { Effect: 'Allow', Action: ['s3:GetBucketLocation', 's3:ListBucket', 's3:ListBucketMultipartUploads'], Resource: [`arn:aws:s3:::${bucket}`] },
    ]);
    for (const role of ['reader', 'writer']) {
      mc(['admin', 'user', 'add', 'root', credential(role, 'access-key'), credential(role, 'secret-key')]);
      mc(['admin', 'policy', 'attach', 'root', `documents-${role}`, '--user', credential(role, 'access-key')]);
    }
    console.log('Private storage bucket and separate reader/writer identities ready; existing objects preserved.');
  }
} catch (error) {
  const location = error.stack?.match(/\/storage\/init\.mjs:\d+:\d+/)?.[0] ?? '';
  console.error(`Storage initialization/check failed during ${phase} ${location}; credential values and signed URLs hidden.`);
  process.exitCode = 1;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
