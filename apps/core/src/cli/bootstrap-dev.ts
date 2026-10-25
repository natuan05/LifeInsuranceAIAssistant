import 'reflect-metadata';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { bootstrapInTransaction, newDevManifest, sharedDevPassword, upgradeLegacyDevPasswords, type DevManifest } from './dev-accounts';

async function main() {
  let port: number;
  let password: string;
  let host: string;
  let legacy: DevManifest | undefined;
  if (process.argv[2] === '--compose-local') {
    if (process.env.NODE_ENV !== 'development' || process.env.LOCAL_DEV_SEED !== 'true'
      || process.env.PGHOST !== 'postgres' || !existsSync('/.dockerenv')) throw new Error();
    host = 'postgres';
    port = 5432;
    password = readFileSync('/credentials/admin/password', 'utf8').trim();
  } else {
    const input = JSON.parse(readFileSync(0, 'utf8')) as { port: number; password: string; directory: string };
    if (process.env.NODE_ENV === 'production' || resolve(input.directory) !== resolve(process.cwd(), '.local/dev')) throw new Error();
    host = '127.0.0.1';
    port = input.port;
    password = input.password;
    const legacyPath = resolve(input.directory, 'dev-accounts.json');
    if (existsSync(legacyPath)) legacy = JSON.parse(readFileSync(legacyPath, 'utf8')) as DevManifest;
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !/^[a-f0-9]{64}$/.test(password)) throw new Error();
  const client = new PrismaClient({ adapter: new PrismaPg({ host, port,
    user: 'admin_runtime', database: 'life_insurance', password, max: 2, connectionTimeoutMillis: 3000 }) });
  try {
    const result = await client.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(6213, 1100)`;
      if (legacy) await upgradeLegacyDevPasswords(tx, legacy);
      return bootstrapInTransaction(tx, client, newDevManifest());
    }, { timeout: 60000, maxWait: 60000 });
    console.log('Local dev seed: ' + result.filter(row => row.created).length + ' created, ' + result.filter(row => !row.created).length + ' preserved.');
    console.log('Public LOCAL fixture password: ' + sharedDevPassword + '. Account list: docs/getting-started.md (section 7) in Git.');
    const different = result.filter(row => !row.initialPasswordValid).map(row => row.accountCode);
    if (different.length) console.log('Existing passwords preserved for: ' + different.join(', ') + '. Shared initial password does not match; see upgrade note in docs/getting-started.md (section 7).');
  } finally { await client.$disconnect(); }
}
void main().catch(() => { console.error('Local dev seed failed. Check schema, local-only configuration and reserved identities; existing accounts are not reset.'); process.exitCode = 1; });
