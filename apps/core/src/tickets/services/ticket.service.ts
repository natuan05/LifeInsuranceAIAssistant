import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { AuthService } from '../../auth/services/auth.service';
import { DatabaseService } from '../../database/database.service';
import { Prisma } from '../../generated/prisma/client';
import { ConversationAccessService } from '../../conversations/services/conversation-access.service';
import type { TicketQuery } from '../dto/ticket-query.dto';
import { legacyTicketConfirmation } from '../dto/ticket-confirmation';
import { TicketAccessService } from './ticket-access.service';
import { TicketCursorService } from './ticket-cursor.service';
import { consumeTicketReadQuota } from './ticket-rate-limit';
import { ConversationCommandService } from '../../conversations/services/conversation-command.service';
import { SafeApiException } from '../../http/safe-api.exception';
import { randomUUID } from 'node:crypto';

import type { ConfirmTicketDto } from '../dto/confirm-ticket.dto';
import type { CreateManualTicketDto } from '../dto/create-manual-ticket.dto';

const customerSelect = { userId: true, fullName: true, user: { select: { accountCode: true } } } satisfies Prisma.CustomerProfileSelect;
const listSelect = { id: true, ticketCode: true, title: true, status: true, createdAt: true,
  customer: { select: customerSelect } } satisfies Prisma.SupportTicketSelect;
const customerDto = (customer: Prisma.CustomerProfileGetPayload<{ select: typeof customerSelect }>) =>
  ({ id: customer.userId, fullName: customer.fullName, accountCode: customer.user.accountCode });

@Injectable()
export class TicketService {
  private transitions(status: string): string[] { return ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].filter(value => value !== status); }
  constructor(private readonly database: DatabaseService, private readonly auth: AuthService,
    private readonly access: TicketAccessService, private readonly cursors: TicketCursorService,
    private readonly conversations: ConversationAccessService, private readonly commands: ConversationCommandService) {}

  private async read<T>(request: IncomingMessage, work: (tx: Prisma.TransactionClient, actorId: string) => Promise<T>) {
    const { actor } = await this.auth.me(request);
    if (actor.role !== 'STAFF') throw new ForbiddenException();
    await consumeTicketReadQuota(this.database.prisma, actor.id);
    return this.database.prisma.$transaction(async tx => {
      const current = await this.auth.me(request, tx);
      if (current.actor.id !== actor.id || current.actor.role !== 'STAFF') throw new UnauthorizedException();
      return work(tx, actor.id);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 });
  }

  list(request: IncomingMessage, query: TicketQuery) {
    return this.read(request, async (tx, actorId) => {
      if (query.customerId && !await tx.staffAssignment.findFirst({ where: { staffId: actorId,
        customerId: query.customerId, isActive: true }, select: { id: true } })) throw new NotFoundException();
      const scope = this.cursors.scope(actorId, query), boundary = this.cursors.decode(query.cursor, scope);
      const term = query.search?.replace(/[\\%_]/g, '\\$&');
      const contains = { contains: term, mode: 'insensitive' as const };
      const where: Prisma.SupportTicketWhereInput = { AND: [this.access.staffScope(actorId),
        ...(query.status ? [{ status: query.status }] : []),
        ...(query.customerId ? [{ customerId: query.customerId }] : []),
        ...(term ? [{ OR: [{ ticketCode: contains }, { customer: { fullName: contains } },
          { customer: { user: { accountCode: contains } } }] }] : []),
        ...(boundary ? [{ OR: [{ createdAt: { lt: boundary.at } }, { createdAt: boundary.at, id: { lt: boundary.id } }] }] : [])] };
      const rows = await tx.supportTicket.findMany({ where, select: listSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1 });
      const hasMore = rows.length > query.limit, visible = rows.slice(0, query.limit), last = visible.at(-1);
      return { items: visible.map(row => ({ id: row.id, ticketCode: row.ticketCode, title: row.title,
        status: row.status, createdAt: row.createdAt.toISOString(), customer: customerDto(row.customer) })),
        pageInfo: { hasMore, nextCursor: hasMore && last ? this.cursors.encode(scope, last.createdAt, last.id) : null } };
    });
  }

  detail(request: IncomingMessage, id: string) {
    return this.read(request, (tx, actorId) => this.projectDetail(tx, actorId, id));
  }

  accept(request: IncomingMessage & { requestId?: string }, id: string, expectedVersion: number) {
    return this.changeStatus(request, id, expectedVersion, 'IN_PROGRESS', true);
  }

  updateStatus(request: IncomingMessage & { requestId?: string }, id: string, expectedVersion: number, status: 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED') {
    return this.changeStatus(request, id, expectedVersion, status);
  }

  private async changeStatus(request: IncomingMessage & { requestId?: string }, id: string, expectedVersion: number, target: 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED', legacyAccept = false) {
    const { actor } = await this.auth.authorizeWrite(request, this.database.prisma);
    if (actor.role !== 'STAFF') throw new ForbiddenException();
    await consumeTicketReadQuota(this.database.prisma, actor.id, true);
    return this.commands.transaction(async tx => {
      const discovered = await tx.supportTicket.findUnique({ where: { id }, select: { customerId: true } });
      if (!discovered) throw new NotFoundException();
      // Same sorted-user/customer/assignment lock order as assignment writes and
      // chat commands. Ticket is last; this command never locks/mutates chat.
      await this.commands.lockCustomer(tx, actor.id, discovered.customerId);
      await tx.$queryRaw`SELECT id FROM business.support_tickets WHERE id=${id}::uuid FOR UPDATE`;
      const current = await this.auth.authorizeWrite(request, tx);
      if (current.actor.id !== actor.id || current.actor.role !== 'STAFF') throw new UnauthorizedException();
      const ticket = await this.access.requireTicket(tx, actor.id, id);
      if (ticket.customerId !== discovered.customerId) throw new NotFoundException();
      // State reconciliation, not a cached receipt: current authority is required
      // even for retries after an unknown network outcome.
      if (ticket.status === target) return this.projectDetail(tx, actor.id, id);
      const isAccept = legacyAccept ? (ticket.status === 'ASSIGNED' || ticket.status === 'OPEN') : this.transitions(ticket.status).includes(target);
      if (!isAccept || ticket.version !== expectedVersion) throw new SafeApiException('STALE_TICKET');
      const changed = await tx.supportTicket.updateMany({ where: { id, version: expectedVersion, status: ticket.status, assignedStaffId: actor.id },
        data: { status: target, version: { increment: 1 } } });
      if (changed.count !== 1) throw new SafeApiException('STALE_TICKET');
      const actionName = (ticket.status === 'ASSIGNED' || ticket.status === 'OPEN') && target === 'IN_PROGRESS' ? 'TICKET_ACCEPTED' : 'TICKET_STATUS_CHANGED';
      await tx.auditLog.create({ data: { actorType: 'USER', actorId: actor.id, actorRole: 'STAFF', action: actionName,
        targetType: 'SupportTicket', targetId: id, outcome: 'SUCCESS', requestId: request.requestId ?? randomUUID(),
        metadata: { previousVersion: expectedVersion, version: expectedVersion + 1, previousStatus: ticket.status, status: target } } });
      await tx.outboxEvent.create({ data: { aggregateType: 'TICKET', aggregateId: id, eventType: actionName,
        payload: { schemaVersion: 1, version: expectedVersion + 1 } } });
      return this.projectDetail(tx, actor.id, id);
    });
  }

  private async projectDetail(tx: Prisma.TransactionClient, actorId: string, id: string) {
      const ticket = await tx.supportTicket.findFirst({ where: { id, AND: [this.access.staffScope(actorId)] },
        select: { ...listSelect, customerId: true, conversationId: true, version: true, confirmedAt: true, aiSummary: true,
          policy: { select: { id: true, policyNumber: true, customerId: true } } } });
      if (!ticket) throw new NotFoundException();
      // FK legacy data may link another customer's conversation. Never use the
      // Ticket relationship or recipient as authority to reveal that resource.
      const conversation = ticket.conversationId ? await tx.conversation.findFirst({ where: {
        id: ticket.conversationId, customerId: ticket.customerId, AND: [this.conversations.staffScope(actorId)] },
        select: { id: true, status: true } }) : null;
      return { ticket: { id: ticket.id, ticketCode: ticket.ticketCode, title: ticket.title, status: ticket.status,
        version: ticket.version, customer: customerDto(ticket.customer), policy: ticket.policy?.customerId === ticket.customerId
          ? { id: ticket.policy.id, policyNumber: ticket.policy.policyNumber } : null,
        createdAt: ticket.createdAt.toISOString(), confirmedAt: ticket.confirmedAt.toISOString(),
        ...legacyTicketConfirmation(), aiSummary: ticket.aiSummary, allowedActions: { accept: ticket.status === 'ASSIGNED' || ticket.status === 'OPEN', transitions: this.transitions(ticket.status) },
        chatLink: conversation ? { conversationId: conversation.id,
          capability: conversation.status === 'PENDING_HANDOFF' ? 'REQUEST_METADATA' : 'TRANSCRIPT',
          href: `/staff/inbox/${conversation.id}?filter=${conversation.status === 'PENDING_HANDOFF' ? 'requests' : 'active'}` } : null } };
  }

  async customerConfirm(request: IncomingMessage & { requestId?: string }, dto: ConfirmTicketDto) {
    const { actor } = await this.auth.authorizeWrite(request, this.database.prisma);
    if (actor.role !== 'CUSTOMER') throw new ForbiddenException();

    return this.commands.transaction(async (tx) => {
      // 1. Idempotency check
      const existing = await tx.supportTicket.findUnique({
        where: { idempotencyKey: dto.clientRequestId },
        select: { id: true, ticketCode: true, status: true, confirmedAt: true, customerId: true },
      });
      if (existing) {
        if (existing.customerId !== actor.id) throw new ForbiddenException();
        return {
          ticket: {
            id: existing.id,
            ticketCode: existing.ticketCode,
            status: existing.status,
            confirmedAt: existing.confirmedAt.toISOString(),
          },
          replayed: true,
        };
      }

      // 2. Draft check and lock
      const draft = await tx.ticketDraft.findFirst({
        where: {
          id: dto.draftId,
          customerId: actor.id,
        },
      });
      if (!draft) throw new NotFoundException('Ticket draft not found');

      if (draft.state !== 'DRAFT') {
        throw new SafeApiException('DRAFT_ALREADY_CONFIRMED');
      }

      const now = new Date();
      if (draft.expiresAt < now) {
        await tx.ticketDraft.update({ where: { id: draft.id }, data: { state: 'EXPIRED' } });
        throw new SafeApiException('DRAFT_EXPIRED');
      }

      if (draft.version !== dto.expectedDraftVersion) {
        throw new SafeApiException('STALE_DRAFT');
      }

      // 3. Find active assignment if any
      const assignment = await tx.staffAssignment.findFirst({
        where: { customerId: actor.id, isActive: true },
        select: { staffId: true },
      });

      // 4. Generate unique ticketCode
      let ticketCode = `TK-${Math.floor(1000 + Math.random() * 9000)}`;
      while (await tx.supportTicket.findUnique({ where: { ticketCode }, select: { id: true } })) {
        ticketCode = `TK-${Math.floor(1000 + Math.random() * 9000)}`;
      }

      const confirmedContent = {
        title: draft.title,
        description: draft.description,
        policyId: draft.policyId,
        textVersion: dto.confirmation.textVersion,
        confirmedAt: now.toISOString(),
      };

      // 5. Create Ticket with status OPEN
      const ticket = await tx.supportTicket.create({
        data: {
          ticketCode,
          customerId: actor.id,
          conversationId: draft.conversationId,
          policyId: draft.policyId,
          title: draft.title,
          aiSummary: draft.description,
          confirmedContent,
          sourceDraftId: draft.id,
          status: 'OPEN',
          assignedStaffId: assignment?.staffId ?? null,
          version: 0,
          idempotencyKey: dto.clientRequestId,
          confirmedAt: now,
        },
      });

      // 6. Update draft state
      await tx.ticketDraft.update({
        where: { id: draft.id },
        data: { state: 'CONFIRMED' },
      });

      // 7. Audit log & Outbox event
      await tx.auditLog.create({
        data: {
          actorType: 'USER',
          actorId: actor.id,
          actorRole: 'CUSTOMER',
          action: 'TICKET_CREATED',
          targetType: 'SupportTicket',
          targetId: ticket.id,
          outcome: 'SUCCESS',
          requestId: request.requestId ?? randomUUID(),
          metadata: { ticketCode: ticket.ticketCode, draftId: draft.id, status: 'OPEN' },
        },
      });

      await tx.outboxEvent.create({
        data: {
          aggregateType: 'TICKET',
          aggregateId: ticket.id,
          eventType: 'TICKET_CREATED',
          payload: {
            schemaVersion: 1,
            ticketId: ticket.id,
            customerId: actor.id,
            assignedStaffId: ticket.assignedStaffId,
            status: 'OPEN',
          },
        },
      });

      return {
        ticket: {
          id: ticket.id,
          ticketCode: ticket.ticketCode,
          status: ticket.status,
          confirmedAt: ticket.confirmedAt.toISOString(),
        },
        replayed: false,
      };
    });
  }

  async customerCreateManual(request: IncomingMessage & { requestId?: string }, dto: CreateManualTicketDto) {
    const { actor } = await this.auth.authorizeWrite(request, this.database.prisma);
    if (actor.role !== 'CUSTOMER') throw new ForbiddenException();

    return this.commands.transaction(async (tx) => {
      // 1. Idempotency check
      const existing = await tx.supportTicket.findUnique({
        where: { idempotencyKey: dto.clientRequestId },
        select: { id: true, ticketCode: true, status: true, createdAt: true, customerId: true },
      });
      if (existing) {
        if (existing.customerId !== actor.id) throw new ForbiddenException();
        return {
          ticket: {
            id: existing.id,
            ticketCode: existing.ticketCode,
            status: existing.status,
            createdAt: existing.createdAt.toISOString(),
          },
          replayed: true,
        };
      }

      // 2. Validate policy if provided
      if (dto.policyId) {
        const policy = await tx.insurancePolicy.findUnique({
          where: { id: dto.policyId },
          select: { customerId: true },
        });
        if (!policy || policy.customerId !== actor.id) {
          throw new NotFoundException('Policy not found or not owned by customer');
        }
      }

      // 3. Find active assignment if any
      const assignment = await tx.staffAssignment.findFirst({
        where: { customerId: actor.id, isActive: true },
        select: { staffId: true },
      });

      // 4. Generate unique ticketCode
      let ticketCode = `TK-${Math.floor(1000 + Math.random() * 9000)}`;
      while (await tx.supportTicket.findUnique({ where: { ticketCode }, select: { id: true } })) {
        ticketCode = `TK-${Math.floor(1000 + Math.random() * 9000)}`;
      }

      const now = new Date();
      const confirmedContent = {
        title: dto.title.trim(),
        description: dto.description.trim(),
        policyId: dto.policyId ?? null,
        manual: true,
        confirmedAt: now.toISOString(),
      };

      // 5. Create Ticket with status OPEN
      const ticket = await tx.supportTicket.create({
        data: {
          ticketCode,
          customerId: actor.id,
          policyId: dto.policyId ?? null,
          title: dto.title.trim(),
          aiSummary: dto.description.trim(),
          confirmedContent,
          status: 'OPEN',
          assignedStaffId: assignment?.staffId ?? null,
          version: 0,
          idempotencyKey: dto.clientRequestId,
          confirmedAt: now,
        },
      });

      // 6. Audit log & Outbox event
      await tx.auditLog.create({
        data: {
          actorType: 'USER',
          actorId: actor.id,
          actorRole: 'CUSTOMER',
          action: 'TICKET_CREATED',
          targetType: 'SupportTicket',
          targetId: ticket.id,
          outcome: 'SUCCESS',
          requestId: request.requestId ?? randomUUID(),
          metadata: { ticketCode: ticket.ticketCode, manual: true, status: 'OPEN' },
        },
      });

      await tx.outboxEvent.create({
        data: {
          aggregateType: 'TICKET',
          aggregateId: ticket.id,
          eventType: 'TICKET_CREATED',
          payload: {
            schemaVersion: 1,
            ticketId: ticket.id,
            customerId: actor.id,
            assignedStaffId: ticket.assignedStaffId,
            status: 'OPEN',
          },
        },
      });

      return {
        ticket: {
          id: ticket.id,
          ticketCode: ticket.ticketCode,
          status: ticket.status,
          createdAt: ticket.createdAt.toISOString(),
        },
        replayed: false,
      };
    });
  }

  async customerList(request: IncomingMessage, query: { status?: string; search?: string; page?: number; pageSize?: number }) {
    const { actor } = await this.auth.me(request);
    if (actor.role !== 'CUSTOMER') throw new ForbiddenException();

    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, query.pageSize ?? 10));
    const skip = (page - 1) * pageSize;

    const term = query.search?.replace(/[\\%_]/g, '\\$&');
    const contains = { contains: term, mode: 'insensitive' as const };

    const where: Prisma.SupportTicketWhereInput = {
      customerId: actor.id,
      ...(query.status ? { status: query.status as any } : {}),
      ...(term ? { OR: [{ ticketCode: contains }, { title: contains }] } : {}),
    };

    const [items, total] = await Promise.all([
      this.database.prisma.supportTicket.findMany({
        where,
        select: {
          id: true,
          ticketCode: true,
          title: true,
          status: true,
          createdAt: true,
          confirmedAt: true,
          policy: { select: { policyNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.database.prisma.supportTicket.count({ where }),
    ]);

    return {
      items: items.map((t) => ({
        id: t.id,
        ticketCode: t.ticketCode,
        title: t.title,
        status: t.status,
        policyNumber: t.policy?.policyNumber ?? null,
        createdAt: t.createdAt.toISOString(),
        confirmedAt: t.confirmedAt?.toISOString() ?? null,
      })),
      total,
      page,
      pageSize,
    };
  }

  async customerDetail(request: IncomingMessage, ticketId: string) {
    const { actor } = await this.auth.me(request);
    if (actor.role !== 'CUSTOMER') throw new ForbiddenException();

    const ticket = await this.database.prisma.supportTicket.findFirst({
      where: { id: ticketId, customerId: actor.id },
      include: {
        policy: { select: { id: true, policyNumber: true } },
        staff: {
          select: {
            userId: true,
            fullName: true,
            department: true,
          },
        },
      },
    });

    if (!ticket) throw new NotFoundException('Ticket not found');

    return {
      ticket: {
        id: ticket.id,
        ticketCode: ticket.ticketCode,
        title: ticket.title,
        status: ticket.status,
        version: ticket.version,
        policyId: ticket.policyId,
        policyNumber: ticket.policy?.policyNumber ?? null,
        conversationId: ticket.conversationId,
        confirmedContent: ticket.confirmedContent as Record<string, unknown> | null,
        assignedStaff: ticket.staff
          ? {
              id: ticket.staff.userId,
              fullName: ticket.staff.fullName,
              department: ticket.staff.department,
            }
          : null,
        createdAt: ticket.createdAt.toISOString(),
        confirmedAt: ticket.confirmedAt?.toISOString() ?? null,
      },
    };
  }

  async customerReceipt(request: IncomingMessage, clientRequestId: string) {
    const { actor } = await this.auth.me(request);
    if (actor.role !== 'CUSTOMER') throw new ForbiddenException();

    const ticket = await this.database.prisma.supportTicket.findUnique({
      where: { idempotencyKey: clientRequestId },
      select: { id: true, ticketCode: true, status: true, customerId: true, confirmedAt: true },
    });

    if (!ticket || ticket.customerId !== actor.id) {
      throw new NotFoundException();
    }

    return {
      ticket: {
        id: ticket.id,
        ticketCode: ticket.ticketCode,
        status: ticket.status,
        confirmedAt: ticket.confirmedAt.toISOString(),
      },
      replayed: true,
    };
  }
}
