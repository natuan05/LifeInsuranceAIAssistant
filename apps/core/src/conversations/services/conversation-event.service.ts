import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { ConversationAccessService } from './conversation-access.service';
import { ConversationCommandService } from './conversation-command.service';

export type ChatRecipient = { actorId: string; role: 'CUSTOMER' | 'STAFF'; scope?: boolean; transcript?: boolean; notification?: boolean };
export type ChatEvent = { id: string; aggregateId: string; eventType: string };
@Injectable()
export class ConversationEventService {
  constructor(private readonly database: DatabaseService, private readonly access: ConversationAccessService, private readonly commands: ConversationCommandService) {}
  route(event: ChatEvent): Promise<ChatRecipient[]> {
    return this.database.prisma.$transaction(async tx => {
      const conversation = await tx.conversation.findUnique({ where: { id: event.aggregateId },
        select: { customerId: true, channelType: true, supportOrigin: true, status: true,
          directAssignment: { select: { staffId: true } }, handoffs: { select: { id: true, recipientStaffId: true, state: true } } } });
      if (!conversation || conversation.channelType !== 'CUSTOMER_SUPPORT' || conversation.supportOrigin === 'LEGACY_UNKNOWN') return [];
      const recipients: ChatRecipient[] = [{ actorId: conversation.customerId, role: 'CUSTOMER' }];
      if (event.eventType === 'CONVERSATION_ACCESS_REVOKED') {
        const former = new Set(conversation.handoffs.map(h => h.recipientStaffId));
        if (conversation.directAssignment) former.add(conversation.directAssignment.staffId);
        return [...recipients, ...[...former].map(actorId => ({ actorId, role: 'STAFF' as const, scope: true }))];
      }
      const assignment = await tx.staffAssignment.findFirst({ where: { customerId: conversation.customerId, isActive: true }, select: { staffId: true } });
      if (!assignment) return recipients;
      const allowed = await tx.conversation.findFirst({ where: { id: event.aggregateId, AND: [this.access.staffScope(assignment.staffId, event.eventType === 'MESSAGE_COMMITTED' ? 'active' : 'all')] }, select: { id: true } });
      if (!allowed) return recipients;
      let notification = false;
      if (event.eventType === 'HANDOFF_REQUESTED' && conversation.status === 'PENDING_HANDOFF') {
        const pending = conversation.handoffs.find(h => h.state === 'PENDING' && h.recipientStaffId === assignment.staffId);
        // Only the event for the current pending request may create a notification.
        const source = await tx.outboxEvent.findUnique({ where: { id: event.id }, select: { payload: true } });
        const payload = source?.payload;
        if (pending && payload && typeof payload === 'object' && !Array.isArray(payload) && payload.requestId === pending.id) {
          // Serialize the final pending check with Accept/reassignment, in the
          // shared user/customer/assignment/conversation lock order.
          await this.commands.lock(tx, assignment.staffId, event.aggregateId);
          const current = await tx.conversation.findFirst({ where: { id: event.aggregateId,
            AND: [this.access.staffScope(assignment.staffId, 'requests')], handoffs: { some: { id: pending.id, state: 'PENDING', revokedAt: null } } }, select: { id: true } });
          if (current) {
            const dedupKey = `${event.id}:${assignment.staffId}:HANDOFF_REQUESTED`;
            await tx.notification.upsert({ where: { dedupKey }, create: { dedupKey, kind: 'HANDOFF_REQUESTED', recipientStaffId: assignment.staffId,
              conversationId: event.aggregateId, title: 'Staff support requested' }, update: {} });
            notification = true;
          }
        }
      }
      recipients.push({ actorId: assignment.staffId, role: 'STAFF', transcript: event.eventType === 'MESSAGE_COMMITTED', notification });
      return recipients;
    });
  }
}
