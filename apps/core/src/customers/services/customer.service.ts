import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { AuthService } from '../../auth/services/auth.service';
import { DatabaseService } from '../../database/database.service';
import { Prisma } from '../../generated/prisma/client';
import type { CustomerListQuery } from '../dto/customer-query.dto';

const profileSelect = {
  userId: true, fullName: true, birth: true, address: true,
  user: { select: { accountCode: true, email: true, phone: true, status: true } },
} satisfies Prisma.CustomerProfileSelect;
type Profile = Prisma.CustomerProfileGetPayload<{ select: typeof profileSelect }>;
function customerView(profile: Profile) {
  return { id: profile.userId, fullName: profile.fullName, birth: profile.birth?.toISOString().slice(0, 10) ?? null,
    address: profile.address, ...profile.user };
}

@Injectable()
export class CustomerService {
  constructor(private readonly database: DatabaseService, private readonly auth: AuthService) {}

  private read<T>(request: IncomingMessage, role: 'CUSTOMER' | 'STAFF', work: (tx: Prisma.TransactionClient, actorId: string) => Promise<T>) {
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
      const where = { assignments: { some: { staffId: actorId, isActive: true } } };
      const total = await tx.customerProfile.count({ where });
      const profiles = await tx.customerProfile.findMany({ where, select: {
        userId: true, fullName: true, user: { select: { accountCode: true, email: true, phone: true, status: true } },
      }, orderBy: { userId: 'asc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize });
      return { items: profiles.map(profile => ({ id: profile.userId, fullName: profile.fullName, ...profile.user })),
        total, page: query.page, pageSize: query.pageSize };
    });
  }

  detail(request: IncomingMessage, customerId: string) {
    return this.read(request, 'STAFF', async (tx, actorId) => {
      // Filter ownership in the data query itself; missing and out-of-scope IDs both return 404.
      const profile = await tx.customerProfile.findFirst({ where: { userId: customerId,
        assignments: { some: { staffId: actorId, isActive: true } } }, select: profileSelect });
      if (!profile) throw new NotFoundException();
      return { customer: customerView(profile) };
    });
  }
}
