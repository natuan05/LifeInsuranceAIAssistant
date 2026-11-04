import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, chownSync } from 'node:fs';

// Separate from database prepare: starting storage never requires database jobs.
const hasData = existsSync('/data/.minio.sys');
const settings = {
  root: ['MINIO_ROOT_USER', 'MINIO_ROOT_PASSWORD'],
  reader: ['MINIO_READER_ACCESS_KEY', 'MINIO_READER_SECRET_KEY'],
  writer: ['MINIO_WRITER_ACCESS_KEY', 'MINIO_WRITER_SECRET_KEY'],
};
for (const [role, names] of Object.entries(settings)) {
  const values = names.map(name => process.env[name] || '');
  if (Boolean(values[0]) !== Boolean(values[1])) throw new Error(`Supply both credentials for storage ${role}, or leave both blank; values hidden.`);
  for (const [index, name] of ['access-key', 'secret-key'].entries()) {
    const value = values[index], path = `/credentials/${role}/${name}`;
    if (value && (index === 0 ? !/^[A-Za-z0-9_-]{3,20}$/.test(value) : value.length < 8 || value.length > 128 || /[\r\n\0]/.test(value))) throw new Error(`Invalid storage ${role} credential; values hidden.`);
    if (value && existsSync(path) && readFileSync(path, 'utf8') !== value) throw new Error(`Storage ${role} credential conflicts with existing volume. Restore matching env values; values hidden.`);
    if (!existsSync(path) && hasData) throw new Error('Existing storage requires its original credential volumes; restore them before starting.');
  }
}
for (const role of ['root', 'reader', 'writer']) {
  const directory = `/credentials/${role}`;
  mkdirSync(directory, { recursive: true });
  for (const name of ['access-key', 'secret-key']) {
    const path = `${directory}/${name}`;
    if (!existsSync(path)) {
      if (hasData) throw new Error('Existing storage requires its original credential volumes; restore them before starting.');
      const setting = settings[role][name === 'access-key' ? 0 : 1];
      writeFileSync(path, process.env[setting] || randomBytes(name === 'access-key' ? 10 : 32).toString('hex'), { flag: 'wx', mode: 0o400 });
    }
    if (!readFileSync(path, 'utf8') || /[\r\n\0]/.test(readFileSync(path, 'utf8'))) throw new Error('Invalid storage credential file.');
    chownSync(path, 1000, 1000);
    chmodSync(path, 0o400);
  }
  chownSync(directory, 1000, 1000);
  chmodSync(directory, 0o700);
}
chownSync('/data', 1000, 1000);
console.log('Storage credentials ready; values hidden and existing credentials preserved.');
