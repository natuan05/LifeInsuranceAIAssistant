import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { OutboxDispatcherService } from './services/outbox-dispatcher.service';
import { TicketsModule } from '../tickets/tickets.module';
@Module({ imports: [DatabaseModule, ConversationsModule, RealtimeModule, TicketsModule], providers: [OutboxDispatcherService] })
export class OutboxModule {}
