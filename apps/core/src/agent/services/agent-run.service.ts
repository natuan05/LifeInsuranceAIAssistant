import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Prisma } from '../../generated/prisma/client';
import { DatabaseService } from '../../database/database.service';
import { sha256Json, validateContract } from '../hmac';
import {
  AgentAccessService,
  type AuthorizedAttemptContext,
  loadPublicManifestEntries,
} from './agent-access.service';
import { AgentTransportService, type DurableAckDto } from './agent-transport.service';

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

@Injectable()
export class AgentRunService {
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
      const cursor = await this.computeThroughCursor(tx, params.linkedContextConversationId);
      linkedHistoryView = {
        conversation_id: params.linkedContextConversationId,
        through_cursor: cursor,
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
      if (invalidating) return null;

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

      const attemptId = randomUUID();
      const now = new Date();
      const trialLimits = loadTrialLimits();
      const deadlineAt = new Date(now.getTime() + trialLimits.deadline_s * 1000).toISOString();
      const storedLimits = (nextRun.limits ?? {}) as Record<string, unknown>;
      const limits = {
        deadline_at: deadlineAt,
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
        message_text: nextRun.message.content,
        channel_type: conv.channelType,
        actor: { id: actorId, role: actorRole },
        target_customer_id: conv.customerId,
        history_view: historyView,
        linked_history_view: linkedHistoryView,
        limits,
      });

      const prevCount = await tx.agentAttempt.count({ where: { runId: nextRun.id } });
      await tx.agentAttempt.create({
        data: {
          id: attemptId,
          runId: nextRun.id,
          attemptNo: prevCount + 1,
          state: 'DISPATCHING',
          request: runRequest as Prisma.InputJsonObject,
          requestSha256: sha256Json(runRequest),
          nextDispatchAt: now,
        },
      });

      await tx.agentRun.update({
        where: { id: nextRun.id },
        data: {
          status: 'RUNNING',
          currentAttemptId: attemptId,
          historyView: historyView as Prisma.InputJsonObject,
          limits: limits as Prisma.InputJsonObject,
          startedAt: now,
        },
      });

      return { attemptId, request: runRequest };
    });

    if (claimed) {
      void this.dispatchAttempt(claimed.attemptId);
    }
    return claimed;
  }

  private backoffDelayMs(count: number): number {
    const baseSec = Math.min(60, 1 * 2 ** Math.min(count, 10));
    const jitter = 1 + 0.2 * (2 * Math.random() - 1);
    return Math.round(baseSec * jitter * 1000);
  }

  async dispatchAttempt(attemptId: string): Promise<DurableAckDto | null> {
    const attempt = await this.database.prisma.agentAttempt.findUnique({
      where: { id: attemptId },
      include: { run: true },
    });
    if (!attempt || attempt.state !== 'DISPATCHING' || attempt.run.status !== 'RUNNING') {
      return null;
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
          await tx.agentRun.update({
            where: { id: current.runId },
            data: {
              status: 'FAILED',
              failure: { code: 'INTERNAL', retryable: false },
              finishedAt: now,
            },
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
    const now = new Date();
    const outcomeCode =
      reason === 'PERMISSION_CHANGED'
        ? 'PERMISSION_DENIED'
        : reason === 'STAFF_TAKEOVER'
          ? 'STAFF_TAKEOVER'
          : 'CANCELLED_BY_CORE';

    if (cancelQueued) {
      await tx.agentRun.updateMany({
        where: { conversationId, status: 'QUEUED' },
        data: {
          status: 'CANCELLED',
          failure: { code: outcomeCode, retryable: false },
          finishedAt: now,
        },
      });
    }

    const runningRuns = await tx.agentRun.findMany({
      where: { conversationId, status: 'RUNNING' },
      include: { currentAttempt: true },
    });

    const invalidatedAttemptIds: string[] = [];
    for (const run of runningRuns) {
      await tx.agentRun.update({
        where: { id: run.id },
        data: {
          status: 'CANCELLED',
          failure: { code: outcomeCode, retryable: false },
          finishedAt: now,
        },
      });
      if (run.currentAttempt && ['DISPATCHING', 'ACCEPTED'].includes(run.currentAttempt.state)) {
        await tx.agentAttempt.update({
          where: { id: run.currentAttempt.id },
          data: {
            state: 'INVALIDATING',
            revocationReason: reason,
            revocationRequestedAt: now,
            nextDispatchAt: now,
          },
        });
        invalidatedAttemptIds.push(run.currentAttempt.id);
      }
    }
    return invalidatedAttemptIds;
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
          await tx.agentRun.update({
            where: { id: fresh.runId },
            data: {
              status: 'FAILED',
              failure: { code: 'DEADLINE_EXCEEDED', retryable: false },
              finishedAt: now,
            },
          });
        } else {
          const code =
            reason === 'PERMISSION_CHANGED'
              ? 'PERMISSION_DENIED'
              : reason === 'STAFF_TAKEOVER'
                ? 'STAFF_TAKEOVER'
                : 'CANCELLED_BY_CORE';
          await tx.agentRun.update({
            where: { id: fresh.runId },
            data: {
              status: 'CANCELLED',
              failure: { code, retryable: false },
              finishedAt: now,
            },
          });
        }
      }
      return true;
    });

    if (changed) {
      void this.sendRevocation(attemptId);
    }
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

    if (conversationToClaim) {
      void this.claimNext(conversationToClaim);
    }
    return Boolean(ack);
  }

  private async resolveAndVerifyCitations(
    tx: Prisma.TransactionClient,
    ctx: AuthorizedAttemptContext,
    citations: AgentResultPayload['citations'],
  ): Promise<{ valid: boolean; mappedCitations: Array<{ documentId: string; versionId: string; page: number }> }> {
    if (!citations.length) return { valid: true, mappedCitations: [] };

    const publicEntries = loadPublicManifestEntries();
    const publicByRag = new Map(publicEntries.map(e => [`${e.ragDocumentId}:${e.ragVersion}`, e.businessDocumentId]));

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
      for (const doc of policy.documents) {
        for (const ver of doc.versions) {
          if (doc.currentVersion === ver.versionNumber) {
            privateAllowed.set(`${doc.id}:${ver.versionNumber}`, { documentId: doc.id, versionId: ver.id });
          }
        }
      }
    }

    const publicDocs = await tx.document.findMany({
      where: { accessScope: 'PUBLIC', policyId: null, ownerCustomerId: null },
      include: { versions: { where: { isActive: true } } },
    });
    const publicDbById = new Map<string, { documentId: string; versionId: string }>();
    const publicAllowed = new Map<string, { documentId: string; versionId: string }>();
    for (const doc of publicDocs) {
      for (const ver of doc.versions) {
        if (doc.currentVersion === ver.versionNumber) {
          publicDbById.set(doc.id, { documentId: doc.id, versionId: ver.id });
          publicAllowed.set(`${doc.id}:${ver.versionNumber}`, { documentId: doc.id, versionId: ver.id });
        }
      }
    }

    const mappedCitations: Array<{ documentId: string; versionId: string; page: number }> = [];
    for (const c of citations) {
      const key = `${c.document_id}:${c.document_version}`;
      const page = c.location?.pages?.[0] ?? 1;
      if (publicByRag.has(key)) {
        const businessDocId = publicByRag.get(key)!;
        const dbMatch = publicDbById.get(businessDocId);
        if (dbMatch) {
          mappedCitations.push({ documentId: dbMatch.documentId, versionId: dbMatch.versionId, page });
        }
        continue;
      }
      if (publicAllowed.has(key)) {
        const dbMatch = publicAllowed.get(key)!;
        mappedCitations.push({ documentId: dbMatch.documentId, versionId: dbMatch.versionId, page });
        continue;
      }
      if (privateAllowed.has(key)) {
        const dbMatch = privateAllowed.get(key)!;
        mappedCitations.push({ documentId: dbMatch.documentId, versionId: dbMatch.versionId, page });
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

      let ctx: AuthorizedAttemptContext | null = null;
      try {
        ctx = await this.access.authorizeInTx(tx, event.run_id, event.attempt_id);
      } catch {
        ctx = null;
      }

      if (!ctx) {
        await tx.agentRunEvent.create({
          data: {
            eventId: event.event_id,
            attemptId: event.attempt_id,
            runId: event.run_id,
            sequence: event.sequence,
            kind: event.kind,
            payloadSha256,
            decision: 'IGNORED_STALE',
          },
        });
        return { status: 200, body: ack('IGNORED_STALE', 'ATTEMPT_NOT_CURRENT') };
      }

      const run = await tx.agentRun.findUniqueOrThrow({ where: { id: event.run_id } });
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
        await tx.agentRun.update({
          where: { id: run.id },
          data: {
            status: 'FAILED',
            failure: (event.payload.failure ?? { code: 'INTERNAL', retryable: false }) as Prisma.InputJsonObject,
            finishedAt: now,
          },
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
        await tx.agentRun.update({
          where: { id: run.id },
          data: {
            status: 'FAILED',
            failure: { code: 'OUTPUT_INVALID', retryable: false },
            finishedAt: now,
          },
        });
        conversationIdToClaim = conversationId;
        return { status: 200, body: ack('ACCEPTED') };
      }

      const citationCheck = await this.resolveAndVerifyCitations(tx, ctx, result.citations);
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
        await tx.agentRun.update({
          where: { id: run.id },
          data: {
            status: 'FAILED',
            failure: { code: 'OUTPUT_INVALID', retryable: false },
            finishedAt: now,
          },
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

      await tx.agentRun.update({
        where: { id: run.id },
        data: {
          status: 'COMPLETED',
          result: result as Prisma.InputJsonObject,
          resultMessageId: aiMessage.id,
          finishedAt: now,
        },
      });

      conversationIdToClaim = conversationId;
      return { status: 200, body: ack('ACCEPTED') };
    });

    if (conversationIdToClaim) {
      void this.claimNext(conversationIdToClaim);
    }

    return outcome;
  }

  async reconcileTick(): Promise<void> {
    const now = new Date();

    // 1. Check expired RUNNING runs past deadline + 5s grace
    const runningRuns = await this.database.prisma.agentRun.findMany({
      where: { status: 'RUNNING', currentAttemptId: { not: null } },
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

    // 2. Reconcile due DISPATCHING or INVALIDATING attempts
    const dueAttempts = await this.database.prisma.agentAttempt.findMany({
      where: {
        state: { in: ['DISPATCHING', 'INVALIDATING'] },
        nextDispatchAt: { lte: now },
      },
      orderBy: { nextDispatchAt: 'asc' },
      take: 20,
    });
    for (const attempt of dueAttempts) {
      if (attempt.state === 'DISPATCHING') {
        await this.dispatchAttempt(attempt.id);
      } else if (attempt.state === 'INVALIDATING') {
        await this.sendRevocation(attempt.id);
      }
    }

    // 3. Claim queued runs on conversations that have no RUNNING run
    const queuedConversations = await this.database.prisma.agentRun.findMany({
      where: { status: 'QUEUED' },
      select: { conversationId: true },
      distinct: ['conversationId'],
      take: 20,
    });
    for (const row of queuedConversations) {
      await this.claimNext(row.conversationId);
    }
  }
}
