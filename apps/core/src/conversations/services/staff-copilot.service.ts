import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AgentRunService } from '../../agent/services/agent-run.service';
import { validateContract } from '../../agent/hmac';
import type { Prisma } from '../../generated/prisma/client';
import { SafeApiException } from '../../http/safe-api.exception';
import { PolicyService } from '../../policies/services/policy.service';
import type { CopilotHistoryQuery, CopilotQuestionDto, CopilotSourceLocationDto } from '../dto/staff-copilot.dto';
import { ConversationAccessService } from './conversation-access.service';
import { ConversationCommandService } from './conversation-command.service';
import { ConversationSessionService, type ConversationRequest } from './conversation-session.service';
import { decodeMessageCursor, encodeMessageCursor } from './message-cursor';

const activeStatuses = ['QUEUED', 'RUNNING'] as const;
const runSelect = { id: true, status: true, queuePosition: true, linkedHistoryView: true, message: {
  select: { id: true, clientMessageId: true, content: true, createdAt: true },
}, resultMessage: { select: { id: true, conversationId: true, audience: true, content: true, createdAt: true, citations: true } } } satisfies Prisma.AgentRunSelect;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function threadScope(actorId: string, sourceId: string, customerId: string): Prisma.ConversationWhereInput {
  return { channelType: 'STAFF_COPILOT', assignedStaffId: actorId, linkedContextConvId: sourceId, customerId };
}

function readSourceLocation(value: Prisma.JsonValue | undefined): CopilotSourceLocationDto | null {
  if (value === undefined || value === null) return null;
  try {
    return validateContract<CopilotSourceLocationDto>('EvidenceLocation', value);
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'SCHEMA_INVALID') throw error;
    return null;
  }
}

@Injectable()
export class StaffCopilotService {
  constructor(private readonly session: ConversationSessionService, private readonly commands: ConversationCommandService,
    private readonly access: ConversationAccessService, private readonly agent: AgentRunService,
    private readonly policies: PolicyService) {}

  history(request: ConversationRequest, sourceId: string, query: CopilotHistoryQuery) {
    return this.session.read(request, 'STAFF', async (tx, actorId) => {
      const grant = await this.access.requireTranscript(tx, actorId, sourceId);
      const before = query.before ? decodeMessageCursor(query.before, actorId, sourceId, 'STAFF_COPILOT', 'before') : null;
      const thread = await tx.conversation.findFirst({
        where: threadScope(actorId, sourceId, grant.customerId), select: { id: true },
      });
      if (!thread) return { items: [], beforeCursor: null, activeRun: null };
      const where: Prisma.AgentRunWhereInput = {
        conversationId: thread.id, message: { conversationId: thread.id, audience: 'INTERNAL', senderType: 'STAFF', senderId: actorId },
      };
      const rows = await tx.agentRun.findMany({ where: {
        ...where, ...(before === null ? {} : { queuePosition: { lt: before } }),
      }, orderBy: { queuePosition: 'desc' }, take: query.limit + 1, select: runSelect });
      const page = rows.slice(0, query.limit).reverse();
      const activeRun = await tx.agentRun.findFirst({ where: { ...where, status: { in: [...activeStatuses] } },
        select: { id: true, status: true } });
      const validAnswers = page.flatMap(run => run.status === 'COMPLETED' && run.resultMessage?.audience === 'INTERNAL'
        && run.resultMessage.conversationId === thread.id ? [run.resultMessage] : []);
      const answers = new Map(validAnswers.map(answer => [answer.id, answer]));
      const citations = await this.citations(tx, actorId, grant.customerId, validAnswers);
      return {
        items: page.map(run => {
          const view = run.linkedHistoryView as { through_cursor?: string | null } | null;
          const answer = run.status === 'COMPLETED' && run.resultMessage ? answers.get(run.resultMessage.id) : undefined;
          return { id: run.id, status: run.status, question: run.message,
            sourceThroughSequence: view?.through_cursor?.match(/^m1_(\d+)$/)?.[1] ?? null,
            answer: answer ? { id: answer.id, content: answer.content, createdAt: answer.createdAt,
              citations: citations.get(answer.id) ?? [] } : null };
        }),
        beforeCursor: rows.length > query.limit
          ? encodeMessageCursor(actorId, sourceId, 'STAFF_COPILOT', 'before', page[0].queuePosition) : null,
        activeRun,
      };
    });
  }

  async send(request: ConversationRequest, sourceId: string, input: CopilotQuestionDto) {
    const content = input.content.replace(/\r\n?/g, '\n');
    const characters = [...content];
    const hasControlCharacter = characters.some(character => {
      const code = character.charCodeAt(0);
      return (code < 32 && code !== 9 && code !== 10) || code === 127;
    });
    if (!content.trim() || hasControlCharacter || characters.length > 4000) throw new BadRequestException();
    const result = await this.session.write(request, 'STAFF', 'SEND_COPILOT',
      (tx, actorId) => this.commands.lock(tx, actorId, sourceId),
      async (tx, actorId) => {
        const grant = await this.access.requireTranscript(tx, actorId, sourceId);
        const scope = threadScope(actorId, sourceId, grant.customerId);
        const key = input.clientMessageId.toLowerCase();
        const receipt = await this.commands.execute(tx, actorId, 'SEND_COPILOT', key, { sourceId, content },
          async () => { /* Session and source were checked under the source lock above. */ },
          async () => {
            const thread = await tx.conversation.findFirst({ where: scope, select: { id: true } })
              ?? await tx.conversation.create({ data: {
                channelType: 'STAFF_COPILOT', assignedStaffId: actorId, customerId: grant.customerId,
                linkedContextConvId: sourceId, status: 'AI_ACTIVE',
              }, select: { id: true } });
            const active = await tx.agentRun.findFirst({
              where: { conversationId: thread.id, status: { in: [...activeStatuses] } }, select: { id: true },
            });
            if (active) throw new SafeApiException('COPILOT_BUSY');
            const { nextMessageSequence } = await tx.conversation.update({ where: { id: thread.id },
              data: { nextMessageSequence: { increment: 1 } }, select: { nextMessageSequence: true } });
            const message = await tx.message.create({ data: { conversationId: thread.id, sequence: nextMessageSequence,
              senderType: 'STAFF', senderId: actorId, audience: 'INTERNAL', content, clientMessageId: key },
              select: { id: true } });
            const run = await this.agent.enqueueInTransaction(tx, { conversationId: thread.id, messageId: message.id,
              queuePosition: nextMessageSequence, linkedContextConversationId: sourceId });
            return { resourceId: run.id, resultVersion: grant.controlVersion };
          });
        const run = await tx.agentRun.findFirst({ where: { id: receipt.resourceId, conversation: scope },
          select: { id: true, status: true, conversationId: true } });
        if (!run) throw new NotFoundException();
        return { run, replayed: receipt.replayed };
      });
    if (result.run.status === 'QUEUED') void this.agent.claimNext(result.run.conversationId).catch(() => {});
    return { id: result.run.id, status: result.run.status, replayed: result.replayed };
  }

  private async citations(tx: Prisma.TransactionClient, actorId: string, customerId: string,
    answers: { id: string; citations: Prisma.JsonValue }[]) {
    const candidates = answers.map(answer => ({ id: answer.id, refs: (Array.isArray(answer.citations) ? answer.citations : [])
      .slice(0, 20).flatMap(ref => {
        if (!ref || typeof ref !== 'object' || Array.isArray(ref)) return [];
        const { documentId, versionId, sourceLocation } = ref;
        return typeof documentId === 'string' && uuid.test(documentId) && typeof versionId === 'string' && uuid.test(versionId)
          ? [{ documentId, versionId, sourceLocation: readSourceLocation(sourceLocation) }] : [];
      }) }));
    const versionIds = [...new Set(candidates.flatMap(answer => answer.refs.map(ref => ref.versionId)))];
    const versions = versionIds.length ? await tx.documentVersion.findMany({ where: { id: { in: versionIds }, isActive: true },
      select: { id: true, documentId: true, versionNumber: true, document: { select: { title: true, accessScope: true, productId: true,
        policyId: true, ownerCustomerId: true, currentVersion: true, product: { select: { isActive: true } } } } } }) : [];
    const policies = new Map<string, Set<string>>();
    for (const policyId of new Set(versions.flatMap(({ document: doc }) =>
      doc.accessScope === 'PRIVATE_POLICY' && doc.ownerCustomerId === customerId && doc.policyId ? [doc.policyId] : []))) {
      try {
        const catalog = await this.policies.citationCatalog(tx, actorId, 'STAFF', policyId);
        policies.set(policyId, new Set(catalog.items.map(item => item.versionId)));
      } catch (error) {
        if (!(error instanceof NotFoundException)) throw error;
      }
    }
    const allowed = new Map(versions.filter(version => {
      const doc = version.document;
      return doc.accessScope === 'PUBLIC' ? doc.policyId === null && doc.ownerCustomerId === null
        && doc.product?.isActive && doc.currentVersion === version.versionNumber
        : doc.policyId !== null && policies.get(doc.policyId)?.has(version.id);
    }).map(version => [version.id, version]));
    return new Map(candidates.map(answer => [answer.id, answer.refs.flatMap(ref => {
      const version = allowed.get(ref.versionId);
      return version?.documentId === ref.documentId ? [{ ...ref, label: version.document.title,
        policyId: version.document.policyId, productId: version.document.productId }] : [];
    })]));
  }
}
