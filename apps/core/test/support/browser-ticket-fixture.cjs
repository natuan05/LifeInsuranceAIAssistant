// Synthetic browser fixture protocol over private stdin/stdout. Never log sessions.
const {readFileSync}=require('node:fs');
const {randomUUID,randomBytes,createHash}=require('node:crypto');
const {PrismaPg}=require('@prisma/adapter-pg');
const {PrismaClient,Prisma}=require('../../dist/generated/prisma/client');
const {action,runId,extraPolicies=0}=JSON.parse(readFileSync(0,'utf8'));
if(!Number.isInteger(extraPolicies)||extraPolicies<0||extraPolicies>20)throw new Error('Invalid policy fixture count');
if(!['setup','cleanup'].includes(action)||!/^[0-9a-f-]{36}$/.test(runId))throw new Error('Invalid fixture command');
const db=new PrismaClient({adapter:new PrismaPg({host:process.env.PGHOST,database:process.env.I01_TEST_DATABASE,user:'admin_runtime',password:readFileSync('/credentials/admin/password','utf8').trim()})});
const hash=x=>createHash('sha256').update(x).digest('hex');
const emails=['staff','customer'].map(role=>`${runId}.tk04.${role}@synthetic.invalid`);
async function cleanup(){
 const users=await db.user.findMany({where:{email:{in:emails}},select:{id:true}}),ids=users.map(x=>x.id);
 await db.$transaction(async tx=>{
 if(ids.length)await tx.$queryRaw`SELECT id FROM business.users WHERE id::text IN (${Prisma.join([...ids].sort())}) ORDER BY id FOR UPDATE`;
 const rows=await tx.supportTicket.findMany({where:{customerId:{in:ids}},select:{id:true}}),tickets=rows.map(x=>x.id);
 await tx.auditLog.deleteMany({where:{actorId:{in:ids}}});await tx.outboxEvent.deleteMany({where:{aggregateType:'TICKET',aggregateId:{in:tickets}}});
 await tx.notification.deleteMany({where:{ticketId:{in:tickets}}});
 await tx.supportTicket.deleteMany({where:{id:{in:tickets}}});
 await tx.ticketDraft.deleteMany({where:{customerId:{in:ids}}});
 await tx.conversation.deleteMany({where:{customerId:{in:ids}}});
 await tx.insurancePolicy.deleteMany({where:{customerId:{in:ids}}});
 await tx.insuranceProduct.deleteMany({where:{productCode:'P2-'+runId}});
 await tx.authSession.deleteMany({where:{userId:{in:ids}}});await tx.rateLimitBucket.deleteMany({where:{clientToken:{in:ids.map(hash)}}});
 await tx.staffAssignment.deleteMany({where:{customerId:{in:ids}}});await tx.customerProfile.deleteMany({where:{userId:{in:ids}}});await tx.staffProfile.deleteMany({where:{userId:{in:ids}}});await tx.user.deleteMany({where:{id:{in:ids}}});
 });return {users:await db.user.count({where:{email:{in:emails}}}),tickets:await db.supportTicket.count({where:{ticketCode:{startsWith:'TK04-'+runId}}})};
}
async function actor(role){
 const id=randomUUID(),token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');
 await db.user.create({data:{id,role,email:emails[role==='STAFF'?0:1],accountCode:`${role==='STAFF'?'STF':'CUS'}-${BigInt('0x'+id.replaceAll('-','')).toString().slice(0,22)}`,passwordHash:'synthetic-browser-not-for-login',passwordChangeRecommended:false,...(role==='STAFF'?{staffProfile:{create:{fullName:'Synthetic TK04 Staff'}}}:{customerProfile:{create:{fullName:'Synthetic TK04 Customer'}}})}});
 await db.authSession.create({data:{userId:id,tokenHash:hash(token),csrfTokenHash:hash(csrf),expiresAt:new Date(Date.now()+3600000)}});return {id,token,csrf};
}
async function setup(){try{
 const staff=await actor('STAFF'),customer=await actor('CUSTOMER');await db.staffAssignment.create({data:{staffId:staff.id,customerId:customer.id,operatorId:runId}});
 const ticket=await db.supportTicket.create({data:{ticketCode:'TK04-'+runId,customerId:customer.id,assignedStaffId:staff.id,title:'Synthetic browser support request',aiSummary:'Synthetic legacy AI summary',status:'ASSIGNED',idempotencyKey:runId,confirmedAt:new Date()}});
 const product=await db.insuranceProduct.create({data:{productCode:'P2-'+runId,name:'Synthetic Phase 2 browser product'}});
 const policy=await db.insurancePolicy.create({data:{policyNumber:'P2-'+runId,customerId:customer.id,productId:product.id,status:'ACTIVE'}});
 let outsidePolicy=null;
 for(let index=0;index<extraPolicies;index++) {
  const extra=await db.insurancePolicy.create({data:{policyNumber:'P2-'+runId+'-'+index,customerId:customer.id,productId:product.id,status:'ACTIVE'}});
  if(index===0)outsidePolicy=extra;
 }
 const conversation=await db.conversation.create({data:{customerId:customer.id,createdByCustomerId:customer.id,channelType:'CUSTOMER_SUPPORT',supportOrigin:'AI',status:'AI_ACTIVE'}});
 const draft=await db.ticketDraft.create({data:{customerId:customer.id,conversationId:conversation.id,title:'Synthetic browser draft',description:'Synthetic draft description',policyId:policy.id,expiresAt:new Date(Date.now()+1800000)}});
 return {staff,customer,conversationId:conversation.id,draftId:draft.id,policyId:policy.id,policyNumber:policy.policyNumber,outsidePolicyId:outsidePolicy?.id,outsidePolicyNumber:outsidePolicy?.policyNumber,ticketId:ticket.id,search:ticket.ticketCode};
 }catch(error){await cleanup();throw error;}}
(action==='setup'?setup():cleanup()).then(x=>process.stdout.write(JSON.stringify(x))).catch(()=>{process.stderr.write('Synthetic Ticket browser fixture failed.\n');process.exitCode=1;}).finally(()=>db.$disconnect());
