import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { ConversationCommandService } from '../../conversations/services/conversation-command.service';
import type { ChatEvent } from '../../conversations/services/conversation-event.service';
import { TicketAccessService } from './ticket-access.service';

export const ticketEventTypes = ['TICKET_CREATED', 'TICKET_ACCEPTED', 'TICKET_STATUS_CHANGED'] as const;
export const ticketNotificationTitle = (kind: string) => kind === 'TICKET_CREATED' ? 'New support ticket' : kind === 'TICKET_ACCEPTED' ? 'Support ticket accepted' : 'Support ticket status updated';
@Injectable()
export class TicketEventService {
  constructor(private readonly database: DatabaseService, private readonly access: TicketAccessService,
    private readonly commands: ConversationCommandService) {}
  async route(event: ChatEvent): Promise<string[]> {
    return this.commands.transaction(async tx => {
      const source = await tx.outboxEvent.findFirst({ where: { id: event.id, aggregateType: 'TICKET', aggregateId: event.aggregateId,
        eventType: { in: [...ticketEventTypes] } }, select: { eventType: true, payload: true } });
      if (!source || source.eventType !== event.eventType) return [];
      const payload = source.payload;
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.schemaVersion !== 1
        || typeof payload.version !== 'number' || !Number.isSafeInteger(payload.version) || payload.version < 0
        || (source.eventType === 'TICKET_ACCEPTED' && payload.version < 1)) throw new Error('Invalid Ticket event schema');
      const discovered = await tx.supportTicket.findUnique({ where: { id: event.aggregateId }, select: { customerId: true, assignedStaffId: true } });
      if (!discovered?.assignedStaffId) return [];
      await this.commands.lockCustomer(tx, discovered.assignedStaffId, discovered.customerId);
      await tx.$queryRaw`SELECT id FROM business.support_tickets WHERE id=${event.aggregateId}::uuid FOR UPDATE`;
      const ticket = await tx.supportTicket.findFirst({ where: { id: event.aggregateId, customerId: discovered.customerId,
        AND: [this.access.staffScope(discovered.assignedStaffId)] }, select: { assignedStaffId: true, version: true, status: true } });
      if (!ticket?.assignedStaffId || ticket.version < payload.version) return [];
      if (source.eventType === 'TICKET_ACCEPTED' && !['IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(ticket.status)) return [];
      const recipient = ticket.assignedStaffId, dedupKey = `${event.id}:${recipient}:${source.eventType}`;
      await tx.notification.upsert({ where: { dedupKey }, create: { dedupKey, recipientStaffId: recipient,
        ticketId: event.aggregateId, kind: source.eventType, title: ticketNotificationTitle(source.eventType) }, update: {} });
      return [recipient];
    });
  }
}
