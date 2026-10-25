import { Injectable, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly client: PrismaClient | null;

  constructor() {
    const file = process.env.DATABASE_PASSWORD_FILE;
    this.client = file ? new PrismaClient({
      adapter: new PrismaPg({
        host: process.env.PGHOST ?? '127.0.0.1',
        port: Number(process.env.PGPORT ?? '5432'),
        database: process.env.PGDATABASE ?? 'life_insurance',
        user: process.env.PGUSER ?? 'core_runtime',
        password: readFileSync(file, 'utf8').trim(),
        connectionTimeoutMillis: 3000,
        max: 5,
      }),
    }) : null;
  }

  async onModuleInit() { await this.client?.$connect(); }
  get prisma(): PrismaClient {
    if (!this.client) throw new ServiceUnavailableException();
    return this.client;
  }
  async onModuleDestroy() { await this.client?.$disconnect(); }

  async isReady(): Promise<boolean> {
    if (!this.client) return false;
    try {
      const rows = await this.client.$queryRaw<Array<{ ready: boolean }>>`
        SELECT EXISTS(SELECT 1 FROM business._prisma_migrations
          WHERE migration_name = '202610250003_remove_admin_requests'
          AND finished_at IS NOT NULL AND rolled_back_at IS NULL) AS ready`;
      return rows[0]?.ready === true;
    } catch { return false; }
  }
}
