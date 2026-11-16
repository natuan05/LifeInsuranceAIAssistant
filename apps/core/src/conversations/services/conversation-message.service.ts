import { SafeApiException } from '../../http/safe-api.exception';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { ConversationAccessService } from './conversation-access.service';
import { ConversationCommandService } from './conversation-command.service';

type Actor = { id: string; role: 'CUSTOMER' | 'STAFF' };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Explicit projection: neither tool payload nor raw citations escape this module.
const publicSelect = { id: true, conversationId: true, sequence: true, senderType: true,
  clientMessageId: true, content: true, createdAt: true } satisfies Prisma.MessageSelect;

@Injectable()
export class ConversationMessageService {
  constructor(private readonly access: ConversationAccessService, private readonly commands: ConversationCommandService) {}
  private input(key: string, version: number, text: string) {
    if (!uuid.test(key) || !Number.isSafeInteger(version) || version < 0 || typeof text !== 'string') throw new BadRequestException();
    const content = text.replace(/\r\n?/g, '\n');
    if (!content.trim() || [...content].length > 4000) throw new BadRequestException();
    return content;
  }

  // Internal trusted Core API. A future HTTP caller must authenticate/authorize
  // its session inside this transaction via the mandatory authorize callback.
  async send(actor: Actor, id: string, key: string, expectedVersion: number, text: string,
    authorize: (tx: Prisma.TransactionClient) => Promise<void>) {
    const content = this.input(key, expectedVersion, text);
    return this.commands.transaction(async tx => {
      await this.commands.lock(tx, actor.id, id);
      let version = -1;
      const receipt = await this.commands.execute(tx, actor.id, 'SEND_MESSAGE', key,
        { conversationId: id, expectedVersion, content }, async () => {
          await authorize(tx);
          const grant = actor.role === 'STAFF' ? await this.access.requireTranscript(tx, actor.id, id)
            : await this.access.requireCustomer(tx, actor.id, id);
          if (!grant.canSend) throw new NotFoundException();
          version = grant.controlVersion;
        }, async () => {
          if (version !== expectedVersion) throw new SafeApiException('STALE_CONVERSATION');
          const message = await this.append(tx, id, actor.role, actor.id, content, key, null);
          return { resourceId: message.id, resultVersion: version };
        });
      const message = await tx.message.findFirst({ where: { id: receipt.resourceId, conversationId: id,
        senderId: actor.id, audience: 'CUSTOMER_VISIBLE' }, select: publicSelect });
      if (!message) throw new NotFoundException();
      return { message: { ...message, sequence: message.sequence.toString() }, controlVersion: version, replayed: receipt.replayed };
    });
  }

  // No browser controller exposes this. Agent service authentication/transport is
  // intentionally deferred; the mandatory callback is the trusted-service gate.
  async appendAI(customerId: string, id: string, internalMessageId: string, expectedVersion: number, text: string,
    authorizeService: (tx: Prisma.TransactionClient) => Promise<void>) {
    const content = this.input(internalMessageId, expectedVersion, text);
    return this.commands.transaction(async tx => {
      await this.commands.lock(tx, customerId, id);
      await authorizeService(tx);
      const conversation = await this.access.requireCustomer(tx, customerId, id);
      if (conversation.supportOrigin !== 'AI' || conversation.status !== 'AI_ACTIVE' || conversation.handoffs.length ||
        conversation.controlVersion !== expectedVersion) throw new SafeApiException('STALE_CONVERSATION');
      const existing = await tx.message.findUnique({ where: { conversationId_internalMessageId: { conversationId: id, internalMessageId } }, select: publicSelect });
      if (existing) {
        if (existing.content !== content || existing.senderType !== 'AI_AGENT') throw new SafeApiException('IDEMPOTENCY_CONFLICT');
        return { ...existing, sequence: existing.sequence.toString() };
      }
      const message = await this.append(tx, id, 'AI_AGENT', null, content, null, internalMessageId);
      return { ...message, sequence: message.sequence.toString() };
    });
  }

  async acceptedSystemMessage(tx: Prisma.TransactionClient, id: string, handoffId: string, staffId: string) {
    const existing = await tx.message.findUnique({ where: { conversationId_internalMessageId: { conversationId: id, internalMessageId: handoffId } } });
    if (existing) return existing;
    const profile = await tx.staffProfile.findUniqueOrThrow({ where: { userId: staffId }, select: { fullName: true } });
    return this.append(tx, id, 'SYSTEM', null,
      `Staff ${profile.fullName} has accepted your request and will respond as soon as possible.`, null, handoffId);
  }

  async markAsRead(tx: Prisma.TransactionClient, actor: { id: string; role: 'CUSTOMER' | 'STAFF' }, id: string) {
    if (actor.role === 'STAFF') await this.access.requireTranscript(tx, actor.id, id);
    else await this.access.requireCustomer(tx, actor.id, id);
    const now = new Date();
    const targetSenderType = actor.role === 'CUSTOMER' ? { not: 'CUSTOMER' as const } : 'CUSTOMER';
    const updated = await tx.message.updateMany({
      where: { conversationId: id, senderType: targetSenderType, readAt: null, audience: 'CUSTOMER_VISIBLE' },
      data: { readAt: now },
    });
    if (actor.role === 'CUSTOMER') {
      await tx.notification.updateMany({
        where: { recipientCustomerId: actor.id, conversationId: id, kind: 'STAFF_MESSAGE_UNREAD', isRead: false },
        data: { isRead: true },
      });
    } else if (actor.role === 'STAFF') {
      await tx.notification.updateMany({
        where: { recipientStaffId: actor.id, conversationId: id, kind: 'CUSTOMER_MESSAGE_UNREAD', isRead: false },
        data: { isRead: true },
      });
    }
    if (updated.count > 0) {
      const conv = await tx.conversation.findUniqueOrThrow({ where: { id }, select: { controlVersion: true } });
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'CONVERSATION',
          aggregateId: id,
          eventType: 'MESSAGE_COMMITTED',
          payload: { schemaVersion: 1, controlVersion: conv.controlVersion },
        },
      });
    }
    return { success: true, readAt: now.toISOString() };
  }

  private async append(tx: Prisma.TransactionClient, id: string, senderType: 'CUSTOMER' | 'STAFF' | 'AI_AGENT' | 'SYSTEM',
    senderId: string | null, content: string, clientMessageId: string | null, internalMessageId: string | null) {
    const previous = await tx.conversation.findUniqueOrThrow({ where: { id }, select: { lastCustomerFacingActivityAt: true, controlVersion: true } });
    const now = new Date();
    const activity = new Date(Math.max(now.getTime(), previous.lastCustomerFacingActivityAt?.getTime() ?? 0));
    const counter = await tx.conversation.update({ where: { id }, data: {
      nextMessageSequence: { increment: 1 }, lastCustomerFacingActivityAt: activity,
    }, select: { nextMessageSequence: true } });
    const message = await tx.message.create({ data: { conversationId: id, senderType, senderId, content,
      clientMessageId, internalMessageId, sequence: counter.nextMessageSequence, audience: 'CUSTOMER_VISIBLE', createdAt: now }, select: publicSelect });
    await tx.auditLog.create({ data: { actorType: senderId ? 'USER' : 'SYSTEM', actorId: senderId,
      action: 'CONVERSATION_MESSAGE_APPENDED', targetType: 'Message', targetId: message.id, outcome: 'SUCCESS', requestId: randomUUID() } });
    await tx.outboxEvent.create({ data: { aggregateType: 'CONVERSATION', aggregateId: id, eventType: 'MESSAGE_COMMITTED',
      payload: { schemaVersion: 1, controlVersion: previous.controlVersion } } });
    return message;
  }
}
