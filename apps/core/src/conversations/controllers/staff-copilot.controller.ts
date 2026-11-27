import { BadRequestException, Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { ServerResponse } from 'node:http';
import { CopilotHistoryDto, CopilotHistoryQuery, CopilotQuestionDto, CopilotSendDto } from '../dto/staff-copilot.dto';
import type { ConversationRequest } from '../services/conversation-session.service';
import { StaffCopilotService } from '../services/staff-copilot.service';

@ApiTags('Staff Copilot') @ApiCookieAuth('session')
@Controller('staff/conversations/:conversationId/copilot')
export class StaffCopilotController {
  constructor(private readonly copilot: StaffCopilotService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'A24: Read internal Copilot history for this Staff and source conversation.' })
  @ApiOkResponse({ type: CopilotHistoryDto })
  history(@Req() request: ConversationRequest, @Param('conversationId', new ParseUUIDPipe()) id: string,
    @Query() query: CopilotHistoryQuery) {
    return this.copilot.history(request, id.toLowerCase(), query);
  }

  @Post('messages')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'A25: Accept one Copilot question in the selected conversation.' })
  @ApiResponse({ status: 200, type: CopilotSendDto, description: 'Existing run and its current status.' })
  @ApiResponse({ status: 201, type: CopilotSendDto, description: 'Question and run committed.' })
  @ApiResponse({ status: 409, description: 'COPILOT_BUSY or IDEMPOTENCY_CONFLICT.' })
  async send(@Req() request: ConversationRequest, @Param('conversationId', new ParseUUIDPipe()) id: string,
    @Body() body: CopilotQuestionDto, @Query() query: Record<string, unknown>, @Res({ passthrough: true }) response: ServerResponse) {
    if (Object.keys(query).length) throw new BadRequestException();
    const result = await this.copilot.send(request, id.toLowerCase(), body);
    response.statusCode = result.replayed ? 200 : 201;
    return result;
  }
}
