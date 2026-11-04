const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync, readdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const root = resolve(__dirname, '../../..');
const dir = resolve(__dirname, '../prisma/migrations');
const name = '202611040001_inbox_foundation';
const migration = readFileSync(resolve(dir, name, 'migration.sql'), 'utf8');
function sql(input, fail = false) {
  const r = spawnSync('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-X', '-qAt', '-U', 'local_owner',
    '-d', 'life_insurance', '-v', 'ON_ERROR_STOP=1'], { cwd: root, input, encoding: 'utf8', timeout: 30000 });
  if (fail) assert.notEqual(r.status, 0); else assert.equal(r.status, 0, r.stderr || String(r.error));
  return r;
}
function fixture(work) {
  const schema = `migration_test_${randomUUID().replaceAll('-', '')}`;
  assert.match(schema, /^migration_test_[a-f0-9]{32}$/);
  const transform = s => s.replace(/\bbusiness\b/g, schema).replace(/\brag\b/g, `${schema}_rag`);
  try {
    for (const old of readdirSync(dir).filter(n => n < name).sort()) sql(transform(readFileSync(resolve(dir, old, 'migration.sql'), 'utf8')));
    work(schema, transform(migration));
  } finally { sql(`DROP SCHEMA IF EXISTS ${schema}_rag CASCADE; DROP SCHEMA IF EXISTS ${schema} CASCADE;`); }
}

test('I01 migration supports empty baseline and adds DB constraints', () => fixture((s, script) => {
  sql(script);
  assert.equal(sql(`SELECT count(*) FROM ${s}.conversation_handoffs;
    SELECT count(*) FROM ${s}.conversation_command_receipts;
    SELECT enum_range(NULL::${s}."MessageAudience");`).stdout.trim(), '0\n0\n{CUSTOMER_VISIBLE,INTERNAL,LEGACY_REVIEW}');
}));

test('I01 legacy backfill preserves original rows, deterministic order, and creates no grants', () => fixture((s, script) => {
  sql(`INSERT INTO ${s}.users (id,account_code,email,password_hash,role)
    VALUES ('00000000-0000-4000-8000-000000000001','CUS-999999999','i01@synthetic.invalid','not-for-login','CUSTOMER');
    INSERT INTO ${s}.customer_profiles(user_id,full_name) VALUES ('00000000-0000-4000-8000-000000000001','Synthetic I01');
    INSERT INTO ${s}.conversations(id,customer_id,channel_type,status) VALUES
      ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','CUSTOMER_SUPPORT','AI_ACTIVE'),
      ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','STAFF_COPILOT','AI_ACTIVE');
    INSERT INTO ${s}.messages(id,conversation_id,sender_type,content,created_at) VALUES
      ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000002','AI_AGENT','Synthetic B','2026-11-01'),
      ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000002','AI_AGENT','Synthetic A','2026-11-01'),
      ('00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000003','SYSTEM','Synthetic internal','2026-11-01');`);
  const digest = () => sql(`SELECT md5(string_agg((to_jsonb(m)-ARRAY['sequence','audience','client_message_id','internal_message_id'])::text,'' ORDER BY id)) FROM ${s}.messages m;`).stdout.trim();
  const before = digest();
  sql(script);
  assert.equal(digest(), before);
  assert.equal(sql(`SELECT string_agg(sequence::text||':'||audience::text,',' ORDER BY id) FROM ${s}.messages;
    SELECT support_origin,next_message_sequence FROM ${s}.conversations WHERE channel_type='CUSTOMER_SUPPORT';
    SELECT count(*) FROM ${s}.conversation_handoffs;`).stdout.trim(), '1:LEGACY_REVIEW,2:LEGACY_REVIEW,1:INTERNAL\nLEGACY_UNKNOWN|2\n0');
  assert.match(sql(`UPDATE ${s}.conversations SET support_origin='AI',created_by_customer_id=customer_id WHERE channel_type='CUSTOMER_SUPPORT';`, true).stderr, /immutable/);
  assert.match(sql(`UPDATE ${s}.messages SET audience='CUSTOMER_VISIBLE' WHERE conversation_id='00000000-0000-4000-8000-000000000003';`, true).stderr, /internal/);
}));

test('I01 failure after all DDL/backfill rolls the whole migration back', () => fixture((s, script) => {
  assert.match(sql(script.replace('COMMIT;', 'SELECT 1/0; COMMIT;'), true).stderr, /division by zero/);
  assert.equal(sql(`SELECT to_regclass('${s}.conversation_handoffs') IS NULL;
    SELECT count(*) FROM information_schema.columns WHERE table_schema='${s}' AND table_name='messages' AND column_name='sequence';`).stdout.trim(), 't\n0');
}));
