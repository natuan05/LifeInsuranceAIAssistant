import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { HttpAdapterHost } from '@nestjs/core';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { ApiExceptionFilter, createValidationPipe } from '../http/http-foundation';
import { AdminModule } from './admin.module';

export async function createAdminApp(client: PrismaClient, credential: { username: string; passwordHash: string }, port: number) {
  const origins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
  const app = await NestFactory.create(AdminModule.register(client, credential, origins), { logger: false });
  app.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if (!origins.some(origin => new URL(origin).host === req.headers.host) || req.headers['sec-fetch-site'] === 'cross-site') {
      res.writeHead(403); res.end(); return;
    }
    const assets: Record<string, [string, string]> = { '/': ['index.html', 'text/html; charset=utf-8'],
      '/admin.js': ['admin.js', 'text/javascript; charset=utf-8'], '/admin.css': ['admin.css', 'text/css; charset=utf-8'] };
    const asset = assets[req.url ?? ''];
    if (req.method === 'GET' && asset) {
      res.setHeader('Content-Type', asset[1]); res.end(readFileSync(resolve(__dirname, '../../admin-ui', asset[0]))); return;
    }
    next();
  });
  app.setGlobalPrefix('ops/v1'); app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new ApiExceptionFilter(app.get(HttpAdapterHost).httpAdapter));
  return app;
}

async function main() {
  const input = JSON.parse(readFileSync(0, 'utf8')) as { port: number; password: string; directory: string };
  if (process.env.NODE_ENV === 'production' || resolve(input.directory) !== resolve(process.cwd(), '.local/dev')
    || !Number.isInteger(input.port) || input.port < 1 || input.port > 65535 || !/^[a-f0-9]{64}$/.test(input.password)) throw new Error();
  const file = resolve(input.directory, 'operator.json');
  if (!existsSync(file) || realpathSync(file) !== file) throw new Error();
  const credential = JSON.parse(readFileSync(file, 'utf8')) as { username: string; passwordHash: string };
  if (credential.username !== 'local-operator' || !/^\$2b\$12\$[./A-Za-z0-9]{53}$/.test(credential.passwordHash)) throw new Error();
  const client = new PrismaClient({ adapter: new PrismaPg({ host: '127.0.0.1', port: input.port, database: 'life_insurance', user: 'admin_runtime', password: input.password, max: 5 }) });
  try {
    const rows = await client.$queryRaw<Array<{ migration_name: string }>>`SELECT migration_name FROM business._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name DESC LIMIT 1`;
    if (rows[0]?.migration_name !== '202610250003_remove_admin_requests') throw new Error();
    const app = await createAdminApp(client, credential, 4100); app.enableShutdownHooks();
    await app.listen(4100, '127.0.0.1');
    console.log('Account admin ready: http://127.0.0.1:4100 — LOCAL PostgreSQL. Operator credential: .local/dev/operator-initial.txt (private; do not share).');
    for (const event of ['SIGINT', 'SIGTERM'] as const) process.once(event, () => { void app.close().then(() => client.$disconnect()); });
  } catch { await client.$disconnect(); throw new Error(); }
}
if (require.main === module) void main().catch(() => { console.error('Admin startup failed. Check private operator setup, local database/schema and port 4100. Credentials suppressed.'); process.exitCode = 1; });
