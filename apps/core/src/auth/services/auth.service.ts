import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { DatabaseService } from '../../database/database.service';
import { hashPassword, needsPasswordRehash, verifyPassword } from '../../accounts/utils/password';
import { loadConfig } from '../../config';
import type { LoginDto } from '../dto/login.dto';
import type { ChangePasswordDto } from '../dto/change-password.dto';
import type { UpdateStaffProfileDto } from '../dto/update-staff-profile.dto';
import type { Prisma } from '../../generated/prisma/client';

export const SESSION_SECONDS = 8 * 60 * 60;
export const sessionCookie = 'li_session';
export const csrfCookie = 'li_csrf';
export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');
const tokenValid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
type Request = IncomingMessage & { requestId?: string };

export function authCookies(request: IncomingMessage) {
  const result: Record<string, string> = {};
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (![sessionCookie, csrfCookie].includes(key)) continue;
    if (result[key] !== undefined) throw new UnauthorizedException();
    result[key] = value.join('=');
  }
  return result;
}

@Injectable()
export class AuthService {
  private readonly config = loadConfig();
  private readonly dummyHash = hashPassword(randomBytes(32).toString('hex'));
  constructor(private readonly database: DatabaseService) {}

  requireWrite(request: IncomingMessage) {
    if (!this.config.origins.includes(request.headers.origin ?? '') || request.headers['x-auth-request'] !== '1'
      || !/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')) throw new ForbiddenException();
  }

  private async limit(identity: string, group: string, max: number, seconds: number) {
    const rows = await this.database.prisma.$queryRaw<Array<{ request_count: number }>>`
      INSERT INTO business.rate_limit_buckets (client_token, endpoint_group, window_start, request_count)
      VALUES (${tokenHash(identity)}, ${group}, NOW(), 1)
      ON CONFLICT (client_token, endpoint_group) DO UPDATE SET
        request_count = CASE WHEN rate_limit_buckets.window_start < NOW() - (${seconds} * INTERVAL '1 second') THEN 1 ELSE rate_limit_buckets.request_count + 1 END,
        window_start = CASE WHEN rate_limit_buckets.window_start < NOW() - (${seconds} * INTERVAL '1 second') THEN NOW() ELSE rate_limit_buckets.window_start END
      RETURNING request_count`;
    if (rows[0].request_count > max) throw new HttpException('Too Many Requests', 429);
  }

  async login(input: LoginDto, request: Request, expectedRole: 'STAFF' | 'CUSTOMER') {
    this.requireWrite(request);
    const identifier = input.email;
    await this.limit(request.socket.remoteAddress ?? 'local', 'AUTH_IP', 60, 60);
    await this.limit(identifier, 'AUTH_LOGIN', 10, 15 * 60);
    const client = this.database.prisma;
    const user = await client.user.findUnique({ where: { email: identifier } });
    const verified = await verifyPassword(input.password, user?.passwordHash ?? await this.dummyHash);
    // Legacy passwords over bcrypt's byte limit remain usable until explicitly changed;
    // never truncate or silently replace them.
    const upgradedHash = user && verified && user.role === expectedRole && needsPasswordRehash(user.passwordHash)
      && Buffer.byteLength(input.password, 'utf8') <= 72 ? await hashPassword(input.password) : undefined;
    const sessionToken = randomBytes(32).toString('hex'), csrfToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);
    const previous = authCookies(request)[sessionCookie];
    const authenticated = await client.$transaction(async tx => {
      if (!user) return false;
      await tx.$queryRaw`SELECT id FROM business.users WHERE id = ${user.id}::uuid FOR UPDATE`;
      const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (current.status !== 'ACTIVE' || (current.lockedUntil && current.lockedUntil > new Date())) return false;
      if (current.role !== expectedRole) return false;
      if (!verified || current.passwordHash !== user.passwordHash) {
        const failures = current.failedLoginAttempts + 1;
        await tx.user.update({ where: { id: user.id }, data: { failedLoginAttempts: failures,
          lockedUntil: failures >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null } });
        await this.audit(tx, user.id, 'LOGIN_FAILED', request.requestId, false);
        return false;
      }
      await tx.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null,
        ...(upgradedHash ? { passwordHash: upgradedHash } : {}) } });
      if (tokenValid(previous)) await tx.authSession.updateMany({ where: { tokenHash: tokenHash(previous), revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.authSession.create({ data: { userId: user.id, tokenHash: tokenHash(sessionToken), csrfTokenHash: tokenHash(csrfToken), expiresAt } });
      await this.audit(tx, user.id, 'LOGIN_SUCCEEDED', request.requestId, true);
      return true;
    });
    if (!authenticated) throw new UnauthorizedException();
    const result = await this.session(sessionToken, csrfToken);
    return { ...result, sessionToken, expiresAt };
  }

  private async audit(tx: Prisma.TransactionClient, userId: string, action: string, requestId: string | undefined, success: boolean) {
    await tx.auditLog.create({ data: { actorType: success ? 'USER' : 'SYSTEM', actorId: success ? userId : null, action, targetType: 'User', targetId: userId,
      outcome: success ? 'SUCCESS' : 'FAILURE', requestId: requestId ?? randomUUID() } });
  }

  private async session(sessionToken: string, csrfToken: string, client: Pick<Prisma.TransactionClient, 'authSession'> = this.database.prisma) {
    if (!tokenValid(sessionToken) || !tokenValid(csrfToken)) throw new UnauthorizedException();
    const session = await client.authSession.findUnique({ where: { tokenHash: tokenHash(sessionToken) },
      include: { user: { include: { staffProfile: true, customerProfile: true } } } });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.status !== 'ACTIVE'
      || (session.user.passwordChangedAt && session.createdAt < session.user.passwordChangedAt)
      || (session.user.lockedUntil && session.user.lockedUntil > new Date())
      || !timingSafeEqual(Buffer.from(session.csrfTokenHash, 'hex'), Buffer.from(tokenHash(csrfToken), 'hex'))) throw new UnauthorizedException();
    const user = session.user;
    return { actor: { id: user.id, accountCode: user.accountCode, email: user.email, role: user.role,
      fullName: user.staffProfile?.fullName ?? user.customerProfile?.fullName ?? user.accountCode,
      passwordChangeRecommended: user.passwordChangeRecommended }, csrfToken };
  }

  async me(request: IncomingMessage, client?: Pick<Prisma.TransactionClient, 'authSession'>) {
    const cookies = authCookies(request);
    return this.session(cookies[sessionCookie], cookies[csrfCookie], client);
  }

  private async writeSession(request: Request) {
    this.requireWrite(request);
    const cookies = authCookies(request);
    const current = await this.session(cookies[sessionCookie], cookies[csrfCookie]);
    const supplied = request.headers['x-csrf-token'];
    if (!tokenValid(supplied) || !timingSafeEqual(Buffer.from(tokenHash(supplied), 'hex'), Buffer.from(tokenHash(current.csrfToken), 'hex'))) throw new ForbiddenException();
    return { cookies, current };
  }

  async authorizeWrite(request: Request, client: Pick<Prisma.TransactionClient, 'authSession'>) {
    this.requireWrite(request);
    const current = await this.me(request, client);
    const supplied = request.headers['x-csrf-token'];
    if (!tokenValid(supplied) || !timingSafeEqual(Buffer.from(tokenHash(supplied), 'hex'), Buffer.from(tokenHash(current.csrfToken), 'hex'))) throw new ForbiddenException();
    return current;
  }

  async changePassword(input: ChangePasswordDto, request: Request) {
    const { cookies, current } = await this.writeSession(request);
    await this.limit(current.actor.id, 'AUTH_PASSWORD_CHANGE', 10, 15 * 60);
    if (input.newPassword !== input.confirmPassword) throw new BadRequestException();
    const client = this.database.prisma;
    const user = await client.user.findUniqueOrThrow({ where: { id: current.actor.id } });
    const verified = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!verified) {
      await client.auditLog.create({ data: { actorType: 'USER', actorId: user.id, action: 'PASSWORD_CHANGE_FAILED',
        targetType: 'User', targetId: user.id, outcome: 'FAILURE', requestId: request.requestId ?? randomUUID() } });
      throw new BadRequestException();
    }
    if (await verifyPassword(input.newPassword, user.passwordHash)) throw new BadRequestException();
    const passwordHash = await hashPassword(input.newPassword);
    const sessionToken = randomBytes(32).toString('hex'), csrfToken = randomBytes(32).toString('hex');
    await client.$transaction(async tx => {
      // Serialize login/password changes for this user and recheck the original session
      // after acquiring the lock; concurrent requests must not reuse a revoked session.
      await tx.$queryRaw`SELECT id FROM business.users WHERE id = ${user.id}::uuid FOR UPDATE`;
      await this.session(cookies[sessionCookie], cookies[csrfCookie], tx);
      const fresh = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (fresh.passwordHash !== user.passwordHash) throw new UnauthorizedException();
      const changedAt = new Date();
      await tx.user.update({ where: { id: user.id }, data: { passwordHash, passwordChangedAt: changedAt,
        passwordChangeRecommended: false, failedLoginAttempts: 0, lockedUntil: null } });
      await tx.authSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: changedAt } });
      await tx.authSession.create({ data: { userId: user.id, tokenHash: tokenHash(sessionToken), csrfTokenHash: tokenHash(csrfToken),
        createdAt: changedAt, expiresAt: new Date(changedAt.getTime() + SESSION_SECONDS * 1000) } });
      await this.audit(tx, user.id, 'PASSWORD_CHANGED', request.requestId, true);
    });
    return { ...await this.session(sessionToken, csrfToken), sessionToken };
  }

  async logout(request: Request) {
    const { cookies, current } = await this.writeSession(request);
    await this.database.prisma.$transaction(async tx => {
      await tx.authSession.updateMany({ where: { tokenHash: tokenHash(cookies[sessionCookie]), revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit(tx, current.actor.id, 'LOGOUT', request.requestId, true);
    });
  }

  private async staffView(tx: Prisma.TransactionClient, userId: string) {
    const profile = await tx.staffProfile.findUnique({ where: { userId }, select: {
      fullName: true, department: true,
      user: { select: { id: true, accountCode: true, email: true, phone: true, role: true, updatedAt: true } },
    } });
    if (!profile) throw new NotFoundException();
    return { staff: { ...profile.user, fullName: profile.fullName, department: profile.department } };
  }

  staffProfile(request: IncomingMessage) {
    return this.database.prisma.$transaction(async tx => {
      const { actor } = await this.me(request, tx);
      if (actor.role !== 'STAFF') throw new ForbiddenException();
      return this.staffView(tx, actor.id);
    }, { isolationLevel: 'RepeatableRead' });
  }

  async updateStaffProfile(input: UpdateStaffProfileDto, request: Request) {
    const { current } = await this.writeSession(request);
    if (current.actor.role !== 'STAFF') throw new ForbiddenException();
    await this.limit(current.actor.id, 'STAFF_PROFILE_UPDATE', 30, 15 * 60);
    try {
      return await this.database.prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM business.users WHERE id = ${current.actor.id}::uuid FOR UPDATE`;
        const { actor } = await this.me(request, tx);
        if (actor.role !== 'STAFF') throw new ForbiddenException();
        const before = await this.staffView(tx, actor.id);
        if (before.staff.updatedAt.getTime() !== new Date(input.expectedUpdatedAt).getTime()) throw new ConflictException();
        await tx.staffProfile.update({ where: { userId: actor.id }, data: { fullName: input.fullName } });
        await tx.user.update({ where: { id: actor.id }, data: {
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          updatedAt: new Date(Math.max(Date.now(), before.staff.updatedAt.getTime() + 1)),
        } });
        await this.audit(tx, actor.id, 'STAFF_PROFILE_UPDATED', request.requestId, true);
        return this.staffView(tx, actor.id);
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new ConflictException();
      throw error;
    }
  }
}
