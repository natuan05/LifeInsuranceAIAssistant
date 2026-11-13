import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { SafeApiException } from '../../http/safe-api.exception';
import type { CreateTicketDraftDto } from '../dto/create-ticket-draft.dto';
import type { UpdateTicketDraftDto } from '../dto/update-ticket-draft.dto';

const DRAFT_TTL_MS = 30 * 60 * 1000; // 30 minutes

function computeHash(title: string, description: string, policyId?: string | null): string {
  return createHash('sha256')
    .update(JSON.stringify({ title, description, policyId: policyId ?? null }))
    .digest('hex');
}

@Injectable()
export class TicketDraftService {
  constructor(private readonly database: DatabaseService) {}

  async proposeDraft(
    actorId: string,
    conversationId: string | null,
    dto: CreateTicketDraftDto,
  ) {
    if (dto.policyId) {
      const policy = await this.database.prisma.insurancePolicy.findUnique({
        where: { id: dto.policyId },
        select: { customerId: true },
      });
      if (!policy || policy.customerId !== actorId) {
        throw new NotFoundException('Policy not found or not owned by customer');
      }
    }

    if (conversationId) {
      const conv = await this.database.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { customerId: true },
      });
      if (!conv || conv.customerId !== actorId) {
        throw new NotFoundException('Conversation not found or not owned by customer');
      }
    }

    const expiresAt = new Date(Date.now() + DRAFT_TTL_MS);
    const hash = computeHash(dto.title, dto.description, dto.policyId);

    const draft = await this.database.prisma.ticketDraft.create({
      data: {
        customerId: actorId,
        conversationId,
        version: 1,
        title: dto.title.trim(),
        description: dto.description.trim(),
        policyId: dto.policyId ?? null,
        state: 'DRAFT',
        payloadHash: hash,
        expiresAt,
      },
      include: {
        policy: { select: { id: true, policyNumber: true } },
      },
    });

    return {
      draft: {
        id: draft.id,
        conversationId: draft.conversationId,
        version: draft.version,
        state: draft.state,
        title: draft.title,
        description: draft.description,
        policyId: draft.policyId,
        policyNumber: draft.policy?.policyNumber ?? null,
        expiresAt: draft.expiresAt.toISOString(),
        createdAt: draft.createdAt.toISOString(),
      },
      confirmation: {
        textVersion: 'ticket-v1',
        text: 'Tôi xác nhận yêu cầu hỗ trợ với nội dung trên.',
      },
    };
  }

  async getDraft(actorId: string, conversationId: string, draftId: string) {
    const draft = await this.database.prisma.ticketDraft.findFirst({
      where: {
        id: draftId,
        customerId: actorId,
        conversationId,
      },
      include: {
        policy: { select: { id: true, policyNumber: true } },
      },
    });

    if (!draft) {
      throw new NotFoundException('Draft not found');
    }

    const now = new Date();
    if (draft.state === 'DRAFT' && draft.expiresAt < now) {
      await this.database.prisma.ticketDraft.update({
        where: { id: draft.id },
        data: { state: 'EXPIRED' },
      });
      throw new SafeApiException('DRAFT_EXPIRED');
    }

    return {
      draft: {
        id: draft.id,
        conversationId: draft.conversationId,
        version: draft.version,
        state: draft.state,
        title: draft.title,
        description: draft.description,
        policyId: draft.policyId,
        policyNumber: draft.policy?.policyNumber ?? null,
        expiresAt: draft.expiresAt.toISOString(),
        createdAt: draft.createdAt.toISOString(),
      },
      confirmation: {
        textVersion: 'ticket-v1',
        text: 'Tôi xác nhận yêu cầu hỗ trợ với nội dung trên.',
      },
    };
  }

  async updateDraft(
    actorId: string,
    conversationId: string,
    draftId: string,
    dto: UpdateTicketDraftDto,
  ) {
    return this.database.prisma.$transaction(async (tx) => {
      const draft = await tx.ticketDraft.findFirst({
        where: {
          id: draftId,
          customerId: actorId,
          conversationId,
        },
      });

      if (!draft) {
        throw new NotFoundException('Draft not found');
      }

      if (draft.state !== 'DRAFT') {
        throw new SafeApiException('DRAFT_NOT_EDITABLE');
      }

      const now = new Date();
      if (draft.expiresAt < now) {
        await tx.ticketDraft.update({
          where: { id: draft.id },
          data: { state: 'EXPIRED' },
        });
        throw new SafeApiException('DRAFT_EXPIRED');
      }

      if (draft.version !== dto.expectedVersion) {
        throw new SafeApiException('STALE_DRAFT');
      }

      if (dto.policyId && dto.policyId !== draft.policyId) {
        const policy = await tx.insurancePolicy.findUnique({
          where: { id: dto.policyId },
          select: { customerId: true },
        });
        if (!policy || policy.customerId !== actorId) {
          throw new NotFoundException('Policy not found or not owned by customer');
        }
      }

      const newHash = computeHash(dto.title, dto.description, dto.policyId);

      const updated = await tx.ticketDraft.update({
        where: { id: draft.id },
        data: {
          title: dto.title.trim(),
          description: dto.description.trim(),
          policyId: dto.policyId ?? null,
          version: { increment: 1 },
          payloadHash: newHash,
          updatedAt: new Date(),
        },
        include: {
          policy: { select: { id: true, policyNumber: true } },
        },
      });

      return {
        draft: {
          id: updated.id,
          conversationId: updated.conversationId,
          version: updated.version,
          state: updated.state,
          title: updated.title,
          description: updated.description,
          policyId: updated.policyId,
          policyNumber: updated.policy?.policyNumber ?? null,
          expiresAt: updated.expiresAt.toISOString(),
          createdAt: updated.createdAt.toISOString(),
        },
        confirmation: {
          textVersion: 'ticket-v1',
          text: 'Tôi xác nhận yêu cầu hỗ trợ với nội dung trên.',
        },
      };
    });
  }
}
