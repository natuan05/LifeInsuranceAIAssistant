// Host runner; each case upgrades an isolated synthetic schema and removes it.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {spawnSync}=require('node:child_process');
const migration=name=>readFileSync(resolve(__dirname,`../prisma/migrations/${name}/migration.sql`),'utf8');
const first=migration('202611160001_notification_cycles');
const repair=migration('202611160002_repair_notification_baselines');
const reconcile=migration('202611160003_reconcile_published_notification_gaps');
const closedCycle=migration('202611160004_reconcile_closed_notification_cycles');
function sql(input,fail=false){
 const r=spawnSync('docker',['compose','exec','-T','postgres','psql','-X','-qAt','-U','local_owner','-d','life_insurance','-v','ON_ERROR_STOP=1'],
  {cwd:resolve(__dirname,'../../..'),input,encoding:'utf8',timeout:30000,windowsHide:true});
 if(fail)assert.notEqual(r.status,0);else assert.equal(r.status,0,r.stderr);
 return r.stdout.trim();
}
for(const role of ['CUSTOMER','STAFF']) for(const status of ['PENDING','PROCESSING','FAILED_DLQ','PUBLISHED']) for(const oldNotice of [false,true]) test(`A4 upgrade repairs ${status} ${oldNotice?'old-notice':'no-notice'} ${role} cycles without rewinding live state`,()=>{
 const s='notification_upgrade_'+randomUUID().replaceAll('-','');
 assert.match(s,/^notification_upgrade_[a-f0-9]{32}$/);
 const owner=randomUUID(),staff=randomUUID(),pending=randomUUID(),closed=randomUUID(),live=randomUUID(),old=randomUUID();
 const eventId=randomUUID(),oldNoticeId=randomUUID();
 const recipient=role==='CUSTOMER'?owner:staff,kind=role==='CUSTOMER'?'STAFF_MESSAGE_UNREAD':'CUSTOMER_MESSAGE_UNREAD';
 const sender=role==='CUSTOMER'?'STAFF':'CUSTOMER',own=role;
 try{
  sql(`CREATE SCHEMA ${s};
   CREATE TYPE ${s}.sender_kind AS ENUM('STAFF','CUSTOMER');
   CREATE TABLE ${s}.users(id uuid PRIMARY KEY);
   CREATE TABLE ${s}.conversations(id uuid PRIMARY KEY,customer_id uuid,assigned_staff_id uuid,control_version int DEFAULT 0);
   CREATE TABLE ${s}.messages(conversation_id uuid,sequence bigint,audience text,read_at timestamptz,sender_type ${s}.sender_kind,id uuid DEFAULT gen_random_uuid(),created_at timestamptz DEFAULT now());
   CREATE TABLE ${s}.notifications(id uuid PRIMARY KEY,recipient_customer_id uuid,recipient_staff_id uuid,conversation_id uuid,kind text,created_at timestamptz,is_read boolean);
   CREATE TABLE ${s}.outbox_events(id uuid PRIMARY KEY,aggregate_type text,aggregate_id uuid,event_type text,payload jsonb,status text,created_at timestamptz DEFAULT now(),retry_count int DEFAULT 8,next_attempt_at timestamptz DEFAULT now(),lease_owner text,lease_expires_at timestamptz,last_error text);
   CREATE TABLE ${s}._prisma_migrations(migration_name text,finished_at timestamptz,rolled_back_at timestamptz);
   INSERT INTO ${s}.users VALUES('${owner}'),('${staff}');
   INSERT INTO ${s}.conversations(id,customer_id,assigned_staff_id) VALUES('${pending}','${owner}','${staff}'),('${closed}','${owner}','${staff}'),('${live}','${owner}','${staff}');
   INSERT INTO ${s}.messages(conversation_id,sequence,audience,read_at,sender_type) VALUES
    ('${pending}',1,'CUSTOMER_VISIBLE',NULL,'${sender}'),('${pending}',2,'CUSTOMER_VISIBLE',now(),'${own}'),
    ('${closed}',1,'CUSTOMER_VISIBLE',now(),'${sender}'),('${live}',1,'CUSTOMER_VISIBLE',NULL,'${sender}');
   INSERT INTO ${s}.notifications VALUES('${old}',${role==='CUSTOMER'?`'${owner}',NULL`:`NULL,'${staff}'`},'${closed}','${kind}',now(),true);`);
  if(oldNotice) sql(`UPDATE ${s}.messages SET sequence=sequence+1 WHERE conversation_id='${pending}';
   INSERT INTO ${s}.messages(conversation_id,sequence,audience,read_at,sender_type,created_at)
    VALUES('${pending}',1,'CUSTOMER_VISIBLE',now()-interval '1 day','${sender}',now()-interval '2 days');
   INSERT INTO ${s}.notifications VALUES('${oldNoticeId}',${role==='CUSTOMER'?`'${owner}',NULL`:`NULL,'${staff}'`},'${pending}','${kind}',now()-interval '2 days',true);`);
  sql(first.replaceAll('business',s));
  sql(`INSERT INTO ${s}._prisma_migrations VALUES('202611160001_notification_cycles',now(),NULL);
   UPDATE ${s}.conversation_notification_states SET updated_at=now()-interval '1 day';
   UPDATE ${s}.conversation_notification_states SET updated_at=now()+interval '1 day',read_through_sequence=1,last_processed_sequence=10 WHERE conversation_id='${live}';
   INSERT INTO ${s}.outbox_events(id,aggregate_type,aggregate_id,event_type,payload,status) VALUES('${eventId}','CONVERSATION','${pending}','MESSAGE_COMMITTED','{"schemaVersion":1}','${status}');`);
  sql(`UPDATE ${s}.outbox_events SET created_at=now()-interval '1 day';`);
  const before=sql(`SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id)) FROM ${s}.conversation_notification_states t;`);
  sql(repair.replaceAll('business',s).replace('COMMIT;','SELECT 1/0; COMMIT;'),true);
  assert.equal(sql(`SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id)) FROM ${s}.conversation_notification_states t;`),before);
  assert.equal(sql(`SELECT status FROM ${s}.outbox_events;`),status);
  sql(repair.replaceAll('business',s));
  assert.equal(sql(`SELECT last_processed_sequence||':'||read_through_sequence FROM ${s}.conversation_notification_states WHERE recipient_user_id='${recipient}' AND conversation_id='${pending}';`),oldNotice?(status==='PUBLISHED'?'3:3':'1:1'):(status==='PUBLISHED'?'2:0':'0:0'));
  assert.equal(sql(`SELECT active_notification_id IS NULL FROM ${s}.conversation_notification_states WHERE recipient_user_id='${recipient}' AND conversation_id='${closed}';`),'t');
  assert.equal(sql(`SELECT last_processed_sequence||':'||read_through_sequence FROM ${s}.conversation_notification_states WHERE recipient_user_id='${recipient}' AND conversation_id='${live}';`),'10:1');
  assert.equal(sql(`SELECT count(*) FROM ${s}.messages;`),oldNotice?'5':'4');
  assert.equal(sql(`SELECT count(*) FROM ${s}.notifications;`),oldNotice?'2':'1');
  assert.equal(sql(`SELECT status||':'||retry_count FROM ${s}.outbox_events;`),status==='FAILED_DLQ'?'PENDING:0':status+':8');
  sql(`INSERT INTO ${s}._prisma_migrations VALUES('202611160002_repair_notification_baselines',now(),NULL);`);
  if(status==='PUBLISHED') {
   for(const reason of ['expired','delivered','progressed']) {
    const conv=randomUUID();
    sql(`INSERT INTO ${s}.conversations(id,customer_id,assigned_staff_id) VALUES('${conv}','${owner}','${staff}');
     INSERT INTO ${s}.messages(conversation_id,sequence,audience,sender_type,created_at) VALUES('${conv}',2,'CUSTOMER_VISIBLE','${sender}',now()-interval '${reason==='expired'?40:1} days');
     INSERT INTO ${s}.conversation_notification_states(recipient_user_id,conversation_id,kind,last_processed_sequence,updated_at)
      VALUES('${recipient}','${conv}','${kind}',2,now()+interval '${reason==='progressed'?1:-1} days');
     INSERT INTO ${s}.outbox_events(id,aggregate_type,aggregate_id,event_type,payload,status,created_at)
      VALUES('${randomUUID()}','CONVERSATION','${conv}','MESSAGE_COMMITTED','{"schemaVersion":1}','PUBLISHED',now()-interval '1 day');`);
    if(reason==='delivered') sql(`INSERT INTO ${s}.notifications VALUES('${randomUUID()}',${role==='CUSTOMER'?`'${owner}',NULL`:`NULL,'${staff}'`},'${conv}','${kind}',now(),true);`);
   }
  }
  const stateBefore=sql(`SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id)) FROM ${s}.conversation_notification_states t;`);
  sql(reconcile.replaceAll('business',s).replace('COMMIT;','SELECT 1/0; COMMIT;'),true);
  assert.equal(sql(`SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id)) FROM ${s}.conversation_notification_states t;`),stateBefore);
  assert.equal(sql(`SELECT count(*) FROM ${s}.outbox_events;`),status==='PUBLISHED'?'4':'1');
  sql(reconcile.replaceAll('business',s));
  if(status==='PUBLISHED') {
   assert.equal(sql(`SELECT last_processed_sequence||':'||read_through_sequence FROM ${s}.conversation_notification_states WHERE recipient_user_id='${recipient}' AND conversation_id='${pending}';`),oldNotice?'3:3':'0:0');
   assert.equal(sql(`SELECT count(*) FROM ${s}.outbox_events WHERE id<>'${eventId}' AND status='PENDING' AND payload->>'reason'='MESSAGE_APPENDED' AND payload->>'sequence'='1';`),oldNotice?'0':'1');
   assert.equal(sql(`SELECT count(*) FROM ${s}.outbox_events WHERE payload->>'schemaVersion'='2';`),oldNotice?'0':'1');
  }
  assert.equal(sql(`SELECT status FROM ${s}.outbox_events WHERE id='${eventId}';`),status==='FAILED_DLQ'?'PENDING':status);
  const count=sql(`SELECT count(*) FROM ${s}.outbox_events;`);
  sql(reconcile.replaceAll('business',s));
  assert.equal(sql(`SELECT count(*) FROM ${s}.outbox_events;`),count);
  sql(`INSERT INTO ${s}._prisma_migrations VALUES('202611160003_reconcile_published_notification_gaps',now(),NULL);`);
  const snapshot=sql(`SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id)) FROM ${s}.conversation_notification_states t;`);
  sql(closedCycle.replaceAll('business',s).replace('COMMIT;','SELECT 1/0; COMMIT;'),true);
  assert.equal(sql(`SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id)) FROM ${s}.conversation_notification_states t;`),snapshot);
  assert.equal(sql(`SELECT count(*) FROM ${s}.outbox_events;`),count);
  sql(closedCycle.replaceAll('business',s));
  if(oldNotice) {
   assert.equal(sql(`SELECT last_processed_sequence||':'||read_through_sequence||':'||(active_notification_id IS NULL)::text FROM ${s}.conversation_notification_states WHERE recipient_user_id='${recipient}' AND conversation_id='${pending}';`),'1:1:true');
   assert.equal(sql(`SELECT count(*) FROM ${s}.outbox_events WHERE aggregate_id='${pending}' AND payload->>'schemaVersion'='2' AND payload->>'sequence'='2';`),'1');
   assert.equal(sql(`SELECT is_read AND created_at<now()-interval '1 day' FROM ${s}.notifications WHERE id='${oldNoticeId}';`),'t');
  }
  const after=sql(`SELECT count(*) FROM ${s}.outbox_events;`);
  sql(closedCycle.replaceAll('business',s));
  assert.equal(sql(`SELECT count(*) FROM ${s}.outbox_events;`),after);


 }finally{sql(`DROP SCHEMA IF EXISTS ${s} CASCADE;`);}
});
