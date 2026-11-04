const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

// Integration test: uses the existing Docker PostgreSQL local socket, without
// reading credentials. Each case owns and cleans up a separate fixture schema.
const root = resolve(__dirname, '../../..');
const migration = readFileSync(resolve(__dirname,
  '../prisma/migrations/202611030001_remove_conversation_closed/migration.sql'), 'utf8');

function sql(input, { succeeds = true } = {}) {
  const result = spawnSync('docker', ['compose', 'exec', '-T', 'postgres',
    'psql', '-X', '-qAt', '-U', 'local_owner', '-d', 'life_insurance',
    '-v', 'ON_ERROR_STOP=1'], { cwd: root, input, encoding: 'utf8', timeout: 30000 });
  if (succeeds) assert.equal(result.status, 0, result.stderr || String(result.error));
  else assert.notEqual(result.status, 0);
  return result;
}

function fixture(run) {
  const schema = `migration_test_${randomUUID().replaceAll('-', '')}`;
  assert.match(schema, /^migration_test_[a-f0-9]{32}$/);
  try {
    sql(`CREATE SCHEMA ${schema};
      CREATE TYPE ${schema}."ConversationStatus" AS ENUM
        ('AI_ACTIVE','PENDING_HANDOFF','STAFF_ACTIVE','CLOSED');
      CREATE TYPE ${schema}."TicketStatus" AS ENUM ('OPEN','CLOSED');
      CREATE TABLE ${schema}.conversations (
        id uuid PRIMARY KEY, channel_type text NOT NULL,
        status ${schema}."ConversationStatus" NOT NULL, assigned_staff_id uuid,
        linked_policy_id uuid, updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE ${schema}.audit_logs (
        actor_type text, action text, target_type text, target_id uuid,
        outcome text, request_id uuid, metadata jsonb);
      CREATE TABLE ${schema}.messages (
        conversation_id uuid REFERENCES ${schema}.conversations(id), content text);
      CREATE TABLE ${schema}.tickets (
        conversation_id uuid REFERENCES ${schema}.conversations(id),
        status ${schema}."TicketStatus" NOT NULL);
    `);
    run(schema, migration.replaceAll('business.', `${schema}.`));
  } finally {
    sql(`DROP SCHEMA IF EXISTS ${schema} CASCADE;`);
  }
}

test('legacy support chats become AI-private; history, links and Ticket CLOSED survive', () => {
  fixture((s, script) => {
    sql(`INSERT INTO ${s}.conversations VALUES
      ('00000000-0000-4000-8000-000000000001','CUSTOMER_SUPPORT','CLOSED',
       '00000000-0000-4000-8000-000000000099',
       '00000000-0000-4000-8000-000000000088','2026-10-01T00:00:00Z'),
      ('00000000-0000-4000-8000-000000000002','CUSTOMER_SUPPORT','STAFF_ACTIVE',
       '00000000-0000-4000-8000-000000000099',NULL,'2026-10-01T00:00:00Z');
      INSERT INTO ${s}.messages VALUES
        ('00000000-0000-4000-8000-000000000001','synthetic history');
      INSERT INTO ${s}.tickets VALUES
        ('00000000-0000-4000-8000-000000000001','CLOSED');`);
    sql(script);
    const checks = sql(`SELECT
      (SELECT status='AI_ACTIVE' AND assigned_staff_id IS NULL
        AND linked_policy_id='00000000-0000-4000-8000-000000000088'
        AND updated_at='2026-10-01T00:00:00Z' FROM ${s}.conversations
        WHERE id='00000000-0000-4000-8000-000000000001'),
      (SELECT status='STAFF_ACTIVE' AND assigned_staff_id IS NOT NULL
        FROM ${s}.conversations WHERE id='00000000-0000-4000-8000-000000000002'),
      (SELECT count(*)=1 AND bool_and(content='synthetic history') FROM ${s}.messages),
      (SELECT count(*)=1 AND bool_and(status='CLOSED') FROM ${s}.tickets),
      (SELECT count(*)=1 AND bool_and(actor_type='SYSTEM' AND outcome='SUCCESS'
        AND metadata->>'previousStatus'='CLOSED'
        AND metadata->>'previousAssignedStaffId'='00000000-0000-4000-8000-000000000099'
        AND metadata->>'newStatus'='AI_ACTIVE') FROM ${s}.audit_logs);`).stdout.trim();
    assert.equal(checks, 't|t|t|t|t');
    const rejected = sql(`UPDATE ${s}.conversations SET status='CLOSED';`, { succeeds: false });
    assert.match(rejected.stderr, /invalid input value for enum/);
  });
});

test('empty database migrates without inventing audit or chat records', () => {
  fixture((s, script) => {
    sql(script);
    assert.equal(sql(`SELECT count(*) FROM ${s}.audit_logs;`).stdout.trim(), '0');
    assert.equal(sql(`SELECT enum_range(NULL::${s}."ConversationStatus");`).stdout.trim(),
      '{AI_ACTIVE,PENDING_HANDOFF,STAFF_ACTIVE}');
  });
});

test('unreviewed legacy Copilot fails atomically and preserves owner and old enum', () => {
  fixture((s, script) => {
    sql(`INSERT INTO ${s}.conversations (id,channel_type,status,assigned_staff_id)
      VALUES (gen_random_uuid(),'STAFF_COPILOT','CLOSED',gen_random_uuid());`);
    const failed = sql(script, { succeeds: false });
    assert.match(failed.stderr, /require an ownership review/);
    assert.equal(sql(`SELECT status, assigned_staff_id IS NOT NULL FROM ${s}.conversations;
      SELECT count(*) FROM ${s}.audit_logs;
      SELECT enum_range(NULL::${s}."ConversationStatus");`).stdout.trim(),
    'CLOSED|t\n0\n{AI_ACTIVE,PENDING_HANDOFF,STAFF_ACTIVE,CLOSED}');
  });
});
