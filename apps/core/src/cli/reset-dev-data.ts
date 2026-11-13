import 'reflect-metadata';
import { readFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { DeleteObjectCommand, ListObjectVersionsCommand, S3Client } from '@aws-sdk/client-s3';
import { localFixtureStorage } from './dev-policy-storage';
import { assertSeedObject, resetDevDataInTransaction, resetOperator, seedObjectPrefixes, type CleanupObject } from './dev-data-reset';
import { replaceRetiredPolicyFixtures } from './dev-policy-reseed';

async function main() {
  const flags = process.argv.slice(2).join(' ');
  const policyOnly = flags === '--compose-local --replace-policy-fixtures';
  if ((!policyOnly && flags !== '--compose-local --erase-all-app-data')
    || process.env.NODE_ENV !== 'development' || process.env.LOCAL_DEV_SEED !== 'true'
    || process.env.PGHOST !== 'postgres' || !existsSync('/.dockerenv')) throw new Error('Explicit local-only reset flags are required.');
  const client = new PrismaClient({ adapter: new PrismaPg({ host: 'postgres', port: 5432, user: 'local_owner', database: 'life_insurance',
    password: readFileSync('/credentials/bootstrap/password', 'utf8').trim(), max: 2 }) });
  const storage = localFixtureStorage();
  // Delete authority is mounted only on this explicit operator command, never
  // in Core or additive bootstrap. Secrets and signed URLs are never logged.
  const cleanup = new S3Client({ endpoint: 'http://minio:9000', region: process.env.STORAGE_REGION ?? 'ap-southeast-1',
    forcePathStyle: true, maxAttempts: 1, credentials: {
      accessKeyId: readFileSync('/credentials/storage-cleanup/access-key', 'utf8').trim(),
      secretAccessKey: readFileSync('/credentials/storage-cleanup/secret-key', 'utf8').trim(),
    } });
  try {
    // If storage cleanup failed after a prior commit, finish it first instead
    // of erasing the durable pending-cleanup record on another reset.
    const pending = await client.auditLog.findFirst({ where: { operatorId: resetOperator, action: { in: ['DEV_DATA_RESET_COMMITTED', 'DEV_POLICY_FIXTURE_REPLACED'] }, outcome: 'SUCCESS' }, orderBy: { createdAt: 'desc' } });
    const finished = pending && await client.auditLog.findFirst({ where: { operatorId: resetOperator, targetId: pending.targetId, action: 'DEV_SEED_STORAGE_CLEANED', outcome: 'SUCCESS' } });
    let record = pending;
    if (!pending || finished) {
      const inventory: CleanupObject[] = [];
      for (const prefix of seedObjectPrefixes) {
        let keyMarker: string | undefined, versionIdMarker: string | undefined;
        do {
          const result = await cleanup.send(new ListObjectVersionsCommand({ Bucket: storage.bucket, Prefix: prefix,
            KeyMarker: keyMarker, VersionIdMarker: versionIdMarker }), { abortSignal: AbortSignal.timeout(10000) });
          for (const item of [...result.Versions ?? [], ...result.DeleteMarkers ?? []]) {
            if (!item.Key) throw new Error('Invalid storage key.');
            const object = { bucket: storage.bucket, key: item.Key, ...(item.VersionId ? { versionId: item.VersionId } : {}) };
            assertSeedObject(object, storage.bucket); inventory.push(object);
          }
          keyMarker = result.IsTruncated ? result.NextKeyMarker : undefined;
          versionIdMarker = result.IsTruncated ? result.NextVersionIdMarker : undefined;
          if (result.IsTruncated && !keyMarker) throw new Error('Invalid storage pagination.');
        } while (keyMarker);
      }
      let cleanupId: string;
      if (policyOnly) {
        const result = await client.$transaction(tx => replaceRetiredPolicyFixtures(tx, storage, inventory), { timeout: 240000, maxWait: 120000 });
        cleanupId = result.cleanupId;
        console.log(`Policy fixtures updated: ${result.retiredPolicies} retired policies removed, ${result.policies.policiesCreated} distinct policies created. Accounts, profiles, passwords, assignments, chats and Tickets preserved; retired optional policy links cleared.`);
      } else {
        const result = await client.$transaction(tx => resetDevDataInTransaction(tx, client, storage, inventory), { timeout: 240000, maxWait: 120000 });
        cleanupId = result.cleanupId;
        console.log(`Dev data rebuilt: ${result.accountsCreated} accounts, ${result.policies.productsCreated} products, ${result.policies.policiesCreated} policies, ${result.policies.versionsCreated} PDF versions. Old chats, Tickets, notifications, sessions and app audit records were cleared.`);
      }
      record = await client.auditLog.findFirstOrThrow({ where: { targetId: cleanupId, action: policyOnly ? 'DEV_POLICY_FIXTURE_REPLACED' : 'DEV_DATA_RESET_COMMITTED' } });
    } else console.log('Resuming pending seed-storage cleanup; application data is not reset again.');
    const objects = (record!.metadata as { cleanupObjects: CleanupObject[] }).cleanupObjects;
    let removed = 0, reused = 0;
    for (const object of objects) {
      assertSeedObject(object, storage.bucket);
      if (await client.documentVersion.count({ where: { storageBucket: object.bucket, storageObjectKey: object.key } })) { reused++; continue; }
      await cleanup.send(new DeleteObjectCommand({ Bucket: object.bucket, Key: object.key, VersionId: object.versionId }), { abortSignal: AbortSignal.timeout(10000) });
      removed++;
    }
    await client.auditLog.create({ data: { actorType: 'OPERATOR', operatorId: resetOperator, action: 'DEV_SEED_STORAGE_CLEANED',
      targetType: 'DevDataset', targetId: record!.targetId, requestId: randomUUID(), outcome: 'SUCCESS', metadata: { objectsRemoved: removed, objectsReused: reused } } });
    console.log(`Storage cleanup finished: ${removed} old PDF objects/versions removed; ${reused} unchanged seed objects reused. Database roles, migrations, credentials and Docker volumes preserved.`);
    console.log('Open http://localhost:8080. Dev login accounts/password: docs/getting-started.md#dev-accounts. PDFs and runtime credentials remain in Docker volumes; no host PDF or credential file was created.');
  } finally { storage.close(); cleanup.destroy(); await client.$disconnect(); }
}
void main().catch(() => {
  console.error('Local dev reset failed. Database changes roll back before commit; after commit, rerun the same explicit command to finish pending storage cleanup. No volumes or infrastructure credentials were reset.');
  process.exitCode = 1;
});
