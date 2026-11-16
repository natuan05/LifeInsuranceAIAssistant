import { Injectable, NotFoundException, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { DatabaseService } from '../database/database.service';
import { ConversationAccessService } from '../conversations/services/conversation-access.service';
import { ConversationCommandService } from '../conversations/services/conversation-command.service';
import { ConversationSessionService, type ConversationRequest } from '../conversations/services/conversation-session.service';
import { decodeInboxCursor, encodeInboxCursor, inboxCursorScope } from '../conversations/services/inbox-cursor';
import type { CustomerConversationsQuery } from '../conversations/dto/message-query.dto';
import { TicketAccessService } from '../tickets/services/ticket-access.service';
import { ticketNotificationTitle } from '../tickets/services/ticket-event.service';

export const customerNotificationTitle = (kind: string, ticketCode?: string | null) => {
  switch (kind) {
    case 'STAFF_ACCEPTED_HANDOFF':
      return 'Nhân viên đã tiếp nhận yêu cầu chat';
    case 'SUPPORT_TICKET_CREATED':
      return ticketCode ? `Phiếu hỗ trợ #${ticketCode} của bạn đã được tạo` : 'Phiếu hỗ trợ của bạn đã được tạo';
    case 'STAFF_MESSAGE_UNREAD':
      return 'Bạn có tin nhắn mới từ nhân viên hỗ trợ';
    default:
      return 'Thông báo mới';
  }
};

@Injectable()
export class NotificationsService implements OnApplicationBootstrap, OnModuleDestroy {
  private cleanupTimer?: NodeJS.Timeout;

  constructor(
    private readonly database: DatabaseService,
    private readonly session: ConversationSessionService,
    private readonly access: ConversationAccessService,
    private readonly commands: ConversationCommandService,
    private readonly tickets: TicketAccessService,
  ) {}

  onApplicationBootstrap() {
    this.cleanupExpiredNotifications().catch(() => {});
    // Periodic hourly cleanup for notifications older than 30 days
    this.cleanupTimer = setInterval(() => {
      void this.cleanupExpiredNotifications();
    }, 3600000);
    this.cleanupTimer.unref();
  }

  async cleanupExpiredNotifications(): Promise<number> {
    try {
      const result = await this.database.prisma.$executeRaw`
        DELETE FROM business.notifications
        WHERE created_at < NOW() - INTERVAL '30 days'
      `;
      return Number(result);
    } catch {
      return 0;
    }
  }

  onModuleDestroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }

  private scope(actorId: string): Prisma.NotificationWhereInput {
    return {
      recipientStaffId: actorId,
      OR: [
        { kind: { in: ['HANDOFF_REQUESTED', 'CUSTOMER_MESSAGE_UNREAD'] }, ticketId: null, conversation: { is: this.access.staffScope(actorId) } },
        { kind: { in: ['TICKET_CREATED', 'TICKET_ACCEPTED', 'TICKET_STATUS_CHANGED'] }, conversationId: null, ticket: { is: this.tickets.staffScope(actorId) } },
      ],
    };
  }

  list(request: ConversationRequest, query: CustomerConversationsQuery) {
    return this.session.read(request, 'STAFF', async (tx, actorId) => {
      const scope = inboxCursorScope(actorId, 'notifications', 'all');
      const boundary = decodeInboxCursor(query.cursor, scope);
      const rows = await tx.notification.findMany({
        where: {
          AND: [
            this.scope(actorId),
            ...(boundary ? [{ OR: [
              { createdAt: { lt: new Date(boundary.at) } },
              { createdAt: new Date(boundary.at), id: { lt: boundary.id } },
            ] }] : []),
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        select: { id: true, kind: true, createdAt: true, isRead: true, conversationId: true, ticketId: true },
      });
      const items = rows.slice(0, query.limit), last = items.at(-1), hasMore = rows.length > query.limit;
      return {
        items: items.map(row => ({
          id: row.id,
          kind: row.kind,
          title: row.kind === 'HANDOFF_REQUESTED' ? 'Staff support requested'
            : row.kind === 'CUSTOMER_MESSAGE_UNREAD' ? 'Bạn có tin nhắn mới từ khách hàng'
            : ticketNotificationTitle(row.kind!),
          isRead: row.isRead,
          createdAt: row.createdAt.toISOString(),
          target: row.ticketId ? { type: 'TICKET', id: row.ticketId } : { type: 'CONVERSATION', id: row.conversationId },
        })),
        pageInfo: { hasMore, nextCursor: hasMore && last ? encodeInboxCursor(scope, last.createdAt, last.id) : null },
      };
    });
  }

  read(request: ConversationRequest, id: string) {
    return this.session.write(request, 'STAFF', 'NOTIFICATION_READ', async (tx, actorId) => {
      const row = await tx.notification.findFirst({ where: { id, ...this.scope(actorId) }, select: { conversationId: true, ticketId: true } });
      if (!row) throw new NotFoundException();
      if (row.ticketId) {
        const ticket = await this.tickets.requireTicket(tx, actorId, row.ticketId);
        await this.commands.lockCustomer(tx, actorId, ticket.customerId);
        await tx.$queryRaw`SELECT id FROM business.support_tickets WHERE id=${row.ticketId}::uuid FOR UPDATE`;
      } else if (row.conversationId) {
        await this.commands.lock(tx, actorId, row.conversationId);
      } else {
        throw new NotFoundException();
      }
    }, async (tx, actorId) => {
      const row = await tx.notification.findFirst({ where: { id, ...this.scope(actorId) }, select: { id: true } });
      if (!row) throw new NotFoundException();
      await tx.notification.update({ where: { id }, data: { isRead: true } });
      return { id, isRead: true };
    });
  }

  // --- Customer Notifications (N01 / N02) ---

  listForCustomer(request: ConversationRequest, query: CustomerConversationsQuery) {
    return this.session.read(request, 'CUSTOMER', async (tx, actorId) => {
      const scope = inboxCursorScope(actorId, 'notifications', 'all');
      const boundary = decodeInboxCursor(query.cursor, scope);
      const rows = await tx.notification.findMany({
        where: {
          AND: [
            { recipientCustomerId: actorId },
            ...(boundary ? [{ OR: [
              { createdAt: { lt: new Date(boundary.at) } },
              { createdAt: new Date(boundary.at), id: { lt: boundary.id } },
            ] }] : []),
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        select: {
          id: true,
          kind: true,
          title: true,
          body: true,
          createdAt: true,
          isRead: true,
          conversationId: true,
          ticketId: true,
          ticket: { select: { ticketCode: true } },
        },
      });
      const items = rows.slice(0, query.limit), last = items.at(-1), hasMore = rows.length > query.limit;
      return {
        items: items.map(row => ({
          id: row.id,
          kind: row.kind ?? 'NOTIFICATION',
          title: row.title || customerNotificationTitle(row.kind ?? '', row.ticket?.ticketCode),
          body: row.body,
          isRead: row.isRead,
          createdAt: row.createdAt.toISOString(),
          target: row.ticketId
            ? { type: 'TICKET', id: row.ticketId }
            : { type: 'CONVERSATION', id: row.conversationId },
        })),
        pageInfo: { hasMore, nextCursor: hasMore && last ? encodeInboxCursor(scope, last.createdAt, last.id) : null },
      };
    });
  }

  readForCustomer(request: ConversationRequest, id: string) {
    return this.session.write(request, 'CUSTOMER', 'NOTIFICATION_READ', async (tx, actorId) => {
      const row = await tx.notification.findFirst({
        where: { id, recipientCustomerId: actorId },
        select: { id: true },
      });
      if (!row) throw new NotFoundException();
    }, async (tx, actorId) => {
      const row = await tx.notification.findFirst({
        where: { id, recipientCustomerId: actorId },
        select: { id: true },
      });
      if (!row) throw new NotFoundException();
      await tx.notification.update({ where: { id }, data: { isRead: true } });
      return { id, isRead: true };
    });
  }

  readAllForCustomer(request: ConversationRequest) {
    return this.session.write(request, 'CUSTOMER', 'NOTIFICATION_READ', async () => {}, async (tx, actorId) => {
      const result = await tx.notification.updateMany({
        where: { recipientCustomerId: actorId, isRead: false },
        data: { isRead: true },
      });
      return { success: true, count: result.count };
    });
  }
}
