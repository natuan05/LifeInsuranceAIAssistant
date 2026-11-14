require('reflect-metadata');
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID,randomBytes}=require('node:crypto');
const {readFileSync}=require('node:fs');
const {Module}=require('@nestjs/common');
const {NestFactory}=require('@nestjs/core');
const {PrismaPg}=require('@prisma/adapter-pg');
const {PrismaClient,Prisma}=require('../dist/generated/prisma/client');
const {DatabaseService}=require('../dist/database/database.service');
const {AuthService,tokenHash}=require('../dist/auth/services/auth.service');
const {TicketService}=require('../dist/tickets/services/ticket.service');
const {TicketAccessService}=require('../dist/tickets/services/ticket-access.service');
const {TicketCursorService}=require('../dist/tickets/services/ticket-cursor.service');
const {StaffTicketController}=require('../dist/tickets/controllers/staff-ticket.controller');
const {ConversationCommandService}=require('../dist/conversations/services/conversation-command.service');
const {ConversationAccessService}=require('../dist/conversations/services/conversation-access.service');
const {TicketEventService}=require('../dist/tickets/services/ticket-event.service');
const {RealtimeService}=require('../dist/realtime/realtime.service');
const {NotificationsController}=require('../dist/notifications/notifications.controller');
const {conversationTestProviders}=require('./support/conversation-test.module.cjs');
const {OutboxDispatcherService}=require('../dist/outbox/services/outbox-dispatcher.service');
const {WebSocket}=require('ws');
const {configureHttp}=require('../dist/http/http-foundation');
process.env.NODE_ENV='test';
const origin=(process.env.TEST_CORS_ORIGINS||'http://localhost:8080').split(',')[0].trim();
process.env.CORS_ORIGINS=origin;
const runId=randomUUID(),users=[],tickets=[],chats=[],policies=[],products=[];
const client=(role)=>new PrismaClient({adapter:new PrismaPg({host:process.env.PGHOST,database:process.env.I01_TEST_DATABASE,user:role+'_runtime',password:readFileSync('/credentials/'+role+'/password','utf8').trim(),max:5})});
const admin=client('admin'),core=client('core');
class TestModule{}
Module({controllers:[StaffTicketController,NotificationsController],providers:[...conversationTestProviders(core),TicketEventService,RealtimeService,AuthService,TicketService,TicketAccessService,TicketCursorService,ConversationAccessService,ConversationCommandService,{provide:DatabaseService,useValue:{prisma:core}}]})(TestModule);
let app,base,staff,other,customer,assignment;
async function actor(role){
 const id=randomUUID();users.push(id);
 await admin.user.create({data:{id,role,accountCode:`${role==='STAFF'?'STF':'CUS'}-${BigInt('0x'+id.replaceAll('-','')).toString().slice(0,22)}`,email:id+'@synthetic.invalid',passwordHash:'synthetic-not-for-login',...(role==='STAFF'?{staffProfile:{create:{fullName:'Synthetic Ticket Staff'}}}:{customerProfile:{create:{fullName:'Synthetic %_\\ Ticket Customer'}}})}});
 const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');
 const session=await admin.authSession.create({data:{userId:id,tokenHash:tokenHash(token),csrfTokenHash:tokenHash(csrf),expiresAt:new Date(Date.now()+3600000)}});
 return {id,csrf,cookie:'li_session='+token+'; li_csrf='+csrf,sessionId:session.id};
}
async function fixture(status='ASSIGNED',recipient=staff.id){
 const id=randomUUID();tickets.push(id);
 return admin.supportTicket.create({data:{id,ticketCode:`TK-${id}`,customerId:customer.id,assignedStaffId:recipient,status,title:'TITLE_ONLY_SENTINEL',aiSummary:'AI_ONLY_SENTINEL',extractedDetails:{confirmedContent:'PRIVATE_SENTINEL'},idempotencyKey:id,confirmedAt:new Date('2026-01-01T00:00:00Z'),createdAt:new Date('2026-01-01T00:00:00Z')}});
}
async function get(path='',who=staff,status=200,gateway=false){
 const response=await fetch((gateway?'http://gateway':base)+'/api/v1/staff/tickets'+path,{headers:who?{Cookie:who.cookie}:{},signal:AbortSignal.timeout(15000)});
 assert.equal(response.status,status,`Unexpected status on synthetic Ticket read: ${response.status}/${status}`);
 assert.equal(response.headers.get('cache-control'),'no-store');
 const body=await response.json();
 assert.doesNotMatch(JSON.stringify(body),/passwordHash|tokenHash|extractedDetails|PRIVATE_SENTINEL/);
 if(status>=400)assert.deepEqual(Object.keys(body).sort(),['code','message','requestId','statusCode','timestamp']);
 return {body,response};
}
before(async()=>{
 staff=await actor('STAFF');other=await actor('STAFF');customer=await actor('CUSTOMER');
 assignment=await admin.staffAssignment.create({data:{staffId:staff.id,customerId:customer.id,operatorId:runId}});
 for(const status of ['OPEN','ASSIGNED','IN_PROGRESS','RESOLVED','CLOSED','ASSIGNED','ASSIGNED'])await fixture(status);
 await fixture('ASSIGNED',other.id);await fixture('OPEN',null);
 app=await NestFactory.create(TestModule,{logger:false});configureHttp(app,{origins:[origin],docsEnabled:true});
 await app.listen(0,'127.0.0.1');base=await app.getUrl();
});
after(async()=>{try{
 await app?.close();
 await admin.$transaction(async tx=>{
 await tx.$queryRaw`SELECT id FROM business.users WHERE id::text IN (${Prisma.join([...users].sort())}) ORDER BY id FOR UPDATE`;
 await tx.auditLog.deleteMany({where:{targetId:{in:tickets}}});
 await tx.outboxEvent.deleteMany({where:{aggregateId:{in:tickets},aggregateType:'TICKET'}});
 await tx.notification.deleteMany({where:{ticketId:{in:tickets}}});
 await tx.supportTicket.deleteMany({where:{id:{in:tickets}}});
 await tx.conversationHandoff.deleteMany({where:{conversationId:{in:chats}}});
 await tx.conversation.deleteMany({where:{id:{in:chats}}});
 await tx.insurancePolicy.deleteMany({where:{id:{in:policies}}});await tx.insuranceProduct.deleteMany({where:{id:{in:products}}});
 await tx.authSession.deleteMany({where:{userId:{in:users}}});
 await tx.rateLimitBucket.deleteMany({where:{clientToken:{in:users.map(id=>tokenHash(id.toLowerCase()))},endpointGroup:{in:['TICKET_READ','TICKET_ACCEPT']}}});
 await tx.staffAssignment.deleteMany({where:{customerId:{in:users}}});
 await tx.customerProfile.deleteMany({where:{userId:{in:users}}});await tx.staffProfile.deleteMany({where:{userId:{in:users}}});await tx.user.deleteMany({where:{id:{in:users}}});});
 assert.equal(await admin.user.count({where:{id:{in:users}}}),0);assert.equal(await admin.supportTicket.count({where:{id:{in:tickets}}}),0);
 }finally{await Promise.all([admin.$disconnect(),core.$disconnect()]);}});
test('real sessions and role gates return safe HTTP envelopes',async()=>{
 await get('',null,401);await get('',customer,403);
 await admin.authSession.update({where:{id:other.sessionId},data:{revokedAt:new Date()}});await get('',other,401);
 await admin.authSession.update({where:{id:other.sessionId},data:{revokedAt:null}});
 await admin.authSession.update({where:{id:other.sessionId},data:{createdAt:new Date(Date.now()-60000),expiresAt:new Date(Date.now()-1000)}});await get('',other,401);
 await admin.authSession.update({where:{id:other.sessionId},data:{expiresAt:new Date(Date.now()+3600000)}});
 assert.deepEqual((await get('',other)).body.items,[]);
 await get('/'+tickets[0],other,404);await get('/'+randomUUID(),staff,404);
});
test('permission-first keyset pagination is stable on tied timestamps with no counts',async()=>{
 let cursor=null,seen=[];
 do{const {body}=await get('?limit=2'+(cursor?'&cursor='+cursor:''));
 assert.deepEqual(Object.keys(body).sort(),['items','pageInfo']);
 for(const row of body.items){assert.deepEqual(Object.keys(row).sort(),['createdAt','customer','id','status','ticketCode','title']);assert.equal(row.customer.id,customer.id);seen.push(row.id);}
 cursor=body.pageInfo.nextCursor;assert.equal(body.pageInfo.hasMore,Boolean(cursor));
 }while(cursor);
 assert.deepEqual(seen,tickets.slice(0,7).sort().reverse());assert.equal(new Set(seen).size,7);
});
test('literal case-insensitive name/code search spans all pages; title and AI summary excluded',async()=>{
 for(const term of ['%','_','\\','  synthetic  '])assert.equal((await get('?search='+encodeURIComponent(term))).body.items.length,7);
 for(const term of ['TITLE_ONLY_SENTINEL','AI_ONLY_SENTINEL'])assert.equal((await get('?search='+term)).body.items.length,0);
 const row=await admin.user.findUnique({where:{id:customer.id}});
 assert.equal((await get('?search='+row.accountCode.toLowerCase())).body.items.length,7);
 assert.equal((await get('?search='+('TK-'+tickets[0]).toLowerCase())).body.items[0].id,tickets[0]);
});
test('all five exact Ticket statuses filter independently; customer filter cannot expand scope',async()=>{
 for(const status of ['OPEN','ASSIGNED','IN_PROGRESS','RESOLVED','CLOSED']){
 const {body}=await get('?status='+status+'&customerId='+customer.id);assert(body.items.length);assert(body.items.every(x=>x.status===status));}
 await get('?customerId='+other.id,staff,404);
});
test('invalid/unknown/repeated fields rejected before service queries',async()=>{
 for(const q of ['limit=0','limit=51','limit=1.5','limit=','limit=2&limit=3','status=closed','customerId=bad','search='+('a'.repeat(101)),'search=x%0Ay','search=a&search=b','cursor=bad','foo=bar'])await get('?'+q,staff,400);
 await get('/bad',staff,400);await get('/'+tickets[0]+'?foo=bar',staff,400);
});
test('cursor tampering, actor and query reuse fail closed',async()=>{
 const cursor=(await get('?limit=2')).body.pageInfo.nextCursor;
 for(const q of ['limit=3','limit=2&status=ASSIGNED','limit=2&search=synthetic','limit=2&customerId='+customer.id])await get('?'+q+'&cursor='+cursor,staff,400);
 await get('?limit=2&cursor='+cursor,other,400);
 await get('?limit=2&cursor='+cursor.slice(0,-1)+(cursor.endsWith('A')?'B':'A'),staff,400);
});
test('cursor expiry and Core restart require a fresh first page',()=>{
 const service=new TicketCursorService(),scope=service.scope(staff.id,{limit:2});
 const cursor=service.encode(scope,new Date(),randomUUID());assert(service.decode(cursor,scope));
 assert.throws(()=>new TicketCursorService().decode(cursor,scope),e=>e.getStatus()===400);
 const now=Date.now;try{Date.now=()=>now()+901000;assert.throws(()=>service.decode(cursor,scope),e=>e.getStatus()===400);}finally{Date.now=now;}
});
test('detail projects legacy metadata without pretending AI summary is confirmed content',async()=>{
 for(let i=0;i<5;i++){const {ticket}= (await get('/'+tickets[i])).body;
 assert.equal(ticket.confirmationSource,'LEGACY_UNVERIFIED');assert.equal(ticket.confirmedContent,null);assert.equal(ticket.aiSummary,'AI_ONLY_SENTINEL');
 assert.equal(ticket.version,0);assert.equal(ticket.policy,null);assert.equal(ticket.chatLink,null);assert.equal(ticket.allowedActions.accept,i===0||i===1);assert(!('conversationId'in ticket));}
});
test('Ticket link never grants private AI or cross-customer transcript access; direct chat may link',async()=>{
 const privateChat=await admin.conversation.create({data:{customerId:customer.id,channelType:'CUSTOMER_SUPPORT',supportOrigin:'AI',status:'AI_ACTIVE',createdByCustomerId:customer.id}});chats.push(privateChat.id);
 await admin.supportTicket.update({where:{id:tickets[0]},data:{conversationId:privateChat.id}});assert.equal((await get('/'+tickets[0])).body.ticket.chatLink,null);
 const direct=await admin.conversation.create({data:{customerId:customer.id,channelType:'CUSTOMER_SUPPORT',supportOrigin:'DIRECT',status:'STAFF_ACTIVE',assignedStaffId:staff.id,directAssignmentId:assignment.id,createdByCustomerId:customer.id}});chats.push(direct.id);
 await admin.supportTicket.update({where:{id:tickets[0]},data:{conversationId:direct.id}});
 assert.deepEqual((await get('/'+tickets[0])).body.ticket.chatLink,{conversationId:direct.id,capability:'TRANSCRIPT',href:'/staff/inbox/'+direct.id+'?filter=active'});
 const outsider=await actor('CUSTOMER');
 const outsideAssignment=await admin.staffAssignment.create({data:{staffId:staff.id,customerId:outsider.id,operatorId:runId}});
 const wrong=await admin.conversation.create({data:{customerId:outsider.id,channelType:'CUSTOMER_SUPPORT',supportOrigin:'DIRECT',status:'STAFF_ACTIVE',assignedStaffId:staff.id,directAssignmentId:outsideAssignment.id,createdByCustomerId:outsider.id}});chats.push(wrong.id);
 await core.$transaction(tx=>new ConversationAccessService().requireTranscript(tx,staff.id,wrong.id));
 await admin.supportTicket.update({where:{id:tickets[0]},data:{conversationId:wrong.id}});assert.equal((await get('/'+tickets[0])).body.ticket.chatLink,null);
});
test('locked Customer remains serviceable; locked Staff loses session access',async()=>{
 try{await admin.user.update({where:{id:customer.id},data:{status:'LOCKED'}});await get('/'+tickets[0]);
 await admin.user.update({where:{id:staff.id},data:{status:'LOCKED'}});await get('',staff,401);
 }finally{await admin.user.update({where:{id:customer.id},data:{status:'ACTIVE'}});await admin.user.update({where:{id:staff.id},data:{status:'ACTIVE'}});}
});
test('pending handoff link permits metadata only and accepted handoff links the transcript',async()=>{
 const chat=await admin.conversation.create({data:{customerId:customer.id,channelType:'CUSTOMER_SUPPORT',supportOrigin:'AI',status:'PENDING_HANDOFF',createdByCustomerId:customer.id}});chats.push(chat.id);
 const handoff=await admin.conversationHandoff.create({data:{conversationId:chat.id,customerId:customer.id,assignmentId:assignment.id,recipientStaffId:staff.id,sharedSubject:'Synthetic shared subject',consentScope:'ENTIRE_CUSTOMER_VISIBLE_CONVERSATION',consentTextVersion:'handoff-v1',confirmedByCustomerId:customer.id}});
 await admin.supportTicket.update({where:{id:tickets[0]},data:{conversationId:chat.id}});
 assert.equal((await get('/'+tickets[0])).body.ticket.chatLink.capability,'REQUEST_METADATA');
 await assert.rejects(core.$transaction(tx=>new ConversationAccessService().requireTranscript(tx,staff.id,chat.id)),e=>e.getStatus()===404);
 await admin.$transaction(async tx=>{await tx.conversationHandoff.update({where:{id:handoff.id},data:{state:'ACCEPTED',acceptedByStaffId:staff.id,acceptedAt:new Date()}});await tx.conversation.update({where:{id:chat.id},data:{status:'STAFF_ACTIVE',assignedStaffId:staff.id}});});
 assert.equal((await get('/'+tickets[0])).body.ticket.chatLink.capability,'TRANSCRIPT');
});
test('historical policy projects only identifier/number; DB rejects cross-customer linkage',async()=>{
 const product=await admin.insuranceProduct.create({data:{productCode:'TK-'+runId,name:'Synthetic inactive product',isActive:false}});products.push(product.id);
 const policy=await admin.insurancePolicy.create({data:{policyNumber:'TK-'+runId,customerId:customer.id,productId:product.id,status:'ACTIVE',benefitsSnapshot:{private:'PRIVATE_SENTINEL'}}});policies.push(policy.id);
 await admin.supportTicket.update({where:{id:tickets[0]},data:{policyId:policy.id}});
 assert.deepEqual((await get('/'+tickets[0])).body.ticket.policy,{id:policy.id,policyNumber:policy.policyNumber});
 const outsider=await actor('CUSTOMER');
 const foreign=await admin.insurancePolicy.create({data:{policyNumber:'FOREIGN-'+runId,customerId:outsider.id,productId:product.id,status:'ACTIVE'}});policies.push(foreign.id);
 await assert.rejects(admin.supportTicket.update({where:{id:tickets[0]},data:{policyId:foreign.id}}),e=>e.code==='P2003');
 assert.equal((await get('/'+tickets[0])).body.ticket.policy.id,policy.id);
});
test('assignment revocation after first page denies detail and excludes later pages',async()=>{
 const cursor=(await get('?limit=2')).body.pageInfo.nextCursor;
 try{await admin.staffAssignment.update({where:{id:assignment.id},data:{isActive:false,endedAt:new Date()}});
 await get('/'+tickets[0],staff,404);await get('?customerId='+customer.id,staff,404);
 assert.deepEqual((await get('?limit=2&cursor='+cursor)).body.items,[]);
 }finally{await admin.staffAssignment.update({where:{id:assignment.id},data:{isActive:true,endedAt:null}});}
});
test('concurrent reads succeed and list/detail share a committed quota with Retry-After',async()=>{
 await Promise.all(Array.from({length:6},()=>get('/'+tickets[0])));
 await admin.rateLimitBucket.update({where:{clientToken_endpointGroup:{clientToken:tokenHash(staff.id.toLowerCase()),endpointGroup:'TICKET_READ'}},data:{requestCount:120,windowStart:new Date()}});
 const {response}=await get('',staff,429);assert(Number(response.headers.get('retry-after'))>=1);await get('/'+tickets[0],staff,429);
 await admin.rateLimitBucket.update({where:{clientToken_endpointGroup:{clientToken:tokenHash(staff.id.toLowerCase()),endpointGroup:'TICKET_READ'}},data:{windowStart:new Date(Date.now()-61000)}});await get('');
});
test('gateway exposes read APIs and Swagger describes safe response schemas',async()=>{
 await get('',staff,200,true);await get('/'+tickets[0],staff,200,true);
 const response=await fetch(base+'/api/v1/docs-json');assert.equal(response.status,200);const doc=await response.json();
 assert(doc.paths['/api/v1/staff/tickets'].get);assert(doc.paths['/api/v1/staff/tickets/{ticketId}/accept'].post);assert(doc.components.schemas.TicketDetailResponseDto);

});

// TK03 command regressions share the synthetic session/assignment fixture and teardown.
async function accept(id,version=0,who=staff,expected=200,headers={},gateway=false) {
 const response=await fetch((gateway?'http://gateway':base)+'/api/v1/staff/tickets/'+id+'/accept',{method:'POST',headers:{Cookie:who.cookie,Origin:origin,'Content-Type':'application/json','X-Auth-Request':'1','X-CSRF-Token':who.csrf,...headers},body:JSON.stringify({expectedVersion:version})});
 assert.equal(response.status,expected);const body=await response.json();
 assert.equal(response.headers.get('cache-control'),'no-store');return {body,response};
}
test('TK03 concurrent acceptance and replay commit one transition/audit/event without chat grants',async()=>{
 const ticket=await fixture();
 const chat=await admin.conversation.create({data:{customerId:customer.id,channelType:'CUSTOMER_SUPPORT',supportOrigin:'AI',status:'AI_ACTIVE',createdByCustomerId:customer.id}});chats.push(chat.id);
 await admin.supportTicket.update({where:{id:ticket.id},data:{conversationId:chat.id}});
 const before=await admin.conversation.findUnique({where:{id:chat.id}});
 const results=await Promise.all(Array.from({length:5},()=>accept(ticket.id)));
 for(const {body} of results){assert.equal(body.ticket.status,'IN_PROGRESS');assert.equal(body.ticket.version,1);assert.equal(body.ticket.chatLink,null);assert.equal(body.ticket.allowedActions.accept,false);}
 await accept(ticket.id,0);
 await accept(ticket.id,0,staff,200,{},true);
 assert.equal(await admin.auditLog.count({where:{targetId:ticket.id,action:'TICKET_ACCEPTED'}}),1);
 assert.equal(await admin.outboxEvent.count({where:{aggregateId:ticket.id,eventType:'TICKET_ACCEPTED'}}),1);
 assert.deepEqual(await admin.conversation.findUnique({where:{id:chat.id}}),before);
 await assert.rejects(core.$transaction(tx=>new ConversationAccessService().requireTranscript(tx,staff.id,chat.id)),e=>e.getStatus()===404);
});
test('TK03 stale versions and terminal states cannot Accept; assigned OPEN can',async()=>{
 const ticket=await fixture();assert.equal((await accept(ticket.id,9,staff,409)).body.code,'STALE_TICKET');
 for(const status of ['RESOLVED','CLOSED']){const row=await fixture(status);await accept(row.id,0,staff,409);assert.equal((await admin.supportTicket.findUnique({where:{id:row.id}})).version,0);}
 const open=await fixture('OPEN');assert.equal((await accept(open.id)).body.ticket.status,'IN_PROGRESS');
 await accept(ticket.id,0,other,404);await accept(randomUUID(),0,staff,404);
 assert.equal(await admin.auditLog.count({where:{targetId:ticket.id}}),0);
});
test('TK03 CSRF, origin, role and strict body validation protect writes',async()=>{
 const ticket=await fixture();
 await accept(ticket.id,0,staff,403,{'X-CSRF-Token':'bad'});await accept(ticket.id,0,staff,403,{Origin:'http://invalid.example'});
 await accept(ticket.id,0,customer,403);
 for(const value of [-1,1.5,'0',null,2147483647])await accept(ticket.id,value,staff,400);
 const response=await fetch(base+'/api/v1/staff/tickets/'+ticket.id+'/accept',{method:'POST',headers:{Cookie:staff.cookie,Origin:origin,'Content-Type':'application/json','X-Auth-Request':'1','X-CSRF-Token':staff.csrf},body:JSON.stringify({expectedVersion:0,status:'IN_PROGRESS'})});assert.equal(response.status,400);
 assert.equal((await admin.supportTicket.findUnique({where:{id:ticket.id}})).status,'ASSIGNED');
});
test('TK03 replay still checks current assignment and locked Staff; locked Customer is serviceable',async()=>{
 const ticket=await fixture();
 await admin.user.update({where:{id:customer.id},data:{status:'LOCKED'}});
 try{await accept(ticket.id);}finally{await admin.user.update({where:{id:customer.id},data:{status:'ACTIVE'}});}
 await admin.staffAssignment.update({where:{id:assignment.id},data:{isActive:false,endedAt:new Date()}});
 try{await accept(ticket.id,0,staff,404);}finally{await admin.staffAssignment.update({where:{id:assignment.id},data:{isActive:true,endedAt:null}});}
 await admin.user.update({where:{id:staff.id},data:{status:'LOCKED'}});
 try{await accept(ticket.id,0,staff,401);}finally{await admin.user.update({where:{id:staff.id},data:{status:'ACTIVE'}});}
});
test('TK03 reassignment committed before lock is rechecked and denied',async()=>{
 const ticket=await fixture(),commands=app.get(ConversationCommandService),original=commands.lockCustomer.bind(commands);
 commands.lockCustomer=async(tx,actor,id)=>{await admin.staffAssignment.update({where:{id:assignment.id},data:{isActive:false,endedAt:new Date()}});return original(tx,actor,id);};
 try{await accept(ticket.id,0,staff,404);}finally{commands.lockCustomer=original;await admin.staffAssignment.update({where:{id:assignment.id},data:{isActive:true,endedAt:null}});}
 assert.equal((await admin.supportTicket.findUnique({where:{id:ticket.id}})).status,'ASSIGNED');
});
test('TK03 event write failure rolls back status/version/audit; retry can commit',async()=>{
 const ticket=await fixture(),commands=app.get(ConversationCommandService),original=commands.transaction.bind(commands);
 commands.transaction=work=>original(tx=>work(new Proxy(tx,{get(target,key){if(key==='outboxEvent')return {create:async()=>{throw new Error('Synthetic outbox failure');}};return target[key];}})));
 try{await accept(ticket.id,0,staff,500);}finally{commands.transaction=original;}
 const row=await admin.supportTicket.findUnique({where:{id:ticket.id}});assert.equal(row.status,'ASSIGNED');assert.equal(row.version,0);
 assert.equal(await admin.auditLog.count({where:{targetId:ticket.id}}),0);assert.equal(await admin.outboxEvent.count({where:{aggregateId:ticket.id}}),0);
 await accept(ticket.id);assert.equal((await admin.supportTicket.findUnique({where:{id:ticket.id}})).status,'IN_PROGRESS');
});
test('TK03 command quota is separate from reads and returns Retry-After',async()=>{
 const ticket=await fixture();
 await admin.rateLimitBucket.update({where:{clientToken_endpointGroup:{clientToken:tokenHash(staff.id.toLowerCase()),endpointGroup:'TICKET_ACCEPT'}},data:{requestCount:30,windowStart:new Date()}});
 const {response}=await accept(ticket.id,0,staff,429);assert(Number(response.headers.get('retry-after'))>=1);await get('/'+ticket.id);
});

// TK05 notification/worker/WS regressions; held leases isolate test events from the live worker.
async function ticketEvent(row,type='TICKET_CREATED'){
 return admin.outboxEvent.create({data:{aggregateType:'TICKET',aggregateId:row.id,eventType:type,payload:{schemaVersion:1,version:row.version},status:'PROCESSING',leaseOwner:'synthetic-held',leaseExpiresAt:new Date(Date.now()+3600000)}});
}
async function notifications(who=staff,id=null,expected=200){
 const response=await fetch(base+'/api/v1/staff/notifications'+(id?'/'+id+'/read':''),{method:id?'POST':'GET',headers:{Cookie:who.cookie,Origin:origin,'X-Auth-Request':'1','X-CSRF-Token':who.csrf,...(id?{'Content-Type':'application/json'}:{})},...(id?{body:'{}'}:{})});assert.equal(response.status,expected);return response.json();
}
test('TK05 creation consumer deduplicates concurrent delivery and exposes safe Ticket target; read does not Accept',async()=>{
 const row=await fixture(),event=await ticketEvent(row),service=app.get(TicketEventService);
 await Promise.all(Array.from({length:3},()=>service.route(event)));
 const created=await admin.notification.findMany({where:{ticketId:row.id},select:{kind:true,recipientStaffId:true,recipientCustomerId:true}});
 assert.deepEqual(created.sort((a,b)=>a.kind.localeCompare(b.kind)),[
  {kind:'SUPPORT_TICKET_CREATED',recipientStaffId:null,recipientCustomerId:customer.id},
  {kind:'TICKET_CREATED',recipientStaffId:staff.id,recipientCustomerId:null},
 ]);
 const items=(await notifications()).items,item=items.find(x=>x.target.id===row.id);assert(item);assert.equal(item.kind,'TICKET_CREATED');assert.equal(item.target.type,'TICKET');assert.equal(item.title,'New support ticket');assert(!JSON.stringify(item).includes(row.title));
 await notifications(staff,item.id);await notifications(staff,item.id);assert.equal((await admin.supportTicket.findUnique({where:{id:row.id}})).status,'ASSIGNED');
 assert(!(await notifications(other)).items.some(x=>x.target.id===row.id));await notifications(other,item.id,404);await notifications(customer,item.id,403);
 const denied=await fetch(base+'/api/v1/staff/notifications/'+item.id+'/read',{method:'POST',headers:{Cookie:staff.cookie,Origin:origin,'Content-Type':'application/json','X-Auth-Request':'1'},body:'{}'});assert.equal(denied.status,403);
});
test('TK05 scope loss filters list/read and suppresses creation before routing, including locked Staff',async()=>{
 const row=await fixture(),event=await ticketEvent(row),service=app.get(TicketEventService);await service.route(event);const item=await admin.notification.findFirst({where:{ticketId:row.id}});
 try{
 await admin.staffAssignment.update({where:{id:assignment.id},data:{isActive:false,endedAt:new Date()}});
 assert.deepEqual(await service.route(event),[]);assert(!(await notifications()).items.some(x=>x.target.id===row.id));await notifications(staff,item.id,404);
 }finally{await admin.staffAssignment.update({where:{id:assignment.id},data:{isActive:true,endedAt:null}});}
 try{await admin.user.update({where:{id:staff.id},data:{status:'LOCKED'}});assert.deepEqual(await service.route(event),[]);}finally{await admin.user.update({where:{id:staff.id},data:{status:'ACTIVE'}});}
 const foreign=await fixture('ASSIGNED',other.id);assert.deepEqual(await service.route(await ticketEvent(foreign)),[]);
});
test('TK05 worker retry after notification commit deduplicates; lease loss cannot publish and exhausted work reaches DLQ',async()=>{
 const row=await fixture(),event=await ticketEvent(row),events=app.get(TicketEventService);
 const failed=new OutboxDispatcherService({prisma:core},{},{publishTicket:async()=>{throw new Error('Synthetic delivery failure');}},events);
 await admin.outboxEvent.update({where:{id:event.id},data:{leaseOwner:failed.owner,retryCount:1}});await failed.process({...event,retryCount:1});
 assert.equal((await admin.outboxEvent.findUnique({where:{id:event.id}})).status,'PENDING');assert.equal(await admin.notification.count({where:{ticketId:row.id}}),2);assert.equal((await admin.supportTicket.findUnique({where:{id:row.id}})).status,'ASSIGNED');
 await admin.outboxEvent.update({where:{id:event.id},data:{status:'PROCESSING',leaseOwner:failed.owner,retryCount:8}});await failed.process({...event,retryCount:8});assert.equal((await admin.outboxEvent.findUnique({where:{id:event.id}})).status,'FAILED_DLQ');
 let count=0;const good=new OutboxDispatcherService({prisma:core},{},{publishTicket:async()=>{count++;}},events);
 await good.process({...event,retryCount:1});assert.equal(count,0);
 await admin.outboxEvent.update({where:{id:event.id},data:{status:'PROCESSING',leaseOwner:good.owner}});await good.process({...event,retryCount:1});await good.process({...event,retryCount:1});assert.equal(count,1);assert.equal(await admin.notification.count({where:{ticketId:row.id}}),2);assert.equal((await admin.outboxEvent.findUnique({where:{id:event.id}})).status,'PUBLISHED');
});
test('TK05 accepted events validate source/version and do not trust arbitrary kind or future version',async()=>{
 const row=await fixture('IN_PROGRESS');await admin.supportTicket.update({where:{id:row.id},data:{version:1}});row.version=1;
 const event=await ticketEvent(row,'TICKET_ACCEPTED'),service=app.get(TicketEventService);assert.deepEqual(await service.route(event),[staff.id]);
 assert.equal((await admin.notification.findFirst({where:{ticketId:row.id}})).kind,'TICKET_ACCEPTED');assert.deepEqual(await service.route({...event,eventType:'TICKET_CREATED'}),[]);
 await admin.outboxEvent.update({where:{id:event.id},data:{payload:{schemaVersion:1,version:999}}});assert.deepEqual(await service.route(event),[]);
 await admin.outboxEvent.update({where:{id:event.id},data:{payload:{schemaVersion:99,version:1}}});await assert.rejects(service.route(event));
});
async function liveSocket(who){
 const frames=[],ws=new WebSocket(base.replace('http:','ws:')+'/api/v1/realtime',{headers:{Cookie:who.cookie,Origin:origin}});ws.on('message',x=>frames.push(JSON.parse(String(x))));ws.on('error',()=>{});
 await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});return {ws,frames};
}
test('TK05 WebSocket only invalidates authorized Staff, rechecks scope before send and never carries Ticket/chat content',async()=>{
 const row=await fixture(),event=await ticketEvent(row),service=app.get(RealtimeService),sockets=await Promise.all([liveSocket(staff),liveSocket(other),liveSocket(customer)]);
 try{
 await service.publishTicket(event,[staff.id]);await new Promise(r=>setTimeout(r,80));
 const frames=sockets[0].frames.filter(x=>x.eventId===event.id);assert.deepEqual(frames.map(x=>x.type).sort(),['notifications-invalidated','tickets-invalidated']);for(const frame of frames)assert.deepEqual(Object.keys(frame).sort(),['eventId','type']);assert(sockets.slice(1).every(x=>!x.frames.some(f=>f.eventId===event.id)));
 await admin.staffAssignment.update({where:{id:assignment.id},data:{isActive:false,endedAt:new Date()}});
 const next={...event,id:randomUUID()};await service.publishTicket(next,[staff.id]);await new Promise(r=>setTimeout(r,80));assert(!sockets[0].frames.some(f=>f.eventId===next.id));
 }finally{await admin.staffAssignment.update({where:{id:assignment.id},data:{isActive:true,endedAt:null}});sockets.forEach(x=>x.ws.close());}
});
async function patchStatus(row,status,expectedVersion,who=staff,expected=200,extra={}){
 const response=await fetch(base+'/api/v1/staff/tickets/'+row.id+'/status',{method:'PATCH',headers:{Cookie:who.cookie,Origin:origin,'Content-Type':'application/json','X-Auth-Request':'1','X-CSRF-Token':who.csrf,...extra},body:JSON.stringify({status,expectedVersion})});assert.equal(response.status,expected);return response.json();
}
test('Ticket workflow permits sequential resolution, closure and explicit reopening with current transitions',async()=>{
 await admin.rateLimitBucket.updateMany({where:{clientToken:tokenHash(staff.id.toLowerCase()),endpointGroup:'TICKET_ACCEPT'},data:{requestCount:0,windowStart:new Date()}});
 const row=await fixture();let version=0;
 for(const status of ['IN_PROGRESS','RESOLVED','CLOSED','IN_PROGRESS','RESOLVED','IN_PROGRESS']){
 const result=await patchStatus(row,status,version++);assert.equal(result.ticket.status,status);assert.equal(result.ticket.version,version);assert(Array.isArray(result.ticket.allowedActions.transitions));
 }
 const audits=await admin.auditLog.count({where:{targetId:row.id}});await patchStatus(row,'IN_PROGRESS',version-1);assert.equal(await admin.auditLog.count({where:{targetId:row.id}}),audits);
 assert.equal(await admin.outboxEvent.count({where:{aggregateId:row.id,eventType:'TICKET_STATUS_CHANGED'}}),5);
});
test('Ticket status permits direct selection while rejecting stale versions and missing authority or CSRF',async()=>{
 const row=await fixture();await patchStatus(row,'IN_PROGRESS',9,staff,409);await patchStatus(row,'IN_PROGRESS',0,other,404);await patchStatus(row,'IN_PROGRESS',0,customer,403);await patchStatus(row,'IN_PROGRESS',0,staff,403,{'X-CSRF-Token':'bad'});await patchStatus(row,'INVALID',0,staff,400);
 assert.equal((await admin.supportTicket.findUnique({where:{id:row.id}})).status,'ASSIGNED');assert.equal(await admin.auditLog.count({where:{targetId:row.id}}),0);
 const open=await fixture('OPEN');await patchStatus(open,'ASSIGNED',0);assert.equal((await admin.supportTicket.findUnique({where:{id:open.id}})).status,'ASSIGNED');
});
test('concurrent Ticket status updates commit one transition and consumer routes status-change notification',async()=>{
 const row=await fixture('IN_PROGRESS');await Promise.all([patchStatus(row,'RESOLVED',0),patchStatus(row,'RESOLVED',0)]);
 assert.equal(await admin.auditLog.count({where:{targetId:row.id,action:'TICKET_STATUS_CHANGED'}}),1);
 const event=await admin.outboxEvent.findFirstOrThrow({where:{aggregateId:row.id,eventType:'TICKET_STATUS_CHANGED'}});await app.get(TicketEventService).route(event);
 assert.equal(await admin.notification.count({where:{ticketId:row.id,kind:'TICKET_STATUS_CHANGED'}}),1);
});

test('all five Ticket statuses are available for direct selection under current scope/version',async()=>{ const row=await fixture();let version=0;for(const value of ['CLOSED','OPEN','RESOLVED','ASSIGNED','IN_PROGRESS']){const result=await patchStatus(row,value,version++);assert.equal(result.ticket.status,value);assert.equal(result.ticket.allowedActions.transitions.length,4);}});
