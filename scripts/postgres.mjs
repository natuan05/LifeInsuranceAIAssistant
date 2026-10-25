import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const compose = ['compose', '--project-name', 'life-insurance-local', '--file', fileURLToPath(new URL('../compose.yaml', import.meta.url))];
function docker(args, inherit = false) {
  const result = spawnSync('docker', args, { cwd: root, encoding: 'utf8', stdio: inherit ? 'inherit' : 'pipe', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error('Docker command failed. Check Docker Desktop and service logs.');
  return result.stdout?.trim() ?? '';
}
function localDocker() {
  const endpoint = process.env.DOCKER_HOST || docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']);
  if (!endpoint.startsWith('npipe://') && !endpoint.startsWith('unix://')) throw new Error('Use a local Docker context for this development stack.');
  docker(['info', '--format', '{{.ServerVersion}}']);
}
async function openUi() {
  const binding = docker([...compose, 'port', 'database-ui', '3000']);
  if (!/^127\.0\.0\.1:\d+$/.test(binding)) throw new Error('Database UI must use a loopback port.');
  const url = `http://${binding}`;
  console.log(`Database tables: ${url}`);
  const [command, args] = process.platform === 'win32'
    ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  await once(child, 'spawn'); child.unref();
}
async function check() {
  const binding = docker([...compose, 'port', 'gateway', '80']);
  assert.match(binding, /^127\.0\.0\.1:\d+$/);
  for (const route of ['/gateway-health', '/api/v1/health/live', '/api/v1/health/ready', '/']) {
    const response = await fetch(`http://${binding}${route}`, { signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 200, route); console.log(`PASS gateway ${route}`);
  }
  const swagger = docker([...compose, 'port', 'gateway', '81']);
  assert.match(swagger, /^127\.0\.0\.1:\d+$/);
  for (const route of ['/', '/api/v1/docs-json', '/api/v1/docs/swagger-ui-bundle.js']) {
    const response = await fetch(`http://${swagger}${route}`, { signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 200, route); console.log(`PASS Swagger ${route}`);
  }
  const sql = "SELECT count(*) FROM information_schema.tables WHERE table_schema IN ('business','rag') AND table_type='BASE TABLE' AND table_name <> '_prisma_migrations';";
  const command = 'export PGPASSWORD="$(cat /credentials/bootstrap/password)"; exec psql -X -h 127.0.0.1 -U local_owner -d life_insurance -v ON_ERROR_STOP=1 -At -c "$1"';
  assert.equal(docker([...compose, 'exec', '-T', 'postgres', 'sh', '-c', command, 'check', sql]), '17');
  const ui = docker([...compose, 'port', 'database-ui', '3000']);
  assert.equal((await fetch(`http://${ui}`, { signal: AbortSignal.timeout(10000) })).status, 200);
  console.log('PASS 17 application tables and database UI.');
}
try {
  const action = process.argv[2];
  if (!['setup', 'up', 'ui', 'check', 'down', 'status'].includes(action)) throw new Error('Expected setup|up|ui|check|down|status');
  localDocker();
  if (action === 'setup') docker([...compose, 'run', '--rm', 'prepare'], true);
  if (action === 'up' || action === 'ui') docker([...compose, 'up', '--detach', '--build', '--wait', '--wait-timeout', '180', '--remove-orphans'], true);
  if (action === 'ui') await openUi();
  if (action === 'check') await check();
  if (action === 'down') docker([...compose, 'down'], true);
  if (action === 'status') docker([...compose, 'ps'], true);
} catch (error) { console.error(`Local stack: ${error.message}`); process.exitCode = 1; }
