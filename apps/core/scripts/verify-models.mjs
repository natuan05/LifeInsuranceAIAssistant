import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const clientFor = role => new pg.Client({ host: 'postgres', port: 5432, database: 'life_insurance',
  user: role === 'core' ? 'core_runtime' : 'db_viewer',
  password: readFileSync(`/credentials/${role}/password`, 'utf8').trim() });
const client = clientFor('core');
async function rejected(sql, parameters, expectedCode) {
  await client.query('SAVEPOINT rejected_operation');
  let errorCode;
  try { await client.query(sql, parameters); } catch (error) { errorCode = error.code; }
  await client.query('ROLLBACK TO SAVEPOINT rejected_operation');
  assert.equal(errorCode, expectedCode, 'Expected a database constraint/privilege rejection');
}

try {
  await client.connect();
  const flags = (await client.query('SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user')).rows[0];
  assert.deepEqual(flags, { rolsuper: false, rolcreatedb: false, rolcreaterole: false });
  await client.query('BEGIN');
  await rejected('CREATE TABLE business.__forbidden_probe (id int)', [], '42501');
  await rejected('SELECT * FROM rag.rag_knowledge_chunks LIMIT 0', [], '42501');
  await rejected("UPDATE business._prisma_migrations SET logs = 'forbidden' WHERE false", [], '42501');
  console.log('PASS Core runtime: no superuser, business DDL, RAG or migration-history writes');

  const suffix = randomUUID();
  const create = async (code, role) => (await client.query(
    'INSERT INTO business.users(account_code,email,password_hash,role) VALUES ($1,$2,$3,$4) RETURNING id',
    [code, `${code.toLowerCase()}-${suffix}@synthetic.invalid`, 'SYNTHETIC_TEST_NOT_A_LOGIN_CREDENTIAL', role])).rows[0].id;
  // All fixtures are synthetic and rolled back, including password placeholders.
  const a = await create('STF-990001', 'STAFF');
  const b = await create('STF-990002', 'STAFF');
  const c = await create('CUS-990001', 'CUSTOMER');
  await client.query("INSERT INTO business.staff_profiles(user_id,full_name) VALUES ($1,'Synthetic Staff A'),($2,'Synthetic Staff B')", [a,b]);
  await client.query("INSERT INTO business.customer_profiles(user_id,full_name) VALUES ($1,'Synthetic Customer')", [c]);
  await rejected('INSERT INTO business.staff_profiles(user_id,full_name) VALUES ($1,$2)', [c,'Wrong role'], '23503');
  await client.query("INSERT INTO business.staff_assignments(staff_id,customer_id,operator_id) VALUES ($1,$2,'synthetic-test')", [a,c]);
  await rejected("INSERT INTO business.staff_assignments(staff_id,customer_id,operator_id) VALUES ($1,$2,'synthetic-test')", [b,c], '23505');
  await client.query('UPDATE business.staff_assignments SET is_active=false,ended_at=now() WHERE customer_id=$1', [c]);
  await client.query("INSERT INTO business.staff_assignments(staff_id,customer_id,operator_id) VALUES ($1,$2,'synthetic-test')", [b,c]);
  assert.equal(Number((await client.query('SELECT count(*) FROM business.staff_assignments WHERE customer_id=$1', [c])).rows[0].count), 2);
  console.log('PASS role/profile FK, unique active assignment and reassignment history');

  await rejected('INSERT INTO business.users(account_code,email,password_hash,role) SELECT account_code,email,password_hash,role FROM business.users WHERE id=$1', [c], '23505');
  await rejected('INSERT INTO business.auth_sessions(user_id,token_hash,csrf_token_hash,expires_at) VALUES ($1,$2,$3,now()-interval \'1 hour\')', [c,'1'.repeat(64),'2'.repeat(64)], '23514');
  await rejected('INSERT INTO business.support_tickets(ticket_code,customer_id,title,status,idempotency_key) VALUES ($1,$2,$3,$4,$5)', [suffix,c,'Synthetic','OPEN',suffix], '23502');
  console.log('PASS unique account/email, session lifetime and Ticket confirmation without automatic timestamp');

  const doc = (await client.query("INSERT INTO business.documents(title,access_scope) VALUES ('Synthetic public document','PUBLIC') RETURNING id")).rows[0].id;
  await rejected('UPDATE business.documents SET current_version=$1 WHERE id=$2', ['missing-version',doc], '23503');
  await rejected("INSERT INTO business.documents(title,access_scope) VALUES ('Synthetic private document','PRIVATE_POLICY')", [], '23514');
  console.log('PASS exact document-version FK and private ownership requirement');
} finally {
  await client.query('ROLLBACK').catch(() => {});
  await client.end();
}

const viewer = clientFor('viewer');
try {
  await viewer.connect();
  const tables = (await viewer.query("SELECT table_schema,table_name FROM information_schema.tables WHERE table_schema IN ('business','rag') AND table_type='BASE TABLE' ORDER BY 1,2")).rows;
  assert.equal(tables.length, 17);
  await viewer.query('SELECT id FROM business.users LIMIT 0');
  let denied;
  try { await viewer.query('DELETE FROM business.users WHERE false'); } catch (error) { denied = error.code; }
  assert.equal(denied, '42501');
  console.log('PASS database UI role: 17 tables visible, writes denied');
} finally { await viewer.end(); }
