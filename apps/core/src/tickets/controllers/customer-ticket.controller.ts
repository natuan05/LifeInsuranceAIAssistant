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
  ApiBadRequestResponse,
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
import { AuthService } from '../../auth/services/auth.service';
import { DatabaseService } from '../../database/database.service';
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
    private readonly auth: AuthService,
    private readonly database: DatabaseService,
    private readonly tickets: TicketService,
    private readonly drafts: TicketDraftService,
  ) {}

  @Get('conversations/:conversationId/ticket-drafts/:draftId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Customer views proposed ticket draft' })
  @ApiOkResponse({ type: TicketDraftResponseDto })
  @ApiNotFoundResponse({ description: 'Draft not found or expired' })
  async getDraft(
    @Req() request: IncomingMessage,
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Param('draftId', new ParseUUIDPipe()) draftId: string,
  ) {
    const { actor } = await this.auth.me(request);
    return this.drafts.getDraft(actor.id, conversationId, draftId);
  }

  @Put('conversations/:conversationId/ticket-drafts/:draftId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Customer updates ticket draft content before confirmation' })
  @ApiOkResponse({ type: TicketDraftResponseDto })
  @ApiResponse({ status: 409, description: 'Stale version or expired draft' })
  async updateDraft(
    @Req() request: IncomingMessage,
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Param('draftId', new ParseUUIDPipe()) draftId: string,
    @Body() dto: UpdateTicketDraftDto,
  ) {
    const { actor } = await this.auth.authorizeWrite(request, this.database.prisma);
    return this.drafts.updateDraft(actor.id, conversationId, draftId, dto);
  }

  @Post('conversations/:conversationId/ticket-drafts/propose')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Propose a new ticket draft in conversation' })
  @ApiOkResponse({ type: TicketDraftResponseDto })
  async proposeDraft(
    @Req() request: IncomingMessage,
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Body() dto: CreateTicketDraftDto,
  ) {
    const { actor } = await this.auth.authorizeWrite(request, this.database.prisma);
    return this.drafts.proposeDraft(actor.id, conversationId, dto);
  }

  @Post('tickets')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Customer confirms ticket draft to create ticket with status OPEN' })
  @ApiResponse({ status: 200, description: 'Ticket created or replayed successfully' })
  @ApiResponse({ status: 409, description: 'Stale draft version or already confirmed' })
  async confirmTicket(
    @Req() request: IncomingMessage,
    @Body() dto: ConfirmTicketDto,
  ) {
    return this.tickets.customerConfirm(request, dto);
  }

  @Post('tickets/manual')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Customer manually creates ticket with status OPEN via form' })
  @ApiResponse({ status: 200, description: 'Ticket created or replayed successfully' })
  async createManualTicket(
    @Req() request: IncomingMessage,
    @Body() dto: CreateManualTicketDto,
  ) {
    return this.tickets.customerCreateManual(request, dto);
  }

  @Get('tickets')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Customer lists own support tickets' })
  @ApiOkResponse({ type: CustomerTicketListResponseDto })
  async listTickets(
    @Req() request: IncomingMessage,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.tickets.customerList(request, {
      status,
      search,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 10,
    });
  }

  @Get('tickets/:ticketId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Customer views own ticket detail' })
  @ApiOkResponse({ type: CustomerTicketDetailResponseDto })
  @ApiNotFoundResponse({ description: 'Ticket not found or not owned by customer' })
  async getTicketDetail(
    @Req() request: IncomingMessage,
    @Param('ticketId', new ParseUUIDPipe()) ticketId: string,
  ) {
    return this.tickets.customerDetail(request, ticketId);
  }

  @Get('tickets/by-client-request-id/:clientRequestId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Customer reconciles ticket by client request ID' })
  @ApiNotFoundResponse({ description: 'Ticket receipt not found' })
  async getReceipt(
    @Req() request: IncomingMessage,
    @Param('clientRequestId', new ParseUUIDPipe()) clientRequestId: string,
  ) {
    return this.tickets.customerReceipt(request, clientRequestId);
  }
}
