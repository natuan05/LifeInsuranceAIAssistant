import { BadRequestException, ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { isUUID, validateSync } from 'class-validator';
import { PrismaClient, Prisma } from '../../generated/prisma/client';
import { ProvisionAccountDto } from '../dto/provision-account.dto';
import { hashPassword } from '../utils/password';

export type ProvisioningContext = { operatorId: string; requestId: string };

// Core business service shared by local bootstrap and the future admin entrypoint.
// No public controller or operator authentication is registered by this class.
export class AccountProvisioningService {
  constructor(private readonly client: PrismaClient) {}

  async create(input: unknown, context: ProvisioningContext) {
    try {
      return await this.client.$transaction(tx => this.createInTransaction(tx, input, context), { timeout: 30000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Account already exists.');
      }
      throw error;
    }
  }

  async createInTransaction(tx: Prisma.TransactionClient, input: unknown, context: ProvisioningContext) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException();
    const dto = plainToInstance(ProvisionAccountDto, input);
    if (validateSync(dto, { whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true }).length
      || !/^[A-Za-z0-9_-]{1,100}$/.test(context.operatorId) || !isUUID(context.requestId)) throw new BadRequestException();
    if (!dto.accountCode.startsWith(dto.role === 'STAFF' ? 'STF-' : 'CUS-')
      || (dto.role === 'STAFF' && dto.staffId)) throw new BadRequestException();
    if (dto.staffId) {
      await tx.$queryRaw`SELECT id FROM business.users WHERE id = ${dto.staffId}::uuid FOR UPDATE`;
      const staff = await tx.staffProfile.findUnique({ where: { userId: dto.staffId }, include: { user: true } });
      if (!staff || staff.user.status !== 'ACTIVE' || (staff.user.lockedUntil && staff.user.lockedUntil > new Date())) throw new BadRequestException();
    }
    const account = await tx.user.create({ data: {
      accountCode: dto.accountCode, email: dto.email, role: dto.role,
      passwordHash: await hashPassword(dto.password), passwordChangeRecommended: true,
    }, select: { id: true, accountCode: true, email: true, role: true } });
    if (dto.role === 'STAFF') await tx.staffProfile.create({ data: { userId: account.id, fullName: dto.fullName } });
    else {
      await tx.customerProfile.create({ data: { userId: account.id, fullName: dto.fullName, assignmentVersion: dto.staffId ? 1 : 0 } });
      if (dto.staffId) await tx.staffAssignment.create({ data: { staffId: dto.staffId, customerId: account.id, operatorId: context.operatorId } });
    }
    await tx.auditLog.create({ data: { actorType: 'OPERATOR', operatorId: context.operatorId,
      action: 'ACCOUNT_CREATED', targetType: 'User', targetId: account.id, outcome: 'SUCCESS', requestId: context.requestId,
      metadata: { role: account.role } } });
    return account;
  }
}
