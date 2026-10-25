import { Module, type DynamicModule } from '@nestjs/common';
import type { PrismaClient } from '../generated/prisma/client';
import { AccountsModule } from '../accounts/accounts.module';
import { AdminController } from './controllers/admin.controller';
import { OperatorAuth } from './services/operator-auth.service';

@Module({})
export class AdminModule {
  static register(client: PrismaClient, credential: { username: string; passwordHash: string }, origins: string[]): DynamicModule {
    return {
      module: AdminModule,
      imports: [AccountsModule.register(client)],
      controllers: [AdminController],
      providers: [{ provide: OperatorAuth, useFactory: () => new OperatorAuth(client, credential, origins) }],
    };
  }
}
