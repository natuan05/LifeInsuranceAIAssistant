import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, type PrismaClient } from '../../generated/prisma/client';
import { AccountProvisioningService, type ProvisioningContext } from './account-provisioning.service';
import { generateInitialPassword, hashPassword } from '../utils/password';
import type { AccountActionDto, AccountStatusDto, AssignmentDto, CreateManagedAccountDto, ManagedListQuery } from '../dto/account-management.dto';

const select = { id: true, accountCode: true, email: true, role: true, status: true, updatedAt: true, passwordChangeRecommended: true,
  staffProfile: { select: { fullName: true, department: true } },
  customerProfile: { select: { fullName: true, assignmentVersion: true, assignments: { where: { isActive: true }, select: {
    staffId: true, assignedAt: true, staff: { select: { fullName: true, user: { select: { accountCode: true, status: true } } } },
  } } } },
} satisfies Prisma.UserSelect;

export class AccountManagementService {
  constructor(private readonly client: PrismaClient) {}
  async list(query: ManagedListQuery) {
    const where: Prisma.UserWhereInput = { role: query.role, status: query.status,
      ...(query.q ? { OR: [{ email: { contains: query.q, mode: 'insensitive' } }, { accountCode: { contains: query.q, mode: 'insensitive' } },
        { staffProfile: { fullName: { contains: query.q, mode: 'insensitive' } } }, { customerProfile: { fullName: { contains: query.q, mode: 'insensitive' } } }] } : {}) };
    return this.client.$transaction(async tx => ({ items: await tx.user.findMany({ where, select, orderBy: { accountCode: 'asc' },
      skip: (query.page - 1) * query.pageSize, take: query.pageSize }), total: await tx.user.count({ where }), page: query.page, pageSize: query.pageSize }),
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async detail(id: string) {
    const user = await this.client.user.findUnique({ where: { id }, select });
    if (!user) throw new NotFoundException();
    return user;
  }
  private async execute<T extends { id: string }>(action: string, targetId: string | null, context: ProvisioningContext,
    work: (tx: Prisma.TransactionClient) => Promise<T>, metadata: Prisma.InputJsonObject = {}) {
    try {
      return await this.client.$transaction(async tx => {
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${context.operatorId + ':' + context.requestId}, 0))`;
        if (await tx.auditLog.findFirst({ where: { operatorId: context.operatorId, requestId: context.requestId, outcome: 'SUCCESS' } })) throw new ConflictException();
        const result = await work(tx);
        await tx.auditLog.create({ data: { actorType: 'OPERATOR', operatorId: context.operatorId, action, targetType: 'User', targetId: result.id,
          outcome: 'SUCCESS', requestId: context.requestId, metadata } });
        return result;
      }, { timeout: 30000 });
    } catch (error) {
      await this.client.auditLog.create({ data: { actorType: 'OPERATOR', operatorId: context.operatorId, action, targetType: 'User', targetId,
        outcome: 'FAILURE', requestId: context.requestId } });
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException();
      throw error;
    }
  }
  create(input: CreateManagedAccountDto, context: ProvisioningContext) {
    const password = input.password ?? generateInitialPassword();
    return this.execute('OPS_ACCOUNT_CREATED', null, context, async tx => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(6213, 2100)`;
      const rows = await tx.$queryRaw<Array<{ maximum: string }>>`SELECT COALESCE(MAX(substring(account_code from 5)::numeric), 0)::text AS maximum
        FROM business.users WHERE role::text = ${input.role}`;
      const number = (BigInt(rows[0].maximum) + 1n).toString().padStart(6, '0');
      if (number.length > 28) throw new ConflictException();
      const account = await new AccountProvisioningService(this.client).createInTransaction(tx, {
        accountCode: `${input.role === 'STAFF' ? 'STF' : 'CUS'}-${number}`, email: input.email, role: input.role,
        fullName: input.fullName, password, ...(input.staffId ? { staffId: input.staffId } : {}),
      }, context);
      return { ...account, initialPassword: password };
    }, { role: input.role });
  }
  status(id: string, input: AccountStatusDto, context: ProvisioningContext) {
    return this.execute('ACCOUNT_STATUS_CHANGED', id, context, async tx => {
      const user = await this.lockedUser(tx, id, input);
      if (user.status === input.status) throw new ConflictException();
      const now = new Date(Math.max(Date.now(), user.updatedAt.getTime() + 1));
      await tx.user.update({ where: { id }, data: { status: input.status, lockedUntil: null, failedLoginAttempts: 0, updatedAt: now } });
      await tx.authSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: now } });
      return { id };
    }, { status: input.status });
  }
  reset(id: string, input: AccountActionDto, context: ProvisioningContext) {
    const password = generateInitialPassword();
    return this.execute('PASSWORD_RESET', id, context, async tx => {
      const user = await this.lockedUser(tx, id, input);
      const now = new Date(Math.max(Date.now(), user.updatedAt.getTime() + 1));
      await tx.user.update({ where: { id }, data: { passwordHash: await hashPassword(password), passwordChangedAt: now,
        passwordChangeRecommended: true, failedLoginAttempts: 0, lockedUntil: null, updatedAt: now } });
      await tx.authSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: now } });
      return { id, initialPassword: password };
    });
  }
  private async lockedUser(tx: Prisma.TransactionClient, id: string, input: AccountActionDto) {
    await tx.$queryRaw`SELECT id FROM business.users WHERE id = ${id}::uuid FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException();
    if (user.updatedAt.getTime() !== new Date(input.expectedUpdatedAt).getTime()) throw new ConflictException();
    return user;
  }
  assign(id: string, input: AssignmentDto, context: ProvisioningContext) {
    return this.execute('STAFF_ASSIGNMENT_CHANGED', id, context, async tx => {
      const ids = [...new Set([id, ...(input.staffId ? [input.staffId] : [])])];
      await tx.$queryRaw`SELECT id FROM business.users WHERE id::text IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
      const customer = await tx.customerProfile.findUnique({ where: { userId: id }, include: { user: true } });
      if (!customer) throw new NotFoundException();
      if (customer.assignmentVersion !== input.expectedVersion) throw new ConflictException();
      if (input.staffId) {
        const staff = await tx.staffProfile.findUnique({ where: { userId: input.staffId }, include: { user: true } });
        if (customer.user.status !== 'ACTIVE' || !staff || staff.user.status !== 'ACTIVE'
          || (staff.user.lockedUntil && staff.user.lockedUntil > new Date())) throw new BadRequestException();
      }
      const previous = await tx.staffAssignment.findFirst({ where: { customerId: id, isActive: true } });
      if ((previous?.staffId ?? null) === input.staffId) throw new ConflictException();
      const now = new Date();
      if (previous) await tx.staffAssignment.update({ where: { id: previous.id }, data: { isActive: false, endedAt: now } });
      if (input.staffId) await tx.staffAssignment.create({ data: { customerId: id, staffId: input.staffId, operatorId: context.operatorId, assignedAt: now } });
      await tx.customerProfile.update({ where: { userId: id }, data: { assignmentVersion: { increment: 1 } } });
      return { id, assignmentVersion: customer.assignmentVersion + 1 };
    }, { staffId: input.staffId, expectedVersion: input.expectedVersion });
  }
  async audit(query: ManagedListQuery) {
    const where: Prisma.AuditLogWhereInput = query.q ? { action: { contains: query.q, mode: 'insensitive' } } : {};
    return this.client.$transaction(async tx => ({ items: await tx.auditLog.findMany({ where,
      select: { id: true, createdAt: true, actorType: true, actorId: true, operatorId: true, action: true, targetId: true, outcome: true, requestId: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      total: await tx.auditLog.count({ where }), page: query.page, pageSize: query.pageSize }), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
