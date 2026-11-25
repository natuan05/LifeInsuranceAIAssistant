import { notifyMessage, reconcileMessages } from './notification-cycle';
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
    return this.commands.transaction(async tx => {
      const discovered = await tx.conversation.findUnique({ where: { id: event.aggregateId }, select: { customerId: true } });
      if (!discovered) return [];
      await this.commands.lock(tx, discovered.customerId, event.aggregateId);
      const conversation = await tx.conversation.findUnique({ where: { id: event.aggregateId },
        select: { customerId: true, channelType: true, supportOrigin: true, status: true, assignedStaffId: true,
          directAssignment: { select: { staffId: true } }, handoffs: { select: { id: true, recipientStaffId: true, state: true } } } });
      if (!conversation || conversation.channelType !== 'CUSTOMER_SUPPORT' || conversation.supportOrigin === 'LEGACY_UNKNOWN') return [];
      let customerNotification = false;
      let lastMessage: { senderType: string; readAt: Date | null; sequence: bigint } | null = null;
      if (event.eventType === 'HANDOFF_ACCEPTED' || event.eventType === 'CONVERSATION_TAKEOVER_COMMITTED') {
        const dedupKey = `${event.id}:${conversation.customerId}:STAFF_ACCEPTED_HANDOFF`;
        await tx.notification.upsert({
          where: { dedupKey },
          create: {
            dedupKey,
            kind: 'STAFF_ACCEPTED_HANDOFF',
            recipientCustomerId: conversation.customerId,
            conversationId: event.aggregateId,
            title: event.eventType === 'CONVERSATION_TAKEOVER_COMMITTED'
              ? 'Nhân viên đã tiếp quản cuộc trò chuyện'
              : 'Nhân viên đã tiếp nhận yêu cầu chat',
          },
          update: {},
        });
        customerNotification = true;
      } else if (event.eventType === 'MESSAGE_COMMITTED') {
        const source = await tx.outboxEvent.findFirst({ where: { id: event.id, aggregateType: 'CONVERSATION', aggregateId: event.aggregateId, eventType: event.eventType } });
        const payload = source?.payload;
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid message event');
        if (payload.schemaVersion === 2 && payload.reason === 'MESSAGE_APPENDED') {
          if (typeof payload.messageId !== 'string' || typeof payload.sequence !== 'string' || !/^[1-9][0-9]*$/.test(payload.sequence)) throw new Error('Invalid message event');
          lastMessage = await tx.message.findFirst({ where: { id: payload.messageId, conversationId: event.aggregateId,
            sequence: BigInt(payload.sequence), audience: 'CUSTOMER_VISIBLE' }, select: { senderType: true, readAt: true, sequence: true } });
          if (!lastMessage) throw new Error('Missing event message');
        } else if (payload.schemaVersion === 2 && payload.reason === 'MESSAGES_READ') {
          if (typeof payload.readThroughSequence !== 'string' || !/^[0-9]+$/.test(payload.readThroughSequence)) throw new Error('Invalid read event');
        } else if (payload.schemaVersion !== 1) throw new Error('Unsupported message event');
        // Legacy v1 reconciles beyond durable watermarks with bounded queries.
        if (lastMessage?.senderType === 'STAFF') customerNotification = await notifyMessage(tx, event.aggregateId, conversation.customerId, 'CUSTOMER', lastMessage);
        if (payload.schemaVersion === 1) {
          customerNotification = await reconcileMessages(tx, event.aggregateId, conversation.customerId, 'CUSTOMER');
        }
      }
      const recipients: ChatRecipient[] = [{
        actorId: conversation.customerId,
        role: 'CUSTOMER',
        transcript: event.eventType === 'MESSAGE_COMMITTED' || event.eventType === 'CONVERSATION_TAKEOVER_COMMITTED',
        // Persistence dedup must not suppress publication retries. Read events
        // also invalidate the bell because reading chat dismisses its notice.
        notification: event.eventType === 'MESSAGE_COMMITTED' || customerNotification,
      }];
      if (event.eventType === 'CONVERSATION_ACCESS_REVOKED') {
        const former = new Set(conversation.handoffs.map(h => h.recipientStaffId));
        if (conversation.directAssignment) former.add(conversation.directAssignment.staffId);
        return [...recipients, ...[...former].map(actorId => ({ actorId, role: 'STAFF' as const, scope: true }))];
      }
      const assignment = await tx.staffAssignment.findFirst({ where: { customerId: conversation.customerId, isActive: true }, select: { staffId: true } });
      const routeStaffController = async (staffId: string) => {
        const allowed = await tx.conversation.findFirst({ where: { id: event.aggregateId, AND: [this.access.staffScope(staffId, 'all')] }, select: { id: true } });
        if (!allowed) return;
        const isActiveController = conversation.status === 'STAFF_ACTIVE' && conversation.assignedStaffId === staffId;
        let notification = false;
        if (event.eventType === 'MESSAGE_COMMITTED' && isActiveController) {
          if (lastMessage?.senderType === 'CUSTOMER') notification = await notifyMessage(tx, event.aggregateId, staffId, 'STAFF', lastMessage);
          const source = await tx.outboxEvent.findUnique({ where: { id: event.id } });
          const payload = source?.payload;
          if (payload && typeof payload === 'object' && !Array.isArray(payload) && payload.schemaVersion === 1) {
            notification = await reconcileMessages(tx, event.aggregateId, staffId, 'STAFF');
          }
        }
        if (event.eventType === 'HANDOFF_REQUESTED' && conversation.status === 'PENDING_HANDOFF') {
          const pending = conversation.handoffs.find(h => h.state === 'PENDING' && h.recipientStaffId === staffId);
          // Only the event for the current pending request may create a notification.
          const source = await tx.outboxEvent.findUnique({ where: { id: event.id }, select: { payload: true } });
          const payload = source?.payload;
          if (pending && payload && typeof payload === 'object' && !Array.isArray(payload) && payload.requestId === pending.id) {
            // Serialize the final pending check with Accept/reassignment, in the
            // shared user/customer/assignment/conversation lock order.
            await this.commands.lock(tx, staffId, event.aggregateId);
            const current = await tx.conversation.findFirst({ where: { id: event.aggregateId,
              AND: [this.access.staffScope(staffId, 'requests')], handoffs: { some: { id: pending.id, state: 'PENDING', revokedAt: null } } }, select: { id: true } });
            if (current) {
              const dedupKey = `${event.id}:${staffId}:HANDOFF_REQUESTED`;
              await tx.notification.upsert({ where: { dedupKey }, create: { dedupKey, kind: 'HANDOFF_REQUESTED', recipientStaffId: staffId,
                conversationId: event.aggregateId, title: 'Staff support requested' }, update: {} });
              notification = true;
            }
          }
        }
        recipients.push({ actorId: staffId, role: 'STAFF', transcript: event.eventType === 'MESSAGE_COMMITTED',
          notification: (event.eventType === 'MESSAGE_COMMITTED' && isActiveController) || notification });
      };
      if (assignment) {
        await routeStaffController(assignment.staffId);
        return recipients;
      }
      // Customer is unassigned: notify controller if taken over, and broadcast
      // chat invalidation to active Staff who can view unassigned conversations.
      const routedIds = new Set<string>();
      if (conversation.status === 'STAFF_ACTIVE' && conversation.assignedStaffId) {
        await routeStaffController(conversation.assignedStaffId);
        routedIds.add(conversation.assignedStaffId);
      }
      const hasRevoked = conversation.handoffs.some(h => h.state === 'REVOKED');
      if (!hasRevoked && (conversation.supportOrigin === 'AI' || conversation.status === 'STAFF_ACTIVE')) {
        const now = new Date();
        const activeStaff = await tx.user.findMany({
          where: { role: 'STAFF', status: 'ACTIVE', OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] },
          select: { id: true },
          take: 200,
        });
        for (const s of activeStaff) {
          if (routedIds.has(s.id)) continue;
          recipients.push({ actorId: s.id, role: 'STAFF', transcript: event.eventType === 'MESSAGE_COMMITTED', notification: false });
        }
      }
      return recipients;
    });
  }
}
