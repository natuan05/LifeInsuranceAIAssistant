import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { AuthService } from '../../auth/services/auth.service';
import { DatabaseService } from '../../database/database.service';
import { Prisma } from '../../generated/prisma/client';
import type { InboxConversationsQuery, InboxGroupsQuery } from '../dto/inbox-query.dto';
import type { ConversationMetadataResponseDto, InboxConversationItemDto, InboxConversationsResponseDto, InboxGroupsResponseDto } from '../dto/conversation-response.dto';
import { ConversationAccessService } from './conversation-access.service';
import { ConversationRateLimitService } from './conversation-rate-limit.service';
import { decodeInboxCursor, encodeInboxCursor, inboxCursorScope } from './inbox-cursor';

type Entry = {
  id: string; customer_id: string; full_name: string; account_code: string; subject: string;
  status: 'PENDING_HANDOFF' | 'STAFF_ACTIVE'; entry_type: 'REQUEST' | 'DIRECT' | 'TRANSFERRED';
  activity_at: Date; control_version: number; can_send: boolean;
  request_id: string | null; shared_reason: string | null; requested_at: Date | null;
};
type Group = Pick<Entry, 'customer_id' | 'full_name' | 'account_code' | 'activity_at'>;
const item = (row: Entry): InboxConversationItemDto => ({ id: row.id, subject: row.subject, status: row.status,
  entryType: row.entry_type, activityAt: row.activity_at.toISOString() });
const customer = (row: Group) => ({ id: row.customer_id, fullName: row.full_name, accountCode: row.account_code });

@Injectable()
export class StaffInboxService {
  constructor(private readonly database: DatabaseService, private readonly auth: AuthService,
    private readonly access: ConversationAccessService, private readonly rate: ConversationRateLimitService) {}

  private async read<T>(request: IncomingMessage, work: (tx: Prisma.TransactionClient, actorId: string, now: Date) => Promise<T>) {
    const { actor } = await this.auth.me(request);
    if (actor.role !== 'STAFF') throw new ForbiddenException();
    await this.rate.read(actor.id);
    return this.database.prisma.$transaction(async tx => {
      // Identity, current assignment and resource data share one stable snapshot.
      // The quota update is outside it, avoiding concurrent RR write conflicts.
      const current = await this.auth.me(request, tx);
      if (current.actor.id !== actor.id) throw new UnauthorizedException();
      if (current.actor.role !== 'STAFF') throw new ForbiddenException();
      return work(tx, actor.id, new Date());
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  groups(request: IncomingMessage, query: InboxGroupsQuery): Promise<InboxGroupsResponseDto> {
    return this.read(request, async (tx, actorId, now) => {
      const scope = inboxCursorScope(actorId, 'groups', query.filter, query.search, query.customerId);
      const boundary = decodeInboxCursor(query.cursor, scope);
      const literal = '%' + (query.search ?? '').replace(/[\\%_]/g, '\\$&') + '%';
      const rows = await tx.$queryRaw<Group[]>`WITH eligible AS (${this.access.staffSqlEntries(actorId, query.filter, now)}),
        grouped AS (
          SELECT customer_id,full_name,account_code,MAX(activity_at) AS activity_at FROM eligible
          WHERE (full_name ILIKE ${literal} ESCAPE chr(92) OR account_code ILIKE ${literal} ESCAPE chr(92))
            ${query.customerId ? Prisma.sql`AND customer_id=${query.customerId}::uuid` : Prisma.empty}
          GROUP BY customer_id,full_name,account_code
        ) SELECT * FROM grouped
        ${boundary ? Prisma.sql`WHERE (activity_at,customer_id)<(${new Date(boundary.at)}::timestamptz,${boundary.id}::uuid)` : Prisma.empty}
        ORDER BY activity_at DESC,customer_id DESC LIMIT ${query.limit + 1}`;
      const hasMore = rows.length > query.limit, visible = rows.slice(0, query.limit), last = visible.at(-1);
      return { items: visible.map(row => ({ customer: customer(row), lastActivityAt: row.activity_at.toISOString() })),
        pageInfo: { hasMore, nextCursor: hasMore && last ? encodeInboxCursor(scope, last.activity_at, last.customer_id) : null } };
    });
  }

  conversations(request: IncomingMessage, customerId: string, query: InboxConversationsQuery): Promise<InboxConversationsResponseDto> {
    return this.read(request, async (tx, actorId, now) => {
      const assignment = await tx.staffAssignment.findFirst({ where: { customerId, staffId: actorId, isActive: true }, select: { id: true } });
      if (!assignment) throw new NotFoundException();
      const scope = inboxCursorScope(actorId, 'conversations', query.filter, '', customerId);
      const boundary = decodeInboxCursor(query.cursor, scope);
      const rows = await tx.$queryRaw<Entry[]>`WITH eligible AS (${this.access.staffSqlEntries(actorId, query.filter, now)})
        SELECT * FROM eligible WHERE customer_id=${customerId}::uuid
          ${boundary ? Prisma.sql`AND (activity_at,id)<(${new Date(boundary.at)}::timestamptz,${boundary.id}::uuid)` : Prisma.empty}
        ORDER BY activity_at DESC,id DESC LIMIT ${query.limit + 1}`;
      const hasMore = rows.length > query.limit, visible = rows.slice(0, query.limit), last = visible.at(-1);
      return { items: visible.map(item), pageInfo: { hasMore,
        nextCursor: hasMore && last ? encodeInboxCursor(scope, last.activity_at, last.id) : null } };
    });
  }

  metadata(request: IncomingMessage, id: string): Promise<ConversationMetadataResponseDto> {
    return this.read(request, async (tx, actorId, now) => ({ conversation: await this.metadataInTransaction(tx, actorId, id, now) }));
  }
  async metadataInTransaction(tx: Prisma.TransactionClient, actorId: string, id: string, now = new Date()) {
      const [row] = await tx.$queryRaw<Entry[]>`WITH eligible AS (${this.access.staffSqlEntries(actorId, 'all', now)})
        SELECT * FROM eligible WHERE id=${id}::uuid`;
      if (!row) throw new NotFoundException();
      const pending = row.entry_type === 'REQUEST';
      return { ...item(row), customer: customer(row), controlVersion: row.control_version,
        ...(pending ? { request: { id: row.request_id!, sharedReason: row.shared_reason, requestedAt: row.requested_at!.toISOString() } } : {}),
        allowedActions: { readMessages: !pending, accept: pending, send: row.can_send } };
  }
}
