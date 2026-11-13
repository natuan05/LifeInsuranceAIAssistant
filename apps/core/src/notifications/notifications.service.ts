import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { ConversationAccessService } from '../conversations/services/conversation-access.service';
import { ConversationCommandService } from '../conversations/services/conversation-command.service';
import { ConversationSessionService, type ConversationRequest } from '../conversations/services/conversation-session.service';
import { decodeInboxCursor, encodeInboxCursor, inboxCursorScope } from '../conversations/services/inbox-cursor';
import type { CustomerConversationsQuery } from '../conversations/dto/message-query.dto';
import { TicketAccessService } from '../tickets/services/ticket-access.service';
import { ticketNotificationTitle } from '../tickets/services/ticket-event.service';
@Injectable()
export class NotificationsService {
  constructor(private readonly session: ConversationSessionService, private readonly access: ConversationAccessService, private readonly commands: ConversationCommandService,
    private readonly tickets: TicketAccessService) {}
  private scope(actorId: string): Prisma.NotificationWhereInput {
    return { recipientStaffId: actorId, OR: [
      { kind: 'HANDOFF_REQUESTED', ticketId: null, conversation: { is: this.access.staffScope(actorId) } },
      { kind: { in: ['TICKET_CREATED', 'TICKET_ACCEPTED', 'TICKET_STATUS_CHANGED'] }, conversationId: null, ticket: { is: this.tickets.staffScope(actorId) } },
    ] };
  }
  list(request: ConversationRequest, query: CustomerConversationsQuery) {
    return this.session.read(request, 'STAFF', async (tx, actorId) => {
      const scope = inboxCursorScope(actorId, 'notifications', 'all');
      const boundary = decodeInboxCursor(query.cursor, scope);
      const rows = await tx.notification.findMany({ where: { AND: [this.scope(actorId), ...(boundary ? [{ OR: [
        { createdAt: { lt: new Date(boundary.at) } }, { createdAt: new Date(boundary.at), id: { lt: boundary.id } } ] }] : [])] },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1,
        select: { id: true, kind: true, createdAt: true, isRead: true, conversationId: true, ticketId: true } });
      const items = rows.slice(0, query.limit), last = items.at(-1), hasMore = rows.length > query.limit;
      return { items: items.map(row => ({ id: row.id, kind: row.kind, title: row.kind === 'HANDOFF_REQUESTED' ? 'Staff support requested' : ticketNotificationTitle(row.kind!), isRead: row.isRead,
        createdAt: row.createdAt.toISOString(), target: row.ticketId ? { type: 'TICKET', id: row.ticketId } : { type: 'CONVERSATION', id: row.conversationId } })),
        pageInfo: { hasMore, nextCursor: hasMore && last ? encodeInboxCursor(scope, last.createdAt, last.id) : null } };
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
      } else if (row.conversationId) await this.commands.lock(tx, actorId, row.conversationId);
      else throw new NotFoundException();
    }, async (tx, actorId) => {
      const row = await tx.notification.findFirst({ where: { id, ...this.scope(actorId) }, select: { id: true } });
      if (!row) throw new NotFoundException();
      await tx.notification.update({ where: { id }, data: { isRead: true } });
      return { id, isRead: true };
    });
  }
}
