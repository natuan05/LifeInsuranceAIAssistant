import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { StaffPolicyController } from './controllers/staff-policy.controller';
import { PolicyService } from './services/policy.service';
import { PolicyStorageService } from './services/policy-storage.service';

@Module({ imports: [AuthModule, DatabaseModule], controllers: [StaffPolicyController], providers: [PolicyService, PolicyStorageService] })
export class PoliciesModule {}
