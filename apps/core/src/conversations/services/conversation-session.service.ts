import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { AuthService } from '../../auth/services/auth.service';
import { DatabaseService } from '../../database/database.service';
import { Prisma } from '../../generated/prisma/client';
import { ConversationCommandService } from './conversation-command.service';
import { ConversationRateLimitService } from './conversation-rate-limit.service';
export type ConversationRequest = IncomingMessage & { requestId?: string };
export type ConversationRole = 'CUSTOMER' | 'STAFF';
@Injectable()
export class ConversationSessionService {
  constructor(private readonly database: DatabaseService, private readonly auth: AuthService,
    private readonly commands: ConversationCommandService, private readonly rate: ConversationRateLimitService) {}
  async read<T>(request: ConversationRequest, role: ConversationRole,
    work: (tx: Prisma.TransactionClient, actorId: string) => Promise<T>, lookup = false) {
    const { actor } = await this.auth.me(request); if (actor.role !== role) throw new ForbiddenException();
    if (lookup) await this.rate.command(actor.id, 'LOOKUP'); else await this.rate.read(actor.id);
    return this.database.prisma.$transaction(async tx => {
      const current = await this.auth.me(request, tx);
      if (current.actor.id !== actor.id || current.actor.role !== role) throw new UnauthorizedException();
      return work(tx, actor.id);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async write<T>(request: ConversationRequest, role: ConversationRole, quota: 'CREATE' | 'HANDOFF' | 'ACCEPT' | 'NOTIFICATION_READ',
    lock: (tx: Prisma.TransactionClient, actorId: string) => Promise<unknown>,
    work: (tx: Prisma.TransactionClient, actorId: string) => Promise<T>) {
    const { actor } = await this.auth.authorizeWrite(request, this.database.prisma);
    if (actor.role !== role) throw new ForbiddenException();
    await this.rate.command(actor.id, quota);
    return this.commands.transaction(async tx => {
      await lock(tx, actor.id);
      const current = await this.auth.authorizeWrite(request, tx);
      if (current.actor.id !== actor.id || current.actor.role !== role) throw new UnauthorizedException();
      return work(tx, actor.id);
    });
  }
}
