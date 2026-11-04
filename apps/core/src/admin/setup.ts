import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../accounts/utils/password';
import { operatorDirectory } from './operator-directory';

async function main() {
  const directory = operatorDirectory();
  const file = resolve(directory, 'operator.json');
  if (process.env.NODE_ENV === 'production') throw new Error();
  if (existsSync(file)) { console.log('Existing operator preserved.'); return; }
  const password = randomBytes(24).toString('base64url');
  const credential = { username: 'local-operator', passwordHash: await hashPassword(password) };
  // Parent directory permissions are set by scripts/local-tools.mjs before invoking this CLI.
  writeFileSync(resolve(directory, 'operator-initial.txt'), `Username: local-operator\nPassword: ${password}\n`, { flag: 'wx', mode: 0o600 });
  writeFileSync(file, JSON.stringify(credential), { flag: 'wx', mode: 0o600 });
  // Validate the write without printing credential values.
  JSON.parse(readFileSync(file, 'utf8'));
  console.log(`Operator created. Read ${resolve(directory, 'operator-initial.txt')} locally; credential values are not logged.`);
}
void main().catch(() => { console.error('Operator setup failed; no credential values logged.'); process.exitCode = 1; });
