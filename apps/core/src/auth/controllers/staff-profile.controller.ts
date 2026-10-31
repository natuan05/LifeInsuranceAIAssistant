import { BadRequestException, Body, Controller, Get, Header, Patch, Query, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { IncomingMessage } from 'node:http';
import { AuthService } from '../services/auth.service';
import { UpdateStaffProfileDto } from '../dto/update-staff-profile.dto';

@ApiTags('Staff profile') @ApiCookieAuth('session')
@Controller('staff/me')
export class StaffProfileController {
  constructor(private readonly auth: AuthService) {}

  @Get() @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Staff xem hồ sơ bản thân và updatedAt để cập nhật.' })
  own(@Req() request: IncomingMessage, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).length) throw new BadRequestException();
    return this.auth.staffProfile(request);
  }

  @Patch() @Header('Cache-Control', 'no-store')
  @ApiHeader({ name: 'X-Auth-Request', required: true })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiOperation({ summary: 'Staff tự sửa họ tên/số điện thoại; 409 nếu dữ liệu cũ hoặc số điện thoại đã được dùng.' })
  update(@Body() input: UpdateStaffProfileDto, @Req() request: IncomingMessage, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).length) throw new BadRequestException();
    return this.auth.updateStaffProfile(input, request);
  }
}
