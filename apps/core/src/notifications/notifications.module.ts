import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { TicketsModule } from '../tickets/tickets.module';
@Module({ imports: [ConversationsModule, TicketsModule], controllers: [NotificationsController], providers: [NotificationsService] })
export class NotificationsModule {}
