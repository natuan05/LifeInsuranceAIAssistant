import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { AuthService } from '../../auth/services/auth.service';
import { DatabaseService } from '../../database/database.service';
import { Prisma } from '../../generated/prisma/client';
import { consumeProductQuota } from './product-quota';
import type { ProductQuery } from '../dto/product-query.dto';

const productSelect = { id: true, productCode: true, name: true, summary: true, isActive: true } satisfies Prisma.InsuranceProductSelect;
export type ProductActor = { id: string; role: 'STAFF' | 'CUSTOMER' };

@Injectable()
export class ProductService {
  constructor(private readonly database: DatabaseService, private readonly auth: AuthService) {}

  async readCatalog<T>(request: IncomingMessage, work: (tx: Prisma.TransactionClient, actor: ProductActor) => Promise<T>) {
    const { actor } = await this.auth.me(request);
    if (actor.role !== 'STAFF' && actor.role !== 'CUSTOMER') throw new ForbiddenException();
    // Quota commits independently: concurrent reads must not contend on a quota
    // write inside the RepeatableRead catalog snapshot.
    await consumeProductQuota(this.database.prisma, actor.id, 'READ');
    return this.database.prisma.$transaction(async tx => {
      const current = await this.auth.me(request, tx);
      if (current.actor.id !== actor.id || current.actor.role !== actor.role) throw new UnauthorizedException();
      return work(tx, { id: actor.id, role: actor.role });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 });
  }

  list(request: IncomingMessage, query: ProductQuery) {
    return this.readCatalog(request, async tx => {
      // Prisma contains uses LIKE patterns. Escape metacharacters so search is literal.
      const term = query.search?.replace(/[\\%_]/g, '\\$&');
      const contains = { contains: term, mode: 'insensitive' as const };
      const where: Prisma.InsuranceProductWhereInput = { isActive: true,
        ...(term ? { OR: [{ name: contains }, { productCode: contains }] } : {}) };
      const total = await tx.insuranceProduct.count({ where });
      const items = await tx.insuranceProduct.findMany({ where, select: productSelect,
        orderBy: [{ productCode: 'asc' }, { id: 'asc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize });
      return { items, total, page: query.page, pageSize: query.pageSize };
    });
  }

  detail(request: IncomingMessage, productId: string) {
    return this.readCatalog(request, async tx => {
      const product = await tx.insuranceProduct.findFirst({ where: { id: productId, isActive: true }, select: productSelect });
      if (!product) throw new NotFoundException();
      return { product };
    });
  }
}
