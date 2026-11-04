import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { OutboxDispatcherService } from './services/outbox-dispatcher.service';
@Module({ imports: [DatabaseModule, ConversationsModule, RealtimeModule], providers: [OutboxDispatcherService] })
export class OutboxModule {}
