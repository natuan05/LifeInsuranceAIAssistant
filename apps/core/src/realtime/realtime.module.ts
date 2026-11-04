import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { RealtimeService } from './realtime.service';
@Module({ imports: [AuthModule, DatabaseModule, ConversationsModule], providers: [RealtimeService], exports: [RealtimeService] })
export class RealtimeModule {}
