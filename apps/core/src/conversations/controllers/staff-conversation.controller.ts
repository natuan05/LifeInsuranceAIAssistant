import { ConversationSendingService } from '../services/conversation-sending.service';
import { SendMessageDto, SendMessageResponseDto, MessageLookupResponseDto } from '../dto/send-message.dto';
import { BadRequestException, Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBadRequestResponse, ApiCookieAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ConversationMetadataResponseDto } from '../dto/conversation-response.dto';
import { StaffInboxService } from '../services/staff-inbox.service';
import { AcceptCommandQuery, ConversationVersionCommandDto } from '../dto/conversation-entry.dto';
import { MessageQueryDto } from '../dto/message-query.dto';
import { AcceptResponseDto, CommandReceiptDto, MarkConversationReadResponseDto, TranscriptResponseDto } from '../dto/conversation-workflow-response.dto';
import { ConversationHandoffService } from '../services/conversation-handoff.service';
import { ConversationTranscriptService } from '../services/conversation-transcript.service';
import { ConversationMessageService } from '../services/conversation-message.service';
import { ConversationCommandService } from '../services/conversation-command.service';
import { ConversationSessionService, type ConversationRequest } from '../services/conversation-session.service';

@ApiTags('Staff Inbox') @ApiCookieAuth('session')
@Controller('staff/conversations')
export class StaffConversationController {
  constructor(private readonly inbox: StaffInboxService, private readonly handoff: ConversationHandoffService,
    private readonly transcript: ConversationTranscriptService, private readonly sending: ConversationSendingService,
    private readonly messagesService: ConversationMessageService, private readonly commands: ConversationCommandService,
    private readonly session: ConversationSessionService) {}
  @Post(':conversationId/accept') @HttpCode(200) @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'A11: Accept a Customer-confirmed handoff; full-history grant/control/outbox commit atomically. No Ticket.' })
  @ApiOkResponse({ type: AcceptResponseDto }) @ApiResponse({ status: 409, description: 'STALE_CONVERSATION, ALREADY_ACCEPTED or IDEMPOTENCY_CONFLICT.' })
  accept(@Req() request: ConversationRequest, @Param('conversationId', new ParseUUIDPipe()) id: string,
    @Body() input: ConversationVersionCommandDto, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).length) throw new BadRequestException();
    return this.handoff.accept(request, id, input);
  }
  @Get(':conversationId/commands/:clientRequestId') @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Reconcile this Staff actor\'s committed Accept; receipt never bypasses the current grant.' }) @ApiOkResponse({ type: CommandReceiptDto })
  reconcile(@Req() request: ConversationRequest, @Param('conversationId', new ParseUUIDPipe()) id: string,
    @Param('clientRequestId', new ParseUUIDPipe()) key: string, @Query() query: AcceptCommandQuery) {
    if (query.operation !== 'ACCEPT_HANDOFF') throw new BadRequestException();
    return this.handoff.reconcile(request, id, key);
  }
  @Post(':conversationId/messages') @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Send one Customer-visible message with current session/grant and idempotent clientMessageId; no delivery/read ACK.' })
  @ApiResponse({ status: 201, type: SendMessageResponseDto, description: 'Message committed.' }) @ApiOkResponse({ type: SendMessageResponseDto, description: 'Idempotent replay.' })
  async sendMessage(@Req() request: ConversationRequest, @Param('conversationId', new ParseUUIDPipe()) id: string,
    @Body() input: SendMessageDto, @Query() query: Record<string, unknown>, @Res({ passthrough: true }) response: ServerResponse) {
    if (Object.keys(query).length) throw new BadRequestException();
    const result = await this.sending.send(request, 'STAFF', id, input); response.statusCode = result.replayed ? 200 : 201; return result;
  }
  @Get(':conversationId/messages/by-client-id/:clientMessageId') @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Reconcile only this actor?s message; current access required, 404 does not prove rollback.' })
  @ApiOkResponse({ type: MessageLookupResponseDto })
  messageByClientId(@Req() request: ConversationRequest, @Param('conversationId', new ParseUUIDPipe()) id: string,
    @Param('clientMessageId', new ParseUUIDPipe()) key: string, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).length) throw new BadRequestException(); return this.sending.lookup(request, 'STAFF', id, key);
  }
  @Get(':conversationId/messages') @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'A10: full Customer-facing history only after current Direct/Accept grant, including AI messages before handoff.' })
  @ApiOkResponse({ type: TranscriptResponseDto })
  @ApiNotFoundResponse({ description: 'Missing, pending, private AI, Copilot, legacy or revoked grant.' })
  messages(@Req() request: ConversationRequest, @Param('conversationId', new ParseUUIDPipe()) id: string, @Query() query: MessageQueryDto) {
    return this.transcript.messages(request, 'STAFF', id, query);
  }
  @Get(':conversationId') @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'A09: safe request/active metadata and server-calculated actions. Never returns transcript or AI private metadata.' })
  @ApiOkResponse({ type: ConversationMetadataResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid UUID or query; this endpoint takes no query parameters.' })
  @ApiUnauthorizedResponse({ description: 'Session required.' })
  @ApiForbiddenResponse({ description: 'Staff role required.' })
  @ApiNotFoundResponse({ description: 'Missing, private AI, Copilot, legacy or outside access scope; identical safe response.' })
  @ApiResponse({ status: 429, description: 'RATE_LIMITED with Retry-After.' })
  metadata(@Req() request: IncomingMessage, @Param('conversationId', new ParseUUIDPipe()) id: string,
    @Query() query: Record<string, unknown>) {
    if (Object.keys(query).length) throw new BadRequestException();
    return this.inbox.metadata(request, id);
  }
  @Post(':conversationId/read') @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Mark all unread customer messages in conversation as read.' })
  @ApiOkResponse({ type: MarkConversationReadResponseDto })
  markRead(@Req() request: ConversationRequest, @Param('conversationId', new ParseUUIDPipe()) id: string, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).length) throw new BadRequestException();
    return this.session.write(request, 'STAFF', 'NOTIFICATION_READ',
      (tx, actorId) => this.commands.lock(tx, actorId, id),
      (tx, actorId) => this.messagesService.markAsRead(tx, { id: actorId, role: 'STAFF' }, id));
  }
}
