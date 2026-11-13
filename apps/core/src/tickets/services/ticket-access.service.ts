import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { legacyTicketConfirmation } from '../dto/ticket-confirmation';

// Internal policy: callers obtain actorId from an authenticated STAFF session.
// Apply this predicate before search, projection, pagination or event routing.
@Injectable()
export class TicketAccessService {
  staffScope(actorId: string, now = new Date()): Prisma.SupportTicketWhereInput {
    return {
      assignedStaffId: actorId,
      staff: { user: { role: 'STAFF', status: 'ACTIVE',
        OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] } },
      customer: { assignments: { some: { staffId: actorId, isActive: true } } },
    };
  }

  async requireTicket(tx: Prisma.TransactionClient, actorId: string, id: string) {
    const ticket = await tx.supportTicket.findFirst({
      where: { id, AND: [this.staffScope(actorId)] },
      select: { id: true, customerId: true, assignedStaffId: true, status: true, version: true },
    });
    if (!ticket) throw new NotFoundException();
    // Receiving a Ticket never grants conversation metadata or transcript access.
    return { ...ticket, ...legacyTicketConfirmation(), allowedActions: { accept: ticket.status === 'ASSIGNED' || ticket.status === 'OPEN' } };
  }
}
