import { ConversationEventService } from './services/conversation-event.service';
import { ConversationSendingService } from './services/conversation-sending.service';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { StaffInboxController } from './controllers/staff-inbox.controller';
import { StaffConversationController } from './controllers/staff-conversation.controller';
import { ConversationRateLimitService } from './services/conversation-rate-limit.service';
import { StaffInboxService } from './services/staff-inbox.service';
import { PoliciesModule } from '../policies/policies.module';
import { CustomerConversationController } from './controllers/customer-conversation.controller';
import { ConversationSessionService } from './services/conversation-session.service';
import { ConversationEntryService } from './services/conversation-entry.service';
import { ConversationHandoffService } from './services/conversation-handoff.service';
import { ConversationTranscriptService } from './services/conversation-transcript.service';
import { ConversationAccessService } from './services/conversation-access.service';
import { ConversationCommandService } from './services/conversation-command.service';
import { ConversationMessageService } from './services/conversation-message.service';

// Customer/Staff messaging; no Agent impersonation endpoint.
@Module({ imports: [DatabaseModule, AuthModule, PoliciesModule], controllers: [StaffInboxController, StaffConversationController, CustomerConversationController],
  providers: [ConversationEventService, ConversationSendingService, ConversationAccessService, ConversationCommandService, ConversationMessageService, ConversationRateLimitService, StaffInboxService,
    ConversationSessionService, ConversationEntryService, ConversationHandoffService, ConversationTranscriptService],
  exports: [ConversationSessionService, ConversationRateLimitService, ConversationEventService, ConversationAccessService, ConversationCommandService, ConversationMessageService] })
export class ConversationsModule {}
