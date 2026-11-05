import { BadRequestException, Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CustomerConversationsQuery } from '../conversations/dto/message-query.dto';
import type { ConversationRequest } from '../conversations/services/conversation-session.service';
import { NotificationsService } from './notifications.service';
import { NotificationReadResponseDto, StaffNotificationsResponseDto } from './notification-response.dto';
@ApiTags('Staff Notifications') @ApiCookieAuth('session')
@Controller('staff/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}
  @Get() @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'A27: permission-first handoff/Ticket notifications; target CONVERSATION or TICKET, keyset pagination, no private previews.' }) @ApiOkResponse({ type: StaffNotificationsResponseDto })
  list(@Req() request: ConversationRequest, @Query() query: CustomerConversationsQuery) { return this.notifications.list(request, query); }
  @Post(':notificationId/read') @HttpCode(200) @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'A28: mark own in-scope notification read; does not Accept chat/Ticket or mark transcript read.' }) @ApiOkResponse({ type: NotificationReadResponseDto })
  read(@Req() request: ConversationRequest, @Param('notificationId', new ParseUUIDPipe()) id: string,
    @Body() body: Record<string, unknown>, @Query() query: Record<string, unknown>) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length || Object.keys(query).length) throw new BadRequestException();
    return this.notifications.read(request, id);
  }
}
