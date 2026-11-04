import { ConversationSendingService } from '../services/conversation-sending.service';
import { SendMessageDto, SendMessageResponseDto, MessageLookupResponseDto } from '../dto/send-message.dto';
import { BadRequestException, Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiCookieAuth, ApiCreatedResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { ServerResponse } from 'node:http';
import { CreateConversationDto, CustomerCommandQuery, RequestHandoffDto } from '../dto/conversation-entry.dto';
import { CustomerConversationsQuery, MessageQueryDto } from '../dto/message-query.dto';
import { ChatSupportDto, CommandReceiptDto, CreateConversationResponseDto, CustomerConversationResponseDto, CustomerConversationsResponseDto, HandoffResponseDto, TranscriptResponseDto } from '../dto/conversation-workflow-response.dto';
import { ConversationEntryService } from '../services/conversation-entry.service';
import { ConversationHandoffService } from '../services/conversation-handoff.service';
import { ConversationTranscriptService } from '../services/conversation-transcript.service';
import type { ConversationRequest } from '../services/conversation-session.service';
const noQuery = (query: Record<string, unknown>) => { if (Object.keys(query).length) throw new BadRequestException(); };

@ApiTags('Customer Conversations') @ApiCookieAuth('session')
@ApiUnauthorizedResponse({ description: 'Session required.' })
@ApiForbiddenResponse({ description: 'Customer role required; writes also require Origin/JSON/X-Auth-Request/CSRF.' })
@ApiBadRequestResponse({ description: 'Invalid/unknown input, cursor, consent version/scope or query.' })
@ApiNotFoundResponse({ description: 'Missing/out-of-scope resource, Copilot, transcript not classified, or unknown receipt.' })
@ApiConflictResponse({ description: 'STALE_CONVERSATION, ROUTING_CHANGED, STAFF_UNAVAILABLE, IDEMPOTENCY_CONFLICT, HANDOFF_ALREADY_PENDING or ALREADY_ACCEPTED.' })
@ApiResponse({ status: 429, description: 'Actor quota exceeded; Retry-After seconds.' })
@Controller('customers/me')
export class CustomerConversationController {
  constructor(private readonly entry: ConversationEntryService, private readonly handoff: ConversationHandoffService,
    private readonly transcript: ConversationTranscriptService, private readonly sending: ConversationSendingService) {}
  @Get('chat-support') @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Current routing availability and server-controlled full-history consent text.' }) @ApiOkResponse({ type: ChatSupportDto })
  support(@Req() request: ConversationRequest, @Query() query: Record<string, unknown>) { noQuery(query); return this.entry.support(request); }

  @Post('conversations') @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Create new AI-private or Direct conversation. Never converts an existing AI conversation.' })
  @ApiCreatedResponse({ type: CreateConversationResponseDto }) @ApiOkResponse({ type: CreateConversationResponseDto, description: 'Idempotent replay.' })
  async create(@Req() request: ConversationRequest, @Body() input: CreateConversationDto, @Query() query: Record<string, unknown>, @Res({ passthrough: true }) response: ServerResponse) {
    noQuery(query); const result = await this.entry.create(request, input); response.statusCode = result.replayed ? 200 : 201; return result;
  }
  @Get('conversations') @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Own Customer Support conversations only; cursor pagination without counts.' }) @ApiOkResponse({ type: CustomerConversationsResponseDto })
  list(@Req() request: ConversationRequest, @Query() query: CustomerConversationsQuery) { return this.entry.list(request, query); }

  @Get('conversation-commands/:clientRequestId') @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Reconcile own entry/handoff command. A 404 never proves an in-flight command did not commit.' }) @ApiOkResponse({ type: CommandReceiptDto })
  reconcile(@Req() request: ConversationRequest, @Param('clientRequestId', new ParseUUIDPipe()) key: string, @Query() query: CustomerCommandQuery) {
    return this.entry.reconcile(request, key, query);
  }
  @Get('conversations/:conversationId') @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Own safe conversation metadata and current routing/action capabilities.' }) @ApiOkResponse({ type: CustomerConversationResponseDto })
  detail(@Req() request: ConversationRequest, @Param('conversationId', new ParseUUIDPipe()) id: string, @Query() query: Record<string, unknown>) {
    noQuery(query); return this.entry.detail(request, id);
  }
  @Post('conversations/:conversationId/handoff-requests') @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Customer explicitly confirms sharing the whole Customer-facing history with current Staff. No Ticket is created.' })
  @ApiCreatedResponse({ type: HandoffResponseDto }) @ApiOkResponse({ type: HandoffResponseDto, description: 'Idempotent replay of the original request, with current state.' })
  async requestStaff(@Req() request: ConversationRequest, @Param('conversationId', new ParseUUIDPipe()) id: string,
    @Body() input: RequestHandoffDto, @Query() query: Record<string, unknown>, @Res({ passthrough: true }) response: ServerResponse) {
    noQuery(query); const result = await this.handoff.request(request, id, input); response.statusCode = result.replayed ? 200 : 201; return result;
  }
  @Post('conversations/:conversationId/messages') @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Send one Customer-visible message with current session/grant and idempotent clientMessageId; no delivery/read ACK.' })
  @ApiResponse({ status: 201, type: SendMessageResponseDto, description: 'Message committed.' }) @ApiOkResponse({ type: SendMessageResponseDto, description: 'Idempotent replay.' })
  async sendMessage(@Req() request: ConversationRequest, @Param('conversationId', new ParseUUIDPipe()) id: string,
    @Body() input: SendMessageDto, @Query() query: Record<string, unknown>, @Res({ passthrough: true }) response: ServerResponse) {
    if (Object.keys(query).length) throw new BadRequestException();
    const result = await this.sending.send(request, 'CUSTOMER', id, input); response.statusCode = result.replayed ? 200 : 201; return result;
  }
  @Get('conversations/:conversationId/messages/by-client-id/:clientMessageId') @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Reconcile only this actor?s message; current access required, 404 does not prove rollback.' })
  @ApiOkResponse({ type: MessageLookupResponseDto })
  messageByClientId(@Req() request: ConversationRequest, @Param('conversationId', new ParseUUIDPipe()) id: string,
    @Param('clientMessageId', new ParseUUIDPipe()) key: string, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).length) throw new BadRequestException(); return this.sending.lookup(request, 'CUSTOMER', id, key);
  }
  @Get('conversations/:conversationId/messages') @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Own Customer-facing transcript with exclusive before/after cursors; no Copilot or tool payload.' }) @ApiOkResponse({ type: TranscriptResponseDto })
  messages(@Req() request: ConversationRequest, @Param('conversationId', new ParseUUIDPipe()) id: string, @Query() query: MessageQueryDto) {
    return this.transcript.messages(request, 'CUSTOMER', id, query);
  }
}
