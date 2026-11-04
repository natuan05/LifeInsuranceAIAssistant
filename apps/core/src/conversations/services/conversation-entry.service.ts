import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { SafeApiException } from '../../http/safe-api.exception';
import type { CreateConversationDto, CustomerCommandQuery } from '../dto/conversation-entry.dto';
import type { CustomerConversationsQuery } from '../dto/message-query.dto';
import { ConversationAccessService } from './conversation-access.service';
import { ConversationCommandService } from './conversation-command.service';
import { ConversationSessionService, type ConversationRequest } from './conversation-session.service';
import { decodeInboxCursor, encodeInboxCursor, inboxCursorScope } from './inbox-cursor';
import { recordConversationCommand } from './conversation-events';

export const handoffConsent = {
  textVersion: 'handoff-v1', scope: 'ENTIRE_CUSTOMER_VISIBLE_CONVERSATION',
  text: 'Đồng ý để nhân viên tiếp nhận toàn bộ nội dung bạn và AI đã trao đổi trong cuộc này, cùng các tin nhắn tiếp theo khi được hỗ trợ.',
} as const;
@Injectable()
export class ConversationEntryService {
  constructor(private readonly session: ConversationSessionService, private readonly commands: ConversationCommandService,
    private readonly access: ConversationAccessService) {}
  async routing(tx: Prisma.TransactionClient, actorId: string) {
    const profile = await tx.customerProfile.findUnique({ where: { userId: actorId }, select: { assignmentVersion: true,
      assignments: { where: { isActive: true }, take: 1, select: { id: true, staffId: true,
        staff: { select: { fullName: true, user: { select: { status: true, lockedUntil: true } } } } } } } });
    if (!profile) throw new NotFoundException();
    const assignment = profile.assignments[0];
    const available = assignment && assignment.staff.user.status === 'ACTIVE' &&
      (!assignment.staff.user.lockedUntil || assignment.staff.user.lockedUntil <= new Date());
    return { version: profile.assignmentVersion, assignment, available: !!available };
  }
  async requireRouting(tx: Prisma.TransactionClient, actorId: string, expected: number) {
    const route = await this.routing(tx, actorId);
    if (route.version !== expected) throw new SafeApiException('ROUTING_CHANGED');
    if (!route.available || !route.assignment) throw new SafeApiException('STAFF_UNAVAILABLE');
    return route.assignment;
  }
  support(request: ConversationRequest) {
    return this.session.read(request, 'CUSTOMER', async (tx, id) => {
      const route = await this.routing(tx, id);
      return { availability: !route.assignment ? 'UNASSIGNED' : route.available ? 'AVAILABLE' : 'STAFF_UNAVAILABLE',
        assignmentVersion: route.version, staff: route.available ? { fullName: route.assignment!.staff.fullName } : null, handoffConsent };
    });
  }
  create(request: ConversationRequest, input: CreateConversationDto) {
    if (input.kind === 'AI' && input.expectedAssignmentVersion !== undefined) throw new BadRequestException();
    return this.session.write(request, 'CUSTOMER', 'CREATE', (tx, actorId) => this.commands.lockCustomer(tx, actorId, actorId), async (tx, actorId) => {
      const operation = input.kind === 'AI' ? 'CREATE_AI' : 'CREATE_DIRECT';
      const receipt = await this.commands.execute(tx, actorId, operation, input.clientRequestId,
        { kind: input.kind, subject: input.subject ?? '', expectedAssignmentVersion: input.expectedAssignmentVersion ?? null }, async () => {}, async () => {
          const assignment = input.kind === 'DIRECT' ? await this.requireRouting(tx, actorId, input.expectedAssignmentVersion!) : null;
          const conversation = await tx.conversation.create({ data: { customerId: actorId, channelType: 'CUSTOMER_SUPPORT',
            supportOrigin: input.kind, createdByCustomerId: actorId, subject: input.subject || 'Cuộc trò chuyện',
            status: assignment ? 'STAFF_ACTIVE' : 'AI_ACTIVE', directAssignmentId: assignment?.id, assignedStaffId: assignment?.staffId } });
          await recordConversationCommand(tx, actorId, 'CUSTOMER', conversation.id, 'CONVERSATION_CREATED', 0, request.requestId);
          return { resourceId: conversation.id, resultVersion: 0 };
        });
      const conversation = await this.customerMetadata(tx, actorId, receipt.resourceId);
      return { conversation, replayed: receipt.replayed };
    });
  }
  async customerMetadata(tx: Prisma.TransactionClient, actorId: string, id: string) {
    const row = await tx.conversation.findFirst({ where: { id, customerId: actorId, channelType: 'CUSTOMER_SUPPORT' },
      select: { id: true, subject: true, status: true, supportOrigin: true, controlVersion: true,
        handoffs: { orderBy: [{ confirmedAt: 'desc' }, { id: 'desc' }], take: 1,
          select: { id: true, state: true, assignmentId: true, confirmedAt: true, acceptedAt: true, revokedAt: true } } } });
    if (!row) throw new NotFoundException();
    const review = row.supportOrigin === 'LEGACY_UNKNOWN';
    const route = await this.routing(tx, actorId), current = row.handoffs[0];
    const routed = current && route.available && current.assignmentId === route.assignment?.id;
    const pending = routed && current.state === 'PENDING' && row.status === 'PENDING_HANDOFF';
    const transferred = routed && current.state === 'ACCEPTED' && row.status === 'STAFF_ACTIVE';
    const capability = review ? null : await this.access.requireCustomer(tx, actorId, id);
    return { id: row.id, subject: row.subject || 'Cuộc trò chuyện', status: row.status, controlVersion: row.controlVersion,
      entryType: review ? 'LEGACY_REVIEW' : pending ? 'REQUEST' : transferred ? 'TRANSFERRED' : row.supportOrigin === 'DIRECT' ? 'DIRECT' : 'AI',
      availability: review ? 'REVIEW_REQUIRED' : 'AVAILABLE',
      staff: capability?.canSend && row.status !== 'AI_ACTIVE' && route.available ? { fullName: route.assignment!.staff.fullName } : null,
      ...(current ? { request: { id: current.id, state: current.state, requestedAt: current.confirmedAt.toISOString(),
        acceptedAt: current.acceptedAt?.toISOString() ?? null, revokedAt: current.revokedAt?.toISOString() ?? null } } : {}),
      allowedActions: { readMessages: !review, send: !!capability?.canSend,
        requestStaff: !review && route.available && row.status === 'AI_ACTIVE' } };
  }
  detail(request: ConversationRequest, id: string) {
    return this.session.read(request, 'CUSTOMER', async (tx, actorId) => ({ conversation: await this.customerMetadata(tx, actorId, id) }));
  }
  list(request: ConversationRequest, query: CustomerConversationsQuery) {
    return this.session.read(request, 'CUSTOMER', async (tx, actorId) => {
      const scope = inboxCursorScope(actorId, 'customer-conversations', 'own');
      const boundary = decodeInboxCursor(query.cursor, scope);
      const rows = await tx.$queryRaw<Array<{ id: string; subject: string | null; status: string; support_origin: string;
        activity_at: Date; state: string | null }>>`WITH owned AS (
        SELECT c.id,c.subject,c.status,c.support_origin,h.state,
          GREATEST(c.last_customer_facing_activity_at,c.created_at,h.confirmed_at,h.accepted_at,h.revoked_at) AS activity_at
        FROM business.conversations c LEFT JOIN LATERAL (
          SELECT state,confirmed_at,accepted_at,revoked_at FROM business.conversation_handoffs
          WHERE conversation_id=c.id ORDER BY confirmed_at DESC,id DESC LIMIT 1
        ) h ON TRUE WHERE c.customer_id=${actorId}::uuid AND c.channel_type='CUSTOMER_SUPPORT'
      ) SELECT * FROM owned ${boundary ? Prisma.sql`WHERE (activity_at,id)<(${new Date(boundary.at)}::timestamptz,${boundary.id}::uuid)` : Prisma.empty}
      ORDER BY activity_at DESC,id DESC LIMIT ${query.limit + 1}`;
      const visible = rows.slice(0, query.limit), hasMore = rows.length > query.limit, last = visible.at(-1);
      return { items: visible.map(row => ({ id: row.id, subject: row.subject || 'Cuộc trò chuyện', status: row.status,
        activityAt: row.activity_at.toISOString(), entryType: row.support_origin === 'LEGACY_UNKNOWN' ? 'LEGACY_REVIEW'
          : row.state === 'PENDING' && row.status === 'PENDING_HANDOFF' ? 'REQUEST'
          : row.state === 'ACCEPTED' && row.status === 'STAFF_ACTIVE' ? 'TRANSFERRED' : row.support_origin })),
        pageInfo: { hasMore, nextCursor: hasMore && last ? encodeInboxCursor(scope, last.activity_at, last.id) : null } };
    });
  }
  reconcile(request: ConversationRequest, key: string, query: CustomerCommandQuery) {
    return this.session.read(request, 'CUSTOMER', async (tx, actorId) => {
      const receipt = await tx.conversationCommandReceipt.findUnique({ where: { actorId_operation_clientRequestId: {
        actorId, operation: query.operation, clientRequestId: key } } });
      if (!receipt) throw new NotFoundException();
      const handoff = query.operation === 'REQUEST_HANDOFF'
        ? await tx.conversationHandoff.findFirst({ where: { id: receipt.resourceId, customerId: actorId }, select: { conversationId: true } }) : null;
      if (query.operation === 'REQUEST_HANDOFF' && !handoff) throw new NotFoundException();
      const id = handoff?.conversationId ?? receipt.resourceId;
      const conversation = await this.customerMetadata(tx, actorId, id);
      return { state: 'COMMITTED', resourceId: receipt.resourceId, conversationId: id, controlVersion: conversation.controlVersion };
    }, true);
  }
}
