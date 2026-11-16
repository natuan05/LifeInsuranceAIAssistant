import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConversationRateLimitService } from '../../conversations/services/conversation-rate-limit.service';
import { randomUUID } from 'node:crypto';
import { ConversationCommandService } from '../../conversations/services/conversation-command.service';
import type { IncomingMessage } from 'node:http';
import { AuthService } from '../../auth/services/auth.service';
import { DatabaseService } from '../../database/database.service';
import { Prisma } from '../../generated/prisma/client';
import type { CustomerListQuery } from '../dto/customer-query.dto';

const profileSelect = {
  userId: true, fullName: true, birth: true, address: true,
  user: { select: { accountCode: true, email: true, phone: true, status: true } },
} satisfies Prisma.CustomerProfileSelect;
const staffSelect = {
  userId: true, fullName: true,
  user: { select: { accountCode: true, email: true, phone: true, status: true } },
} satisfies Prisma.CustomerProfileSelect;
type Profile = Prisma.CustomerProfileGetPayload<{ select: typeof profileSelect }>;
function customerView(profile: Profile) {
  return { id: profile.userId, fullName: profile.fullName, birth: profile.birth?.toISOString().slice(0, 10) ?? null,
    address: profile.address, ...profile.user };
}

export function maskContact(field: 'email' | 'phone', value: string | null) {
  if (!value) return null;
  const characters = Array.from(field === 'phone' ? value.replace(/\D/g, '') : value);
  if (field === 'email') return characters.length <= 1 ? '***' : characters[0] + '***';
  return characters.length <= 2 ? '***' : '***' + characters.slice(-2).join('');
}
function staffSummary(profile: { userId: string; fullName: string; user: { accountCode: string; email: string; phone: string | null; status: string } }) {
  return { id: profile.userId, fullName: profile.fullName, accountCode: profile.user.accountCode,
    status: profile.user.status, email: maskContact('email', profile.user.email), phone: maskContact('phone', profile.user.phone) };
}

@Injectable()
export class CustomerService {
  constructor(private readonly database: DatabaseService, private readonly auth: AuthService,
    private readonly commands: ConversationCommandService, private readonly limits: ConversationRateLimitService) {}

  private async read<T>(request: IncomingMessage, role: 'CUSTOMER' | 'STAFF', work: (tx: Prisma.TransactionClient, actorId: string) => Promise<T>) {
    const verified = await this.auth.me(request);
    if (verified.actor.role !== role) throw new ForbiddenException();
    await this.limits.customerRead(verified.actor.id);
    // Read identity, assignment and data from one snapshot. The next request observes
    // any committed revocation/lock/reassignment; never cache authorization in the UI.
    return this.database.prisma.$transaction(async tx => {
      const { actor } = await this.auth.me(request, tx);
      if (actor.role !== role) throw new ForbiddenException();
      return work(tx, actor.id);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  own(request: IncomingMessage) {
    return this.read(request, 'CUSTOMER', async (tx, actorId) => {
      const profile = await tx.customerProfile.findUnique({ where: { userId: actorId }, select: profileSelect });
      if (!profile) throw new NotFoundException();
      const assignment = await tx.staffAssignment.findFirst({ where: { customerId: actorId, isActive: true }, select: {
        staff: { select: { userId: true, fullName: true, department: true,
          user: { select: { email: true, phone: true, status: true, lockedUntil: true } } } },
      } });
      const assigned = assignment?.staff;
      const available = assigned && assigned.user.status === 'ACTIVE' && (!assigned.user.lockedUntil || assigned.user.lockedUntil <= new Date());
      return { customer: customerView(profile), assignmentStatus: !assigned ? 'UNASSIGNED' : available ? 'ASSIGNED' : 'STAFF_UNAVAILABLE',
        staff: available ? { id: assigned.userId, fullName: assigned.fullName, department: assigned.department,
          email: assigned.user.email, phone: assigned.user.phone } : null };
    });
  }

  list(request: IncomingMessage, query: CustomerListQuery) {
    return this.read(request, 'STAFF', async (tx, actorId) => {
      // Escape LIKE metacharacters: user input is a literal substring, never a wildcard pattern.
      const term = query.search?.replace(/[\\%_]/g, '\\$&');
      const where: Prisma.CustomerProfileWhereInput = {
        assignments: { some: { staffId: actorId, isActive: true } },
        ...(term ? { OR: [
          { fullName: { contains: term, mode: 'insensitive' } },
          { user: { accountCode: { contains: term, mode: 'insensitive' } } },
        ] } : {}),
      };
      const total = await tx.customerProfile.count({ where });
      const profiles = await tx.customerProfile.findMany({ where, select: {
        userId: true, fullName: true, user: { select: { accountCode: true, email: true, phone: true, status: true } },
      }, orderBy: { userId: 'asc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize });
      return { items: profiles.map(staffSummary),
        total, page: query.page, pageSize: query.pageSize };
    });
  }

  detail(request: IncomingMessage, customerId: string) {
    return this.read(request, 'STAFF', async (tx, actorId) => {
      // Filter ownership in the data query itself; missing and out-of-scope IDs both return 404.
      const profile = await tx.customerProfile.findFirst({ where: { userId: customerId,
        assignments: { some: { staffId: actorId, isActive: true } } }, select: staffSelect });
      if (!profile) throw new NotFoundException();
      return { customer: { ...staffSummary(profile), birthYear: null, provinceCity: null } };
    });
  }

  async reveal(request: IncomingMessage & { requestId?: string }, customerId: string, field: 'email' | 'phone') {
    const verified = await this.auth.authorizeWrite(request, this.database.prisma);
    if (verified.actor.role !== 'STAFF') throw new ForbiddenException();
    await this.limits.customerContactReveal(verified.actor.id);
    const result = await this.commands.transaction(async tx => {
      const initial = await this.auth.authorizeWrite(request, tx);
      if (initial.actor.role !== 'STAFF') throw new ForbiddenException();
      // Missing profiles also produce an audited 404. Acquire the shared lock order
      // only for existing profiles, then reauthorize after waiting for any writer.
      const exists = await tx.customerProfile.findUnique({ where: { userId: customerId }, select: { userId: true } });
      if (exists) await this.commands.lockCustomer(tx, initial.actor.id, customerId);
      const { actor } = await this.auth.authorizeWrite(request, tx);
      if (actor.role !== 'STAFF') throw new ForbiddenException();
      const assignment = exists && await tx.staffAssignment.findFirst({ where: { customerId, staffId: actor.id, isActive: true }, select: { id: true } });
      await tx.auditLog.create({ data: { actorType: 'USER', actorId: actor.id, actorRole: 'STAFF',
        action: 'CUSTOMER_CONTACT_REVEALED', targetType: 'Customer', targetId: customerId,
        outcome: assignment ? 'SUCCESS' : 'FAILURE', requestId: request.requestId ?? randomUUID(), metadata: { field } } });
      if (!assignment) return null;
      const contact = await tx.user.findUniqueOrThrow({ where: { id: customerId }, select: { email: true, phone: true } });
      return { customerId, field, value: contact[field] };
    });
    // Throw after commit so a denied scope attempt retains its metadata audit.
    if (!result) throw new NotFoundException();
    return result;
  }

}
