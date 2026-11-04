import { Controller, Get, Header, Param, ParseUUIDPipe, Query, Req } from '@nestjs/common';
import { ApiBadRequestResponse, ApiCookieAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { IncomingMessage } from 'node:http';
import { InboxConversationsQuery, InboxGroupsQuery } from '../dto/inbox-query.dto';
import { InboxConversationsResponseDto, InboxGroupsResponseDto } from '../dto/conversation-response.dto';
import { StaffInboxService } from '../services/staff-inbox.service';

@ApiTags('Staff Inbox') @ApiCookieAuth('session')
@ApiUnauthorizedResponse({ description: 'Missing, expired, revoked or locked session.' })
@ApiForbiddenResponse({ description: 'Staff role required.' })
@ApiBadRequestResponse({ description: 'VALIDATION_ERROR or INVALID_CURSOR. Unknown fields, invalid UUID/limit/query or mismatched cursor.' })
@ApiResponse({ status: 429, description: 'RATE_LIMITED; Retry-After seconds. Read quota 240 requests/minute/actor.' })
@Controller('staff/inbox/customers')
export class StaffInboxController {
  constructor(private readonly inbox: StaffInboxService) {}

  @Get() @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'A08: visible Customer groups; literal name/code search, filters and keyset pagination, without counts.' })
  @ApiOkResponse({ type: InboxGroupsResponseDto })
  groups(@Req() request: IncomingMessage, @Query() query: InboxGroupsQuery) { return this.inbox.groups(request, query); }

  @Get(':customerId/conversations') @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'A08: lazy conversation list for one assigned Customer. Pending exposes shared request metadata only.' })
  @ApiOkResponse({ type: InboxConversationsResponseDto })
  @ApiNotFoundResponse({ description: 'Customer missing or outside active assignment.' })
  conversations(@Req() request: IncomingMessage, @Param('customerId', new ParseUUIDPipe()) id: string,
    @Query() query: InboxConversationsQuery) { return this.inbox.conversations(request, id, query); }
}
