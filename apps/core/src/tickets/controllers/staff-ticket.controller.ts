import { BadRequestException, Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { UpdateTicketStatusDto } from '../dto/update-ticket-status.dto';
import { AcceptTicketDto } from '../dto/accept-ticket.dto';
import { ApiBadRequestResponse, ApiCookieAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { IncomingMessage } from 'node:http';
import { TicketQuery } from '../dto/ticket-query.dto';
import { TicketDetailResponseDto, TicketListResponseDto } from '../dto/ticket-response.dto';
import { TicketService } from '../services/ticket.service';

@ApiTags('Staff Tickets') @ApiCookieAuth('session')
@ApiUnauthorizedResponse({ description: 'A current Staff session is required.' })
@ApiForbiddenResponse({ description: 'Staff role required.' })
@ApiBadRequestResponse({ description: 'Invalid UUID/query/cursor or unsupported field.' })
@ApiNotFoundResponse({ description: 'Absent or outside the current Staff recipient and assignment scope.' })
@ApiResponse({ status: 429, description: '120 Ticket reads per minute per actor; Retry-After returned.' })
@Controller('staff/tickets')
export class StaffTicketController {
  constructor(private readonly tickets: TicketService) {}
  @Patch(':ticketId/status') @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Transition Ticket status, including reopen; version, role, CSRF and current scope enforced.' })
  @ApiOkResponse({ type: TicketDetailResponseDto })
  @ApiResponse({ status: 409, description: 'Stale version or invalid transition.' })
  updateStatus(@Req() request: IncomingMessage, @Param('ticketId', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateTicketStatusDto, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).length) throw new BadRequestException();
    return this.tickets.updateStatus(request, id, body.expectedVersion, body.status);
  }
  @Get() @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Search assigned recipient Tickets; keyset pagination without counts.' })
  @ApiOkResponse({ type: TicketListResponseDto })
  list(@Req() request: IncomingMessage, @Query() query: TicketQuery) { return this.tickets.list(request, query); }

  @Get(':ticketId') @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Read Ticket independently of chat; a chat link is returned only after its own gate.' })
  @ApiOkResponse({ type: TicketDetailResponseDto })
  detail(@Req() request: IncomingMessage, @Param('ticketId', new ParseUUIDPipe()) id: string, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).length) throw new BadRequestException();
    return this.tickets.detail(request, id);
  }

  @Post(':ticketId/accept') @HttpCode(200) @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Accept assigned Ticket independently of chat. Requires Origin, X-Auth-Request and CSRF; 30 commands/minute.' })
  @ApiResponse({ status: 409, description: 'STALE_TICKET: stale version or unsupported state.' })
  @ApiResponse({ status: 429, description: '30 Ticket accept commands per minute per actor; Retry-After returned.' })
  @ApiOkResponse({ type: TicketDetailResponseDto })
  accept(@Req() request: IncomingMessage, @Param('ticketId', new ParseUUIDPipe()) id: string,
    @Body() input: AcceptTicketDto, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).length) throw new BadRequestException();
    return this.tickets.accept(request, id, input.expectedVersion);
  }
}
