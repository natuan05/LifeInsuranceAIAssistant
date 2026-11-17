import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Prisma } from '../../generated/prisma/client';
import { ConversationAccessService } from '../../conversations/services/conversation-access.service';
import { DatabaseService } from '../../database/database.service';
import { validateContract } from '../hmac';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURSOR_RE = /^p(0|[1-9][0-9]{0,18})$/;
const POLICY_NO_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/;
const PUBLIC_UUID_NAMESPACE = Buffer.from('5d9a3f3e6c1b4f0e9a517f1d2c3b4a60', 'hex');

export class AgentApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: 'INVALID_INPUT' | 'NOT_AUTHORIZED' | 'NOT_FOUND' | 'INVALID_ATTEMPT' | 'UNAVAILABLE',
  ) {
    super(code);
  }
}

function uuidv5(namespace: Buffer, name: string): string {
  const hash = createHash('sha1').update(namespace).update(Buffer.from(name, 'utf8')).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function fixtureId(value: string): string {
  const hex = createHash('sha256').update(`synthetic-manulife-v1:${value}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

type PublicManifestEntry = {
  ragDocumentId: string;
  ragVersion: string;
  businessDocumentId: string;
  outputMarkdown: string;
};

let cachedPublicEntries: PublicManifestEntry[] | null = null;

export function loadPublicManifestEntries(): PublicManifestEntry[] {
  if (cachedPublicEntries) return cachedPublicEntries;
  const candidates = [
    process.env.DEV_POLICY_DATA_DIR
      ? resolve(process.env.DEV_POLICY_DATA_DIR, 'public/manifest-manulife-text.json')
      : null,
    resolve(__dirname, '../../../../../../data/public/manifest-manulife-text.json'),
    resolve(__dirname, '../../../../../data/public/manifest-manulife-text.json'),
    resolve(process.cwd(), 'data/public/manifest-manulife-text.json'),
    resolve(process.cwd(), '../../data/public/manifest-manulife-text.json'),
  ].filter((p): p is string => Boolean(p));

  for (const file of candidates) {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as {
        sources?: Array<{ source_relative_path: string; source_sha256: string; output_markdown: string }>;
      };
      if (Array.isArray(parsed.sources)) {
        cachedPublicEntries = parsed.sources.map(src => ({
          ragDocumentId: uuidv5(PUBLIC_UUID_NAMESPACE, `manulife-public:${src.source_relative_path}`),
          ragVersion: `sha256-${src.source_sha256.slice(0, 12)}`,
          businessDocumentId: fixtureId(`DEV:public:${src.output_markdown}`),
          outputMarkdown: src.output_markdown,
        }));
        return cachedPublicEntries;
      }
    } catch {
      continue;
    }
  }
  return [];
}

export type AuthorizedAttemptContext = {
  runId: string;
  attemptId: string;
  conversationId: string;
  messageId: string;
  queuePosition: bigint;
  channelType: 'CUSTOMER_SUPPORT' | 'STAFF_COPILOT';
  actor: { id: string; role: 'CUSTOMER' | 'STAFF' };
  targetCustomerId: string;
  historyView: { conversation_id: string; through_cursor: string | null; current_message_id: string };
  linkedHistoryView: { conversation_id: string; through_cursor: string | null } | null;
};

@Injectable()
export class AgentAccessService {
  constructor(
    private readonly database: DatabaseService,
    private readonly conversationAccess: ConversationAccessService,
  ) {}

  private parseCursor(cursor: string | undefined | null): bigint {
    if (!cursor) return 0n;
    if (!CURSOR_RE.test(cursor)) throw new AgentApiError(400, 'INVALID_INPUT');
    return BigInt(cursor.slice(1));
  }

  async authorizeInTx(
    tx: Prisma.TransactionClient,
    runId: string,
    attemptId: string,
  ): Promise<AuthorizedAttemptContext> {
    if (!UUID_RE.test(runId) || !UUID_RE.test(attemptId)) {
      throw new AgentApiError(400, 'INVALID_INPUT');
    }
    const run = await tx.agentRun.findUnique({
      where: { id: runId },
      include: {
        conversation: {
          include: {
            handoffs: {
              where: { state: { in: ['PENDING', 'ACCEPTED'] }, revokedAt: null },
              select: { id: true, state: true },
            },
          },
        },
        currentAttempt: true,
      },
    });
    if (
      !run ||
      run.status !== 'RUNNING' ||
      run.currentAttemptId !== attemptId ||
      !run.currentAttempt ||
      !['DISPATCHING', 'ACCEPTED'].includes(run.currentAttempt.state)
    ) {
      throw new AgentApiError(409, 'INVALID_ATTEMPT');
    }

    const req = run.currentAttempt.request as Record<string, unknown>;
    const actor = req.actor as { id: string; role: 'CUSTOMER' | 'STAFF' } | undefined;
    const targetCustomerId = String(req.target_customer_id ?? '');
    const channelType = String(req.channel_type ?? '') as 'CUSTOMER_SUPPORT' | 'STAFF_COPILOT';

    if (!actor || !UUID_RE.test(actor.id) || !UUID_RE.test(targetCustomerId)) {
      throw new AgentApiError(409, 'INVALID_ATTEMPT');
    }

    const now = new Date();
    const user = await tx.user.findUnique({
      where: { id: actor.id },
      select: { id: true, role: true, status: true, lockedUntil: true },
    });
    if (!user || user.role !== actor.role || user.status !== 'ACTIVE' || (user.lockedUntil && user.lockedUntil > now)) {
      throw new AgentApiError(403, 'NOT_AUTHORIZED');
    }

    if (channelType === 'CUSTOMER_SUPPORT') {
      if (
        actor.role !== 'CUSTOMER' ||
        actor.id !== targetCustomerId ||
        run.conversation.customerId !== actor.id ||
        run.conversation.channelType !== 'CUSTOMER_SUPPORT'
      ) {
        throw new AgentApiError(403, 'NOT_AUTHORIZED');
      }
      if (
        run.conversation.status !== 'AI_ACTIVE' ||
        run.conversation.supportOrigin !== 'AI' ||
        run.conversation.handoffs.length > 0
      ) {
        throw new AgentApiError(409, 'INVALID_ATTEMPT');
      }
    } else if (channelType === 'STAFF_COPILOT') {
      if (
        actor.role !== 'STAFF' ||
        run.conversation.channelType !== 'STAFF_COPILOT' ||
        run.conversation.assignedStaffId !== actor.id ||
        run.conversation.customerId !== targetCustomerId
      ) {
        throw new AgentApiError(403, 'NOT_AUTHORIZED');
      }
      const assignment = await tx.staffAssignment.findFirst({
        where: {
          staffId: actor.id,
          customerId: targetCustomerId,
          isActive: true,
          customer: { user: { status: 'ACTIVE', OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] } },
        },
        select: { id: true },
      });
      if (!assignment) {
        throw new AgentApiError(403, 'NOT_AUTHORIZED');
      }
    } else {
      throw new AgentApiError(400, 'INVALID_INPUT');
    }

    const historyView = (run.historyView ?? req.history_view) as AuthorizedAttemptContext['historyView'];
    const linkedHistoryView = (run.linkedHistoryView ?? req.linked_history_view ?? null) as AuthorizedAttemptContext['linkedHistoryView'];

    return {
      runId: run.id,
      attemptId,
      conversationId: run.conversationId,
      messageId: run.messageId,
      queuePosition: run.queuePosition,
      channelType,
      actor,
      targetCustomerId,
      historyView,
      linkedHistoryView,
    };
  }

  private async buildHistoryPage(
    tx: Prisma.TransactionClient,
    conversationId: string,
    afterPos: bigint,
    throughPos: bigint,
  ): Promise<{ items: Array<Record<string, unknown>>; nextCursor: string | null }> {
    if (throughPos <= 0n || afterPos >= throughPos) return { items: [], nextCursor: null };
    const minMessageSeq = afterPos / 2n + 1n;
    const maxMessageSeq = (throughPos + 1n) / 2n;
    const messages = await tx.message.findMany({
      where: {
        conversationId,
        sequence: { gte: minMessageSeq, lte: maxMessageSeq },
        senderType: { in: ['CUSTOMER', 'STAFF'] },
      },
      orderBy: { sequence: 'asc' },
      take: 101,
      include: { triggerRun: true },
    });

    const items: Array<Record<string, unknown>> = [];
    for (const msg of messages) {
      const userPos = msg.sequence * 2n - 1n;
      if (userPos > afterPos && userPos <= throughPos) {
        items.push({
          kind: 'USER_MESSAGE',
          position: userPos.toString(),
          messageId: msg.id,
          senderType: msg.senderType === 'STAFF' ? 'STAFF' : 'CUSTOMER',
          content: msg.content,
          createdAt: msg.createdAt.toISOString(),
          run: msg.triggerRun ? { id: msg.triggerRun.id, status: msg.triggerRun.status } : null,
        });
      }
      const outcomePos = msg.sequence * 2n;
      if (outcomePos > afterPos && outcomePos <= throughPos && msg.triggerRun) {
        const r = msg.triggerRun;
        if (r.status === 'COMPLETED' && r.result) {
          items.push({
            kind: 'AGENT_RESULT',
            position: outcomePos.toString(),
            runId: r.id,
            messageId: msg.id,
            result: r.result,
            createdAt: (r.finishedAt ?? msg.createdAt).toISOString(),
          });
        } else if ((r.status === 'FAILED' || r.status === 'CANCELLED') && r.failure) {
          const failureObj = r.failure as { code?: string };
          items.push({
            kind: 'RUN_OUTCOME',
            position: outcomePos.toString(),
            runId: r.id,
            messageId: msg.id,
            status: r.status,
            code: failureObj.code ?? 'INTERNAL',
            createdAt: (r.finishedAt ?? msg.createdAt).toISOString(),
          });
        }
      }
    }
    const pageItems = items.slice(0, 100);
    const hasMore = items.length > 100 || messages.length > 100;
    const lastPos = pageItems.at(-1)?.position;
    const nextCursor = hasMore && typeof lastPos === 'string' ? `p${lastPos}` : null;
    return { items: pageItems, nextCursor };
  }

  async history(runId: string, attemptId: string, cursor?: string | null) {
    const afterPos = this.parseCursor(cursor);
    return this.database.prisma.$transaction(async tx => {
      const ctx = await this.authorizeInTx(tx, runId, attemptId);
      const throughPos = this.parseCursor(ctx.historyView.through_cursor);
      const page = await this.buildHistoryPage(tx, ctx.conversationId, afterPos, throughPos);
      return validateContract('ConversationHistoryPage', page);
    });
  }

  async linkedHistory(runId: string, attemptId: string, cursor?: string | null) {
    const afterPos = this.parseCursor(cursor);
    return this.database.prisma.$transaction(async tx => {
      const ctx = await this.authorizeInTx(tx, runId, attemptId);
      if (ctx.channelType !== 'STAFF_COPILOT' || !ctx.linkedHistoryView) {
        throw new AgentApiError(403, 'NOT_AUTHORIZED');
      }
      try {
        await this.conversationAccess.requireTranscript(tx, ctx.actor.id, ctx.linkedHistoryView.conversation_id);
      } catch {
        throw new AgentApiError(403, 'NOT_AUTHORIZED');
      }
      const throughPos = this.parseCursor(ctx.linkedHistoryView.through_cursor);
      const page = await this.buildHistoryPage(tx, ctx.linkedHistoryView.conversation_id, afterPos, throughPos);
      return validateContract('ConversationHistoryPage', page);
    });
  }

  async scope(
    runId: string,
    rawBody: unknown,
    fallbackAttemptId?: string,
  ) {
    const body = (rawBody && typeof rawBody === 'object' ? rawBody : {}) as {
      attempt_id?: unknown;
      attemptId?: unknown;
      kind?: unknown;
      policy_number?: unknown;
    };
    const attemptId =
      typeof body.attempt_id === 'string'
        ? body.attempt_id
        : typeof body.attemptId === 'string'
          ? body.attemptId
          : (fallbackAttemptId ?? '');
    const kind = body.kind;
    const policyNumber = body.policy_number === null || body.policy_number === undefined ? null : String(body.policy_number);

    if (!UUID_RE.test(attemptId) || (kind !== 'PUBLIC' && kind !== 'PRIVATE')) {
      throw new AgentApiError(400, 'INVALID_INPUT');
    }
    if (kind === 'PUBLIC' && policyNumber !== null) {
      throw new AgentApiError(400, 'INVALID_INPUT');
    }
    if (kind === 'PRIVATE' && (!policyNumber || !POLICY_NO_RE.test(policyNumber))) {
      throw new AgentApiError(400, 'INVALID_INPUT');
    }

    return this.database.prisma.$transaction(async tx => {
      let ctx: AuthorizedAttemptContext;
      try {
        ctx = await this.authorizeInTx(tx, runId, attemptId);
      } catch (err) {
        if (err instanceof AgentApiError && err.code === 'INVALID_ATTEMPT') {
          return validateContract('DocumentScope', {
            decision: 'DENIED',
            kind,
            policy_number: policyNumber,
            reason: 'ATTEMPT_INVALID',
          });
        }
        if (err instanceof AgentApiError && err.code === 'NOT_AUTHORIZED') {
          return validateContract('DocumentScope', {
            decision: 'DENIED',
            kind,
            policy_number: policyNumber,
            reason: 'NOT_AUTHORIZED',
          });
        }
        throw err;
      }

      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      if (kind === 'PUBLIC') {
        const manifestEntries = loadPublicManifestEntries();
        const dbDocs = await tx.document.findMany({
          where: { accessScope: 'PUBLIC', policyId: null, ownerCustomerId: null, currentVersion: { not: null } },
          select: { id: true, currentVersion: true },
        });
        const docsMap = new Map<string, { document_id: string; document_version: string; policy_id: null }>();
        for (const entry of manifestEntries) {
          docsMap.set(`${entry.ragDocumentId}:${entry.ragVersion}`, {
            document_id: entry.ragDocumentId,
            document_version: entry.ragVersion,
            policy_id: null,
          });
        }
        for (const doc of dbDocs) {
          if (doc.currentVersion && (doc.currentVersion !== 'public-text-v2' || manifestEntries.length === 0)) {
            docsMap.set(`${doc.id}:${doc.currentVersion}`, {
              document_id: doc.id,
              document_version: doc.currentVersion,
              policy_id: null,
            });
          }
        }
        return validateContract('DocumentScope', {
          decision: 'GRANTED',
          kind: 'PUBLIC',
          policy_number: null,
          documents: [...docsMap.values()],
          scope_version: 'public-v1',
          expires_at: expiresAt,
        });
      }

      // PRIVATE scope
      const policy = await tx.insurancePolicy.findFirst({
        where: { policyNumber: policyNumber!, customerId: ctx.targetCustomerId },
        include: {
          documents: {
            where: { accessScope: 'PRIVATE_POLICY', ownerCustomerId: ctx.targetCustomerId, currentVersion: { not: null } },
            select: { id: true, currentVersion: true },
          },
        },
      });
      if (!policy) {
        return validateContract('DocumentScope', {
          decision: 'DENIED',
          kind: 'PRIVATE',
          policy_number: policyNumber,
          reason: 'NOT_AUTHORIZED',
        });
      }

      const documents = policy.documents
        .filter(d => Boolean(d.currentVersion))
        .map(d => ({
          document_id: d.id,
          document_version: d.currentVersion!,
          policy_id: policy.id,
        }));

      return validateContract('DocumentScope', {
        decision: 'GRANTED',
        kind: 'PRIVATE',
        policy_number: policy.policyNumber,
        documents,
        scope_version: `policy:${policy.id}`,
        expires_at: expiresAt,
      });
    });
  }

  async listContracts(runId: string, attemptId: string) {
    return this.database.prisma.$transaction(async tx => {
      const ctx = await this.authorizeInTx(tx, runId, attemptId);
      const policies = await tx.insurancePolicy.findMany({
        where: { customerId: ctx.targetCustomerId },
        orderBy: [{ createdAt: 'asc' }, { policyNumber: 'asc' }],
        include: { product: { select: { productCode: true, name: true } } },
      });
      const contracts = policies.map(p =>
        validateContract('ContractSummary', {
          policy_number: p.policyNumber,
          main_product: {
            code: p.product.productCode,
            name: p.product.name,
          },
        }),
      );
      return { contracts };
    });
  }

  async getContractOverview(runId: string, attemptId: string, policyNumber: string) {
    if (!policyNumber || !POLICY_NO_RE.test(policyNumber)) {
      throw new AgentApiError(400, 'INVALID_INPUT');
    }
    return this.database.prisma.$transaction(async tx => {
      const ctx = await this.authorizeInTx(tx, runId, attemptId);
      const policy = await tx.insurancePolicy.findFirst({
        where: { policyNumber, customerId: ctx.targetCustomerId },
        include: { product: { select: { productCode: true, name: true } } },
      });
      if (!policy) {
        throw new AgentApiError(404, 'NOT_FOUND');
      }

      const snapshot = (policy.benefitsSnapshot ?? {}) as Record<string, unknown>;
      const catalogProducts = await tx.insuranceProduct.findMany({
        where: { isActive: true },
        select: { productCode: true, name: true },
      });
      const catalogMap = new Map(catalogProducts.map(p => [p.productCode, p.name]));

      const rawRiders = Array.isArray(snapshot.riders) ? snapshot.riders : [];
      const riders: Array<{ code: string; name: string }> = [];
      let allMapped = snapshot.schemaVersion === 1 && snapshot.ridersComplete === true;

      for (const item of rawRiders) {
        if (typeof item === 'string') {
          const name = catalogMap.get(item);
          if (!name) allMapped = false;
          riders.push({ code: item, name: name ?? item });
        } else if (item && typeof item === 'object') {
          const rObj = item as Record<string, unknown>;
          const code = String(rObj.code ?? rObj.benefit_id ?? '');
          const name = String(rObj.name ?? rObj.display_name ?? catalogMap.get(code) ?? code);
          if (!code || !catalogMap.has(code)) allMapped = false;
          if (code) riders.push({ code, name });
        } else {
          allMapped = false;
        }
      }

      return validateContract('ContractOverview', {
        policy_number: policy.policyNumber,
        main_product: {
          code: policy.product.productCode,
          name: policy.product.name,
        },
        riders,
        riders_complete: Boolean(allMapped),
      });
    });
  }
}
