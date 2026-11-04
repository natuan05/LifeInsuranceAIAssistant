import 'reflect-metadata';
import { existsSync, readFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { bootstrapInTransaction, newDevManifest, sharedDevPassword } from './dev-accounts';
import { seedPoliciesInTransaction } from './dev-policies';
import { localFixtureStorage } from './dev-policy-storage';

async function main() {
  if (process.argv[2] !== '--compose-local' || process.env.NODE_ENV !== 'development'
    || process.env.LOCAL_DEV_SEED !== 'true' || process.env.PGHOST !== 'postgres' || !existsSync('/.dockerenv')) throw new Error();
  const host = 'postgres';
  const port = 5432;
  const password = readFileSync('/credentials/admin/password', 'utf8').trim();
  if (password.length < 16 || password.length > 128 || /[\r\n\0]/.test(password)) throw new Error();
  const client = new PrismaClient({ adapter: new PrismaPg({ host, port,
    user: 'admin_runtime', database: 'life_insurance', password, max: 2, connectionTimeoutMillis: 3000 }) });
  try {
    const result = await client.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(6213, 1100)`;
      const accounts = await bootstrapInTransaction(tx, client, newDevManifest());
      return { accounts };
    }, { timeout: 60000, maxWait: 60000 });
    console.log('Local dev seed: ' + result.accounts.filter(row => row.created).length + ' created, ' + result.accounts.filter(row => !row.created).length + ' preserved.');
    console.log('Public LOCAL fixture password: ' + sharedDevPassword + '. Account list: docs/getting-started.md (section 7) in Git.');
    const different = result.accounts.filter(row => !row.initialPasswordValid).map(row => row.accountCode);
    if (different.length) console.log('Existing passwords preserved for: ' + different.join(', ') + '. Shared initial password does not match; see upgrade note in docs/getting-started.md (section 7).');
    const storage = localFixtureStorage();
    try {
      const policies = await client.$transaction(tx => seedPoliciesInTransaction(tx, storage), { timeout: 120000, maxWait: 120000 });
      console.log(`Synthetic policy seed: ${policies.productsCreated} products, ${policies.policiesCreated} policies, ${policies.documentsCreated} documents, ${policies.versionsCreated} versions created; ${policies.policiesPreserved} policies preserved; ${policies.objectsCreated} PDFs uploaded/restored.`);
      console.log('PDFs stay private in the MinIO Docker volume; no host PDF or credential file was created. Open the gateway Staff Customers page; access URLs and account commands are in docs/getting-started.md.');
    } finally { storage.close(); }
  } finally { await client.$disconnect(); }
}
void main().catch(() => { console.error('Local dev seed failed. Check schema, local-only configuration, reserved identities, PDF fonts and MinIO access; existing data is not reset.'); process.exitCode = 1; });
