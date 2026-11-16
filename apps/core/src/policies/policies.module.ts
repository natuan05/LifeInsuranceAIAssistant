import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { StaffPolicyController } from './controllers/staff-policy.controller';
import { CustomerPolicyController } from './controllers/customer-policy.controller';
import { PolicyService } from './services/policy.service';
import { PolicyStorageService } from './services/policy-storage.service';

@Module({ imports: [AuthModule, DatabaseModule], controllers: [StaffPolicyController, CustomerPolicyController], providers: [PolicyService, PolicyStorageService], exports: [PolicyService, PolicyStorageService] })
export class PoliciesModule {}
