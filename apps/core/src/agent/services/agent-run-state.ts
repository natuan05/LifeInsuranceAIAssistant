import { Prisma } from '../../generated/prisma/client';

export const copilotRunChanged = 'COPILOT_RUN_CHANGED';
type TerminalUpdate = Prisma.AgentRunUncheckedUpdateInput & { status: 'COMPLETED' | 'FAILED' | 'CANCELLED' };

export async function finishAgentRun(tx: Prisma.TransactionClient, id: string, data: TerminalUpdate) {
  const run = await tx.agentRun.update({ where: { id }, data,
    select: { conversationId: true, conversation: { select: { channelType: true } } } });
  if (run.conversation.channelType === 'STAFF_COPILOT') {
    await tx.outboxEvent.create({ data: {
      aggregateType: 'CONVERSATION', aggregateId: run.conversationId, eventType: copilotRunChanged,
      payload: { schemaVersion: 1, runId: id },
    } });
  }
}

type FenceReason = 'STAFF_TAKEOVER' | 'CANCELLED_BY_CORE' | 'PERMISSION_CHANGED';

// The caller holds the conversation row lock, including during assignment changes.
export async function fenceAgentConversation(tx: Prisma.TransactionClient, conversationId: string, reason: FenceReason, cancelQueued = true) {
  const now = new Date();
  const outcomeCode = reason === 'PERMISSION_CHANGED' ? 'PERMISSION_DENIED' : reason;
  const conversation = await tx.conversation.findUniqueOrThrow({ where: { id: conversationId }, select: { channelType: true } });
  const copilot = conversation.channelType === 'STAFF_COPILOT';
  if (cancelQueued && !copilot) {
    await tx.agentRun.updateMany({ where: { conversationId, status: 'QUEUED' },
      data: { status: 'CANCELLED', failure: { code: outcomeCode, retryable: false }, finishedAt: now } });
  }
  const runs = await tx.agentRun.findMany({
    where: { conversationId, status: { in: cancelQueued && copilot ? ['RUNNING', 'QUEUED'] : ['RUNNING'] } },
    include: { currentAttempt: true },
  });
  const invalidatedAttemptIds: string[] = [];
  for (const run of runs) {
    await finishAgentRun(tx, run.id, { status: 'CANCELLED', failure: { code: outcomeCode, retryable: false }, finishedAt: now });
    if (run.currentAttempt && ['DISPATCHING', 'ACCEPTED'].includes(run.currentAttempt.state)) {
      await tx.agentAttempt.update({ where: { id: run.currentAttempt.id }, data: {
        state: 'INVALIDATING', revocationReason: reason, revocationRequestedAt: now, nextDispatchAt: now,
      } });
      invalidatedAttemptIds.push(run.currentAttempt.id);
    }
  }
  return invalidatedAttemptIds;
}

export function copilotDeadlinePassed(limits: Prisma.JsonValue, now: Date) {
  const deadline = (limits as { deadline_at?: string } | null)?.deadline_at;
  return !deadline || !(Date.parse(deadline) > now.getTime());
}

export async function expireCopilotRun(tx: Prisma.TransactionClient, run: {
  id: string; currentAttemptId: string | null; status: string;
}, now: Date) {
  if (run.status === 'RUNNING' && run.currentAttemptId) {
    await tx.agentAttempt.updateMany({
      where: { id: run.currentAttemptId, state: { in: ['DISPATCHING', 'ACCEPTED'] } },
      data: { state: 'INVALIDATING', revocationReason: 'DEADLINE', revocationRequestedAt: now, nextDispatchAt: now },
    });
  }
  await finishAgentRun(tx, run.id, { status: 'FAILED', failure: { code: 'DEADLINE_EXCEEDED', retryable: false }, finishedAt: now });
}

export async function fenceCopilotsForAccount(tx: Prisma.TransactionClient, filter: { customerId: string } | { userId: string }) {
  const affected = 'customerId' in filter
    ? Prisma.sql`customer_id = ${filter.customerId}::uuid`
    : Prisma.sql`(customer_id = ${filter.userId}::uuid OR assigned_staff_id = ${filter.userId}::uuid)`;
  const threads = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM business.conversations c
    WHERE channel_type = 'STAFF_COPILOT' AND ${affected}
      AND EXISTS (SELECT 1 FROM business.agent_runs r
        WHERE r.conversation_id = c.id AND r.status IN ('QUEUED', 'RUNNING'))
    ORDER BY id FOR UPDATE`;
  for (const { id } of threads) await fenceAgentConversation(tx, id, 'PERMISSION_CHANGED');
}
