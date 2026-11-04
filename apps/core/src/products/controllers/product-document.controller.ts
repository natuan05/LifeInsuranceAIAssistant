import { BadRequestException, Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBody, ApiCookieAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { IncomingMessage } from 'node:http';
import { DocumentAccessResponseDto } from '../../policies/dto/document-access.dto';
import { ProductDocumentsQuery, ProductDocumentsResponseDto } from '../dto/product-documents.dto';
import { ProductDocumentService } from '../services/product-document.service';

const emptyBody = { schema: { type: 'object' as const, properties: {}, additionalProperties: false, maxProperties: 0 } };
function requireEmpty(body: unknown, query: Record<string, unknown>) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length || Object.keys(query).length) throw new BadRequestException();
}

@ApiTags('Products') @ApiCookieAuth('session')
@ApiUnauthorizedResponse({ description: 'A current Staff or Customer session is required.' })
@ApiForbiddenResponse({ description: 'Unsupported role, or missing/invalid Origin, JSON request marker or CSRF for POST.' })
@ApiBadRequestResponse({ description: 'Invalid UUID/cursor/query/body. Access accepts only an empty JSON object.' })
@ApiNotFoundResponse({ description: 'Product inactive/absent, or document/version unavailable in its PUBLIC current publication.' })
@ApiResponse({ status: 429, description: '120 catalog reads or 30 view/download grants per minute per actor. Retry-After is returned.' })
@Controller('products')
export class ProductDocumentController {
  constructor(private readonly documents: ProductDocumentService) {}

  @Get(':productId/documents') @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Current active PUBLIC documents of an active product; actor-bound keyset, no totals or storage URLs.' })
  @ApiOkResponse({ type: ProductDocumentsResponseDto })
  list(@Req() request: IncomingMessage, @Param('productId', new ParseUUIDPipe()) productId: string, @Query() query: ProductDocumentsQuery) {
    return this.documents.list(request, productId, query);
  }

  @Post(':productId/documents/:documentId/versions/:versionId/view') @HttpCode(200) @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Grant inline PDF access to the exact current PUBLIC version; recheck publication and session after signing.' })
  @ApiBody(emptyBody) @ApiOkResponse({ type: DocumentAccessResponseDto })
  @ApiResponse({ status: 503, description: 'Storage unavailable; no SDK details are exposed.' })
  view(@Req() request: IncomingMessage, @Param('productId', new ParseUUIDPipe()) productId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string, @Param('versionId', new ParseUUIDPipe()) versionId: string,
    @Body() body: unknown, @Query() query: Record<string, unknown>) {
    requireEmpty(body, query);
    return this.documents.access(request, productId, documentId, versionId, 'view');
  }

  @Post(':productId/documents/:documentId/versions/:versionId/download') @HttpCode(200) @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Grant attachment PDF access to an exact current PUBLIC version; session and CSRF required.' })
  @ApiBody(emptyBody) @ApiOkResponse({ type: DocumentAccessResponseDto })
  @ApiResponse({ status: 503, description: 'Storage unavailable; no SDK details are exposed.' })
  download(@Req() request: IncomingMessage, @Param('productId', new ParseUUIDPipe()) productId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string, @Param('versionId', new ParseUUIDPipe()) versionId: string,
    @Body() body: unknown, @Query() query: Record<string, unknown>) {
    requireEmpty(body, query);
    return this.documents.access(request, productId, documentId, versionId, 'download');
  }
}
