import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client';
export async function recordConversationCommand(tx: Prisma.TransactionClient, actorId: string, actorRole: 'CUSTOMER' | 'STAFF',
  id: string, eventType: string, controlVersion: number, correlationId?: string, handoffId?: string) {
  await tx.auditLog.create({ data: { actorType: 'USER', actorId, actorRole, action: eventType,
    targetType: 'Conversation', targetId: id, outcome: 'SUCCESS', requestId: correlationId ?? randomUUID() } });
  await tx.outboxEvent.create({ data: { aggregateType: 'CONVERSATION', aggregateId: id, eventType,
    payload: { schemaVersion: 1, controlVersion, ...(handoffId ? { requestId: handoffId } : {}) } } });
}
