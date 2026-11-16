import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '../generated/prisma/client';
import { bootstrapInTransaction, newDevManifest } from './dev-accounts';
import { fixtureObjectPrefix, seedPoliciesInTransaction } from './dev-policies';
import type { FixtureStorage } from './dev-policy-storage';

export const resetOperator = 'reset-local-dev-data-v1';
export const seedObjectPrefixes = ['dev-fixtures/policies-v1/', 'local-fixtures/2026-10-31/', fixtureObjectPrefix] as const;
export type CleanupObject = { bucket: string; key: string; versionId?: string };
export function assertSeedObject(object: CleanupObject, bucket: string) {
  if (object.bucket !== bucket || !seedObjectPrefixes.some(prefix => object.key.startsWith(prefix))
    || object.key.includes('..') || !object.key.endsWith('.pdf')) throw new Error('Object outside the approved local seed scope.');
}

// No API or ordinary bootstrap calls this function. It deliberately clears ALL
// application records, including edited profiles/passwords and audit history.
// Only the explicit Docker reset command receives database-owner credentials.
export async function resetDevDataInTransaction(tx: Prisma.TransactionClient, client: PrismaClient, storage: FixtureStorage, inventory: CleanupObject[]) {
  inventory.forEach(object => assertSeedObject(object, storage.bucket));
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(6213, 1100)`;
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(6213, 1101)`;
  const before = { accounts: await tx.user.count(), policies: await tx.insurancePolicy.count(), documents: await tx.document.count(),
    versions: await tx.documentVersion.count(), conversations: await tx.conversation.count(), messages: await tx.message.count(), tickets: await tx.supportTicket.count() };
  const versions = await tx.documentVersion.findMany({ select: { storageBucket: true, storageObjectKey: true } });
  for (const version of versions) {
    const object = { bucket: version.storageBucket, key: version.storageObjectKey };
    assertSeedObject(object, storage.bucket);
    if (!inventory.some(item => item.key === object.key)) inventory.push(object);
  }
  // Enumerate all 19 app tables explicitly. No CASCADE/DROP DATABASE, schema,
  // migration metadata, DB role or infrastructure credential is touched.
  await tx.$executeRawUnsafe(`TRUNCATE TABLE
    business.users, business.customer_profiles, business.staff_profiles,
    business.staff_assignments, business.auth_sessions, business.rate_limit_buckets,
    business.audit_logs, business.insurance_products, business.insurance_policies,
    business.documents, business.document_versions, business.conversations,
    business.messages, business.conversation_handoffs, business.conversation_command_receipts,
    business.support_tickets, business.outbox_events, business.notifications,
    rag.rag_knowledge_chunks RESTART IDENTITY`);
  const accounts = await bootstrapInTransaction(tx, client, newDevManifest());
  const policies = await seedPoliciesInTransaction(tx, storage);
  const cleanupId = randomUUID();
  await tx.auditLog.create({ data: { actorType: 'OPERATOR', operatorId: resetOperator, action: 'DEV_DATA_RESET_COMMITTED',
    targetType: 'DevDataset', targetId: cleanupId, requestId: cleanupId, outcome: 'SUCCESS',
    metadata: { before, accountsCreated: accounts.length, policies, cleanupObjects: inventory } as Prisma.InputJsonObject } });
  return { before, accountsCreated: accounts.length, policies, cleanupId };
}
