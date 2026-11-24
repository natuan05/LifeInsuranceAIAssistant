import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Prisma } from '../../generated/prisma/client';
import { DatabaseService } from '../../database/database.service';
import { sha256Json, validateContract } from '../hmac';
import {
  AgentApiError,
  AgentAccessService,
  type AuthorizedAttemptContext,
  agentMessageText,
  linkedMessageCursor,
  loadPublicManifestEntries,
  publicManifestPdfVersion,
} from './agent-access.service';
import { AgentTransportService, type DurableAckDto } from './agent-transport.service';
import { copilotDeadlinePassed, expireCopilotRun, fenceAgentConversation, finishAgentRun } from './agent-run-state';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TrialLimits = {
  retrieval_calls_max: number;
  core_read_requests_max: number;
  core_request_timeout_ms: number;
  core_retry_per_call: number;
  model_calls_max: number | null;
  graph_steps_max: number | null;
  turn_token_budget: number | null;
  finish_reserve_tokens: number | null;
  deadline_s: number;
};

let cachedTrialLimits: TrialLimits | null = null;

export function loadTrialLimits(): TrialLimits {
  if (cachedTrialLimits) return cachedTrialLimits;
  const rel = process.env.LIFE_AGENT_RUNTIME_CONFIG || 'evaluation/trial-config.json';
  const candidates = [
    process.env.LIFE_AGENT_RUNTIME_CONFIG ? resolve(process.env.LIFE_AGENT_RUNTIME_CONFIG) : null,
    resolve(__dirname, '../../../../../../apps/agent', rel),
    resolve(__dirname, '../../../../../apps/agent', rel),
    resolve(process.cwd(), '../agent', rel),
    resolve(process.cwd(), '../../apps/agent', rel),
    resolve('/app/apps/agent', rel),
  ].filter((p): p is string => Boolean(p));

  for (const file of candidates) {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as { limits?: TrialLimits };
      if (parsed.limits && typeof parsed.limits.deadline_s === 'number') {
        cachedTrialLimits = parsed.limits;
        return cachedTrialLimits;
      }
    } catch {
      continue;
    }
  }
  throw new Error('Unable to load limits from apps/agent/evaluation/trial-config.json');
}

type AgentResultPayload = {
  response_type: 'ANSWER' | 'CLARIFICATION' | 'REFUSAL';
  message: string;
  citations: Array<{
    evidence_id: string;
    document_id: string;
    document_version: string;
    title: string;
    document_type: string;
    location: { pages?: number[]; clause?: string; anchor?: string };
  }>;
  actions: Array<
    | {
        type: 'PROPOSE_TICKET';
        summary: {
          request: string;
          context: string;
          customer_statements: string[];
          verified_findings: Array<{ text: string; source_refs: string[] }>;
          attempted_steps: string[];
          pending_issues: string[];
        };
      }
    | {
        type: 'PROPOSE_HANDOFF';
        subject: string;
        reason: string | null;
      }
  >;
};

type MappedCitation = { documentId: string; versionId: string } &
  ({ sourceLocation: AgentResultPayload['citations'][number]['location'] } | { page: number });

@Injectable()
export class AgentRunService {
  private readonly logger = new Logger(AgentRunService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly access: AgentAccessService,
    private readonly transport: AgentTransportService,
  ) {}

  async computeThroughCursor(
    tx: Prisma.TransactionClient,
    conversationId: string,
    beforeSequence?: bigint,
  ): Promise<string | null> {
    const lastMsg = await tx.message.findFirst({
      where: {
        conversationId,
        senderType: { in: ['CUSTOMER', 'STAFF'] },
        ...(beforeSequence !== undefined ? { sequence: { lt: beforeSequence } } : {}),
      },
      orderBy: { sequence: 'desc' },
      include: { triggerRun: true },
    });
    if (!lastMsg) return null;
    const hasOutcome =
      lastMsg.triggerRun &&
      ['COMPLETED', 'FAILED', 'CANCELLED'].includes(lastMsg.triggerRun.status);
    const pos = hasOutcome ? lastMsg.sequence * 2n : lastMsg.sequence * 2n - 1n;
    return `p${pos.toString()}`;
  }

  async enqueueInTransaction(
    tx: Prisma.TransactionClient,
    params: {
      conversationId: string;
      messageId: string;
      queuePosition: bigint;
      linkedContextConversationId?: string | null;
    },
  ) {
    const existing = await tx.agentRun.findUnique({
      where: { messageId: params.messageId },
    });
    if (existing) return existing;

    let linkedHistoryView: { conversation_id: string; through_cursor: string | null } | null = null;
    if (params.linkedContextConversationId) {
      const last = await tx.message.findFirst({ where: { conversationId: params.linkedContextConversationId,
        audience: 'CUSTOMER_VISIBLE' }, orderBy: { sequence: 'desc' }, select: { sequence: true } });
      linkedHistoryView = {
        conversation_id: params.linkedContextConversationId,
        through_cursor: linkedMessageCursor(last?.sequence ?? 0n),
      };
    }

    const trialLimits = loadTrialLimits();
    const deadlineAt = new Date(Date.now() + trialLimits.deadline_s * 1000).toISOString();
    const limits = {
      deadline_at: deadlineAt,
      retrieval_calls_max: trialLimits.retrieval_calls_max,
      core_read_requests_max: trialLimits.core_read_requests_max,
      core_request_timeout_ms: trialLimits.core_request_timeout_ms,
      core_retry_per_call: trialLimits.core_retry_per_call,
      model_calls_max: trialLimits.model_calls_max,
      graph_steps_max: trialLimits.graph_steps_max,
      turn_token_budget: trialLimits.turn_token_budget,
      finish_reserve_tokens: trialLimits.finish_reserve_tokens,
    };

    return tx.agentRun.create({
      data: {
        conversationId: params.conversationId,
        messageId: params.messageId,
        queuePosition: params.queuePosition,
        status: 'QUEUED',
        linkedHistoryView: linkedHistoryView ?? undefined,
        limits,
      },
    });
  }

  async claimNext(conversationId: string): Promise<{ attemptId: string; request: Record<string, unknown> } | null> {
    const claimed = await this.database.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM business.conversations WHERE id = ${conversationId}::uuid FOR UPDATE`;
      const conv = await tx.conversation.findUnique({
        where: { id: conversationId },
        include: {
          handoffs: {
            where: { state: { in: ['PENDING', 'ACCEPTED'] }, revokedAt: null },
            select: { id: true },
          },
        },
      });
      if (!conv) return null;
      if (
        conv.channelType === 'CUSTOMER_SUPPORT' &&
        (conv.status !== 'AI_ACTIVE' || conv.supportOrigin !== 'AI' || conv.handoffs.length > 0)
      ) {
        return null;
      }

      const invalidating = await tx.agentAttempt.findFirst({
        where: { state: 'INVALIDATING', run: { conversationId } },
        select: { id: true },
      });

      const running = await tx.agentRun.findFirst({
        where: { conversationId, status: 'RUNNING' },
        select: { id: true },
      });
      if (running) return null;

      const nextRun = await tx.agentRun.findFirst({
        where: { conversationId, status: 'QUEUED' },
        orderBy: { queuePosition: 'asc' },
        include: { message: true },
      });
      if (!nextRun) return null;

      const isCopilot = conv.channelType === 'STAFF_COPILOT';
      const now = new Date();
      if (isCopilot && copilotDeadlinePassed(nextRun.limits, now)) {
        await expireCopilotRun(tx, nextRun, now);
        return null;
      }
      if (invalidating) return null;
      const actorId =
        conv.channelType === 'STAFF_COPILOT' ? conv.assignedStaffId : conv.customerId;
      const actorRole = conv.channelType === 'STAFF_COPILOT' ? 'STAFF' : 'CUSTOMER';
      if (!actorId) return null;

      const throughCursor = await this.computeThroughCursor(tx, conversationId, nextRun.queuePosition);
      const historyView = {
        conversation_id: conversationId,
        through_cursor: throughCursor,
        current_message_id: nextRun.messageId,
      };
      const linkedHistoryView = (nextRun.linkedHistoryView as { conversation_id: string; through_cursor: string | null } | null) ?? null;
      if (isCopilot) {
        try {
          if (linkedHistoryView?.conversation_id !== conv.linkedContextConvId) throw new AgentApiError(403, 'NOT_AUTHORIZED');
          await this.access.requireCopilotSource(tx, actorId, conv.customerId, conv.linkedContextConvId);
        } catch (error) {
          if (!(error instanceof AgentApiError) || error.code !== 'NOT_AUTHORIZED') throw error;
          await fenceAgentConversation(tx, conversationId, 'PERMISSION_CHANGED');
          return null;
        }
      }

      const attemptId = randomUUID();
      const trialLimits = loadTrialLimits();
      const storedLimits = (nextRun.limits ?? {}) as Record<string, unknown>;
      const limits = {
        deadline_at: isCopilot ? storedLimits.deadline_at : new Date(now.getTime() + trialLimits.deadline_s * 1000).toISOString(),
        retrieval_calls_max: Number(storedLimits.retrieval_calls_max ?? trialLimits.retrieval_calls_max),
        core_read_requests_max: Number(storedLimits.core_read_requests_max ?? trialLimits.core_read_requests_max),
        core_request_timeout_ms: Number(storedLimits.core_request_timeout_ms ?? trialLimits.core_request_timeout_ms),
        core_retry_per_call: Number(storedLimits.core_retry_per_call ?? trialLimits.core_retry_per_call),
        model_calls_max: storedLimits.model_calls_max !== undefined ? storedLimits.model_calls_max : trialLimits.model_calls_max,
        graph_steps_max: storedLimits.graph_steps_max !== undefined ? storedLimits.graph_steps_max : trialLimits.graph_steps_max,
        turn_token_budget: storedLimits.turn_token_budget !== undefined ? storedLimits.turn_token_budget : trialLimits.turn_token_budget,
        finish_reserve_tokens:
          storedLimits.finish_reserve_tokens !== undefined ? storedLimits.finish_reserve_tokens : trialLimits.finish_reserve_tokens,
      };

      const runRequest = validateContract<Record<string, unknown>>('RunRequest', {
        schema_version: 'agent-v1',
        run_id: nextRun.id,
        attempt_id: attemptId,
        conversation_id: conversationId,
        message_id: nextRun.messageId,
        message_text: agentMessageText(nextRun.message.content),
        channel_type: conv.channelType,
        actor: { id: actorId, role: actorRole },
        target_customer_id: conv.customerId,
        history_view: historyView,
        linked_history_view: linkedHistoryView,
        limits,
      });

      const prevCount = await tx.agentAttempt.count({ where: { runId: nextRun.id } });
      const claimedAt = new Date();
      if (isCopilot && copilotDeadlinePassed(nextRun.limits, claimedAt)) {
        await expireCopilotRun(tx, nextRun, claimedAt);
        return null;
      }
      await tx.agentAttempt.create({
        data: {
          id: attemptId,
          runId: nextRun.id,
          attemptNo: prevCount + 1,
          state: 'DISPATCHING',
          request: runRequest as Prisma.InputJsonObject,
          requestSha256: sha256Json(runRequest),
          nextDispatchAt: claimedAt,
        },
      });

      await tx.agentRun.update({
        where: { id: nextRun.id },
        data: {
          status: 'RUNNING',
          currentAttemptId: attemptId,
          historyView: historyView as Prisma.InputJsonObject,
          limits: limits as Prisma.InputJsonObject,
          startedAt: claimedAt,
        },
      });

      return { attemptId, request: runRequest };
    });

    if (claimed) this.runInBackground(this.dispatchAttempt(claimed.attemptId), 'dispatch');
    return claimed;
  }

  private backoffDelayMs(count: number): number {
    const baseSec = Math.min(60, 1 * 2 ** Math.min(count, 10));
    const jitter = 1 + 0.2 * (2 * Math.random() - 1);
    return Math.round(baseSec * jitter * 1000);
  }

  private runInBackground(work: Promise<unknown>, operation: 'dispatch' | 'revoke' | 'claim') {
    // The transaction already committed. The dispatcher can recover the durable work on its next tick.
    void work.catch(() => this.logger.warn(`Agent ${operation} failed in background; reconciliation will retry pending work.`));
  }

  async dispatchAttempt(attemptId: string): Promise<DurableAckDto | null> {
    const attempt = await this.database.prisma.agentAttempt.findUnique({
      where: { id: attemptId },
      include: { run: { include: { conversation: { select: { channelType: true } } } } },
    });
    if (!attempt || attempt.state !== 'DISPATCHING' || attempt.run.status !== 'RUNNING') {
      return null;
    }

    if (attempt.run.conversation.channelType === 'STAFF_COPILOT') {
      try {
        await this.database.prisma.$transaction(tx => this.access.authorizeInTx(tx, attempt.runId, attemptId));
      } catch (error) {
        if (!(error instanceof AgentApiError)) throw error;
        if (error.code === 'NOT_AUTHORIZED') await this.invalidateAttempt(attemptId, 'PERMISSION_CHANGED');
        else if (copilotDeadlinePassed(attempt.run.limits, new Date())) await this.invalidateAttempt(attemptId, 'DEADLINE');
        else if (error.code !== 'INVALID_ATTEMPT') throw error;
        return null;
      }
    }

    const request = attempt.request as Record<string, unknown>;
    const ack = await this.transport.dispatchRun(request);

    await this.database.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM business.conversations WHERE id = ${attempt.run.conversationId}::uuid FOR UPDATE`;
      const current = await tx.agentAttempt.findUnique({
        where: { id: attemptId },
        include: { run: true },
      });
      if (!current || current.state !== 'DISPATCHING') return;

      if (ack && (ack.outcome === 'ACCEPTED' || ack.outcome === 'DUPLICATE')) {
        await tx.agentAttempt.update({
          where: { id: attemptId },
          data: {
            state: 'ACCEPTED',
            acceptedAt: new Date(),
            dispatchCount: { increment: 1 },
          },
        });
      } else if (ack && (ack.outcome === 'CONFLICT' || ack.outcome === 'REJECTED')) {
        const now = new Date();
        await tx.agentAttempt.update({
          where: { id: attemptId },
          data: { state: 'FINISHED', dispatchCount: { increment: 1 } },
        });
        if (current.run.status === 'RUNNING') {
          await finishAgentRun(tx, current.runId, {
              status: 'FAILED',
              failure: { code: 'INTERNAL', retryable: false },
              finishedAt: now,
            });
        }
      } else {
        const delayMs = this.backoffDelayMs(current.dispatchCount);
        await tx.agentAttempt.update({
          where: { id: attemptId },
          data: {
            dispatchCount: { increment: 1 },
            nextDispatchAt: new Date(Date.now() + delayMs),
          },
        });
      }
    });

    return ack;
  }

  async fenceConversationInTx(
    tx: Prisma.TransactionClient,
    conversationId: string,
    reason: 'STAFF_TAKEOVER' | 'CANCELLED_BY_CORE' | 'PERMISSION_CHANGED',
    cancelQueued = true,
  ): Promise<string[]> {
    return fenceAgentConversation(tx, conversationId, reason, cancelQueued);
  }

  async invalidateAttempt(
    attemptId: string,
    reason: 'STAFF_TAKEOVER' | 'RETRY' | 'DEADLINE' | 'CANCELLED_BY_CORE' | 'PERMISSION_CHANGED',
  ): Promise<boolean> {
    const changed = await this.database.prisma.$transaction(async tx => {
      const attempt = await tx.agentAttempt.findUnique({
        where: { id: attemptId },
        include: { run: true },
      });
      if (!attempt || !['DISPATCHING', 'ACCEPTED'].includes(attempt.state)) return false;

      await tx.$queryRaw`SELECT id FROM business.conversations WHERE id = ${attempt.run.conversationId}::uuid FOR UPDATE`;
      const fresh = await tx.agentAttempt.findUnique({
        where: { id: attemptId },
        include: { run: true },
      });
      if (!fresh || !['DISPATCHING', 'ACCEPTED'].includes(fresh.state)) return false;

      const now = new Date();
      await tx.agentAttempt.update({
        where: { id: attemptId },
        data: {
          state: 'INVALIDATING',
          revocationReason: reason,
          revocationRequestedAt: now,
          nextDispatchAt: now,
        },
      });

      if (fresh.run.status === 'RUNNING' && reason !== 'RETRY') {
        if (reason === 'DEADLINE') {
          await finishAgentRun(tx, fresh.runId, {
              status: 'FAILED',
              failure: { code: 'DEADLINE_EXCEEDED', retryable: false },
              finishedAt: now,
            });
        } else {
          const code =
            reason === 'PERMISSION_CHANGED'
              ? 'PERMISSION_DENIED'
              : reason === 'STAFF_TAKEOVER'
                ? 'STAFF_TAKEOVER'
                : 'CANCELLED_BY_CORE';
          await finishAgentRun(tx, fresh.runId, {
              status: 'CANCELLED',
              failure: { code, retryable: false },
              finishedAt: now,
            });
        }
      }
      return true;
    });

    if (changed) this.runInBackground(this.sendRevocation(attemptId), 'revoke');
    return changed;
  }

  async sendRevocation(attemptId: string): Promise<boolean> {
    const attempt = await this.database.prisma.agentAttempt.findUnique({
      where: { id: attemptId },
      include: { run: true },
    });
    if (!attempt || attempt.state !== 'INVALIDATING') return false;

    const revocation = validateContract<Record<string, unknown>>('AttemptRevocation', {
      schema_version: 'agent-v1',
      run_id: attempt.runId,
      attempt_id: attempt.id,
      conversation_id: attempt.run.conversationId,
      reason: attempt.revocationReason ?? 'CANCELLED_BY_CORE',
      requested_at: (attempt.revocationRequestedAt ?? new Date()).toISOString(),
    });

    const ack = await this.transport.revokeAttempt(revocation);
    let conversationToClaim: string | null = null;

    await this.database.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM business.conversations WHERE id = ${attempt.run.conversationId}::uuid FOR UPDATE`;
      const current = await tx.agentAttempt.findUnique({
        where: { id: attemptId },
        include: { run: true },
      });
      if (!current || current.state !== 'INVALIDATING') return;

      if (ack && ['REVOKED', 'ALREADY_REVOKED'].includes(ack.outcome) && ack.writer_epoch !== null) {
        await tx.agentAttempt.update({
          where: { id: attemptId },
          data: {
            state: 'INVALIDATED',
            revokedAt: new Date(),
            revokedEpoch: BigInt(ack.writer_epoch),
          },
        });
        conversationToClaim = current.run.conversationId;
      } else {
        const delayMs = this.backoffDelayMs(current.dispatchCount);
        await tx.agentAttempt.update({
          where: { id: attemptId },
          data: {
            dispatchCount: { increment: 1 },
            nextDispatchAt: new Date(Date.now() + delayMs),
          },
        });
      }
    });

    if (conversationToClaim) this.runInBackground(this.claimNext(conversationToClaim), 'claim');
    return Boolean(ack);
  }

  private async resolveAndVerifyCitations(
    tx: Prisma.TransactionClient,
    ctx: AuthorizedAttemptContext,
    citations: AgentResultPayload['citations'],
  ): Promise<{ valid: boolean; mappedCitations: MappedCitation[] }> {
    if (!citations.length) return { valid: true, mappedCitations: [] };

    const publicEntries = loadPublicManifestEntries();
    const publicByRag = new Map(publicEntries.map(e => [`${e.ragDocumentId}:${e.ragVersion}`, e.businessDocumentId]));
    const copilot = ctx.channelType === 'STAFF_COPILOT';
    const citedIds = new Set(citations.map(citation => citation.document_id));

    const customerPolicies = await tx.insurancePolicy.findMany({
      where: { customerId: ctx.targetCustomerId },
      include: {
        documents: {
          where: { accessScope: 'PRIVATE_POLICY', ownerCustomerId: ctx.targetCustomerId },
          include: { versions: { where: { isActive: true } } },
        },
      },
    });
    const privateAllowed = new Map<string, { documentId: string; versionId: string }>();
    for (const policy of customerPolicies) {
      if (copilot) {
        if (!policy.documents.some(doc => citedIds.has(doc.id))) continue;
        for (const version of await this.access.copilotPolicyVersions(tx, ctx.actor.id, policy.id)) {
          privateAllowed.set(`${version.documentId}:${version.versionNumber}`, { documentId: version.documentId, versionId: version.versionId });
        }
        continue;
      }
      for (const doc of policy.documents) {
        for (const ver of doc.versions) {
          if (doc.currentVersion === ver.versionNumber) {
            privateAllowed.set(`${doc.id}:${ver.versionNumber}`, { documentId: doc.id, versionId: ver.id });
          }
        }
      }
    }

    const publicDocs = await tx.document.findMany({
      where: { accessScope: 'PUBLIC', policyId: null, ownerCustomerId: null, ...(copilot ? { product: { isActive: true } } : {}) },
      include: { versions: { where: { isActive: true } } },
    });
    const publicDbById = new Map<string, { documentId: string; versionId: string }>();
    const publicAllowed = new Map<string, { documentId: string; versionId: string }>();
    for (const doc of publicDocs) {
      for (const ver of doc.versions) {
        if (doc.currentVersion === ver.versionNumber) {
          if (!copilot || ver.versionNumber === publicManifestPdfVersion) {
            publicDbById.set(doc.id, { documentId: doc.id, versionId: ver.id });
          }
          publicAllowed.set(`${doc.id}:${ver.versionNumber}`, { documentId: doc.id, versionId: ver.id });
        }
      }
    }

    const mappedCitations: MappedCitation[] = [];
    for (const c of citations) {
      const key = `${c.document_id}:${c.document_version}`;
      const location = copilot ? { sourceLocation: c.location } : { page: c.location?.pages?.[0] ?? 1 };
      if (publicByRag.has(key)) {
        const businessDocId = publicByRag.get(key)!;
        const dbMatch = publicDbById.get(businessDocId);
        if (dbMatch) {
          mappedCitations.push({ ...dbMatch, ...location });
        } else if (copilot) {
          return { valid: false, mappedCitations: [] };
        }
        continue;
      }
      if (publicAllowed.has(key)) {
        const dbMatch = publicAllowed.get(key)!;
        mappedCitations.push({ ...dbMatch, ...location });
        continue;
      }
      if (privateAllowed.has(key)) {
        const dbMatch = privateAllowed.get(key)!;
        mappedCitations.push({ ...dbMatch, ...location });
        continue;
      }
      return { valid: false, mappedCitations: [] };
    }

    return { valid: true, mappedCitations };
  }

  async applyEvent(rawPayload: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
    const maybeObj = rawPayload && typeof rawPayload === 'object' ? (rawPayload as Record<string, unknown>) : null;
    const rawRunId = typeof maybeObj?.run_id === 'string' && UUID_RE.test(maybeObj.run_id) ? maybeObj.run_id : null;
    const rawAttemptId = typeof maybeObj?.attempt_id === 'string' && UUID_RE.test(maybeObj.attempt_id) ? maybeObj.attempt_id : null;
    const rawEventId = typeof maybeObj?.event_id === 'string' && UUID_RE.test(maybeObj.event_id) ? maybeObj.event_id : null;

    let event: {
      schema_version: 'agent-v1';
      run_id: string;
      attempt_id: string;
      event_id: string;
      sequence: number;
      kind: 'PROGRESS' | 'RESULT' | 'ERROR';
      payload: { stage?: string; result?: AgentResultPayload; failure?: { code: string; retryable: boolean } };
    };

    try {
      event = validateContract('AgentEvent', rawPayload);
    } catch {
      if (rawRunId && rawAttemptId && rawEventId) {
        return {
          status: 400,
          body: {
            outcome: 'REJECTED',
            run_id: rawRunId,
            attempt_id: rawAttemptId,
            event_id: rawEventId,
            reason: 'SCHEMA_INVALID',
          },
        };
      }
      return { status: 400, body: { error: { code: 'SCHEMA_INVALID' } } };
    }

    const ack = (
      outcome: 'ACCEPTED' | 'DUPLICATE' | 'IGNORED_STALE' | 'CONFLICT' | 'REJECTED',
      reason: string | null = null,
    ) => ({
      outcome,
      run_id: event.run_id,
      attempt_id: event.attempt_id,
      event_id: event.event_id,
      reason,
    });

    const payloadSha256 = sha256Json(event);
    let conversationIdToClaim: string | null = null;

    const outcome = await this.database.prisma.$transaction(async tx => {
      const attemptLookup = await tx.agentAttempt.findUnique({
        where: { id: event.attempt_id },
        include: { run: true },
      });
      if (!attemptLookup || attemptLookup.runId !== event.run_id) {
        return { status: 400, body: ack('REJECTED', 'UNKNOWN_RUN') };
      }

      const conversationId = attemptLookup.run.conversationId;
      await tx.$queryRaw`SELECT id FROM business.conversations WHERE id = ${conversationId}::uuid FOR UPDATE`;

      const existingById = await tx.agentRunEvent.findUnique({
        where: { eventId: event.event_id },
      });
      if (existingById) {
        if (
          existingById.attemptId === event.attempt_id &&
          existingById.runId === event.run_id &&
          existingById.payloadSha256 === payloadSha256
        ) {
          return { status: 200, body: ack('DUPLICATE') };
        }
        return { status: 409, body: ack('CONFLICT', 'PAYLOAD_MISMATCH') };
      }

      const existingBySeq = await tx.agentRunEvent.findUnique({
        where: {
          attemptId_sequence: {
            attemptId: event.attempt_id,
            sequence: event.sequence,
          },
        },
      });
      if (existingBySeq) {
        return { status: 409, body: ack('CONFLICT', 'SEQUENCE_CONFLICT') };
      }

      const ignoreStale = async () => {
        await tx.agentRunEvent.create({ data: { eventId: event.event_id, attemptId: event.attempt_id, runId: event.run_id,
          sequence: event.sequence, kind: event.kind, payloadSha256, decision: 'IGNORED_STALE' } });
        return { status: 200, body: ack('IGNORED_STALE', 'ATTEMPT_NOT_CURRENT') };
      };
      const liveRun = await tx.agentRun.findUniqueOrThrow({ where: { id: event.run_id },
        include: { conversation: { select: { channelType: true } } } });
      const checkedAt = new Date();
      if (liveRun.conversation.channelType === 'STAFF_COPILOT' && liveRun.status === 'RUNNING'
        && liveRun.currentAttemptId === event.attempt_id && copilotDeadlinePassed(liveRun.limits, checkedAt)) {
        await expireCopilotRun(tx, liveRun, checkedAt);
      }

      let ctx: AuthorizedAttemptContext | null = null;
      try {
        ctx = await this.access.authorizeInTx(tx, event.run_id, event.attempt_id);
      } catch (error) {
        if (!(error instanceof AgentApiError)) throw error;
        if (error.code === 'NOT_AUTHORIZED' && liveRun.conversation.channelType === 'STAFF_COPILOT') {
          await fenceAgentConversation(tx, conversationId, 'PERMISSION_CHANGED');
        }
      }

      if (!ctx) return ignoreStale();

      const run = liveRun;
      const attempt = await tx.agentAttempt.findUniqueOrThrow({ where: { id: event.attempt_id } });

      if (event.kind === 'PROGRESS') {
        await tx.agentRunEvent.create({
          data: {
            eventId: event.event_id,
            attemptId: event.attempt_id,
            runId: event.run_id,
            sequence: event.sequence,
            kind: 'PROGRESS',
            payloadSha256,
            decision: 'ACCEPTED',
          },
        });
        if (attempt.state === 'DISPATCHING') {
          await tx.agentAttempt.update({
            where: { id: attempt.id },
            data: { state: 'ACCEPTED', acceptedAt: new Date() },
          });
        }
        if (event.sequence > run.progressSequence && event.payload.stage) {
          await tx.agentRun.update({
            where: { id: run.id },
            data: {
              progressStage: event.payload.stage,
              progressSequence: event.sequence,
            },
          });
        }
        return { status: 200, body: ack('ACCEPTED') };
      }

      const now = new Date();

      if (event.kind === 'ERROR') {
        await tx.agentRunEvent.create({
          data: {
            eventId: event.event_id,
            attemptId: event.attempt_id,
            runId: event.run_id,
            sequence: event.sequence,
            kind: 'ERROR',
            payloadSha256,
            decision: 'ACCEPTED',
          },
        });
        await tx.agentAttempt.update({
          where: { id: attempt.id },
          data: { state: 'FINISHED' },
        });
        await finishAgentRun(tx, run.id, {
            status: 'FAILED',
            failure: (event.payload.failure ?? { code: 'INTERNAL', retryable: false }) as Prisma.InputJsonObject,
            finishedAt: now,
          });
        conversationIdToClaim = conversationId;
        return { status: 200, body: ack('ACCEPTED') };
      }

      // RESULT
      const result = event.payload.result!;
      if (ctx.channelType === 'STAFF_COPILOT' && result.actions.length > 0) {
        await tx.agentRunEvent.create({
          data: {
            eventId: event.event_id,
            attemptId: event.attempt_id,
            runId: event.run_id,
            sequence: event.sequence,
            kind: 'RESULT',
            payloadSha256,
            decision: 'ACCEPTED',
          },
        });
        await tx.agentAttempt.update({
          where: { id: attempt.id },
          data: { state: 'FINISHED' },
        });
        await finishAgentRun(tx, run.id, {
            status: 'FAILED',
            failure: { code: 'OUTPUT_INVALID', retryable: false },
            finishedAt: now,
          });
        conversationIdToClaim = conversationId;
        return { status: 200, body: ack('ACCEPTED') };
      }

      const citationCheck = await this.resolveAndVerifyCitations(tx, ctx, result.citations);
      const completedAt = new Date();
      if (ctx.channelType === 'STAFF_COPILOT' && copilotDeadlinePassed(run.limits, completedAt)) {
        await expireCopilotRun(tx, run, completedAt);
        return ignoreStale();
      }
      if (!citationCheck.valid) {
        await tx.agentRunEvent.create({
          data: {
            eventId: event.event_id,
            attemptId: event.attempt_id,
            runId: event.run_id,
            sequence: event.sequence,
            kind: 'RESULT',
            payloadSha256,
            decision: 'ACCEPTED',
          },
        });
        await tx.agentAttempt.update({
          where: { id: attempt.id },
          data: { state: 'FINISHED' },
        });
        await finishAgentRun(tx, run.id, {
            status: 'FAILED',
            failure: { code: 'OUTPUT_INVALID', retryable: false },
            finishedAt: now,
          });
        conversationIdToClaim = conversationId;
        return { status: 200, body: ack('ACCEPTED') };
      }

      const conv = await tx.conversation.findUniqueOrThrow({
        where: { id: conversationId },
        select: { lastCustomerFacingActivityAt: true, controlVersion: true, channelType: true },
      });
      const isCustomerVisible = conv.channelType === 'CUSTOMER_SUPPORT';
      const activity = isCustomerVisible
        ? new Date(Math.max(now.getTime(), conv.lastCustomerFacingActivityAt?.getTime() ?? 0))
        : conv.lastCustomerFacingActivityAt;

      const ticketAction = result.actions.find(a => a.type === 'PROPOSE_TICKET');
      const handoffAction = result.actions.find(a => a.type === 'PROPOSE_HANDOFF');

      const counter = await tx.conversation.update({
        where: { id: conversationId },
        data: {
          nextMessageSequence: { increment: 1 },
          ...(isCustomerVisible ? { lastCustomerFacingActivityAt: activity } : {}),
          ...(ticketAction ? { draftTicketPayload: ticketAction.summary as Prisma.InputJsonObject } : {}),
          ...(handoffAction && handoffAction.reason ? { aiSummary: handoffAction.reason } : {}),
        },
        select: { nextMessageSequence: true },
      });

      const aiMessage = await tx.message.create({
        data: {
          conversationId,
          senderType: 'AI_AGENT',
          senderId: null,
          sequence: counter.nextMessageSequence,
          audience: isCustomerVisible ? 'CUSTOMER_VISIBLE' : 'INTERNAL',
          internalMessageId: event.event_id,
          content: result.message,
          citations: (citationCheck.mappedCitations.length
            ? citationCheck.mappedCitations
            : result.citations) as Prisma.InputJsonValue,
          createdAt: now,
        },
      });

      await tx.auditLog.create({
        data: {
          actorType: 'SYSTEM',
          actorId: null,
          action: 'CONVERSATION_MESSAGE_APPENDED',
          targetType: 'Message',
          targetId: aiMessage.id,
          outcome: 'SUCCESS',
          requestId: randomUUID(),
        },
      });

      if (isCustomerVisible) {
        await tx.outboxEvent.create({
          data: {
            aggregateType: 'CONVERSATION',
            aggregateId: conversationId,
            eventType: 'MESSAGE_COMMITTED',
            payload: {
              schemaVersion: 2,
              reason: 'MESSAGE_APPENDED',
              messageId: aiMessage.id,
              sequence: aiMessage.sequence.toString(),
              controlVersion: conv.controlVersion,
            },
          },
        });
      }

      await tx.agentRunEvent.create({
        data: {
          eventId: event.event_id,
          attemptId: event.attempt_id,
          runId: event.run_id,
          sequence: event.sequence,
          kind: 'RESULT',
          payloadSha256,
          decision: 'ACCEPTED',
        },
      });

      await tx.agentAttempt.update({
        where: { id: attempt.id },
        data: { state: 'FINISHED' },
      });

      await finishAgentRun(tx, run.id, {
          status: 'COMPLETED',
          result: result as Prisma.InputJsonObject,
          resultMessageId: aiMessage.id,
          finishedAt: now,
        });

      conversationIdToClaim = conversationId;
      return { status: 200, body: ack('ACCEPTED') };
    });

    if (conversationIdToClaim) this.runInBackground(this.claimNext(conversationIdToClaim), 'claim');

    return outcome;
  }

  async reconcileTick(): Promise<void> {
    const now = new Date();

    // The queue deadline remains in force even while an old writer is being revoked.
    const dueCopilots = await this.database.prisma.$queryRaw<{ conversation_id: string }[]>`
      SELECT r.conversation_id FROM business.agent_runs r
      JOIN business.conversations c ON c.id = r.conversation_id
      WHERE c.channel_type = 'STAFF_COPILOT' AND r.status IN ('QUEUED', 'RUNNING')
        AND COALESCE(r.limits->>'deadline_at', '') <= ${now.toISOString()}
      ORDER BY COALESCE(r.limits->>'deadline_at', ''), r.id LIMIT 20`;
    for (const { conversation_id: id } of dueCopilots) {
      await this.database.prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM business.conversations WHERE id = ${id}::uuid FOR UPDATE`;
        const run = await tx.agentRun.findFirst({ where: { conversationId: id, status: { in: ['QUEUED', 'RUNNING'] } } });
        if (run && copilotDeadlinePassed(run.limits, now)) await expireCopilotRun(tx, run, now);
      });
    }

    // 1. Check expired RUNNING runs past deadline + 5s grace
    const runningRuns = await this.database.prisma.agentRun.findMany({
      where: { status: 'RUNNING', currentAttemptId: { not: null }, conversation: { channelType: 'CUSTOMER_SUPPORT' } },
      select: { id: true, currentAttemptId: true, limits: true },
      take: 20,
    });
    for (const run of runningRuns) {
      const limits = (run.limits ?? {}) as { deadline_at?: string };
      if (limits.deadline_at) {
        const deadlineMs = Date.parse(limits.deadline_at);
        if (!Number.isNaN(deadlineMs) && deadlineMs + 5000 <= now.getTime() && run.currentAttemptId) {
          await this.invalidateAttempt(run.currentAttemptId, 'DEADLINE');
        }
      }
    }

    // Snapshot retries before claiming new work, which dispatches its first attempt immediately.
    const dueAttempts = await this.database.prisma.agentAttempt.findMany({
      where: {
        state: { in: ['DISPATCHING', 'INVALIDATING'] },
        nextDispatchAt: { lte: now },
      },
      orderBy: { nextDispatchAt: 'asc' },
      take: 20,
    });
    // Filter blocked conversations before applying the batch limit. claimNext rechecks under lock.
    const queued = await this.database.prisma.$queryRaw<{ conversation_id: string }[]>`
      SELECT r.conversation_id
      FROM business.agent_runs r
      JOIN business.conversations c ON c.id = r.conversation_id
      WHERE r.status = 'QUEUED'
        AND (
          (c.channel_type = 'STAFF_COPILOT' AND c.assigned_staff_id IS NOT NULL)
          OR (
            c.channel_type = 'CUSTOMER_SUPPORT' AND c.support_origin = 'AI' AND c.status = 'AI_ACTIVE'
            AND NOT EXISTS (
              SELECT 1 FROM business.conversation_handoffs h
              WHERE h.conversation_id = c.id AND h.state IN ('PENDING', 'ACCEPTED') AND h.revoked_at IS NULL
            )
          )
        )
        AND NOT EXISTS (
          SELECT 1 FROM business.agent_runs other
          WHERE other.conversation_id = c.id
            AND (other.status = 'RUNNING' OR (other.status = 'QUEUED' AND other.queue_position < r.queue_position))
        )
        AND NOT EXISTS (
          SELECT 1 FROM business.agent_runs previous
          JOIN business.agent_attempts a ON a.run_id = previous.id
          WHERE previous.conversation_id = c.id AND a.state = 'INVALIDATING'
        )
      ORDER BY r.created_at, r.id
      LIMIT 20`;
    for (const { conversation_id: id } of queued) {
      await this.claimNext(id);
    }

    // A transport timeout should delay this bounded batch by one timeout, not one per attempt.
    await Promise.allSettled(dueAttempts.map(attempt => attempt.state === 'DISPATCHING'
      ? this.dispatchAttempt(attempt.id)
      : this.sendRevocation(attempt.id)));
  }
}
