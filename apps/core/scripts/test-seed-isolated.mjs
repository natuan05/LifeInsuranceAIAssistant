import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import pg from 'pg';
import { prepareUpgrade, verifyUpgrade } from '../test/support/seed-upgrade-fixture.mjs';

const database = `seed_test_${randomUUID().replaceAll('-', '')}`;
if (!/^seed_test_[a-f0-9]{32}$/.test(database)) throw new Error('Invalid fixture database');
const password = readFileSync('/credentials/bootstrap/password', 'utf8').trim();
const config = { host: 'postgres', port: 5432, user: 'local_owner', password, connectionTimeoutMillis: 5000 };
const owner = new pg.Client({ ...config, database: 'postgres' });
let created = false;
const require = createRequire(import.meta.url);
const prismaPackage = require.resolve('prisma/package.json');
const cli = resolve(dirname(prismaPackage), JSON.parse(readFileSync(prismaPackage, 'utf8')).bin.prisma);
const url = new URL(`postgresql://postgres:5432/${database}?schema=business`);
url.username = config.user; url.password = password;
const env = { ...process.env, PGDATABASE: database, TEST_RESET_DATABASE: database, MIGRATION_DATABASE_URL: url.toString() };
function run(args) {
  const result = spawnSync(process.execPath, args, { env, stdio: 'inherit', windowsHide: true, timeout: 600000 });
  if (result.error || result.status !== 0) throw new Error('Isolated seed validation failed');
}
try {
  await owner.connect();
  await owner.query(`CREATE DATABASE "${database}"`);
  created = true;
  const fixture = new pg.Client({ ...config, database });
  try {
    await fixture.connect();
    await fixture.query('CREATE EXTENSION vector');
    await fixture.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC; CREATE SCHEMA business; CREATE SCHEMA rag');
    // Apply production runtime grants in this fixture only; its owner runs migrations.
    const bootstrap = readFileSync(new URL('./bootstrap-database.mjs', import.meta.url), 'utf8');
    for (const [, sql] of bootstrap.matchAll(/await client\.query\('([^']+)'\)/g)) {
      if (sql.startsWith('GRANT USAGE ON SCHEMA') || sql.startsWith('ALTER DEFAULT PRIVILEGES')) {
        await fixture.query(sql.replaceAll('FOR ROLE app_migrator', 'FOR ROLE local_owner'));
      }
    }
    const upgrade = await prepareUpgrade(fixture);
    run([cli, 'migrate', 'deploy']);
    await verifyUpgrade(fixture, upgrade);
    run([cli, 'migrate', 'deploy']);
    await verifyUpgrade(fixture, upgrade);
    await fixture.query('REVOKE ALL ON business._prisma_migrations FROM core_runtime,admin_runtime,db_viewer; GRANT SELECT ON business._prisma_migrations TO core_runtime,admin_runtime');
  } finally { await fixture.end(); }
  run(['scripts/verify-models.mjs']);
  const checks = new pg.Client({ ...config, database });
  try {
    await checks.connect();
    for (const [change, restore] of [
      ['GRANT INSERT ON business.ticket_drafts TO db_viewer', 'REVOKE INSERT ON business.ticket_drafts FROM db_viewer'],
      ['GRANT UPDATE(title) ON business.ticket_drafts TO db_viewer', 'REVOKE UPDATE(title) ON business.ticket_drafts FROM db_viewer'],
      ['GRANT INSERT(title) ON business.ticket_drafts TO db_viewer', 'REVOKE INSERT(title) ON business.ticket_drafts FROM db_viewer'],
      ['GRANT REFERENCES(title) ON business.ticket_drafts TO db_viewer', 'REVOKE REFERENCES(title) ON business.ticket_drafts FROM db_viewer'],
      ['REVOKE SELECT ON business.conversation_notification_states FROM db_viewer', 'GRANT SELECT ON business.conversation_notification_states TO db_viewer'],
      ['CREATE TABLE business.__phase5_extra(id int); GRANT SELECT ON business.__phase5_extra TO db_viewer', 'DROP TABLE business.__phase5_extra'],
      ['CREATE TABLE business.__phase5_hidden(id int); REVOKE ALL ON business.__phase5_hidden FROM core_runtime,admin_runtime,db_viewer,PUBLIC', 'DROP TABLE business.__phase5_hidden'],
      ['CREATE TABLE rag.__phase5_hidden(id int); REVOKE ALL ON rag.__phase5_hidden FROM core_runtime,admin_runtime,db_viewer,PUBLIC', 'DROP TABLE rag.__phase5_hidden'],
      ...['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'].map(privilege => [
        `GRANT ${privilege}(content) ON rag.rag_knowledge_chunks TO core_runtime`,
        `REVOKE ${privilege}(content) ON rag.rag_knowledge_chunks FROM core_runtime`,
      ]),
    ]) {
      try {
        await checks.query(change);
        const result = spawnSync(process.execPath, ['scripts/verify-models.mjs'], { env, encoding: 'utf8', windowsHide: true, timeout: 30000 });
        if (result.status === 0 || !result.stderr?.includes('AssertionError')) throw new Error('Verifier did not reject fixture drift');
      } finally { await checks.query(restore); }
    }
    console.log('PASS verifier rejects table/column privilege drift and visible/hidden schema drift');
    for (const [code, role] of [['STF-990001', 'STAFF'], ['STF-990002', 'STAFF'], ['CUS-990001', 'CUSTOMER']]) {
      const user = (await checks.query('INSERT INTO business.users(account_code,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id',
        [code, `${code.toLowerCase()}@existing.synthetic.invalid`, 'synthetic-existing-account', role])).rows[0].id;
      await checks.query(`INSERT INTO business.${role === 'STAFF' ? 'staff_profiles' : 'customer_profiles'}(user_id,full_name) VALUES($1,$2)`, [user, `Synthetic existing ${code}`]);
    }
    const relations = (await checks.query("SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('business','rag') AND c.relkind IN ('r','p') ORDER BY 1,2")).rows;
    const snapshot = async () => {
      const values = [];
      for (const { nspname, relname } of relations) {
        const quoted = `"${nspname.replaceAll('"', '""')}"."${relname.replaceAll('"', '""')}"`;
        values.push((await checks.query(`SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) AS hash FROM ${quoted} t`)).rows[0].hash);
      }
      return JSON.stringify(values);
    };
    const before = await snapshot();
    run(['scripts/verify-models.mjs']);
    const concurrent = await Promise.allSettled([0, 1].map(() => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['scripts/verify-models.mjs'], { env, stdio: 'ignore', windowsHide: true, timeout: 30000 });
      child.once('error', reject);
      child.once('close', code => code === 0 ? resolve() : reject(new Error('Concurrent verifier failed')));
    })));
    if (concurrent.some(result => result.status !== 'fulfilled') || await snapshot() !== before) throw new Error('Verifier changed existing data or failed concurrently');
    console.log('PASS verifier preserves existing former fixture codes and all table contents across sequential/concurrent runs');
  } finally { await checks.end(); }
  run(['--test', '--test-concurrency=1', 'test/policy-seed.test.cjs', 'test/dev-data-reset.test.cjs']);
} catch (error) {
  console.error('Validation error metadata:', { code: error.code ?? error.name, table: error.table, column: error.column, constraint: error.constraint });
  console.error('Isolated seed/reset validation failed; shared database was not reset.');
  process.exitCode = 1;
} finally {
  try { if (created) await owner.query(`DROP DATABASE "${database}" WITH (FORCE)`); }
  finally { await owner.end(); }
}
