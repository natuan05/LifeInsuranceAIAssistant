import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import pg from 'pg';

const password = readFileSync('/credentials/migration/password', 'utf8').trim();
const host = process.env.PGHOST ?? 'postgres';
const url = new URL(`postgresql://${host}:5432/life_insurance?schema=business`);
url.username = 'app_migrator';
url.password = password;
const require = createRequire(import.meta.url);
const packagePath = require.resolve('prisma/package.json');
const cli = resolve(dirname(packagePath), JSON.parse(readFileSync(packagePath, 'utf8')).bin.prisma);
const result = spawnSync(process.execPath, [cli, 'migrate', 'deploy'], {
  env: { ...process.env, MIGRATION_DATABASE_URL: url.toString() }, stdio: 'inherit', windowsHide: true,
});
if (result.status !== 0 || result.error) {
  process.exitCode = 1;
} else {
  const client = new pg.Client({ host, port: 5432, user: 'app_migrator', password, database: 'life_insurance' });
  try {
    await client.connect();
    await client.query('REVOKE ALL ON business._prisma_migrations FROM core_runtime, admin_runtime, db_viewer');
    await client.query('GRANT SELECT ON business._prisma_migrations TO core_runtime, admin_runtime');
    console.log('Migration completed; migration history is protected from runtime writes.');
  } catch {
    console.error('Could not finalize migration privileges.');
    process.exitCode = 1;
  } finally { await client.end(); }
}
