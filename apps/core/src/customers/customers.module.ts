import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { CustomerController } from './controllers/customer.controller';
import { CustomerService } from './services/customer.service';

@Module({ imports: [AuthModule, DatabaseModule], controllers: [CustomerController], providers: [CustomerService] })
export class CustomersModule {}
