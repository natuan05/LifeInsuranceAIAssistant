import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';

const tables = ['ticket_drafts', 'support_tickets', 'notifications', 'messages', 'insurance_policies'];
async function snapshot(db) {
  const result = {};
  for (const table of tables) {
    result[table] = (await db.query(`SELECT to_jsonb(t)-'request_fingerprint' AS row FROM business.${table} t ORDER BY id`)).rows;
  }
  return result;
}

export async function prepareUpgrade(db) {
  // Reproduce the schema that already supports drafts, before fingerprint/cycle migrations.
  await db.query(`CREATE TABLE business._prisma_migrations (
    id varchar(36) PRIMARY KEY, checksum varchar(64) NOT NULL, finished_at timestamptz,
    migration_name varchar(255) NOT NULL, logs text, rolled_back_at timestamptz,
    started_at timestamptz NOT NULL DEFAULT now(), applied_steps_count integer NOT NULL DEFAULT 0)`);
  const root = new URL('../../prisma/migrations/', import.meta.url);
  const names = readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort();
  for (const name of names.filter(n => n <= '202611130001_customer_ticket_drafts_and_confirmed_content')) {
    assert.match(name, /^\d{12}_[a-z0-9_]+$/);
    const bytes = readFileSync(new URL(`${name}/migration.sql`, root));
    await db.query(bytes.toString('utf8'));
    await db.query('INSERT INTO business._prisma_migrations(id,checksum,migration_name,finished_at,applied_steps_count) VALUES($1,$2,$3,now(),1)',
      [randomUUID(), createHash('sha256').update(bytes).digest('hex'), name]);
  }
  const ids = Object.fromEntries(['customer', 'foreign', 'product', 'policy', 'chat', 'draft', 'pending', 'ticket'].map(key => [key, randomUUID()]));
  await db.query(`INSERT INTO business.users(id,account_code,email,password_hash,role) VALUES
    ($1,'CUS-880001','upgrade-a@synthetic.invalid','synthetic-no-login','CUSTOMER'),
    ($2,'CUS-880002','upgrade-b@synthetic.invalid','synthetic-no-login','CUSTOMER')`, [ids.customer, ids.foreign]);
  await db.query("INSERT INTO business.customer_profiles(user_id,full_name) VALUES($1,'Synthetic Upgrade A'),($2,'Synthetic Upgrade B')", [ids.customer, ids.foreign]);
  await db.query("INSERT INTO business.insurance_products(id,product_code,name) VALUES($1,'PH5-UPGRADE','Synthetic upgrade product')", [ids.product]);
  await db.query("INSERT INTO business.insurance_policies(id,policy_number,customer_id,product_id,status) VALUES($1,'PH5-UPGRADE',$2,$3,'ACTIVE')", [ids.policy, ids.customer, ids.product]);
  await db.query("INSERT INTO business.conversations(id,customer_id,created_by_customer_id,channel_type,support_origin,status,next_message_sequence) VALUES($1,$2,$2,'CUSTOMER_SUPPORT','AI','AI_ACTIVE',2)", [ids.chat, ids.customer]);
  await db.query(`INSERT INTO business.ticket_drafts(id,customer_id,conversation_id,policy_id,title,description,state,expires_at) VALUES
    ($1,$3,$4,$5,'Synthetic confirmed draft','Preserve confirmed draft','CONFIRMED',now()+interval '1 hour'),
    ($2,$3,$4,$5,'Synthetic pending draft','Preserve pending draft','DRAFT',now()+interval '1 hour')`, [ids.draft, ids.pending, ids.customer, ids.chat, ids.policy]);
  await db.query(`INSERT INTO business.support_tickets(id,ticket_code,customer_id,conversation_id,policy_id,source_draft_id,title,status,idempotency_key,confirmed_at,confirmed_content)
    VALUES($1,'PH5-UPGRADE',$2,$3,$4,$5,'Synthetic confirmed ticket','OPEN',$6,now(),' {"title":"Synthetic confirmed ticket","description":"Preserve evidence"}'::jsonb)`, [ids.ticket, ids.customer, ids.chat, ids.policy, ids.draft, ids.ticket]);
  await db.query("INSERT INTO business.notifications(recipient_customer_id,ticket_id,kind,title,dedup_key,is_read) VALUES($1,$2,'SUPPORT_TICKET_CREATED','Synthetic upgrade notice','phase5-upgrade',true)", [ids.customer, ids.ticket]);
  await db.query(`INSERT INTO business.messages(conversation_id,sender_type,sender_id,sequence,audience,content,read_at) VALUES
    ($1,'CUSTOMER',$2,1,'CUSTOMER_VISIBLE','Synthetic old customer message',NULL),
    ($1,'AI_AGENT',NULL,2,'CUSTOMER_VISIBLE','Synthetic old AI reply',now())`, [ids.chat, ids.customer]);
  return { ids, before: await snapshot(db) };
}

export async function verifyUpgrade(db, { ids, before }) {
  assert.deepEqual(await snapshot(db), before, 'Upgrade must preserve legacy data and confirmation evidence');
  assert.equal((await db.query('SELECT request_fingerprint FROM business.support_tickets WHERE id=$1', [ids.ticket])).rows[0].request_fingerprint, null);
  await db.query('BEGIN');
  try {
    const rejected = async (sql, values, expected) => {
      await db.query('SAVEPOINT constraint_probe');
      let code;
      try { await db.query(sql, values); } catch (error) { code = error.code; }
      await db.query('ROLLBACK TO SAVEPOINT constraint_probe');
      assert.equal(code, expected);
    };
    await rejected("INSERT INTO business.support_tickets(ticket_code,customer_id,title,status,idempotency_key,confirmed_at,source_draft_id) VALUES('PH5-DUP',$1,'Synthetic duplicate','OPEN','PH5-DUP',now(),$2)", [ids.customer, ids.draft], '23505');
    await rejected("INSERT INTO business.ticket_drafts(customer_id,policy_id,title,description,expires_at) VALUES($1,$2,'Synthetic foreign policy','Rejected',now())", [ids.foreign, ids.policy], '23503');
    await rejected("INSERT INTO business.support_tickets(ticket_code,customer_id,policy_id,title,status,idempotency_key,confirmed_at) VALUES('PH5-FOREIGN',$1,$2,'Synthetic foreign policy','OPEN','PH5-FOREIGN',now())", [ids.foreign, ids.policy], '23503');
    await rejected('UPDATE business.ticket_drafts SET version=0 WHERE id=$1', [ids.pending], '23514');
    await rejected('UPDATE business.notifications SET conversation_id=$1 WHERE ticket_id=$2', [ids.chat, ids.ticket], '23514');
    await rejected('DELETE FROM business.ticket_drafts WHERE id=$1', [ids.draft], '23503');
  } finally { await db.query('ROLLBACK'); }
  console.log('PASS populated upgrade preserves Ticket/drafts/notifications/messages and policy ownership/source-draft constraints');
}
