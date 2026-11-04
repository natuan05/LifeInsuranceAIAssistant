import { homedir } from 'node:os';
import { join } from 'node:path';
import { chmodSync, copyFileSync, constants, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const base = process.platform === 'win32' ? (process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'))
  : process.platform === 'darwin' ? join(homedir(), 'Library', 'Application Support')
    : (process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state'));
export const stateDirectory = join(base, 'LifeInsuranceAIAssistant');
export function ensureRootEnv(rootDirectory) {
  const path = join(rootDirectory, '.env');
  if (!existsSync(path)) {
    copyFileSync(join(rootDirectory, '.env.example'), path, constants.COPYFILE_EXCL);
    chmodSync(path, 0o600);
    console.log(`Root environment created: ${path}; edit this private file to configure Docker. Values hidden.`);
  }
}
export function privateDirectory(directory) {
  for (const path of [stateDirectory, directory]) {
    if (existsSync(path) && (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink())) throw new Error('Private directory must not be a link.');
    mkdirSync(path, { recursive: true, mode: 0o700 });
  }
  if (process.platform === 'win32') {
    const user = spawnSync('whoami', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true });
    const sid = user.stdout?.match(/S-1-\d+(?:-\d+)+/)?.[0];
    if (!sid) throw new Error('Could not determine local user permissions.');
    const acl = spawnSync('icacls', [directory, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F'], { encoding: 'utf8', windowsHide: true });
    if (acl.error || acl.status !== 0) throw new Error('Could not protect local credential directory.');
  } else chmodSync(directory, 0o700);
}
export function preserveOperator(legacy, directory) {
  // Copy only known operator files; retain originals and never replace a target.
  if (existsSync(join(directory, 'operator.json'))) return;
  for (const name of ['operator-initial.txt', 'operator.json']) {
    const source = join(legacy, name), target = join(directory, name);
    if (!existsSync(source)) continue;
    if (!lstatSync(source).isFile() || lstatSync(source).isSymbolicLink()) throw new Error('Legacy operator path must be a regular file.');
    const value = readFileSync(source);
    if (existsSync(target)) {
      if (!readFileSync(target).equals(value)) throw new Error('Operator state conflict; existing files preserved.');
    } else writeFileSync(target, value, { flag: 'wx', mode: 0o600 });
  }
}
