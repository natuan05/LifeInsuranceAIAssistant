import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PolicyService } from '../../policies/services/policy.service';
import type { MessageQueryDto } from '../dto/message-query.dto';
import { ConversationAccessService } from './conversation-access.service';
import { ConversationSessionService, type ConversationRequest, type ConversationRole } from './conversation-session.service';
import { decodeMessageCursor, encodeMessageCursor } from './message-cursor';
const select = { id: true, sequence: true, senderType: true, content: true, createdAt: true, readAt: true, citations: true,
  sender: { select: { customerProfile: { select: { fullName: true } }, staffProfile: { select: { fullName: true } } } },
} satisfies Prisma.MessageSelect;
type Row = Prisma.MessageGetPayload<{ select: typeof select }>;
type Citation = { documentId: string; versionId: string; page: number; label: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ConversationTranscriptService {
  constructor(private readonly session: ConversationSessionService, private readonly access: ConversationAccessService,
    private readonly policies: PolicyService) {}
  messages(request: ConversationRequest, role: ConversationRole, id: string, query: MessageQueryDto) {
    return this.session.read(request, role, async (tx, actorId) => {
      if (role === 'STAFF') await this.access.requireTranscript(tx, actorId, id);
      else await this.access.requireCustomer(tx, actorId, id);
      if (query.before !== undefined && query.after !== undefined) throw new BadRequestException();
      const direction = query.before ? 'before' : query.after ? 'after' : 'latest';
      const boundary = direction === 'latest' ? null : decodeMessageCursor((query.before ?? query.after)!, actorId, id, role, direction);
      const where: Prisma.MessageWhereInput = { conversationId: id, audience: 'CUSTOMER_VISIBLE' };
      const rows = await tx.message.findMany({ where: { ...where, ...(boundary !== null ? {
        sequence: direction === 'before' ? { lt: boundary } : { gt: boundary } } : {}) },
        orderBy: { sequence: direction === 'after' ? 'asc' : 'desc' }, take: query.limit + 1, select });
      const more = rows.length > query.limit;
      const visible = rows.slice(0, query.limit);
      if (direction !== 'after') visible.reverse();
      const first = visible[0]?.sequence ?? boundary ?? 0n;
      const last = visible.at(-1)?.sequence ?? boundary ?? 0n;
      const hasMoreBefore = direction !== 'after' ? more : !!await tx.message.findFirst({ where: {
        ...where, sequence: visible.length ? { lt: first } : { lte: first } }, select: { id: true } });
      const hasMoreAfter = direction === 'after' ? more : direction === 'latest' ? false : !!await tx.message.findFirst({ where: {
        ...where, sequence: visible.length ? { gt: last } : { gte: last } }, select: { id: true } });
      const citations = await this.citations(tx, actorId, role, id, visible);
      return { items: visible.map(row => ({ id: row.id, sequence: row.sequence.toString(), senderType: row.senderType,
        sender: { displayName: row.senderType === 'CUSTOMER' ? row.sender?.customerProfile?.fullName ?? 'Customer'
          : row.senderType === 'STAFF' ? row.sender?.staffProfile?.fullName ?? 'Staff' : row.senderType === 'AI_AGENT' ? 'AI assistant' : 'System' },
        content: row.content, createdAt: row.createdAt.toISOString(), readAt: row.readAt ? row.readAt.toISOString() : null, citations: citations.get(row.id) ?? [] })),
        pageInfo: { beforeCursor: visible.length || boundary !== null ? encodeMessageCursor(actorId, id, role, 'before', first) : null,
          afterCursor: encodeMessageCursor(actorId, id, role, 'after', last), hasMoreBefore, hasMoreAfter } };
    });
  }
  private async citations(tx: Prisma.TransactionClient, actorId: string, role: ConversationRole, id: string, rows: Row[]) {
    const candidates = new Map<string, Array<{ documentId: string; versionId: string; page: number }>>();
    for (const row of rows) {
      const list = Array.isArray(row.citations) ? row.citations.slice(0, 20) : [];
      candidates.set(row.id, list.flatMap(value => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
        const { documentId, versionId, page } = value;
        return typeof documentId === 'string' && uuid.test(documentId) && typeof versionId === 'string' && uuid.test(versionId) &&
          typeof page === 'number' && Number.isInteger(page) && page > 0 && page <= 1000000
          ? [{ documentId: documentId.toLowerCase(), versionId: versionId.toLowerCase(), page }] : [];
      }));
    }
    const pairs = [...new Map([...candidates.values()].flat().map(c => [c.versionId + ':' + c.documentId, c])).values()];
    const result = new Map<string, Citation[]>(); if (!pairs.length) return result;
    const conversation = await tx.conversation.findUniqueOrThrow({ where: { id }, select: { linkedPolicyId: true } });
    let allowed: Set<string> | null = null;
    if (conversation.linkedPolicyId) {
      try {
        const catalog = await this.policies.citationCatalog(tx, actorId, role, conversation.linkedPolicyId);
        allowed = new Set(catalog.items.map(v => v.versionId + ':' + v.documentId));
      } catch (error) { if (error instanceof NotFoundException) return result; throw error; }
    }
    const versions = await tx.documentVersion.findMany({ where: { isActive: true,
      OR: pairs.filter(p => allowed === null || allowed.has(p.versionId + ':' + p.documentId)).map(p => ({ id: p.versionId, documentId: p.documentId })),
      ...(allowed === null ? { document: { accessScope: 'PUBLIC', policyId: null, ownerCustomerId: null } } : {}),
    }, select: { id: true, documentId: true, document: { select: { title: true } } } });
    const found = new Map(versions.map(v => [v.id + ':' + v.documentId, v.document.title]));
    for (const [messageId, list] of candidates) result.set(messageId, list.flatMap(c => {
      const title = found.get(c.versionId + ':' + c.documentId);
      return title === undefined ? [] : [{ ...c, label: title }];
    }));
    return result;
  }
}
