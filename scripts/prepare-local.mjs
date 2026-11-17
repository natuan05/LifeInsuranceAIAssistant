import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';

const roles = ['bootstrap', 'migration', 'core', 'admin', 'viewer', 'rag_indexer', 'rag_retriever', 'agent_migrator', 'agent_runtime'];
// Added after the first local release: their DB roles do not exist yet in older databases, so bootstrap can create
// them with a newly generated credential instead of requiring an original volume.
const addedLater = new Set(['rag_indexer', 'rag_retriever', 'agent_migrator', 'agent_runtime']);
// Preflight every supplied value before writing any credential. Never rotate implicitly.
for (const role of roles) {
  const supplied = process.env[`DB_${role.toUpperCase()}_PASSWORD`] || '';
  const path = `/credentials/${role}/password`;
  if (supplied && (supplied.length < 16 || supplied.length > 128 || supplied.trim() !== supplied || /[\r\n\0]/.test(supplied))) throw new Error(`Invalid DB_${role.toUpperCase()}_PASSWORD; values hidden.`);
  if (supplied && existsSync(path) && readFileSync(path, 'utf8').trim() !== supplied) throw new Error(`DB_${role.toUpperCase()}_PASSWORD conflicts with existing credential volume. Restore its matching value; values hidden.`);
  if (!existsSync(path) && existsSync('/existing-db/PG_VERSION') && !addedLater.has(role)) throw new Error('Existing PostgreSQL data requires its original credential volumes. Restore the missing credential before starting.');
}
// Runs only in prepare; each consumer receives only its own credential volume.
for (const role of roles) {
  const directory = `/credentials/${role}`;
  const path = `${directory}/password`;
  mkdirSync(directory, { recursive: true });
  if (!existsSync(path)) {
    if (existsSync('/existing-db/PG_VERSION') && !addedLater.has(role)) {
      throw new Error('Existing PostgreSQL data requires its original credential volumes. Restore the missing credential before starting.');
    }
    const password = process.env[`DB_${role.toUpperCase()}_PASSWORD`] || randomBytes(32).toString('hex');
    if (!password || /[\r\n]/.test(password)) throw new Error('Invalid local credential file.');
    writeFileSync(path, password, { flag: 'wx', mode: 0o444 });
  }
  if (!readFileSync(path, 'utf8').trim()) throw new Error('Empty local credential file.');
  chmodSync(path, 0o444);
}

const hmacDir = '/credentials/agent_hmac';
mkdirSync(hmacDir, { recursive: true });
for (const [prefix, filePrefix, defaultId] of [
  ['LIFE_AGENT_CORE_TO_AGENT', 'core_to_agent', 'local-core-to-agent'],
  ['LIFE_AGENT_AGENT_TO_CORE', 'agent_to_core', 'local-agent-to-core'],
]) {
  const idPath = `${hmacDir}/${filePrefix}_key_id`;
  const keysPath = `${hmacDir}/${filePrefix}_keys`;
  const suppliedId = (process.env[`${prefix}_KEY_ID`] || '').trim();
  const suppliedKeys = (process.env[`${prefix}_KEYS`] || '').trim();
  if (Boolean(suppliedId) !== Boolean(suppliedKeys)) {
    throw new Error(`Both ${prefix}_KEY_ID and ${prefix}_KEYS must be supplied together or both left blank.`);
  }
  if (suppliedId && existsSync(idPath) && readFileSync(idPath, 'utf8').trim() !== suppliedId) {
    throw new Error(`${prefix}_KEY_ID conflicts with existing credential volume.`);
  }
  if (suppliedKeys && existsSync(keysPath) && readFileSync(keysPath, 'utf8').trim() !== suppliedKeys) {
    throw new Error(`${prefix}_KEYS conflicts with existing credential volume.`);
  }
  if (!existsSync(idPath) || !existsSync(keysPath)) {
    const keyId = suppliedId || defaultId;
    const keys = suppliedKeys || `${keyId}:${randomBytes(32).toString('base64url')}`;
    if (!existsSync(idPath)) writeFileSync(idPath, keyId, { flag: 'wx', mode: 0o444 });
    if (!existsSync(keysPath)) writeFileSync(keysPath, keys, { flag: 'wx', mode: 0o444 });
  }
  chmodSync(idPath, 0o444);
  chmodSync(keysPath, 0o444);
}

console.log('Local credentials ready; values hidden and existing credentials preserved.');
