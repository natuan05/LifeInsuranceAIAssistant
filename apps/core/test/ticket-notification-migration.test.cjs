const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {spawnSync}=require('node:child_process');
const script=readFileSync(resolve(__dirname,'../prisma/migrations/202611050001_ticket_notifications/migration.sql'),'utf8');
function sql(input,fail=false){const r=spawnSync('docker',['compose','exec','-T','postgres','psql','-X','-qAt','-U','local_owner','-d','life_insurance','-v','ON_ERROR_STOP=1'],{cwd:resolve(__dirname,'../../..'),input,encoding:'utf8',timeout:30000,windowsHide:true});if(fail)assert.notEqual(r.status,0);else assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
function fixture(work){const name='ticket_notification_test_'+randomUUID().replaceAll('-','');assert.match(name,/^ticket_notification_test_[a-f0-9]{32}$/);try{sql(`CREATE SCHEMA ${name};CREATE TABLE ${name}.notifications(id int primary key,kind text,ticket_id uuid,conversation_id uuid,title text,CONSTRAINT notifications_kind_allowlist CHECK(kind IS NULL OR kind='HANDOFF_REQUESTED'));INSERT INTO ${name}.notifications VALUES(1,NULL,NULL,NULL,'Synthetic legacy');INSERT INTO ${name}.notifications VALUES(2,'HANDOFF_REQUESTED',NULL,'00000000-0000-4000-8000-000000000001','Synthetic handoff');`);work(name,script.replaceAll('business',name));}finally{sql(`DROP SCHEMA ${name} CASCADE;`);}}
test('TK05 migration preserves legacy/handoff data and validates Ticket kind and exclusive target',()=>fixture((s,m)=>{
 const before=sql(`SELECT md5(string_agg(to_jsonb(n)::text,'' ORDER BY id)) FROM ${s}.notifications n;`);sql(m);assert.equal(sql(`SELECT md5(string_agg(to_jsonb(n)::text,'' ORDER BY id)) FROM ${s}.notifications n;`),before);
 for(const kind of ['TICKET_CREATED','TICKET_ACCEPTED'])sql(`INSERT INTO ${s}.notifications VALUES(${kind==='TICKET_CREATED'?3:4},'${kind}','00000000-0000-4000-8000-000000000002',NULL,'Synthetic Ticket');`);
 sql(`INSERT INTO ${s}.notifications VALUES(5,'TICKET_ACCEPTED',NULL,NULL,'Bad target');`,true);sql(`INSERT INTO ${s}.notifications VALUES(5,'OTHER',NULL,NULL,'Unknown kind');`,true);sql(`UPDATE ${s}.notifications SET conversation_id='00000000-0000-4000-8000-000000000001' WHERE id=3;`,true);
}));
test('TK05 failed migration rolls back allowlist change and retains existing rows',()=>fixture((s,m)=>{
 sql(m.replace('COMMIT;','SELECT 1/0; COMMIT;'),true);assert.equal(sql(`SELECT count(*) FROM ${s}.notifications;`),'2');sql(`INSERT INTO ${s}.notifications VALUES(3,'TICKET_CREATED','00000000-0000-4000-8000-000000000002',NULL,'Synthetic');`,true);
}));
test('Ticket workflow notification migration preserves rows, rolls back failure and allows status-change target',()=>fixture((s,previous)=>{
 sql(previous);const before=sql(`SELECT md5(string_agg(to_jsonb(n)::text,'' ORDER BY id)) FROM ${s}.notifications n;`);
 const next=readFileSync(resolve(__dirname,'../prisma/migrations/202611050002_ticket_status_notifications/migration.sql'),'utf8').replaceAll('business',s);
 sql(next.replace('COMMIT;','SELECT 1/0; COMMIT;'),true);assert.equal(sql(`SELECT md5(string_agg(to_jsonb(n)::text,'' ORDER BY id)) FROM ${s}.notifications n;`),before);
 sql(`INSERT INTO ${s}.notifications VALUES(3,'TICKET_STATUS_CHANGED','00000000-0000-4000-8000-000000000002',NULL,'Synthetic status');`,true);
 sql(next);sql(`INSERT INTO ${s}.notifications VALUES(3,'TICKET_STATUS_CHANGED','00000000-0000-4000-8000-000000000002',NULL,'Synthetic status');`);
 sql(`UPDATE ${s}.notifications SET conversation_id='00000000-0000-4000-8000-000000000001' WHERE id=3;`,true);
}));
