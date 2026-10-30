import { RealtimeService } from './realtime/realtime.service';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { CustomersModule } from './customers/customers.module';

@Module({ imports: [DatabaseModule, AuthModule, CustomersModule], providers: [RealtimeService], controllers: [AppController] })
export class AppModule {}
