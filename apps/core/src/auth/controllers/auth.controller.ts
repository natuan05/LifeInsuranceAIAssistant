import { Body, Controller, Get, Header, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AuthService, csrfCookie, SESSION_SECONDS, sessionCookie } from '../services/auth.service';
import { LoginDto } from '../dto/login.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';

function setCookies(response: ServerResponse, values: { session: string; csrf: string } | null) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader('Set-Cookie', [[sessionCookie, values?.session ?? ''], [csrfCookie, values?.csrf ?? '']]
    .map(([key, value]) => `${key}=${value}; Path=/api/v1; HttpOnly; SameSite=Lax; Max-Age=${values ? SESSION_SECONDS : 0}${secure}`));
}
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login') @HttpCode(200) @Header('Cache-Control', 'no-store')
  @ApiHeader({ name: 'X-Auth-Request', required: true, schema: { type: 'string', enum: ['1'] } })
  @ApiOperation({ summary: 'Customer đăng nhập bằng email. Origin + X-Auth-Request: 1 bắt buộc.' })
  async login(@Body() input: LoginDto, @Req() request: IncomingMessage, @Res({ passthrough: true }) response: ServerResponse) {
    return this.signIn(input, request, response, 'CUSTOMER');
  }

  @Post('staff/login') @HttpCode(200) @Header('Cache-Control', 'no-store')
  @ApiHeader({ name: 'X-Auth-Request', required: true, schema: { type: 'string', enum: ['1'] } })
  @ApiOperation({ summary: 'Staff đăng nhập bằng email. Tài khoản Customer bị từ chối.' })
  staffLogin(@Body() input: LoginDto, @Req() request: IncomingMessage, @Res({ passthrough: true }) response: ServerResponse) {
    return this.signIn(input, request, response, 'STAFF');
  }

  private async signIn(input: LoginDto, request: IncomingMessage, response: ServerResponse, role: 'STAFF' | 'CUSTOMER') {
    const result = await this.auth.login(input, request, role);
    setCookies(response, { session: result.sessionToken, csrf: result.csrfToken });
    return { actor: result.actor, csrfToken: result.csrfToken };
  }

  @Get('me') @Header('Cache-Control', 'no-store') @ApiCookieAuth('session')
  me(@Req() request: IncomingMessage) { return this.auth.me(request); }

  @Post('change-password') @HttpCode(200) @Header('Cache-Control', 'no-store') @ApiCookieAuth('session')
  @ApiHeader({ name: 'X-Auth-Request', required: true, schema: { type: 'string', enum: ['1'] } })
  @ApiHeader({ name: 'X-CSRF-Token', required: true, schema: { type: 'string' } })
  @ApiOperation({ summary: 'Tự đổi mật khẩu; thu hồi mọi phiên cũ và cấp phiên mới. 400 nếu mật khẩu hiện tại sai, trùng hoặc xác nhận không khớp.' })
  async changePassword(@Body() input: ChangePasswordDto, @Req() request: IncomingMessage, @Res({ passthrough: true }) response: ServerResponse) {
    const result = await this.auth.changePassword(input, request);
    setCookies(response, { session: result.sessionToken, csrf: result.csrfToken });
    return { actor: result.actor, csrfToken: result.csrfToken };
  }

  @Post('logout') @HttpCode(200) @Header('Cache-Control', 'no-store') @ApiCookieAuth('session')
  @ApiHeader({ name: 'X-Auth-Request', required: true, schema: { type: 'string', enum: ['1'] } })
  @ApiHeader({ name: 'X-CSRF-Token', required: true, description: 'csrfToken từ login hoặc me.', schema: { type: 'string' } })
  @ApiOperation({ summary: 'Thu hồi phiên; cần Origin, X-Auth-Request: 1 và X-CSRF-Token.' })
  async logout(@Req() request: IncomingMessage, @Res({ passthrough: true }) response: ServerResponse) {
    await this.auth.logout(request);
    setCookies(response, null);
    return { ok: true };
  }
}
