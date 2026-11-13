const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync, readdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const root = resolve(__dirname, '../../..'), dir = resolve(__dirname, '../prisma/migrations');
const name = '202611040003_ticket_foundation';
const migration = readFileSync(resolve(dir, name, 'migration.sql'), 'utf8');
function sql(input, fail = false) {
  const result = spawnSync('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-X', '-qAt', '-U', 'local_owner',
    '-d', 'life_insurance', '-v', 'ON_ERROR_STOP=1'], { cwd: root, input, encoding: 'utf8', timeout: 30000, windowsHide: true });
  if (fail) assert.notEqual(result.status, 0); else assert.equal(result.status, 0, result.stderr || String(result.error));
  return result;
}
function fixture(work) {
  const schema = `ticket_migration_test_${randomUUID().replaceAll('-', '')}`;
  assert.match(schema, /^ticket_migration_test_[a-f0-9]{32}$/);
  const transform = text => text.replace(/\bbusiness\b/g, schema).replace(/\brag\b/g, `${schema}_rag`);
  try {
    for (const old of readdirSync(dir).filter(value => value < name).sort()) sql(transform(readFileSync(resolve(dir, old, 'migration.sql'), 'utf8')));
    work(schema, transform(migration));
  } finally { sql(`DROP SCHEMA IF EXISTS ${schema}_rag CASCADE; DROP SCHEMA IF EXISTS ${schema} CASCADE;`); }
}
function legacy(schema) {
  sql(`INSERT INTO ${schema}.users(id,account_code,email,password_hash,role)
    VALUES('00000000-0000-4000-8000-000000000001','CUS-909090909','tk01@synthetic.invalid','synthetic-not-for-login','CUSTOMER');
    INSERT INTO ${schema}.customer_profiles(user_id,full_name) VALUES('00000000-0000-4000-8000-000000000001','Synthetic migration');
    INSERT INTO ${schema}.support_tickets(id,ticket_code,customer_id,title,ai_summary,extracted_details,status,idempotency_key,confirmed_at)
    VALUES('00000000-0000-4000-8000-000000000002','SYN-TK01','00000000-0000-4000-8000-000000000001','Synthetic title','Unverified AI summary','{"synthetic":true}','CLOSED','synthetic-key','2026-01-01T00:00:00Z');`);
}
test('TK01 upgrades empty schema with non-null default and nonnegative version constraint', () => fixture((s, script) => {
  sql(script); legacy(s);
  assert.equal(sql(`SELECT version FROM ${s}.support_tickets;`).stdout.trim(), '0');
  assert.match(sql(`UPDATE ${s}.support_tickets SET version=-1;`, true).stderr, /support_tickets_version_nonnegative/);
  assert.match(sql(`UPDATE ${s}.support_tickets SET version=NULL;`, true).stderr, /not-null/);
  sql(`UPDATE ${s}.support_tickets SET version=version+1;`);
  assert.equal(sql(`SELECT version,status FROM ${s}.support_tickets;`).stdout.trim(), '1|CLOSED');
}));
test('TK01 backfill preserves all existing ticket data and does not create confirmation evidence', () => fixture((s, script) => {
  legacy(s);
  const digest = () => sql(`SELECT md5(string_agg((to_jsonb(t)-'version')::text,'' ORDER BY id)) FROM ${s}.support_tickets t;`).stdout.trim();
  const before = digest(); sql(script); assert.equal(digest(), before);
  assert.equal(sql(`SELECT version FROM ${s}.support_tickets;`).stdout.trim(), '0');
  assert.equal(sql(`SELECT count(*) FROM information_schema.columns WHERE table_schema='${s}' AND table_name='support_tickets' AND column_name IN ('confirmed_content','source_draft_id','updated_at');`).stdout.trim(), '0');
}));
test('TK01 failed migration rolls back DDL and preserves existing rows', () => fixture((s, script) => {
  legacy(s); assert.match(sql(script.replace('COMMIT;', 'SELECT 1/0; COMMIT;'), true).stderr, /division by zero/);
  assert.equal(sql(`SELECT count(*) FROM information_schema.columns WHERE table_schema='${s}' AND table_name='support_tickets' AND column_name='version';
    SELECT ticket_code,status FROM ${s}.support_tickets;`).stdout.trim(), '0\nSYN-TK01|CLOSED');
}));
