import { BadRequestException, Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { IncomingMessage } from 'node:http';
import { PolicyListQuery } from '../dto/policy-query.dto';
import { PolicyDetailResponseDto, PolicyDocumentsResponseDto, PolicyListResponseDto } from '../dto/policy-response.dto';
import { PolicyService } from '../services/policy.service';
import { DocumentAccessDto, DocumentAccessResponseDto } from '../dto/document-access.dto';

@ApiTags('Staff policies') @ApiCookieAuth('session')
@ApiNotFoundResponse({ description: 'Resource absent or outside the current Staff assignment.' })
@Controller('staff')
export class StaffPolicyController {
  constructor(private readonly policies: PolicyService) {}

  @Post('documents/:documentId/versions/:versionId/view') @HttpCode(200) @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Issue short-lived inline PDF access for an exact policy-bound version; session and CSRF required.' })
  @ApiOkResponse({ type: DocumentAccessResponseDto })
  view(@Req() request: IncomingMessage, @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Param('versionId', new ParseUUIDPipe()) versionId: string, @Body() body: DocumentAccessDto, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).length) throw new BadRequestException();
    return this.policies.access(request, body.policyId, documentId, versionId, 'view');
  }

  @Post('documents/:documentId/versions/:versionId/download') @HttpCode(200) @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Issue short-lived attachment PDF access; session, assignment, applied version and CSRF required.' })
  @ApiOkResponse({ type: DocumentAccessResponseDto })
  download(@Req() request: IncomingMessage, @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Param('versionId', new ParseUUIDPipe()) versionId: string, @Body() body: DocumentAccessDto, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).length) throw new BadRequestException();
    return this.policies.access(request, body.policyId, documentId, versionId, 'download');
  }

  @Get('customers/:customerId/policies') @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Staff đọc danh sách hợp đồng của khách được phân công, phân trang ổn định.' })
  @ApiOkResponse({ type: PolicyListResponseDto })
  list(@Req() request: IncomingMessage, @Param('customerId', new ParseUUIDPipe()) id: string, @Query() query: PolicyListQuery) {
    return this.policies.list(request, id, query);
  }

  @Get('policies/:policyId') @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Staff đọc chi tiết hợp đồng trong assignment; số tiền là decimal string.' })
  @ApiOkResponse({ type: PolicyDetailResponseDto })
  detail(@Req() request: IncomingMessage, @Param('policyId', new ParseUUIDPipe()) id: string, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).length) throw new BadRequestException();
    return this.policies.detail(request, id);
  }

  @Get('policies/:policyId/documents') @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Danh mục tài liệu đúng phiên bản hợp đồng; không cấp URL hoặc đọc MinIO.' })
  @ApiOkResponse({ type: PolicyDocumentsResponseDto })
  documents(@Req() request: IncomingMessage, @Param('policyId', new ParseUUIDPipe()) id: string, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).length) throw new BadRequestException();
    return this.policies.documents(request, id);
  }
}
