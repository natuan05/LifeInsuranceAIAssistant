import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { stateDirectory, privateDirectory, preserveOperator, ensureRootEnv } from './local-state.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const compose = ['compose', '--project-name', 'life-insurance-local', '--file', join(root, 'compose.yaml')];
const directory = join(stateDirectory, 'operator');
const nodeImage = 'node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d';

function run(command, args, inherit = false, env = process.env, input) {
  const result = spawnSync(command, args, { cwd: root, env, encoding: 'utf8', windowsHide: true,
    input, stdio: inherit ? (input === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit']) : 'pipe' });
  // Captured output can contain credentials; never include it in errors.
  if (result.error || result.status !== 0) throw new Error(`${command} failed. Check the local service/configuration.`);
  return result.stdout?.trim() ?? '';
}
const docker = (args, inherit = false) => run('docker', args, inherit);
function credential(role) {
  return docker(['run', '--rm', '--network', 'none', '--mount',
    `type=volume,source=life-insurance-local-credential-${role},target=/credential,readonly`, nodeImage, 'node', '-e',
    "process.stdout.write(require('node:fs').readFileSync('/credential/password','utf8'))"]);
}
function setup() {
  ensureRootEnv(root);
  const endpoint = process.env.DOCKER_HOST || docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']);
  if (!endpoint.startsWith('npipe://') && !endpoint.startsWith('unix://')) throw new Error('A local Docker context is required.');
  docker(['info', '--format', '{{.ServerVersion}}']);
  docker([...compose, 'up', '-d', '--build', '--wait', '--wait-timeout', '180', 'database-ui'], true);
}

function bootstrapAccounts(test = false) {
  if (process.env.NODE_ENV === 'production') throw new Error('Dev bootstrap is disabled in production.');
  if (!process.env.npm_execpath) throw new Error('Run this command through npm.');
  run(process.execPath, [process.env.npm_execpath, 'run', 'build', '--workspace', '@life-insurance/core'], true);
  const binding = docker([...compose, 'port', 'postgres', '5432']);
  if (!/^127\.0\.0\.1:\d+$/.test(binding)) throw new Error('PostgreSQL must publish a loopback port.');
  const password = docker(['run', '--rm', '--network', 'none', '--mount',
    'type=volume,source=life-insurance-local-credential-admin,target=/credential,readonly',
    nodeImage, 'node', '-e', "process.stdout.write(require('node:fs').readFileSync('/credential/password','utf8'))"]);
  // Secret travels on stdin only; not command-line arguments, shell history or a host admin file.
  const corePassword = ['customers', 'auth', 'policies'].includes(test) ? credential('core') : undefined;
  run(process.execPath, [join(root, 'apps/core', test === 'policy-seed' ? 'test/policy-seed.test.cjs' : test === 'policies' ? 'test/policies.test.cjs' : test === 'customers' ? 'test/customers.test.cjs' : test === 'auth' ? 'test/auth.test.cjs' : 'test/provisioning.test.cjs')], true,
    process.env, JSON.stringify({ port: Number(binding.split(':')[1]), password, corePassword, directory }));
}

function adminTool(action) {
  if (process.env.NODE_ENV === 'production' || !process.env.npm_execpath) throw new Error('Admin tool requires a local npm session.');
  if (action === 'test-admin') run(process.execPath, [process.env.npm_execpath, 'run', 'build', '--workspace', '@life-insurance/core'], true);
  run(process.execPath, [process.env.npm_execpath, 'run', 'build:admin', '--workspace', '@life-insurance/core'], true);
  privateDirectory(directory);
  preserveOperator(join(root, '.local', 'dev'), directory);
  if (action !== 'test-admin') run(process.execPath, [join(root, 'apps/core/dist-admin/admin/setup.js')], true);
  if (action !== 'test-admin') {
    console.log(`Operator login file: ${join(directory, 'operator-initial.txt')}`);
    console.log(`Operator authentication file: ${join(directory, 'operator.json')}; keep private. Existing operator preserved.`);
  }
  if (action === 'admin-setup') return;
  const binding = docker([...compose, 'port', 'postgres', '5432']);
  if (!/^127\.0\.0\.1:\d+$/.test(binding)) throw new Error('Expected local database.');
  const password = docker(['run', '--rm', '--network', 'none', '--mount',
    'type=volume,source=life-insurance-local-credential-admin,target=/credential,readonly', nodeImage, 'node', '-e',
    "process.stdout.write(require('node:fs').readFileSync('/credential/password','utf8'))"]);
  run(process.execPath, [join(root, action === 'test-admin' ? 'apps/core/test/admin.test.cjs' : 'apps/core/dist-admin/admin/main.js')], true,
    process.env, JSON.stringify({ port: Number(binding.split(':')[1]), password, directory,
      ...(action === 'test-admin' ? { corePassword: credential('core') } : {}) }));
}

try {
  const action = process.argv[2];
  if (!['bootstrap', 'test-accounts', 'test-auth', 'test-customers', 'test-policies', 'test-policy-seed', 'admin', 'admin-setup', 'test-admin'].includes(action)) throw new Error('Unknown local command.');
  if (process.env.NODE_ENV === 'production') throw new Error('Local operations are disabled in production.');
  setup();
  if (action === 'bootstrap') {
    docker([...compose, 'run', '--rm', '--no-deps', 'seed-dev'], true);
    try { console.log(`Application gateway: http://${docker([...compose, 'port', 'gateway', '80'])}/staff/customers`); }
    catch { console.log('Application gateway is not running; start it with docker compose up -d --build --wait.'); }
    console.log(`Private tool directory (outside repository): ${stateDirectory}`);
    for (const file of [join(directory, 'operator-initial.txt'), join(directory, 'operator.json'), join(stateDirectory, 'storage', 'console.json')]) {
      console.log(`Private tool file [${existsSync(file) ? 'exists, preserved' : 'not created'}]: ${file}`);
    }
    console.log('Account setup: npm run admin:setup; account management: npm run admin. MinIO credential export if needed: npm run storage:credentials.');
    console.log('Policy PDFs and runtime credentials remain in Docker volumes. Policy seed creates no host PDF or credential files.');
  }
  if (action === 'test-accounts') bootstrapAccounts(true);
  if (action === 'test-auth') bootstrapAccounts('auth');
  if (action === 'test-customers') bootstrapAccounts('customers');
  if (action === 'test-policies') bootstrapAccounts('policies');
  if (action === 'test-policy-seed') bootstrapAccounts('policy-seed');
  if (['admin', 'admin-setup', 'test-admin'].includes(action)) adminTool(action);
} catch (error) {
  console.error(`Local tools: ${error.message}`);
  process.exitCode = 1;
}
