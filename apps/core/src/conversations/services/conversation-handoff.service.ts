import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SafeApiException } from '../../http/safe-api.exception';
import type { ConversationVersionCommandDto, RequestHandoffDto } from '../dto/conversation-entry.dto';
import { ConversationAccessService } from './conversation-access.service';
import { ConversationCommandService } from './conversation-command.service';
import { ConversationEntryService } from './conversation-entry.service';
import { ConversationSessionService, type ConversationRequest } from './conversation-session.service';
import { recordConversationCommand } from './conversation-events';
import { StaffInboxService } from './staff-inbox.service';
import { ConversationMessageService } from './conversation-message.service';

@Injectable()
export class ConversationHandoffService {
  constructor(private readonly session: ConversationSessionService, private readonly commands: ConversationCommandService,
    private readonly access: ConversationAccessService, private readonly entry: ConversationEntryService, private readonly inbox: StaffInboxService,
    private readonly messages: ConversationMessageService) {}
  request(request: ConversationRequest, id: string, input: RequestHandoffDto) {
    if (input.consent?.confirmed !== true || input.consent.scope !== 'ENTIRE_CUSTOMER_VISIBLE_CONVERSATION' ||
      input.consent.textVersion !== 'handoff-v1') throw new BadRequestException();
    return this.session.write(request, 'CUSTOMER', 'HANDOFF', (tx, actorId) => this.commands.lock(tx, actorId, id), async (tx, actorId) => {
      const receipt = await this.commands.execute(tx, actorId, 'REQUEST_HANDOFF', input.clientRequestId,
        { conversationId: id.toLowerCase(), expectedVersion: input.expectedVersion, expectedAssignmentVersion: input.expectedAssignmentVersion,
          sharedSubject: input.sharedSubject, sharedReason: input.sharedReason ?? '', consent: { confirmed: input.consent.confirmed,
            scope: input.consent.scope, textVersion: input.consent.textVersion } },
        async () => { await this.access.requireCustomer(tx, actorId, id); }, async () => {
          const conversation = await tx.conversation.findUniqueOrThrow({ where: { id } });
          if (conversation.status === 'PENDING_HANDOFF') throw new SafeApiException('HANDOFF_ALREADY_PENDING');
          if (conversation.status === 'STAFF_ACTIVE') throw new SafeApiException('ALREADY_ACCEPTED');
          if (conversation.controlVersion !== input.expectedVersion) throw new SafeApiException('STALE_CONVERSATION');
          const assignment = await this.entry.requireRouting(tx, actorId, input.expectedAssignmentVersion);
          const evidence = await tx.conversationHandoff.create({ data: { conversationId: id, customerId: actorId,
            assignmentId: assignment.id, recipientStaffId: assignment.staffId, sharedSubject: input.sharedSubject,
            sharedReason: input.sharedReason || null, consentScope: input.consent.scope,
            consentTextVersion: input.consent.textVersion, confirmedByCustomerId: actorId } });
          const updated = await tx.conversation.update({ where: { id }, data: {
            status: 'PENDING_HANDOFF', assignedStaffId: null, controlVersion: { increment: 1 } } });
          await recordConversationCommand(tx, actorId, 'CUSTOMER', id, 'HANDOFF_REQUESTED', updated.controlVersion, request.requestId, evidence.id);
          return { resourceId: evidence.id, resultVersion: updated.controlVersion };
        });
      const evidence = await tx.conversationHandoff.findFirst({ where: { id: receipt.resourceId, conversationId: id, customerId: actorId } });
      if (!evidence) throw new NotFoundException();
      const conversation = await tx.conversation.findUniqueOrThrow({ where: { id }, select: { id: true, status: true, controlVersion: true } });
      return { request: { id: evidence.id, state: evidence.state, requestedAt: evidence.confirmedAt.toISOString() }, conversation, replayed: receipt.replayed };
    });
  }
  accept(request: ConversationRequest, id: string, input: ConversationVersionCommandDto) {
    return this.session.write(request, 'STAFF', 'ACCEPT', (tx, actorId) => this.commands.lock(tx, actorId, id), async (tx, actorId) => {
      const receipt = await this.commands.execute(tx, actorId, 'ACCEPT_HANDOFF', input.clientRequestId,
        { conversationId: id.toLowerCase(), expectedVersion: input.expectedVersion },
        async () => { await this.access.requireMetadata(tx, actorId, id); }, async () => {
          const grant = await this.access.requireMetadata(tx, actorId, id);
          if (!grant.canAccept) throw new SafeApiException(grant.capability === 'TRANSCRIPT' ? 'ALREADY_ACCEPTED' : 'STALE_CONVERSATION');
          if (grant.controlVersion !== input.expectedVersion) throw new SafeApiException('STALE_CONVERSATION');
          const evidence = await tx.conversationHandoff.findFirst({ where: { conversationId: id, state: 'PENDING',
            recipientStaffId: actorId, assignment: { isActive: true }, revokedAt: null } });
          if (!evidence) throw new NotFoundException();
          await tx.conversationHandoff.update({ where: { id: evidence.id }, data: { state: 'ACCEPTED', acceptedByStaffId: actorId, acceptedAt: new Date() } });
          const updated = await tx.conversation.update({ where: { id }, data: { status: 'STAFF_ACTIVE',
            assignedStaffId: actorId, controlVersion: { increment: 1 } } });
          await this.messages.acceptedSystemMessage(tx, id, evidence.id, actorId);
          await recordConversationCommand(tx, actorId, 'STAFF', id, 'HANDOFF_ACCEPTED', updated.controlVersion, request.requestId, evidence.id);
          return { resourceId: id, resultVersion: updated.controlVersion };
        });
      // A prior receipt is not authority: recheck the current transcript grant.
      await this.access.requireTranscript(tx, actorId, id);
      return { conversation: await this.inbox.metadataInTransaction(tx, actorId, id), replayed: receipt.replayed };
    });
  }
  reconcile(request: ConversationRequest, id: string, key: string) {
    return this.session.read(request, 'STAFF', async (tx, actorId) => {
      await this.access.requireMetadata(tx, actorId, id);
      const receipt = await tx.conversationCommandReceipt.findUnique({ where: { actorId_operation_clientRequestId: {
        actorId, operation: 'ACCEPT_HANDOFF', clientRequestId: key } } });
      if (!receipt || receipt.resourceId !== id.toLowerCase()) throw new NotFoundException();
      const grant = await this.access.requireTranscript(tx, actorId, id);
      return { state: 'COMMITTED', resourceId: id, conversationId: id, controlVersion: grant.controlVersion };
    }, true);
  }
}
