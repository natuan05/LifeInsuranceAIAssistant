import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SafeApiException } from '../../http/safe-api.exception';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { Prisma } from '../../generated/prisma/client';

export const conversationOperations = ['CREATE_AI', 'CREATE_DIRECT', 'REQUEST_HANDOFF', 'ACCEPT_HANDOFF', 'SEND_MESSAGE'] as const;
export type ConversationOperation = typeof conversationOperations[number];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
class RoutingRace extends Error {}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const object = value as Record<string, unknown>;
    return '{' + Object.keys(object).sort().map(key => JSON.stringify(key) + ':' + canonical(object[key])).join(',') + '}';
  }
  throw new BadRequestException();
}

@Injectable()
export class ConversationCommandService {
  constructor(private readonly database: DatabaseService) {}
  hash(payload: unknown) { return createHash('sha256').update(canonical(payload)).digest('hex'); }

  async transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try { return await this.database.prisma.$transaction(work, { timeout: 15000 }); }
      catch (error) {
        const retry = error instanceof RoutingRace || (error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2034' || (error.code === 'P2010' && ['40P01', '40001'].includes(String(error.meta?.code)))));
        if (!retry || attempt >= 2) throw error;
      }
    }
  }

  // Shared order with operator assignment writes: sorted users, customer,
  // assignment, conversation. Recheck a routing discovery made before locks.
  async lock(tx: Prisma.TransactionClient, actorId: string, id: string) {
    if (!uuid.test(actorId) || !uuid.test(id)) throw new BadRequestException();
    const discovered = await tx.conversation.findUnique({ where: { id }, select: { customerId: true } });
    if (!discovered) throw new NotFoundException();
    await this.lockCustomer(tx, actorId, discovered.customerId);
    await tx.$queryRaw`SELECT id FROM business.conversations WHERE id=${id}::uuid FOR UPDATE`;
    return discovered.customerId;
  }

  async lockCustomer(tx: Prisma.TransactionClient, actorId: string, customerId: string) {
    if (!uuid.test(actorId) || !uuid.test(customerId)) throw new BadRequestException();
    const before = await tx.staffAssignment.findFirst({ where: { customerId, isActive: true }, select: { staffId: true } });
    const users = [...new Set([actorId, customerId, ...(before ? [before.staffId] : [])])].sort();
    await tx.$queryRaw`SELECT id FROM business.users WHERE id::text IN (${Prisma.join(users)}) ORDER BY id FOR UPDATE`;
    const rows = await tx.$queryRaw<Array<{ user_id: string }>>`SELECT user_id FROM business.customer_profiles WHERE user_id=${customerId}::uuid FOR UPDATE`;
    if (!rows.length) throw new NotFoundException();
    const current = await tx.staffAssignment.findFirst({ where: { customerId, isActive: true }, select: { id: true, staffId: true } });
    if (current && !users.includes(current.staffId)) throw new RoutingRace();
    if (current) await tx.$queryRaw`SELECT id FROM business.staff_assignments WHERE id=${current.id}::uuid FOR UPDATE`;
  }

  // Caller must reauthorize inside the same transaction BEFORE this lookup,
  // including on replay. No cached Private response is stored in the receipt.
  async execute(tx: Prisma.TransactionClient, actorId: string, operation: ConversationOperation, key: string, payload: unknown,
    authorize: () => Promise<void>,
    work: () => Promise<{ resourceId: string; resultVersion: number }>) {
    if (!uuid.test(actorId) || !uuid.test(key) || !conversationOperations.includes(operation)) throw new BadRequestException();
    const hash = this.hash(payload);
    await authorize();
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${actorId + ':' + operation + ':' + key},0))`;
    const previous = await tx.conversationCommandReceipt.findUnique({ where: {
      actorId_operation_clientRequestId: { actorId, operation, clientRequestId: key },
    } });
    if (previous) {
      if (previous.requestHash !== hash) throw new SafeApiException('IDEMPOTENCY_CONFLICT');
      return { resourceId: previous.resourceId, resultVersion: previous.resultVersion, replayed: true };
    }
    const result = await work();
    await tx.conversationCommandReceipt.create({ data: { actorId, operation, clientRequestId: key, requestHash: hash, ...result } });
    return { ...result, replayed: false };
  }
}
