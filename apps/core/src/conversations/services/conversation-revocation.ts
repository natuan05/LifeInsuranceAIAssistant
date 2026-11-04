import { Prisma } from '../../generated/prisma/client';

// Called by the operator AFTER locking sorted user rows, inside the existing
// assignment transaction. History/evidence survive; no grant transfers implicitly.
export async function revokeCustomerConversations(tx: Prisma.TransactionClient, customerId: string, now: Date) {
  const affected = await tx.$queryRaw<Array<{ id: string; control_version: number }>>`
    SELECT c.id,c.control_version FROM business.conversations c WHERE c.customer_id=${customerId}::uuid
    AND c.channel_type='CUSTOMER_SUPPORT' AND (c.assigned_staff_id IS NOT NULL OR EXISTS(
      SELECT 1 FROM business.conversation_handoffs h WHERE h.conversation_id=c.id AND h.state IN ('PENDING','ACCEPTED')))
    ORDER BY c.id FOR UPDATE`;
  for (const row of affected) {
    await tx.conversationHandoff.updateMany({ where: { conversationId: row.id, state: { in: ['PENDING', 'ACCEPTED'] } },
      data: { state: 'REVOKED', revokedAt: now, revokeReason: 'ASSIGNMENT_CHANGED' } });
    await tx.conversation.update({ where: { id: row.id }, data: { status: 'AI_ACTIVE', assignedStaffId: null, controlVersion: { increment: 1 } } });
    await tx.outboxEvent.create({ data: { aggregateType: 'CONVERSATION', aggregateId: row.id,
      eventType: 'CONVERSATION_ACCESS_REVOKED', payload: { schemaVersion: 1, controlVersion: row.control_version + 1 } } });
  }
}
