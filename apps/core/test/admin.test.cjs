require('reflect-metadata');
const { readFileSync, existsSync } = require('node:fs');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('../dist-admin/generated/prisma/client');
const { createAdminApp } = require('../dist-admin/admin/main');
const { hashPassword, verifyPassword } = require('../dist-admin/accounts/utils/password');
const { DatabaseService } = require('../dist/database/database.service');
const { AuthService } = require('../dist/auth/services/auth.service');
const { AuthController } = require('../dist/auth/controllers/auth.controller');
const { CustomerService } = require('../dist/customers/services/customer.service');
const { CustomerController } = require('../dist/customers/controllers/customer.controller');
const { configureHttp } = require('../dist/http/http-foundation');
const input = JSON.parse(readFileSync(0, 'utf8'));
process.env.NODE_ENV = 'test'; process.env.CORS_ORIGINS = 'http://localhost:3000';
const adapter = (user,password) => new PrismaPg({host:'127.0.0.1',port:input.port,database:'life_insurance',user,password,max:5});
const db = new PrismaClient({adapter:adapter('admin_runtime',input.password)});
const core = new PrismaClient({adapter:adapter('core_runtime',input.corePassword)});
const suffix = randomUUID().replaceAll('-','');
const credential = { username:'synthetic-operator-'+suffix, password:randomUUID() };
const digest = v=>createHash('sha256').update(v).digest('hex');
const origin='http://127.0.0.1:4101', base=origin+'/ops/v1';
const headers={Origin:origin,'Content-Type':'application/json','X-Auth-Request':'1'};
const email = name=>`ops.${name}.${suffix}@synthetic.invalid`;
let app, publicApp, publicBase, session, a, b, customer;
const cookies = r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
const request = (path,body,auth=session,extra={})=>fetch(base+'/'+path,{method:body===undefined?'GET':'POST',headers:{...headers,Cookie:auth?.cookie??'','X-CSRF-Token':auth?.csrf??'',...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
async function loginOperator() {
  const response=await request('auth/login',credential,null);assert.equal(response.status,201);
  const body=await response.json();assert.ok(response.headers.getSetCookie().every(c=>c.includes('HttpOnly')&&c.includes('SameSite=Strict')&&c.includes('Path=/ops/v1')));
  return {cookie:cookies(response),csrf:body.csrfToken};
}
async function ok(path,body,status=200) {const r=await request(path,body);assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'no-store');return r.json();}
async function create(name,role,staffId) {
  const body={email:email(name),role,fullName:'Synthetic '+name,requestId:randomUUID(),...(staffId?{staffId}:{})};
  const result=await ok('accounts',body,201);assert.match(result.accountCode,role==='STAFF'?/^STF-\d{6,}$/:/^CUS-\d{6,}$/);
  assert.ok(await verifyPassword(result.initialPassword,(await db.user.findUnique({where:{id:result.id}})).passwordHash));
  return {...result,request:body};
}
async function loginUser(account,password=account.initialPassword) {
  const r=await fetch(publicBase+'/auth/'+(account.role==='STAFF'?'staff/login':'login'),{method:'POST',headers:{Origin:'http://localhost:3000','Content-Type':'application/json','X-Auth-Request':'1'},body:JSON.stringify({email:account.email,password})});
  return {response:r,cookie:cookies(r)};
}
const publicGet=(path,cookie)=>fetch(publicBase+'/'+path,{headers:{Cookie:cookie}});
before(async()=>{
  class PublicTestModule {}
  Module({controllers:[AuthController,CustomerController],providers:[AuthService,CustomerService,{provide:DatabaseService,useValue:{prisma:core}}]})(PublicTestModule);
  publicApp=await NestFactory.create(PublicTestModule,{logger:false});configureHttp(publicApp,{origins:['http://localhost:3000'],docsEnabled:false});await publicApp.listen(0,'127.0.0.1');publicBase=(await publicApp.getUrl())+'/api/v1';
  app=await createAdminApp(db,{username:credential.username,passwordHash:await hashPassword(credential.password)},4101);await app.listen(4101,'127.0.0.1');
});
after(async()=>{
  await app?.close();await publicApp?.close();
  const users=await db.user.findMany({where:{email:{contains:suffix}},select:{id:true,email:true}});const ids=users.map(u=>u.id);
  await db.$transaction(async tx=>{
    await tx.authSession.deleteMany({where:{userId:{in:ids}}});await tx.staffAssignment.deleteMany({where:{OR:[{staffId:{in:ids}},{customerId:{in:ids}}]}});
    await tx.auditLog.deleteMany({where:{OR:[{operatorId:credential.username},{targetId:{in:ids}}]}});
    await tx.customerProfile.deleteMany({where:{userId:{in:ids}}});await tx.staffProfile.deleteMany({where:{userId:{in:ids}}});await tx.user.deleteMany({where:{id:{in:ids}}});
    await tx.rateLimitBucket.deleteMany({where:{clientToken:{in:[digest(credential.username+':127.0.0.1'),...users.map(u=>digest(u.email))]}}});
  });await db.$disconnect();await core.$disconnect();
});

test('operator isolation, local Host/Origin, CSRF, static UI and public artifact exclusion',async()=>{
  assert.equal(existsSync('apps/core/dist/admin'),false);
  assert.equal((await request('accounts',undefined,null)).status,401);
  assert.equal(await new Promise((resolve,reject)=>{ const req=require('node:http').get(origin+'/',{headers:{Host:'untrusted.invalid'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);}),403);
  assert.equal((await request('auth/login',credential,null,{Origin:'https://untrusted.invalid'})).status,403);
  assert.equal((await request('auth/login',credential,null,{'X-Auth-Request':''})).status,403);
  session=await loginOperator();assert.equal((await ok('auth/me')).operatorId,credential.username);
  const html=await fetch(origin+'/');assert.equal(html.status,200);assert.match(await html.text(),/Quản trị tài khoản/);assert.match(html.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.equal((await request('accounts',{email:email('blocked'),role:'STAFF',fullName:'Synthetic',requestId:randomUUID()},session,{'X-CSRF-Token':''})).status,403);
  for(const path of ['ops/v1/accounts','ops/v1/auth/login'])assert.equal((await publicGet(path,'')).status,404);
});

test('create is atomic, auto-codes and secret shown once; retries/duplicate email never replay password',async()=>{
  a=await create('staff-a','STAFF');b=await create('staff-b','STAFF');customer=await create('customer','CUSTOMER',a.id);
  const retry=await request('accounts',customer.request);assert.equal(retry.status,409);assert.doesNotMatch(await retry.text(),new RegExp(customer.initialPassword));
  assert.equal((await request('accounts',{...customer.request,requestId:randomUUID()})).status,409);
  assert.equal(await db.user.count({where:{email:customer.email}}),1);
  const detail=await ok('accounts/'+customer.id);assert.equal(detail.customerProfile.assignmentVersion,1);assert.equal(detail.customerProfile.assignments[0].staffId,a.id);
  assert.doesNotMatch(JSON.stringify(detail),/passwordHash|initialPassword|csrfToken/);
  assert.equal((await request('accounts',{email:email('bad'),role:'CUSTOMER',fullName:'Synthetic',staffId:randomUUID(),requestId:randomUUID()})).status,400);
  assert.equal(await db.user.count({where:{email:email('bad')}}),0);
  const list=await ok('accounts?q='+encodeURIComponent(suffix)+'&role=CUSTOMER&pageSize=1');assert.equal(list.total,1);assert.equal(list.items.length,1);
  assert.equal((await request('accounts?pageSize=100')).status,400);
});

test('real assignment service serializes conflicts, preserves history and revokes old Staff access immediately',async()=>{
  const staffA=await loginUser(a),staffB=await loginUser(b);assert.equal(staffA.response.status,200);assert.equal(staffB.response.status,200);
  const current=await ok('accounts/'+customer.id);
  const transfer={staffId:b.id,expectedVersion:current.customerProfile.assignmentVersion,requestId:randomUUID()};
  assert.equal((await request('accounts/'+customer.id+'/assignment',transfer)).status,201);
  assert.equal((await publicGet('staff/customers/'+customer.id,staffA.cookie)).status,404);
  assert.equal((await publicGet('staff/customers/'+customer.id,staffB.cookie)).status,200);
  assert.equal((await request('accounts/'+customer.id+'/assignment',{...transfer,staffId:a.id,requestId:randomUUID()})).status,409);
  const next=await ok('accounts/'+customer.id);
  const results=await Promise.all([a.id,null].map(staffId=>request('accounts/'+customer.id+'/assignment',{staffId,expectedVersion:next.customerProfile.assignmentVersion,requestId:randomUUID()})));
  assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
  assert.ok(await db.staffAssignment.count({where:{customerId:customer.id,isActive:false}})>=1);
  assert.ok(await db.staffAssignment.count({where:{customerId:customer.id,isActive:true}})<=1);
  const updated=await ok('accounts/'+customer.id);
  if(updated.customerProfile.assignments.length)await ok('accounts/'+customer.id+'/assignment',{staffId:null,expectedVersion:updated.customerProfile.assignmentVersion,requestId:randomUUID()},201);
  assert.equal((await publicGet('staff/customers/'+customer.id,staffB.cookie)).status,404);
});

test('reset/lock/unlock revoke sessions, restore reminder, preserve lock on reset and prevent stale mutation',async()=>{
  const user=await loginUser(customer);assert.equal(user.response.status,200);
  await db.user.update({where:{id:customer.id},data:{passwordChangeRecommended:false}});
  const target=await ok('accounts/'+customer.id),body={expectedUpdatedAt:target.updatedAt,requestId:randomUUID()};
  const result=await ok('accounts/'+customer.id+'/reset-password',body,201);
  assert.equal((await publicGet('auth/me',user.cookie)).status,401);
  assert.equal((await loginUser(customer)).response.status,401);
  const fresh=await loginUser(customer,result.initialPassword);assert.equal(fresh.response.status,200);
  assert.equal((await (await publicGet('auth/me',fresh.cookie)).json()).actor.passwordChangeRecommended,true);
  assert.equal((await request('accounts/'+customer.id+'/reset-password',body)).status,409);
  assert.equal((await request('accounts/'+customer.id+'/reset-password',{...body,requestId:randomUUID()})).status,409);
  const unlocked=await ok('accounts/'+customer.id);
  await ok('accounts/'+customer.id+'/status',{status:'LOCKED',expectedUpdatedAt:unlocked.updatedAt,requestId:randomUUID()},201);
  assert.equal((await publicGet('customers/me',fresh.cookie)).status,401);
  const locked=await ok('accounts/'+customer.id);
  assert.equal((await request('accounts/'+customer.id+'/assignment',{staffId:a.id,expectedVersion:locked.customerProfile.assignmentVersion,requestId:randomUUID()})).status,400);
  const lockedReset=await ok('accounts/'+customer.id+'/reset-password',{expectedUpdatedAt:locked.updatedAt,requestId:randomUUID()},201);
  assert.equal((await loginUser(customer,lockedReset.initialPassword)).response.status,401);
  const lockedNow=await ok('accounts/'+customer.id);assert.equal(lockedNow.status,'LOCKED');
  await ok('accounts/'+customer.id+'/status',{status:'ACTIVE',expectedUpdatedAt:lockedNow.updatedAt,requestId:randomUUID()},201);
  assert.equal((await publicGet('customers/me',fresh.cookie)).status,401);
  assert.equal((await loginUser(customer,lockedReset.initialPassword)).response.status,200);
  const staffSnapshot=await ok('accounts/'+a.id);
  await ok('accounts/'+a.id+'/status',{status:'LOCKED',expectedUpdatedAt:staffSnapshot.updatedAt,requestId:randomUUID()},201);
  const customerSnapshot=await ok('accounts/'+customer.id);
  assert.equal((await request('accounts/'+customer.id+'/assignment',{staffId:a.id,expectedVersion:customerSnapshot.customerProfile.assignmentVersion,requestId:randomUUID()})).status,400);
  const staffLocked=await ok('accounts/'+a.id);
  await ok('accounts/'+a.id+'/status',{status:'ACTIVE',expectedUpdatedAt:staffLocked.updatedAt,requestId:randomUUID()},201);
  const publicCookie=(await loginUser(a)).cookie;
  assert.equal((await request('accounts',undefined,{cookie:publicCookie,csrf:''})).status,401);
});

test('audit is allowlisted, mutations rate-limited, operator logout/restart/expiry and DB login limit',async t=>{
  const audit=await ok('audit?q=PASSWORD_RESET');assert.ok(audit.items.some(row=>row.operatorId===credential.username&&row.outcome==='SUCCESS'));
  const body=JSON.stringify(audit);assert.doesNotMatch(body,/passwordHash|initialPassword|metadata/);assert.ok(!body.includes(credential.password));
  const before=session;await ok('auth/logout',{},201);assert.equal((await request('accounts',undefined,before)).status,401);
  session=await loginOperator();
  let limited=false; const absent=randomUUID();
  for(let i=0;i<61;i++){ const response=await request('accounts/'+absent+'/status',{status:'LOCKED',expectedUpdatedAt:new Date().toISOString(),requestId:randomUUID()}); if(response.status===429){limited=true;break;} assert.equal(response.status,404); }
  assert.equal(limited,true);
  await app.close();app=await createAdminApp(db,{username:credential.username,passwordHash:await hashPassword(credential.password)},4101);await app.listen(4101,'127.0.0.1');
  assert.equal((await request('accounts')).status,401);session=await loginOperator();
  t.mock.timers.enable({apis:['Date'],now:Date.now()});t.mock.timers.tick(31*60*1000);
  assert.equal((await request('accounts')).status,401);t.mock.timers.reset();
  const key=digest(credential.username+':127.0.0.1');await db.rateLimitBucket.update({where:{clientToken_endpointGroup:{clientToken:key,endpointGroup:'OPS_LOGIN'}},data:{requestCount:10,windowStart:new Date()}});
  assert.equal((await request('auth/login',credential,null)).status,429);
});
