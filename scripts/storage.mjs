import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateDirectory, stateDirectory, ensureRootEnv } from './local-state.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const compose = ['compose', '--project-name', 'life-insurance-local', '--file', fileURLToPath(new URL('../compose.yaml', import.meta.url))];
function docker(args, inherit = false) {
  const result = spawnSync('docker', args, { cwd: root, encoding: 'utf8', stdio: inherit ? 'inherit' : 'pipe', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error('Docker storage command failed. Check Docker Desktop and storage service logs.');
  return result.stdout?.trim() ?? '';
}
try {
  const action = process.argv[2];
  if (!['up', 'check', 'credentials'].includes(action)) throw new Error('Expected up|check|credentials.');
  const endpoint = process.env.DOCKER_HOST || docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']);
  if (!endpoint.startsWith('npipe://') && !endpoint.startsWith('unix://')) throw new Error('Use a local Docker context.');
  ensureRootEnv(root);
  if (action === 'up') {
    docker([...compose, 'up', '-d', '--build', 'storage-init'], true);
    docker([...compose, 'wait', 'storage-init'], true);
  } else if (action === 'credentials') {
    const credentials = JSON.parse(docker([...compose, 'run', '--rm', '--no-deps', '-T', 'storage-init', 'credentials']));
    const directory = join(stateDirectory, 'storage');
    privateDirectory(directory);
    writeFileSync(`${directory}/console.json`, JSON.stringify(credentials, null, 2) + '\n', { mode: 0o600 });
    console.log(`Console credentials saved to ${join(directory, 'console.json')}; values hidden.`);
  } else {
    for (const [service, port, route] of [['minio', '9000', '/minio/health/ready'], ['minio', '9001', '/']]) {
      const binding = docker([...compose, 'port', service, port]);
      assert.match(binding, /^127\.0\.0\.1:\d+$/);
      assert.equal((await fetch(`http://${binding}${route}`, { signal: AbortSignal.timeout(10000) })).status, 200);
    }
    console.log('PASS loopback API/console and storage readiness.');
    docker([...compose, 'run', '--rm', '--no-deps', '-T', 'storage-init'], true);
    console.log('PASS initialization rerun.');
    docker([...compose, 'run', '--rm', '--no-deps', '-T', 'storage-init', 'check'], true);
    const key = `_checks/${randomUUID()}.txt`;
    docker([...compose, 'run', '--rm', '--no-deps', '-T', 'storage-init', 'persistence-write', key]);
    docker([...compose, 'restart', '--no-deps', 'minio']);
    const binding = docker([...compose, 'port', 'minio', '9000']);
    let ready = false;
    for (let attempt = 0; attempt < 30 && !ready; attempt++) {
      try { ready = (await fetch(`http://${binding}/minio/health/ready`, { signal: AbortSignal.timeout(2000) })).ok; } catch {}
      if (!ready) await new Promise(resolve => setTimeout(resolve, 1000));
    }
    assert.ok(ready, 'Storage did not become ready after restart.');
    docker([...compose, 'run', '--rm', '--no-deps', '-T', 'storage-init', 'persistence-read', key], true);
  }
} catch (error) { console.error(`Local storage: ${error.message}`); process.exitCode = 1; }
