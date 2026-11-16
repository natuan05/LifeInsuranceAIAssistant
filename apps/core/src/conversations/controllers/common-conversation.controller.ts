import { BadRequestException, Controller, ForbiddenException, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from '../../auth/services/auth.service';
import { DatabaseService } from '../../database/database.service';
import { ConversationReadStateResponseDto, MarkConversationReadResponseDto } from '../dto/conversation-workflow-response.dto';
import { ConversationTranscriptService } from '../services/conversation-transcript.service';
import { ConversationCommandService } from '../services/conversation-command.service';
import { ConversationMessageService } from '../services/conversation-message.service';
import { ConversationSessionService, type ConversationRequest } from '../services/conversation-session.service';

@ApiTags('Conversations') @ApiCookieAuth('session')
@Controller('conversations')
export class CommonConversationController {
  constructor(
    private readonly messagesService: ConversationMessageService,
    private readonly commands: ConversationCommandService,
    private readonly session: ConversationSessionService,
    private readonly auth: AuthService,
    private readonly database: DatabaseService,
    private readonly transcript: ConversationTranscriptService,
  ) {}

  @Get(':conversationId/read-state') @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Read receipt prefix for current role, with current transcript authorization; no read mutation.' })
  @ApiOkResponse({ type: ConversationReadStateResponseDto })
  async readState(@Req() request: ConversationRequest, @Param('conversationId', new ParseUUIDPipe()) id: string,
    @Query() query: Record<string, unknown>) {
    if (Object.keys(query).length) throw new BadRequestException();
    const { actor } = await this.auth.me(request);
    if (actor.role !== 'CUSTOMER' && actor.role !== 'STAFF') throw new ForbiddenException();
    return this.transcript.readState(request, actor.role, id);
  }

  @Post(':conversationId/read') @HttpCode(200) @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Mark unread messages in conversation as read for current actor.' })
  @ApiOkResponse({ type: MarkConversationReadResponseDto })
  async markRead(@Req() request: ConversationRequest, @Param('conversationId', new ParseUUIDPipe()) id: string,
    @Query() query: Record<string, unknown>) {
    if (Object.keys(query).length) throw new BadRequestException();
    const { actor } = await this.auth.me(request);
    if (actor.role !== 'CUSTOMER' && actor.role !== 'STAFF') throw new ForbiddenException();
    return this.session.write(request, actor.role, 'NOTIFICATION_READ',
      (tx, actorId) => this.commands.lock(tx, actorId, id),
      (tx, actorId) => this.messagesService.markAsRead(tx, { id: actorId, role: actor.role as 'CUSTOMER' | 'STAFF' }, id));
  }
}

