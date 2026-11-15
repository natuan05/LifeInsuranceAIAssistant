import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { ConversationCommandService } from '../../conversations/services/conversation-command.service';
import type { ChatEvent } from '../../conversations/services/conversation-event.service';
import { TicketAccessService } from './ticket-access.service';
import { Prisma } from '../../generated/prisma/client';

export const ticketEventTypes = ['TICKET_CREATED', 'TICKET_ACCEPTED', 'TICKET_STATUS_CHANGED'] as const;
export const ticketNotificationTitle = (kind: string) => kind === 'TICKET_CREATED' ? 'New support ticket' : kind === 'TICKET_ACCEPTED' ? 'Support ticket accepted' : 'Support ticket status updated';
@Injectable()
export class TicketEventService {
  constructor(private readonly database: DatabaseService, private readonly access: TicketAccessService,
    private readonly commands: ConversationCommandService) {}

  // Only the known legacy creation payload can be repaired. The immutable
  // confirmation and creation audit establish version 0, regardless of today's version.
  private async repairCreation(tx: Prisma.TransactionClient, source: { id: string; aggregateId: string; eventType: string; payload: Prisma.JsonValue }) {
    const payload = source.payload;
    if (source.eventType !== 'TICKET_CREATED' || !payload || typeof payload !== 'object' || Array.isArray(payload)
      || Object.hasOwn(payload, 'version')) return payload;
    const keys = Object.keys(payload).sort().join(',');
    if (keys !== 'assignedStaffId,customerId,schemaVersion,status,ticketId' || payload.schemaVersion !== 1
      || payload.ticketId !== source.aggregateId || payload.status !== 'OPEN') throw new Error('Unverified legacy Ticket event');
    const ticket = await tx.supportTicket.findUnique({ where: { id: source.aggregateId },
      select: { customerId: true, ticketCode: true, confirmedContent: true, confirmedAt: true } });
    const snapshot = ticket?.confirmedContent;
    if (!ticket || payload.customerId !== ticket.customerId || !snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)
      || snapshot.schemaVersion !== 1 || !['CUSTOMER_SUBMITTED', 'CUSTOMER_CONFIRMED'].includes(String(snapshot.source))
      || snapshot.confirmedAt !== ticket.confirmedAt.toISOString()) throw new Error('Unverified legacy Ticket event');
    const audit = await tx.auditLog.findFirst({ where: { action: 'TICKET_CREATED', actorType: 'USER', actorId: ticket.customerId,
      actorRole: 'CUSTOMER', targetType: 'SupportTicket', targetId: source.aggregateId, outcome: 'SUCCESS',
      AND: [{ metadata: { path: ['ticketCode'], equals: ticket.ticketCode } }, { metadata: { path: ['status'], equals: 'OPEN' } }] }, select: { id: true } });
    if (!audit) throw new Error('Unverified legacy Ticket event');
    const repaired = { schemaVersion: 1, version: 0 };
    await tx.outboxEvent.update({ where: { id: source.id }, data: { payload: repaired } });
    return repaired;
  }

  async replayCreated(id: string) {
    return this.commands.transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM business.outbox_events WHERE id=${id}::uuid FOR UPDATE`;
      const source = await tx.outboxEvent.findUnique({ where: { id } });
      if (!source || source.aggregateType !== 'TICKET' || source.eventType !== 'TICKET_CREATED') throw new Error('Not a Ticket creation event');
      if (source.status === 'PUBLISHED') return { queued: false };
      if (!['PENDING', 'FAILED_DLQ'].includes(source.status)) throw new Error('Event is leased');
      const payload = await this.repairCreation(tx, source);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.schemaVersion !== 1 || payload.version !== 0
        || !await tx.supportTicket.findUnique({ where: { id: source.aggregateId }, select: { id: true } })) throw new Error('Invalid Ticket creation event');
      await tx.outboxEvent.update({ where: { id }, data: { status: 'PENDING', retryCount: 0, nextAttemptAt: new Date(),
        leaseOwner: null, leaseExpiresAt: null, lastError: null } });
      return { queued: true };
    });
  }
  async route(event: ChatEvent): Promise<string[]> {
    return this.commands.transaction(async tx => {
      const source = await tx.outboxEvent.findFirst({ where: { id: event.id, aggregateType: 'TICKET', aggregateId: event.aggregateId,
        eventType: { in: [...ticketEventTypes] } }, select: { id: true, aggregateId: true, eventType: true, payload: true } });
      if (!source || source.eventType !== event.eventType) return [];
      const payload = await this.repairCreation(tx, source);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.schemaVersion !== 1
        || typeof payload.version !== 'number' || !Number.isSafeInteger(payload.version) || payload.version < 0
        || (source.eventType === 'TICKET_CREATED' && payload.version !== 0)
        || (source.eventType === 'TICKET_ACCEPTED' && payload.version < 1)) throw new Error('Invalid Ticket event schema');
      const discovered = await tx.supportTicket.findUnique({ where: { id: event.aggregateId }, select: { customerId: true, assignedStaffId: true, ticketCode: true } });
      if (!discovered) throw new Error('Missing Ticket aggregate');
      await this.commands.lockCustomer(tx, discovered.assignedStaffId ?? discovered.customerId, discovered.customerId);
      await tx.$queryRaw`SELECT id FROM business.support_tickets WHERE id=${event.aggregateId}::uuid FOR UPDATE`;
      const ticket = await tx.supportTicket.findFirst({ where: { id: event.aggregateId, customerId: discovered.customerId },
        select: { assignedStaffId: true, version: true, status: true, ticketCode: true } });
      if (!ticket || ticket.version < payload.version) return [];
      if (source.eventType === 'TICKET_ACCEPTED' && !['IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(ticket.status)) return [];
      const recipients: string[] = [];
      if (ticket.assignedStaffId && await tx.supportTicket.findFirst({ where: { id: event.aggregateId,
        AND: [this.access.staffScope(ticket.assignedStaffId)] }, select: { id: true } })) {
        const recipient = ticket.assignedStaffId, dedupKey = `${event.id}:${recipient}:${source.eventType}`;
        await tx.notification.upsert({ where: { dedupKey }, create: { dedupKey, recipientStaffId: recipient,
          ticketId: event.aggregateId, kind: source.eventType, title: ticketNotificationTitle(source.eventType) }, update: {} });
        recipients.push(recipient);
      }
      if (source.eventType === 'TICKET_CREATED') {
        const customerDedupKey = `${event.id}:${discovered.customerId}:SUPPORT_TICKET_CREATED`;
        await tx.notification.upsert({
          where: { dedupKey: customerDedupKey },
          create: {
            dedupKey: customerDedupKey,
            recipientCustomerId: discovered.customerId,
            ticketId: event.aggregateId,
            kind: 'SUPPORT_TICKET_CREATED',
            title: `Phiếu hỗ trợ #${discovered.ticketCode} của bạn đã được tạo`,
          },
          update: {},
        });
        recipients.push(discovered.customerId);
      }
      return recipients;
    });
  }
}
