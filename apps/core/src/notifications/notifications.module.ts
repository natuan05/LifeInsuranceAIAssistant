import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { CustomerNotificationsController } from './customer-notifications.controller';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { TicketsModule } from '../tickets/tickets.module';
@Module({ imports: [DatabaseModule, ConversationsModule, TicketsModule], controllers: [NotificationsController, CustomerNotificationsController], providers: [NotificationsService] })
export class NotificationsModule {}
