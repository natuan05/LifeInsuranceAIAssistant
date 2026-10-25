import { ForbiddenException, HttpException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { PrismaClient } from '../../generated/prisma/client';
import { verifyPassword } from '../../accounts/utils/password';

export const operatorCookie = 'li_ops_session';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
type Session = { csrf: string; expiresAt: number; window: number; writes: number };
export class OperatorAuth {
  private readonly sessions = new Map<string, Session>();
  constructor(private readonly client: PrismaClient, private readonly credential: { username: string; passwordHash: string }, private readonly origins: string[]) {}
  write(request: IncomingMessage) {
    if (!this.origins.includes(request.headers.origin ?? '') || request.headers['x-auth-request'] !== '1'
      || !/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')) throw new ForbiddenException();
  }
  private token(request: IncomingMessage) {
    const cookies = (request.headers.cookie ?? '').split(';').map(part => part.trim()).filter(part => part.startsWith(`${operatorCookie}=`));
    if (cookies.length !== 1) throw new UnauthorizedException();
    const token = cookies[0].slice(operatorCookie.length + 1);
    if (!/^[a-f0-9]{64}$/.test(token)) throw new UnauthorizedException();
    return digest(token);
  }
  require(request: IncomingMessage, write = false) {
    const key = this.token(request), session = this.sessions.get(key);
    if (!session || session.expiresAt <= Date.now()) { this.sessions.delete(key); throw new UnauthorizedException(); }
    if (write) {
      this.write(request);
      const csrf = request.headers['x-csrf-token'];
      if (typeof csrf !== 'string' || !/^[a-f0-9]{64}$/.test(csrf)
        || !timingSafeEqual(Buffer.from(csrf, 'hex'), Buffer.from(session.csrf, 'hex'))) throw new ForbiddenException();
      if (Date.now() - session.window >= 60000) { session.window = Date.now(); session.writes = 0; }
      if (++session.writes > 60) throw new HttpException('Too Many Requests', 429);
    }
    return { operatorId: this.credential.username, csrfToken: session.csrf, expiresAt: new Date(session.expiresAt).toISOString() };
  }
  async login(username: string, password: string, request: IncomingMessage, response: ServerResponse) {
    this.write(request);
    const key = digest(this.credential.username + ':' + (request.socket.remoteAddress ?? 'local'));
    const rows = await this.client.$queryRaw<Array<{ request_count: number }>>`INSERT INTO business.rate_limit_buckets(client_token, endpoint_group, window_start, request_count)
      VALUES (${key}, 'OPS_LOGIN', NOW(), 1) ON CONFLICT (client_token,endpoint_group) DO UPDATE SET
      request_count = CASE WHEN rate_limit_buckets.window_start < NOW() - INTERVAL '15 minutes' THEN 1 ELSE rate_limit_buckets.request_count + 1 END,
      window_start = CASE WHEN rate_limit_buckets.window_start < NOW() - INTERVAL '15 minutes' THEN NOW() ELSE rate_limit_buckets.window_start END RETURNING request_count`;
    if (rows[0].request_count > 10) throw new HttpException('Too Many Requests', 429);
    const valid = await verifyPassword(password, this.credential.passwordHash);
    if (!valid || username !== this.credential.username) throw new UnauthorizedException();
    for (const [id, session] of this.sessions) if (session.expiresAt <= Date.now()) this.sessions.delete(id);
    if (this.sessions.size >= 1000) throw new HttpException('Too Many Requests', 429);
    try { this.sessions.delete(this.token(request)); } catch { /* No previous operator session. */ }
    const token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex');
    this.sessions.set(digest(token), { csrf, expiresAt: Date.now() + 30 * 60 * 1000, window: Date.now(), writes: 0 });
    response.setHeader('Set-Cookie', `${operatorCookie}=${token}; HttpOnly; SameSite=Strict; Path=/ops/v1; Max-Age=1800`);
    return { operatorId: this.credential.username, csrfToken: csrf, target: 'LOCAL PostgreSQL' };
  }
  logout(request: IncomingMessage, response: ServerResponse) {
    this.require(request, true); this.sessions.delete(this.token(request));
    response.setHeader('Set-Cookie', `${operatorCookie}=; HttpOnly; SameSite=Strict; Path=/ops/v1; Max-Age=0`);
    return { ok: true };
  }
}
