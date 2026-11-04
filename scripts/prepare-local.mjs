import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';

const roles = ['bootstrap', 'migration', 'core', 'admin', 'viewer'];
// Preflight every supplied value before writing any credential. Never rotate implicitly.
for (const role of roles) {
  const supplied = process.env[`DB_${role.toUpperCase()}_PASSWORD`] || '';
  const path = `/credentials/${role}/password`;
  if (supplied && (supplied.length < 16 || supplied.length > 128 || supplied.trim() !== supplied || /[\r\n\0]/.test(supplied))) throw new Error(`Invalid DB_${role.toUpperCase()}_PASSWORD; values hidden.`);
  if (supplied && existsSync(path) && readFileSync(path, 'utf8').trim() !== supplied) throw new Error(`DB_${role.toUpperCase()}_PASSWORD conflicts with existing credential volume. Restore its matching value; values hidden.`);
  if (!existsSync(path) && existsSync('/existing-db/PG_VERSION')) throw new Error('Existing PostgreSQL data requires its original credential volumes. Restore the missing credential before starting.');
}
// Runs only in prepare; each consumer receives only its own credential volume.
for (const role of roles) {
  const directory = `/credentials/${role}`;
  const path = `${directory}/password`;
  mkdirSync(directory, { recursive: true });
  if (!existsSync(path)) {
    if (existsSync('/existing-db/PG_VERSION')) {
      throw new Error('Existing PostgreSQL data requires its original credential volumes. Restore the missing credential before starting.');
    }
    const password = process.env[`DB_${role.toUpperCase()}_PASSWORD`] || randomBytes(32).toString('hex');
    if (!password || /[\r\n]/.test(password)) throw new Error('Invalid local credential file.');
    writeFileSync(path, password, { flag: 'wx', mode: 0o444 });
  }
  if (!readFileSync(path, 'utf8').trim()) throw new Error('Empty local credential file.');
  chmodSync(path, 0o444);
}
console.log('Local credentials ready; values hidden and existing credentials preserved.');
