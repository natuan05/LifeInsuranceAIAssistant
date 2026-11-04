import { RealtimeModule } from './realtime/realtime.module';
import { OutboxModule } from './outbox/outbox.module';
import { NotificationsModule } from './notifications/notifications.module';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { CustomersModule } from './customers/customers.module';
import { PoliciesModule } from './policies/policies.module';
import { ProductsModule } from './products/products.module';
import { ConversationsModule } from './conversations/conversations.module';

@Module({ imports: [DatabaseModule, AuthModule, CustomersModule, PoliciesModule, ProductsModule, ConversationsModule, RealtimeModule, OutboxModule, NotificationsModule], controllers: [AppController] })
export class AppModule {}
