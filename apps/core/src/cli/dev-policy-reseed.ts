import { randomUUID } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client';
import { devAccounts, type DevAccountDefinition } from './dev-accounts';
import { policySeedOperator, seedPoliciesInTransaction } from './dev-policies';
import { policyFixture } from './dev-policy-source';
import { contractVersion, portfolioVersion } from './dev-policy-portfolio';
import type { FixtureStorage } from './dev-policy-storage';
import { assertSeedObject, resetOperator, type CleanupObject } from './dev-data-reset';

export async function replaceRetiredPolicyFixtures(tx: Prisma.TransactionClient, storage: FixtureStorage, inventory: CleanupObject[],
  options: { namespace?: string; fixtures?: readonly DevAccountDefinition[]; legacyIds?: string[] } = {}) {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(6213, 1101)`;
  await tx.$executeRawUnsafe('LOCK TABLE business.insurance_policies, business.documents, business.document_versions, business.conversations, business.support_tickets IN SHARE ROW EXCLUSIVE MODE');
  const candidates = await tx.insurancePolicy.findMany({ where: options.legacyIds ? { id: { in: options.legacyIds } } : {
    benefitsSnapshot: { path: ['fixture'], equals: policyFixture } }, include: { documents: { include: { versions: true } } } });
  const retired = candidates.filter(row => (row.benefitsSnapshot as Record<string, unknown> | null)?.fixture === policyFixture
    && ((row.benefitsSnapshot as Record<string, unknown>).portfolioVersion !== portfolioVersion
      || (row.benefitsSnapshot as Record<string, unknown>).datasetVersion !== contractVersion));
  const ids = retired.map(row => row.id), documentIds: string[] = [];
  inventory.forEach(object => assertSeedObject(object, storage.bucket));
  for (const row of retired) {
    if (!await tx.auditLog.findFirst({ where: { operatorId: policySeedOperator, action: 'DEV_POLICY_CREATED', targetId: row.id, outcome: 'SUCCESS' } })) throw new Error('Retired policy is not owned by the dev seed.');
    for (const doc of row.documents) {
      if (doc.accessScope !== 'PRIVATE_POLICY' || doc.ownerCustomerId !== row.customerId) throw new Error('Unexpected retired document scope.');
      documentIds.push(doc.id);
      for (const version of doc.versions) {
        const object = { bucket: version.storageBucket, key: version.storageObjectKey };
        assertSeedObject(object, storage.bucket);
        if (!inventory.some(item => item.key === object.key)) inventory.push(object);
      }
    }
  }
  if (await tx.ragKnowledgeChunk.count({ where: { OR: [{ policyId: { in: ids } }, { documentId: { in: documentIds } }] } })) throw new Error('Retired fixtures have RAG references; review reindexing before replacement.');
  // Do not pretend a historical conversation/Ticket refers to a new product.
  // Preserve its content/confirmation, remove only the retired optional link,
  // and advance fences so stale clients cannot write using the previous state.
  const conversationsUnlinked = (await tx.conversation.updateMany({ where: { linkedPolicyId: { in: ids } }, data: { linkedPolicyId: null, controlVersion: { increment: 1 } } })).count;
  const ticketsUnlinked = (await tx.supportTicket.updateMany({ where: { policyId: { in: ids } }, data: { policyId: null, version: { increment: 1 } } })).count;
  await tx.document.updateMany({ where: { id: { in: documentIds } }, data: { currentVersion: null } });
  await tx.documentVersion.deleteMany({ where: { documentId: { in: documentIds } } });
  await tx.document.deleteMany({ where: { id: { in: documentIds } } });
  await tx.insurancePolicy.deleteMany({ where: { id: { in: ids } } });
  const policies = await seedPoliciesInTransaction(tx, storage, options.fixtures ?? devAccounts, options.namespace ?? 'DEV');
  const cleanupId = randomUUID();
  await tx.auditLog.create({ data: { actorType: 'OPERATOR', operatorId: resetOperator, action: 'DEV_POLICY_FIXTURE_REPLACED',
    targetType: 'DevDataset', targetId: cleanupId, requestId: cleanupId, outcome: 'SUCCESS', metadata: {
      retiredPolicies: ids.length, retiredDocuments: documentIds.length, accountsPreserved: true,
      conversationsUnlinked, ticketsUnlinked, policies, cleanupObjects: inventory,
    } as Prisma.InputJsonObject } });
  return { retiredPolicies: ids.length, policies, cleanupId };
}
