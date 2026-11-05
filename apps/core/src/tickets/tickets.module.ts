import { Module } from '@nestjs/common';
import { TicketAccessService } from './services/ticket-access.service';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { StaffTicketController } from './controllers/staff-ticket.controller';
import { TicketService } from './services/ticket.service';
import { TicketCursorService } from './services/ticket-cursor.service';
import { TicketEventService } from './services/ticket-event.service';

// Staff reads and Ticket acceptance; no fixture, draft producer or Agent endpoint.
@Module({ imports: [DatabaseModule, AuthModule, ConversationsModule], controllers: [StaffTicketController],
  providers: [TicketAccessService, TicketService, TicketCursorService, TicketEventService], exports: [TicketAccessService, TicketEventService] })
export class TicketsModule {}
