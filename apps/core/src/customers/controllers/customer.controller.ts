import { BadRequestException, Body, Controller, Get, Header, HttpCode, Post, Param, ParseUUIDPipe, Query, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { IncomingMessage } from 'node:http';
import { ContactRevealDto } from '../dto/contact-reveal.dto';
import { CustomerService } from '../services/customer.service';
import { CustomerListQuery } from '../dto/customer-query.dto';

@ApiTags('Customers') @ApiCookieAuth('session')
@Controller()
export class CustomerController {
  constructor(private readonly customers: CustomerService) {}

  @Get('customers/me') @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Customer xem hồ sơ bản thân và Staff phụ trách hiện hành.' })
  own(@Req() request: IncomingMessage, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).length) throw new BadRequestException();
    return this.customers.own(request);
  }

  @Get('staff/customers') @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Staff xem danh sách Customer được phân công hiện hành, có phân trang.' })
  list(@Req() request: IncomingMessage, @Query() query: CustomerListQuery) { return this.customers.list(request, query); }

  @Get('staff/customers/:customerId') @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Staff xem hồ sơ Customer được phân công; 404 nếu không tồn tại hoặc ngoài quyền.' })
  detail(@Req() request: IncomingMessage, @Param('customerId', new ParseUUIDPipe()) id: string, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).length) throw new BadRequestException();
    return this.customers.detail(request, id);
  }

  @Post('staff/customers/:customerId/contact-reveal') @HttpCode(200) @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Reveal one contact field for a currently assigned Customer.' })
  reveal(@Req() request: IncomingMessage, @Param('customerId', new ParseUUIDPipe()) id: string,
    @Body() body: ContactRevealDto, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).length) throw new BadRequestException();
    return this.customers.reveal(request, id, body.field);
  }

}
