import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const compose = ['compose', '--project-name', 'life-insurance-local', '--file', join(root, 'compose.yaml')];
const directory = join(root, '.local', 'dev');
const passwordFile = join(directory, 'core-password');
const configFile = join(directory, 'core.env');
const nodeImage = 'node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d';

function run(command, args, inherit = false, env = process.env, input) {
  const result = spawnSync(command, args, { cwd: root, env, encoding: 'utf8', windowsHide: true,
    input, stdio: inherit ? (input === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit']) : 'pipe' });
  // Captured output can contain credentials; never include it in errors.
  if (result.error || result.status !== 0) throw new Error(`${command} failed. Check the local service/configuration.`);
  return result.stdout?.trim() ?? '';
}
const docker = (args, inherit = false) => run('docker', args, inherit);
function regular(path) {
  if (existsSync(path) && (lstatSync(path).isSymbolicLink() || !lstatSync(path).isFile())) {
    throw new Error('Managed credential/config path must be a regular file.');
  }
}
function privateDirectory() {
  for (const path of [join(root, '.local'), directory]) {
    if (existsSync(path) && (lstatSync(path).isSymbolicLink() || !lstatSync(path).isDirectory())) {
      throw new Error('Local data directory must not be a link.');
    }
    mkdirSync(path, { recursive: true, mode: 0o700 });
  }
  if (process.platform === 'win32') {
    const sid = run('whoami', ['/user', '/fo', 'csv', '/nh']).match(/S-1-\d+(?:-\d+)+/)?.[0];
    if (!sid) throw new Error('Could not determine local user permissions.');
    run('icacls', [directory, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F']);
  } else chmodSync(directory, 0o700);
}
function writePrivate(path, value) {
  regular(path);
  if (existsSync(path) && readFileSync(path, 'utf8') === value) return;
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, value, { flag: 'wx', mode: 0o600 });
  renameSync(temporary, path);
}
function setup() {
  const endpoint = process.env.DOCKER_HOST || docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']);
  if (!endpoint.startsWith('npipe://') && !endpoint.startsWith('unix://')) throw new Error('A local Docker context is required.');
  docker(['info', '--format', '{{.ServerVersion}}']);
  privateDirectory();
  docker([...compose, 'up', '-d', '--build', '--wait', '--wait-timeout', '180', 'database-ui'], true);
  const binding = docker([...compose, 'port', 'postgres', '5432']);
  if (!/^127\.0\.0\.1:\d+$/.test(binding)) throw new Error('PostgreSQL must publish a loopback port.');
  // Only the Core credential is mounted. No bootstrap/migration credential leaves Docker.
  const password = docker(['run', '--rm', '--network', 'none', '--mount',
    'type=volume,source=life-insurance-local-credential-core,target=/credential,readonly',
    nodeImage, 'node', '-e', "process.stdout.write(require('node:fs').readFileSync('/credential/password','utf8'))"]);
  if (!/^[0-9a-f]{64}$/.test(password)) throw new Error('Invalid Core runtime credential.');
  writePrivate(passwordFile, `${password}\n`);
  const config = `PGHOST=127.0.0.1\nPGPORT=${binding.split(':')[1]}\nPGDATABASE=life_insurance\nPGUSER=core_runtime\nDATABASE_PASSWORD_FILE=${JSON.stringify(passwordFile.replaceAll('\\', '/'))}\n`;
  writePrivate(configFile, config);
  console.log('Dev DB/UI ready. Core runtime credential prepared in ignored .local/dev; values hidden.');
}
function launch() {
  const managed = parseEnv(readFileSync(configFile, 'utf8'));
  const coreEnvPath = join(root, 'apps', 'core', '.env');
  const existing = existsSync(coreEnvPath) ? parseEnv(readFileSync(coreEnvPath, 'utf8')) : {};
  // Preserve user configuration; refuse a conflicting DB target instead of overwriting it.
  for (const key of Object.keys(managed)) {
    const override = process.env[key] ?? existing[key];
    if (override !== undefined && override !== managed[key]) throw new Error(`Conflicting ${key}. Use npm run dev with your own DB config, or remove the override for dev:db.`);
  }
  const env = { ...managed, ...existing, ...process.env };
  const port = env.PORT ?? '4000';
  if (!/^\d+$/.test(port) || +port < 1 || +port > 65535) throw new Error('Invalid Core PORT.');
  // Use the local Core directly; gateway still serves the separate container build.
  env.NEXT_PUBLIC_CORE_API_URL ??= `http://localhost:${port}/api/v1`;
  // npm_execpath is supplied by npm; avoids shell interpolation and Windows .cmd spawning.
  if (!process.env.npm_execpath) throw new Error('Run this command through npm.');
  run(process.execPath, [process.env.npm_execpath, 'run', 'db:generate', '--workspace', '@life-insurance/core'], true, env);
  run(process.execPath, [process.env.npm_execpath, 'run', 'dev'], true, env);
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
  run(process.execPath, [join(root, 'apps/core', test === 'customers' ? 'test/customers.test.cjs' : test === 'auth' ? 'test/auth.test.cjs' : test ? 'test/provisioning.test.cjs' : 'dist/cli/bootstrap-dev.js')], true,
    process.env, JSON.stringify({ port: Number(binding.split(':')[1]), password, directory }));
}

function adminTool(action) {
  if (process.env.NODE_ENV === 'production' || !process.env.npm_execpath) throw new Error('Admin tool requires a local npm session.');
  if (action === 'test-admin') run(process.execPath, [process.env.npm_execpath, 'run', 'build', '--workspace', '@life-insurance/core'], true);
  run(process.execPath, [process.env.npm_execpath, 'run', 'build:admin', '--workspace', '@life-insurance/core'], true);
  if (action !== 'test-admin') run(process.execPath, [join(root, 'apps/core/dist-admin/admin/setup.js')], true);
  if (action === 'admin-setup') return;
  const binding = docker([...compose, 'port', 'postgres', '5432']);
  if (!/^127\.0\.0\.1:\d+$/.test(binding)) throw new Error('Expected local database.');
  const password = docker(['run', '--rm', '--network', 'none', '--mount',
    'type=volume,source=life-insurance-local-credential-admin,target=/credential,readonly', nodeImage, 'node', '-e',
    "process.stdout.write(require('node:fs').readFileSync('/credential/password','utf8'))"]);
  run(process.execPath, [join(root, action === 'test-admin' ? 'apps/core/test/admin.test.cjs' : 'apps/core/dist-admin/admin/main.js')], true,
    process.env, JSON.stringify({ port: Number(binding.split(':')[1]), password, directory }));
}

try {
  const action = process.argv[2];
  if (!['setup', 'start', 'bootstrap', 'test-accounts', 'test-auth', 'test-customers', 'admin', 'admin-setup', 'test-admin'].includes(action)) throw new Error('Unknown local command.');
  if (['bootstrap', 'test-accounts', 'test-auth', 'test-customers', 'admin', 'admin-setup', 'test-admin'].includes(action) && process.env.NODE_ENV === 'production') throw new Error('Local operations are disabled in production.');
  setup();
  if (action === 'start') launch();
  if (action === 'bootstrap' || action === 'test-accounts') bootstrapAccounts(action === 'test-accounts');
  if (action === 'test-auth') bootstrapAccounts('auth');
  if (action === 'test-customers') bootstrapAccounts('customers');
  if (['admin', 'admin-setup', 'test-admin'].includes(action)) adminTool(action);
} catch (error) {
  console.error(`Host dev: ${error.message}`);
  process.exitCode = 1;
}
