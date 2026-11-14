import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { AuthService } from '../../auth/services/auth.service';
import { DatabaseService } from '../../database/database.service';
import { Prisma } from '../../generated/prisma/client';
import { ConversationAccessService } from '../../conversations/services/conversation-access.service';
import type { TicketQuery } from '../dto/ticket-query.dto';
import { projectTicketConfirmation } from '../dto/ticket-confirmation';
import { TicketAccessService } from './ticket-access.service';
import { TicketCursorService } from './ticket-cursor.service';
import { consumeTicketReadQuota, consumeCustomerTicketQuota } from './ticket-rate-limit';
import { ConversationCommandService } from '../../conversations/services/conversation-command.service';
import { SafeApiException } from '../../http/safe-api.exception';
import { randomUUID } from 'node:crypto';

import type { CustomerTicketQuery } from '../dto/customer-ticket-query.dto';
import { ticketContent, ticketHash, ticketConfirmation } from '../dto/ticket-content';
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
        select: { ...listSelect, customerId: true, conversationId: true, version: true, confirmedAt: true, aiSummary: true, policyId: true, sourceDraftId: true, requestFingerprint: true, confirmedContent: true,
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
        ...projectTicketConfirmation(ticket), aiSummary: ticket.aiSummary, allowedActions: { accept: ticket.status === 'ASSIGNED' || ticket.status === 'OPEN', transitions: this.transitions(ticket.status) },
        chatLink: conversation ? { conversationId: conversation.id,
          capability: conversation.status === 'PENDING_HANDOFF' ? 'REQUEST_METADATA' : 'TRANSCRIPT',
          href: `/staff/inbox/${conversation.id}?filter=${conversation.status === 'PENDING_HANDOFF' ? 'requests' : 'active'}` } : null } };
  }


  private async customerRead<T>(request: IncomingMessage, work: (tx: Prisma.TransactionClient, actorId: string) => Promise<T>) {
    const { actor } = await this.auth.me(request);
    if (actor.role !== 'CUSTOMER') throw new ForbiddenException();
    await consumeCustomerTicketQuota(this.database.prisma, actor.id);
    return this.database.prisma.$transaction(async tx => {
      const current = await this.auth.me(request, tx);
      if (current.actor.role !== 'CUSTOMER' || current.actor.id !== actor.id) throw new ForbiddenException();
      return work(tx, actor.id);
    }, { isolationLevel: 'RepeatableRead', timeout: 15000 });
  }

  customerConfirm(request: IncomingMessage & { requestId?: string }, dto: ConfirmTicketDto) {
    if (dto.confirmation?.confirmed !== true || dto.confirmation.textVersion !== ticketConfirmation.textVersion || !Number.isInteger(dto.expectedDraftVersion) || dto.expectedDraftVersion < 1) throw new BadRequestException();
    return this.createCustomerTicket(request, dto, null);
  }
  customerCreateManual(request: IncomingMessage & { requestId?: string }, dto: CreateManualTicketDto) {
    return this.createCustomerTicket(request, dto, ticketContent(dto));
  }
  private async createCustomerTicket(request: IncomingMessage & { requestId?: string }, dto: ConfirmTicketDto | CreateManualTicketDto,
    manual: ReturnType<typeof ticketContent> | null) {
    const initial = await this.auth.authorizeWrite(request, this.database.prisma);
    if (initial.actor.role !== 'CUSTOMER') throw new ForbiddenException();
    await consumeCustomerTicketQuota(this.database.prisma, initial.actor.id, true);
    const actorId = initial.actor.id, confirm = manual ? null : dto as ConfirmTicketDto;
    const fingerprint = ticketHash({ actorId, operation: manual ? 'MANUAL' : 'CONFIRM', input: manual ?? {
      draftId: confirm!.draftId, expectedDraftVersion: confirm!.expectedDraftVersion, confirmed: true, textVersion: confirm!.confirmation.textVersion,
    } });
    // Only ticket-code collisions retry the entire transaction. Other conflicts
    // remain business errors; unique source_draft_id and idempotency_key stay intact.
    for (let attempt = 0; ; attempt++) {
      try { return await this.commands.transaction(async tx => {
        const discovered = confirm ? await tx.ticketDraft.findFirst({ where: { id: confirm.draftId, customerId: actorId }, select: { conversationId: true } }) : null;
        if (confirm && !discovered) throw new NotFoundException();
        if (discovered?.conversationId) {
          const conversation = await tx.conversation.findFirst({ where: { id: discovered.conversationId, customerId: actorId }, select: { id: true } });
          if (!conversation) throw new NotFoundException();
          await this.commands.lock(tx, actorId, conversation.id);
        } else await this.commands.lockCustomer(tx, actorId, actorId);
        const current = await this.auth.authorizeWrite(request, tx);
        if (current.actor.id !== actorId || current.actor.role !== 'CUSTOMER') throw new ForbiddenException();
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${'ticket:' + dto.clientRequestId},0))`;
        const existing = await tx.supportTicket.findUnique({ where: { idempotencyKey: dto.clientRequestId } });
        if (existing) {
          if (existing.customerId !== actorId) throw new NotFoundException();
          let matches = existing.requestFingerprint === fingerprint;
          if (!existing.requestFingerprint && manual && !existing.sourceDraftId) {
            const old = existing.confirmedContent as Record<string, unknown> | null;
            matches = old?.manual === true && old.title === manual.title && old.description === manual.description && old.policyId === manual.policyId;
          }
          if (!matches) throw new SafeApiException('IDEMPOTENCY_CONFLICT');
          return this.customerReceiptView(existing);
        }
        let draft: Prisma.TicketDraftGetPayload<Record<string, never>> | null = null;
        if (confirm) {
          await tx.$queryRaw`SELECT id FROM business.ticket_drafts WHERE id=${confirm.draftId}::uuid AND customer_id=${actorId}::uuid FOR UPDATE`;
          draft = await tx.ticketDraft.findFirst({ where: { id: confirm.draftId, customerId: actorId, conversationId: discovered!.conversationId } });
          if (!draft) throw new NotFoundException();
          if (draft.state === 'CONFIRMED') throw new SafeApiException('DRAFT_ALREADY_CONFIRMED');
          if (draft.state !== 'DRAFT') throw new SafeApiException(draft.state === 'EXPIRED' ? 'DRAFT_EXPIRED' : 'DRAFT_NOT_EDITABLE');
          if (draft.expiresAt <= new Date()) throw new SafeApiException('DRAFT_EXPIRED');
          if (draft.version !== confirm.expectedDraftVersion) throw new SafeApiException('STALE_DRAFT');
        }
        const content = manual ?? ticketContent(draft!);
        const policy = content.policyId ? await tx.insurancePolicy.findFirst({ where: { id: content.policyId, customerId: actorId }, select: { policyNumber: true } }) : null;
        if (content.policyId && !policy) throw new NotFoundException();
        const assignment = await tx.staffAssignment.findFirst({ where: { customerId: actorId, isActive: true }, select: { staffId: true } });
        const now = new Date(), contentHash = ticketHash(content);
        const snapshot = { schemaVersion: 1, source: manual ? 'CUSTOMER_SUBMITTED' : 'CUSTOMER_CONFIRMED', ...content,
          policyNumber: policy?.policyNumber ?? null, confirmedAt: now.toISOString(), contentHash,
          draftId: draft?.id ?? null, draftVersion: draft?.version ?? null, textVersion: confirm?.confirmation.textVersion ?? null };
        if (draft) {
          const consumed = await tx.ticketDraft.updateMany({ where: { id: draft.id, customerId: actorId, conversationId: draft.conversationId,
            state: 'DRAFT', version: confirm!.expectedDraftVersion, expiresAt: { gt: now } }, data: { state: 'CONFIRMED' } });
          if (consumed.count !== 1) throw new SafeApiException('STALE_DRAFT');
        }
        const ticket = await tx.supportTicket.create({ data: {
          ticketCode: 'TK-' + randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase(), customerId: actorId,
          conversationId: draft?.conversationId ?? null, policyId: content.policyId, title: content.title, aiSummary: content.description,
          confirmedContent: snapshot, sourceDraftId: draft?.id ?? null, status: 'OPEN', assignedStaffId: assignment?.staffId ?? null,
          version: 0, idempotencyKey: dto.clientRequestId, requestFingerprint: fingerprint, confirmedAt: now,
        } });
        await tx.auditLog.create({ data: { actorType: 'USER', actorId, actorRole: 'CUSTOMER', action: 'TICKET_CREATED',
          targetType: 'SupportTicket', targetId: ticket.id, outcome: 'SUCCESS', requestId: request.requestId ?? randomUUID(),
          metadata: { ticketCode: ticket.ticketCode, status: 'OPEN', ...(draft ? { draftId: draft.id } : { manual: true }) } } });
        await tx.outboxEvent.create({ data: { aggregateType: 'TICKET', aggregateId: ticket.id, eventType: 'TICKET_CREATED',
          payload: { schemaVersion: 1, ticketId: ticket.id, customerId: actorId, assignedStaffId: ticket.assignedStaffId, status: 'OPEN' } } });
        return { ...this.customerReceiptView(ticket), replayed: false };
      }); } catch (error) {
        const uniqueTarget = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
          ? JSON.stringify(error.meta?.target ?? error.meta) : '';
        // Keep the unique constraint as a final guard, including legacy rows
        // whose draft state was not consumed correctly by an older writer.
        if (/source_draft_id|sourceDraftId/.test(uniqueTarget)) throw new SafeApiException('DRAFT_ALREADY_CONFIRMED');
        if (/idempotency_key|idempotencyKey/.test(uniqueTarget)) throw new SafeApiException('IDEMPOTENCY_CONFLICT');
        const codeCollision = /ticket_code|ticketCode/.test(uniqueTarget);
        if (!codeCollision) throw error;
        if (attempt >= 2) throw new SafeApiException('TICKET_CODE_UNAVAILABLE');
      }
    }
  }
  private customerReceiptView(ticket: { id: string; ticketCode: string; status: string; confirmedAt: Date; createdAt: Date }) {
    return { ticket: { id: ticket.id, ticketCode: ticket.ticketCode, status: ticket.status, confirmedAt: ticket.confirmedAt.toISOString(), createdAt: ticket.createdAt.toISOString() }, replayed: true };
  }
  customerList(request: IncomingMessage, query: CustomerTicketQuery) {
    return this.customerRead(request, async (tx, actorId) => {
      const term = query.search?.replace(/[\\%_]/g, '\\$&'), contains = { contains: term, mode: 'insensitive' as const };
      const where: Prisma.SupportTicketWhereInput = { customerId: actorId, ...(query.status ? { status: query.status } : {}),
        ...(term ? { OR: [{ ticketCode: contains }, { title: contains }] } : {}) };
      const total = await tx.supportTicket.count({ where });
      const items = await tx.supportTicket.findMany({ where, select: { id: true, ticketCode: true, title: true, status: true,
        createdAt: true, confirmedAt: true, policy: { select: { policyNumber: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize });
      return { items: items.map(t => ({ id: t.id, ticketCode: t.ticketCode, title: t.title, status: t.status,
        policyNumber: t.policy?.policyNumber ?? null, createdAt: t.createdAt.toISOString(), confirmedAt: t.confirmedAt.toISOString() })), total, page: query.page, pageSize: query.pageSize };
    });
  }
  customerDetail(request: IncomingMessage, ticketId: string) {
    return this.customerRead(request, async (tx, actorId) => {
      const ticket = await tx.supportTicket.findFirst({ where: { id: ticketId, customerId: actorId }, include: {
        policy: { select: { id: true, policyNumber: true } }, staff: { select: { userId: true, fullName: true, department: true } },
      } });
      if (!ticket) throw new NotFoundException();
      return { ticket: { id: ticket.id, ticketCode: ticket.ticketCode, title: ticket.title, status: ticket.status, version: ticket.version,
        policyId: ticket.policyId, policyNumber: ticket.policy?.policyNumber ?? null, conversationId: ticket.conversationId,
        ...projectTicketConfirmation(ticket), assignedStaff: ticket.staff ? { id: ticket.staff.userId, fullName: ticket.staff.fullName, department: ticket.staff.department } : null,
        createdAt: ticket.createdAt.toISOString(), confirmedAt: ticket.confirmedAt.toISOString() } };
    });
  }
  customerReceipt(request: IncomingMessage, clientRequestId: string) {
    return this.customerRead(request, async (tx, actorId) => {
      const ticket = await tx.supportTicket.findFirst({ where: { idempotencyKey: clientRequestId, customerId: actorId } });
      if (!ticket) throw new NotFoundException();
      return this.customerReceiptView(ticket);
    });
  }
}
