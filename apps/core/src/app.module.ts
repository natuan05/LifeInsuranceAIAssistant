import { RealtimeService } from './realtime/realtime.service';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { CustomersModule } from './customers/customers.module';
import { PoliciesModule } from './policies/policies.module';

@Module({ imports: [DatabaseModule, AuthModule, CustomersModule, PoliciesModule], providers: [RealtimeService], controllers: [AppController] })
export class AppModule {}
