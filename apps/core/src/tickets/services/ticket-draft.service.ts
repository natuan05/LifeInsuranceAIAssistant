import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { AuthService } from '../../auth/services/auth.service';
import { DatabaseService } from '../../database/database.service';
import type { Prisma } from '../../generated/prisma/client';
import { ConversationCommandService } from '../../conversations/services/conversation-command.service';
import { SafeApiException } from '../../http/safe-api.exception';
import type { CreateTicketDraftDto } from '../dto/create-ticket-draft.dto';
import type { UpdateTicketDraftDto } from '../dto/update-ticket-draft.dto';
import { ticketContent, ticketHash, ticketConfirmation } from '../dto/ticket-content';
import { consumeCustomerTicketQuota } from './ticket-rate-limit';
const include = { policy: { select: { id: true, policyNumber: true } } } as const;
type Draft = Prisma.TicketDraftGetPayload<{ include: typeof include }>;
function view(draft: Draft) {
  return { draft: { id: draft.id, conversationId: draft.conversationId, version: draft.version, state: draft.state,
    title: draft.title, description: draft.description, policyId: draft.policyId, policyNumber: draft.policy?.policyNumber ?? null,
    expiresAt: draft.expiresAt.toISOString(), createdAt: draft.createdAt.toISOString() }, confirmation: ticketConfirmation };
}
@Injectable()
export class TicketDraftService {
  constructor(private readonly database: DatabaseService, private readonly auth: AuthService,
    private readonly commands: ConversationCommandService) {}
  private async customer<T>(request: IncomingMessage, write: boolean, conversationId: string | null,
    work: (tx: Prisma.TransactionClient, actorId: string) => Promise<T>) {
    const initial = write ? await this.auth.authorizeWrite(request, this.database.prisma) : await this.auth.me(request);
    if (initial.actor.role !== 'CUSTOMER') throw new ForbiddenException();
    await consumeCustomerTicketQuota(this.database.prisma, initial.actor.id, write);
    const run = async (tx: Prisma.TransactionClient) => {
      if (write) {
        if (conversationId) {
          if (!await tx.conversation.findFirst({ where: { id: conversationId, customerId: initial.actor.id }, select: { id: true } })) throw new NotFoundException();
          await this.commands.lock(tx, initial.actor.id, conversationId);
        } else await this.commands.lockCustomer(tx, initial.actor.id, initial.actor.id);
      }
      const { actor } = write ? await this.auth.authorizeWrite(request, tx) : await this.auth.me(request, tx);
      if (actor.role !== 'CUSTOMER' || actor.id !== initial.actor.id) throw new ForbiddenException();
      return work(tx, actor.id);
    };
    return write ? this.commands.transaction(run) : this.database.prisma.$transaction(run, { isolationLevel: 'RepeatableRead' });
  }
  private async policy(tx: Prisma.TransactionClient, actorId: string, policyId: string | null) {
    if (policyId && !await tx.insurancePolicy.findFirst({ where: { id: policyId, customerId: actorId }, select: { id: true } })) throw new NotFoundException();
  }
  proposeDraft(request: IncomingMessage, conversationId: string | null, dto: CreateTicketDraftDto) {
    const content = ticketContent(dto);
    return this.customer(request, true, conversationId, async (tx, actorId) => {
      await this.policy(tx, actorId, content.policyId);
      return view(await tx.ticketDraft.create({ data: { customerId: actorId, conversationId, ...content,
        payloadHash: ticketHash(content), expiresAt: new Date(Date.now() + 30 * 60000) }, include }));
    });
  }
  getDraft(request: IncomingMessage, conversationId: string, draftId: string) {
    return this.customer(request, false, conversationId, async (tx, actorId) => {
      const draft = await tx.ticketDraft.findFirst({ where: { id: draftId, customerId: actorId, conversationId }, include });
      if (!draft) throw new NotFoundException();
      if (draft.state === 'EXPIRED' || (draft.state === 'DRAFT' && draft.expiresAt <= new Date())) throw new SafeApiException('DRAFT_EXPIRED');
      return view(draft);
    });
  }
  updateDraft(request: IncomingMessage, conversationId: string, draftId: string, dto: UpdateTicketDraftDto) {
    const content = ticketContent(dto);
    return this.customer(request, true, conversationId, async (tx, actorId) => {
      await tx.$queryRaw`SELECT id FROM business.ticket_drafts WHERE id=${draftId}::uuid AND customer_id=${actorId}::uuid FOR UPDATE`;
      const draft = await tx.ticketDraft.findFirst({ where: { id: draftId, customerId: actorId, conversationId } });
      if (!draft) throw new NotFoundException();
      if (draft.state !== 'DRAFT') throw new SafeApiException('DRAFT_NOT_EDITABLE');
      if (draft.expiresAt <= new Date()) throw new SafeApiException('DRAFT_EXPIRED');
      if (draft.version !== dto.expectedVersion) throw new SafeApiException('STALE_DRAFT');
      await this.policy(tx, actorId, content.policyId);
      const changed = await tx.ticketDraft.updateMany({ where: { id: draftId, customerId: actorId, conversationId,
        state: 'DRAFT', version: dto.expectedVersion, expiresAt: { gt: new Date() } },
        data: { ...content, payloadHash: ticketHash(content), version: { increment: 1 } } });
      if (changed.count !== 1) throw new SafeApiException('STALE_DRAFT');
      return view(await tx.ticketDraft.findUniqueOrThrow({ where: { id: draftId }, include }));
    });
  }
}
