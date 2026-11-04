import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { ConversationAccessService } from '../conversations/services/conversation-access.service';
import { ConversationCommandService } from '../conversations/services/conversation-command.service';
import { ConversationSessionService, type ConversationRequest } from '../conversations/services/conversation-session.service';
import { decodeInboxCursor, encodeInboxCursor, inboxCursorScope } from '../conversations/services/inbox-cursor';
import type { CustomerConversationsQuery } from '../conversations/dto/message-query.dto';
@Injectable()
export class NotificationsService {
  constructor(private readonly session: ConversationSessionService, private readonly access: ConversationAccessService, private readonly commands: ConversationCommandService) {}
  private scope(actorId: string): Prisma.NotificationWhereInput {
    return { recipientStaffId: actorId, kind: 'HANDOFF_REQUESTED', conversation: { is: this.access.staffScope(actorId) } };
  }
  list(request: ConversationRequest, query: CustomerConversationsQuery) {
    return this.session.read(request, 'STAFF', async (tx, actorId) => {
      const scope = inboxCursorScope(actorId, 'notifications', 'all');
      const boundary = decodeInboxCursor(query.cursor, scope);
      const rows = await tx.notification.findMany({ where: { ...this.scope(actorId), ...(boundary ? { OR: [
        { createdAt: { lt: new Date(boundary.at) } }, { createdAt: new Date(boundary.at), id: { lt: boundary.id } } ] } : {}) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1,
        select: { id: true, createdAt: true, isRead: true, conversationId: true } });
      const items = rows.slice(0, query.limit), last = items.at(-1), hasMore = rows.length > query.limit;
      return { items: items.map(row => ({ id: row.id, kind: 'HANDOFF_REQUESTED', title: 'Staff support requested', isRead: row.isRead,
        createdAt: row.createdAt.toISOString(), target: { type: 'CONVERSATION', id: row.conversationId } })),
        pageInfo: { hasMore, nextCursor: hasMore && last ? encodeInboxCursor(scope, last.createdAt, last.id) : null } };
    });
  }
  read(request: ConversationRequest, id: string) {
    return this.session.write(request, 'STAFF', 'NOTIFICATION_READ', async (tx, actorId) => {
      const row = await tx.notification.findFirst({ where: { id, recipientStaffId: actorId, kind: 'HANDOFF_REQUESTED' }, select: { conversationId: true } });
      if (!row?.conversationId) throw new NotFoundException();
      await this.commands.lock(tx, actorId, row.conversationId);
    }, async (tx, actorId) => {
      const row = await tx.notification.findFirst({ where: { id, ...this.scope(actorId) }, select: { id: true } });
      if (!row) throw new NotFoundException();
      await tx.notification.update({ where: { id }, data: { isRead: true } });
      return { id, isRead: true };
    });
  }
}
