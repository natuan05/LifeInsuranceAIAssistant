import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { IncomingMessage } from 'node:http';
import { CustomerTicketQuery } from '../dto/customer-ticket-query.dto';
import { ConfirmTicketDto } from '../dto/confirm-ticket.dto';
import { CreateManualTicketDto } from '../dto/create-manual-ticket.dto';
import { CreateTicketDraftDto } from '../dto/create-ticket-draft.dto';
import {
  CustomerTicketDetailResponseDto,
  CustomerTicketListResponseDto,
} from '../dto/customer-ticket-response.dto';
import { TicketDraftResponseDto } from '../dto/ticket-draft-response.dto';
import { UpdateTicketDraftDto } from '../dto/update-ticket-draft.dto';
import { TicketDraftService } from '../services/ticket-draft.service';
import { TicketService } from '../services/ticket.service';

@ApiTags('Customer Tickets')
@ApiCookieAuth('session')
@ApiUnauthorizedResponse({ description: 'Current Customer session is required.' })
@ApiForbiddenResponse({ description: 'Customer role required.' })
@Controller('customers/me')
export class CustomerTicketController {
  constructor(
    private readonly tickets: TicketService,
    private readonly drafts: TicketDraftService,
  ) {}

  @Get('conversations/:conversationId/ticket-drafts/:draftId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Customer views proposed ticket draft' })
  @ApiOkResponse({ type: TicketDraftResponseDto })
  @ApiNotFoundResponse({ description: 'Draft not found or outside the current Customer/conversation.' })
  @ApiResponse({ status: 409, description: 'Ticket draft has expired.' })
  async getDraft(
    @Req() request: IncomingMessage,
    @Query() query: Record<string, unknown>,
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Param('draftId', new ParseUUIDPipe()) draftId: string,
  ) {
    if (Object.keys(query).length) throw new BadRequestException();
    return this.drafts.getDraft(request, conversationId, draftId);
  }

  @Put('conversations/:conversationId/ticket-drafts/:draftId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Customer updates ticket draft content before confirmation' })
  @ApiOkResponse({ type: TicketDraftResponseDto })
  @ApiResponse({ status: 409, description: 'Stale version or expired draft' })
  async updateDraft(
    @Req() request: IncomingMessage,
    @Query() query: Record<string, unknown>,
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Param('draftId', new ParseUUIDPipe()) draftId: string,
    @Body() dto: UpdateTicketDraftDto,
  ) {
    if (Object.keys(query).length) throw new BadRequestException();
    return this.drafts.updateDraft(request, conversationId, draftId, dto);
  }

  @Post('conversations/:conversationId/ticket-drafts/propose')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Propose a new ticket draft in conversation' })
  @ApiOkResponse({ type: TicketDraftResponseDto })
  async proposeDraft(
    @Req() request: IncomingMessage,
    @Query() query: Record<string, unknown>,
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Body() dto: CreateTicketDraftDto,
  ) {
    if (Object.keys(query).length) throw new BadRequestException();
    return this.drafts.proposeDraft(request, conversationId, dto);
  }

  @Post('tickets')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Customer confirms ticket draft to create ticket with status OPEN' })
  @ApiResponse({ status: 200, description: 'Ticket created or replayed successfully' })
  @ApiResponse({ status: 409, description: 'Stale draft version or already confirmed' })
  async confirmTicket(
    @Req() request: IncomingMessage,
    @Query() query: Record<string, unknown>,
    @Body() dto: ConfirmTicketDto,
  ) {
    if (Object.keys(query).length) throw new BadRequestException();
    return this.tickets.customerConfirm(request, dto);
  }

  @Post('tickets/manual')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Customer manually creates ticket with status OPEN via form' })
  @ApiResponse({ status: 200, description: 'Ticket created or replayed successfully' })
  async createManualTicket(
    @Req() request: IncomingMessage,
    @Query() query: Record<string, unknown>,
    @Body() dto: CreateManualTicketDto,
  ) {
    if (Object.keys(query).length) throw new BadRequestException();
    return this.tickets.customerCreateManual(request, dto);
  }

  @Get('tickets')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Customer lists own support tickets' })
  @ApiOkResponse({ type: CustomerTicketListResponseDto })
  async listTickets(
    @Req() request: IncomingMessage,
    @Query() query: CustomerTicketQuery,
  ) {
    return this.tickets.customerList(request, query);
  }

  @Get('tickets/:ticketId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Customer views own ticket detail' })
  @ApiOkResponse({ type: CustomerTicketDetailResponseDto })
  @ApiNotFoundResponse({ description: 'Ticket not found or not owned by customer' })
  async getTicketDetail(
    @Req() request: IncomingMessage,
    @Query() query: Record<string, unknown>,
    @Param('ticketId', new ParseUUIDPipe()) ticketId: string,
  ) {
    if (Object.keys(query).length) throw new BadRequestException();
    return this.tickets.customerDetail(request, ticketId);
  }

  @Get('tickets/by-client-request-id/:clientRequestId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Customer reconciles ticket by client request ID' })
  @ApiNotFoundResponse({ description: 'Ticket receipt not found' })
  async getReceipt(
    @Req() request: IncomingMessage,
    @Query() query: Record<string, unknown>,
    @Param('clientRequestId', new ParseUUIDPipe()) clientRequestId: string,
  ) {
    if (Object.keys(query).length) throw new BadRequestException();
    return this.tickets.customerReceipt(request, clientRequestId);
  }
}
