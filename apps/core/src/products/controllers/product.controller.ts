import { BadRequestException, Controller, Get, Header, Param, ParseUUIDPipe, Query, Req } from '@nestjs/common';
import { ApiBadRequestResponse, ApiCookieAuth, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { IncomingMessage } from 'node:http';
import { ProductQuery } from '../dto/product-query.dto';
import { ProductDetailResponseDto, ProductListResponseDto } from '../dto/product-response.dto';
import { ProductService } from '../services/product.service';

@ApiTags('Products') @ApiCookieAuth('session')
@ApiUnauthorizedResponse({ description: 'A current Staff or Customer session is required.' })
@ApiBadRequestResponse({ description: 'Invalid UUID, query value or unsupported query field.' })
@ApiResponse({ status: 429, description: 'Shared catalog quota: 120 reads per minute per actor. Retry-After is returned.' })
@Controller('products')
export class ProductController {
  constructor(private readonly products: ProductService) {}

  @Get() @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Search active products by name/code, then paginate. Shared by authenticated Staff and Customer.' })
  @ApiOkResponse({ type: ProductListResponseDto })
  list(@Req() request: IncomingMessage, @Query() query: ProductQuery) {
    return this.products.list(request, query);
  }

  @Get(':productId') @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Read an active product. Historical policies may still reference inactive products.' })
  @ApiOkResponse({ type: ProductDetailResponseDto })
  @ApiNotFoundResponse({ description: 'Product is absent or inactive.' })
  detail(@Req() request: IncomingMessage, @Param('productId', new ParseUUIDPipe()) id: string, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).length) throw new BadRequestException();
    return this.products.detail(request, id);
  }
}
