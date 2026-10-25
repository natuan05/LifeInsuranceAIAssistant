import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';

// Runs only in the one-shot prepare container; each consumer receives its own volume.
for (const role of ['bootstrap', 'migration', 'core', 'admin', 'viewer']) {
  const directory = `/credentials/${role}`;
  const path = `${directory}/password`;
  mkdirSync(directory, { recursive: true });
  if (!existsSync(path)) {
    const legacy = '/legacy/postgres/bootstrap-password';
    if (role === 'bootstrap' && existsSync('/existing-db/PG_VERSION') && !existsSync(legacy)) {
      throw new Error('Existing PostgreSQL data needs its original bootstrap credential. Restore .local/postgres/bootstrap-password.');
    }
    const password = role === 'bootstrap' && existsSync(legacy)
      ? readFileSync(legacy, 'utf8').trim()
      : randomBytes(32).toString('hex');
    if (!password || /[\r\n]/.test(password)) throw new Error('Invalid local credential file.');
    writeFileSync(path, password, { flag: 'wx', mode: 0o444 });
  }
  if (!readFileSync(path, 'utf8').trim()) throw new Error('Empty local credential file.');
  chmodSync(path, 0o444);
}
console.log('Local credentials ready; values hidden and existing credentials preserved.');
