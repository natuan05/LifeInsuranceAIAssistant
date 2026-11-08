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
      let customerNotification = false;
      let lastMessage: { senderType: string; readAt: Date | null } | null = null;
      if (event.eventType === 'HANDOFF_ACCEPTED') {
        const dedupKey = `${event.id}:${conversation.customerId}:STAFF_ACCEPTED_HANDOFF`;
        await tx.notification.upsert({
          where: { dedupKey },
          create: {
            dedupKey,
            kind: 'STAFF_ACCEPTED_HANDOFF',
            recipientCustomerId: conversation.customerId,
            conversationId: event.aggregateId,
            title: 'Nhân viên đã tiếp nhận yêu cầu chat',
          },
          update: {},
        });
        customerNotification = true;
      } else if (event.eventType === 'MESSAGE_COMMITTED') {
        lastMessage = await tx.message.findFirst({
          where: { conversationId: event.aggregateId, audience: 'CUSTOMER_VISIBLE' },
          orderBy: { sequence: 'desc' },
          select: { senderType: true, readAt: true },
        });
        if (lastMessage?.senderType === 'STAFF' && lastMessage.readAt === null) {
          const existingCustomerNoti = await tx.notification.findFirst({
            where: {
              recipientCustomerId: conversation.customerId,
              conversationId: event.aggregateId,
              kind: 'STAFF_MESSAGE_UNREAD',
              isRead: false,
            },
            select: { id: true },
          });
          if (existingCustomerNoti) {
            await tx.notification.update({
              where: { id: existingCustomerNoti.id },
              data: { createdAt: new Date() },
            });
          } else {
            const dedupKey = `${event.id}:${conversation.customerId}:STAFF_MESSAGE_UNREAD`;
            await tx.notification.create({
              data: {
                dedupKey,
                kind: 'STAFF_MESSAGE_UNREAD',
                recipientCustomerId: conversation.customerId,
                conversationId: event.aggregateId,
                title: 'Bạn có tin nhắn mới từ nhân viên hỗ trợ',
              },
            });
          }
          customerNotification = true;
        }
      }
      const recipients: ChatRecipient[] = [{
        actorId: conversation.customerId,
        role: 'CUSTOMER',
        transcript: event.eventType === 'MESSAGE_COMMITTED',
        notification: customerNotification,
      }];
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
      if (event.eventType === 'MESSAGE_COMMITTED' && lastMessage?.senderType === 'CUSTOMER' && lastMessage.readAt === null) {
        const existingStaffNoti = await tx.notification.findFirst({
          where: {
            recipientStaffId: assignment.staffId,
            conversationId: event.aggregateId,
            kind: 'CUSTOMER_MESSAGE_UNREAD',
            isRead: false,
          },
          select: { id: true },
        });
        if (existingStaffNoti) {
          await tx.notification.update({
            where: { id: existingStaffNoti.id },
            data: { createdAt: new Date() },
          });
        } else {
          const dedupKey = `${event.id}:${assignment.staffId}:CUSTOMER_MESSAGE_UNREAD`;
          await tx.notification.create({
            data: {
              dedupKey,
              kind: 'CUSTOMER_MESSAGE_UNREAD',
              recipientStaffId: assignment.staffId,
              conversationId: event.aggregateId,
              title: 'Bạn có tin nhắn mới từ khách hàng',
            },
          });
        }
        notification = true;
      }
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
