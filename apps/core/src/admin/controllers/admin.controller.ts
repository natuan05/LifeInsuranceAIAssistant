import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AccountManagementService } from '../../accounts/services/account-management.service';
import { AccountActionDto, AccountStatusDto, AssignmentDto, CreateManagedAccountDto, ManagedListQuery } from '../../accounts/dto/account-management.dto';
import { OperatorAuth } from '../services/operator-auth.service';
import { OperatorLoginDto } from '../dto/operator-login.dto';

@Controller()
export class AdminController {
  constructor(private readonly auth: OperatorAuth, private readonly accounts: AccountManagementService) {}
  @Post('auth/login') login(@Body() input: OperatorLoginDto, @Req() req: IncomingMessage, @Res({ passthrough: true }) res: ServerResponse) {
    return this.auth.login(input.username, input.password, req, res);
  }
  @Get('auth/me') me(@Req() req: IncomingMessage) { return { ...this.auth.require(req), target: 'LOCAL PostgreSQL' }; }
  @Post('auth/logout') logout(@Req() req: IncomingMessage, @Res({ passthrough: true }) res: ServerResponse) { return this.auth.logout(req, res); }
  @Get('accounts') list(@Query() query: ManagedListQuery, @Req() req: IncomingMessage) { this.auth.require(req); return this.accounts.list(query); }
  @Get('accounts/:id') detail(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: IncomingMessage) { this.auth.require(req); return this.accounts.detail(id); }
  @Post('accounts') create(@Body() input: CreateManagedAccountDto, @Req() req: IncomingMessage) {
    return this.accounts.create(input, { ...this.auth.require(req, true), requestId: input.requestId });
  }
  @Post('accounts/:id/status') status(@Param('id', new ParseUUIDPipe()) id: string, @Body() input: AccountStatusDto, @Req() req: IncomingMessage) {
    return this.accounts.status(id, input, { ...this.auth.require(req, true), requestId: input.requestId });
  }
  @Post('accounts/:id/reset-password') reset(@Param('id', new ParseUUIDPipe()) id: string, @Body() input: AccountActionDto, @Req() req: IncomingMessage) {
    return this.accounts.reset(id, input, { ...this.auth.require(req, true), requestId: input.requestId });
  }
  @Post('accounts/:id/assignment') assign(@Param('id', new ParseUUIDPipe()) id: string, @Body() input: AssignmentDto, @Req() req: IncomingMessage) {
    return this.accounts.assign(id, input, { ...this.auth.require(req, true), requestId: input.requestId });
  }
  @Get('audit') audit(@Query() query: ManagedListQuery, @Req() req: IncomingMessage) { this.auth.require(req); return this.accounts.audit(query); }
}
