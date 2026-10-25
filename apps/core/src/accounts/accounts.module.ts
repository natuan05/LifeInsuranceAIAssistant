import { Module, type DynamicModule } from '@nestjs/common';
import type { PrismaClient } from '../generated/prisma/client';
import { AccountManagementService } from './services/account-management.service';
import { AccountProvisioningService } from './services/account-provisioning.service';

// Only the local admin entrypoint supplies an admin_runtime client.
@Module({})
export class AccountsModule {
  static register(client: PrismaClient): DynamicModule {
    return {
      module: AccountsModule,
      providers: [
        { provide: AccountManagementService, useFactory: () => new AccountManagementService(client) },
        { provide: AccountProvisioningService, useFactory: () => new AccountProvisioningService(client) },
      ],
      exports: [AccountManagementService, AccountProvisioningService],
    };
  }
}
