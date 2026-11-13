import { BadRequestException, Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { IncomingMessage } from 'node:http';
import { PolicyLookupQuery } from '../dto/policy-query.dto';
import { PolicyDetailResponseDto, PolicyDocumentsResponseDto, PolicyListResponseDto } from '../dto/policy-response.dto';
import { PolicyService } from '../services/policy.service';
import { DocumentAccessDto, DocumentAccessResponseDto } from '../dto/document-access.dto';

@ApiTags('Customer policies') @ApiCookieAuth('session')
@ApiNotFoundResponse({ description: 'Resource absent or outside the customer account.' })
@Controller('customers/me')
export class CustomerPolicyController {
  constructor(private readonly policies: PolicyService) {}

  @Get('policies') @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Customer reads own insurance policies with pagination and status filter.' })
  @ApiOkResponse({ type: PolicyListResponseDto })
  list(@Req() request: IncomingMessage, @Query() query: PolicyLookupQuery) {
    return this.policies.ownerList(request, query);
  }

  @Get('policies/:policyId') @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Customer reads own policy detail with benefits snapshot.' })
  @ApiOkResponse({ type: PolicyDetailResponseDto })
  detail(@Req() request: IncomingMessage, @Param('policyId', new ParseUUIDPipe()) id: string, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).length) throw new BadRequestException();
    return this.policies.ownerDetail(request, id);
  }

  @Get('policies/:policyId/documents') @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Customer reads applied document catalog for own policy.' })
  @ApiOkResponse({ type: PolicyDocumentsResponseDto })
  documents(@Req() request: IncomingMessage, @Param('policyId', new ParseUUIDPipe()) id: string, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).length) throw new BadRequestException();
    return this.policies.ownerDocuments(request, id);
  }

  @Post('documents/:documentId/versions/:versionId/view') @HttpCode(200) @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Issue short-lived inline PDF access for customer own policy-bound version.' })
  @ApiOkResponse({ type: DocumentAccessResponseDto })
  view(
    @Req() request: IncomingMessage,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Param('versionId', new ParseUUIDPipe()) versionId: string,
    @Body() body: DocumentAccessDto,
    @Query() query: Record<string, unknown>,
  ) {
    if (Object.keys(query).length) throw new BadRequestException();
    return this.policies.ownerAccess(request, body.policyId, documentId, versionId, 'view');
  }

  @Post('documents/:documentId/versions/:versionId/download') @HttpCode(200) @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Issue short-lived attachment PDF access for customer own policy-bound version.' })
  @ApiOkResponse({ type: DocumentAccessResponseDto })
  download(
    @Req() request: IncomingMessage,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Param('versionId', new ParseUUIDPipe()) versionId: string,
    @Body() body: DocumentAccessDto,
    @Query() query: Record<string, unknown>,
  ) {
    if (Object.keys(query).length) throw new BadRequestException();
    return this.policies.ownerAccess(request, body.policyId, documentId, versionId, 'download');
  }
}
