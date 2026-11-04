import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../../auth/services/auth.service';
import { DatabaseService } from '../../database/database.service';
import type { SendMessageDto } from '../dto/send-message.dto';
import { ConversationMessageService } from './conversation-message.service';
import { ConversationSessionService, type ConversationRequest, type ConversationRole } from './conversation-session.service';
import { ConversationRateLimitService } from './conversation-rate-limit.service';
import { ConversationAccessService } from './conversation-access.service';

@Injectable()
export class ConversationSendingService {
  constructor(private readonly auth: AuthService, private readonly database: DatabaseService,
    private readonly messages: ConversationMessageService, private readonly session: ConversationSessionService,
    private readonly rate: ConversationRateLimitService, private readonly access: ConversationAccessService) {}
  async send(request: ConversationRequest, role: ConversationRole, id: string, input: SendMessageDto) {
    const { actor } = await this.auth.authorizeWrite(request, this.database.prisma);
    if (actor.role !== role) throw new ForbiddenException();
    await this.rate.command(actor.id, 'SEND');
    const result = await this.messages.send(actor, id, input.clientMessageId, input.expectedVersion, input.content, async tx => {
      const current = await this.auth.authorizeWrite(request, tx);
      if (current.actor.id !== actor.id || current.actor.role !== role) throw new UnauthorizedException();
    });
    const projection = await this.lookup(request, role, id, input.clientMessageId, false);
    return { ...projection, replayed: result.replayed };
  }
  lookup(request: ConversationRequest, role: ConversationRole, id: string, key: string, quota = true) {
    return this.session.read(request, role, async (tx, actorId) => {
      const grant = role === 'STAFF' ? await this.access.requireTranscript(tx, actorId, id) : await this.access.requireCustomer(tx, actorId, id);
      const row = await tx.message.findFirst({ where: { conversationId: id, senderId: actorId, clientMessageId: key, audience: 'CUSTOMER_VISIBLE' },
        select: { id: true, sequence: true, clientMessageId: true, senderType: true, content: true, createdAt: true,
          sender: { select: { customerProfile: { select: { fullName: true } }, staffProfile: { select: { fullName: true } } } } } });
      if (!row) throw new NotFoundException();
      return { message: { id: row.id, sequence: row.sequence.toString(), clientMessageId: row.clientMessageId,
        senderType: row.senderType, sender: { displayName: row.senderType === 'CUSTOMER' ? row.sender?.customerProfile?.fullName ?? 'Customer' : row.sender?.staffProfile?.fullName ?? 'Staff' },
        content: row.content, createdAt: row.createdAt.toISOString(), citations: [] }, controlVersion: grant.controlVersion };
    }, quota);
  }
}
