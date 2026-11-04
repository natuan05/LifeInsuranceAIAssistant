import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const child = spawn('minio', ['server', '/data', '--address', ':9000', '--console-address', ':9001', '--quiet'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    MINIO_ROOT_USER: readFileSync('/credentials/root/access-key', 'utf8'),
    MINIO_ROOT_PASSWORD: readFileSync('/credentials/root/secret-key', 'utf8'),
  },
});
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.on('error', () => { console.error('Could not start local storage.'); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
