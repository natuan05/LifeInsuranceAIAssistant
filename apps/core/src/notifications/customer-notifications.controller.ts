import { BadRequestException, Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CustomerConversationsQuery } from '../conversations/dto/message-query.dto';
import type { ConversationRequest } from '../conversations/services/conversation-session.service';
import { NotificationsService } from './notifications.service';
import {
  CustomerNotificationsResponseDto,
  NotificationReadAllResponseDto,
  NotificationReadResponseDto,
} from './notification-response.dto';

@ApiTags('Customer Notifications')
@ApiCookieAuth('session')
@Controller('customers/me/notifications')
export class CustomerNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'N02: List own customer notifications with keyset pagination and generic safe content.' })
  @ApiOkResponse({ type: CustomerNotificationsResponseDto })
  list(@Req() request: ConversationRequest, @Query() query: CustomerConversationsQuery) {
    return this.notifications.listForCustomer(request, query);
  }

  @Post(':notificationId/read')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'N02: Mark single own notification as read.' })
  @ApiOkResponse({ type: NotificationReadResponseDto })
  read(
    @Req() request: ConversationRequest,
    @Param('notificationId', new ParseUUIDPipe()) id: string,
    @Body() body: Record<string, unknown>,
    @Query() query: Record<string, unknown>,
  ) {
    if (body && (typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length)) {
      throw new BadRequestException();
    }
    if (Object.keys(query).length) throw new BadRequestException();
    return this.notifications.readForCustomer(request, id);
  }

  @Post('read-all')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'N02: Mark all own notifications as read.' })
  @ApiOkResponse({ type: NotificationReadAllResponseDto })
  readAll(
    @Req() request: ConversationRequest,
    @Body() body: Record<string, unknown>,
    @Query() query: Record<string, unknown>,
  ) {
    if (body && (typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length)) {
      throw new BadRequestException();
    }
    if (Object.keys(query).length) throw new BadRequestException();
    return this.notifications.readAllForCustomer(request);
  }
}

