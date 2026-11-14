import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
function fixture(action,runId,extraPolicies=0){return JSON.parse(execFileSync('docker',['compose','--profile','tests','run','--rm','-T','--no-deps','core-tests','node','test/support/browser-ticket-fixture.cjs'],{cwd:fileURLToPath(new URL('../../../../',import.meta.url)),input:JSON.stringify({action,runId,extraPolicies}),encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:90000}));}
test('real gateway browser: search, detail and Accept persist without document reload',async({browser})=>{
 test.setTimeout(120000);const runId=randomUUID();let context;
 try{
 const data=fixture('setup',runId);context=await browser.newContext();await context.addCookies([{name:'li_session',value:data.staff.token,domain:'localhost',path:'/api/v1',httpOnly:true,sameSite:'Lax'},{name:'li_csrf',value:data.staff.csrf,domain:'localhost',path:'/api/v1',sameSite:'Lax'}]);
 const page=await context.newPage(),nav=[],errors=[];page.on('request',r=>{if(r.isNavigationRequest()&&r.frame()===page.mainFrame())nav.push(new URL(r.url()).pathname);});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/staff/tickets');const input=page.getByRole('searchbox',{name:'Search tickets'});await input.fill(data.search);await input.press('Enter');
 await page.getByRole('link',{name:new RegExp(data.search)}).click();const detail=page.getByRole('article',{name:'Ticket details'});await expect(detail).toContainText('no saved snapshot');await expect(detail.getByText('Unverified content',{exact:true})).toBeVisible();await expect(detail).not.toContainText('Verified Proposal');
 const observer=await context.newPage(),frames=[];
 observer.on('websocket',socket=>socket.on('framereceived',frame=>{try{frames.push(JSON.parse(String(frame.payload)));}catch{/* Ignore protocol frames. */}}));
 await observer.goto('/staff/tickets/'+data.ticketId);await expect.poll(()=>frames.some(f=>f.type==='ready')).toBe(true);
 await observer.getByRole('button',{name:'Notifications',exact:true}).click();
 const started=Date.now();await detail.getByRole('combobox',{name:'Update ticket status'}).selectOption('IN_PROGRESS');await expect(detail.getByText('Ticket status updated.',{exact:true})).toBeVisible();await expect(detail.getByRole('combobox',{name:'Update ticket status'})).toBeVisible();
 await expect(observer.getByRole('article',{name:'Ticket details'}).getByRole('combobox',{name:'Update ticket status'})).toHaveValue('IN_PROGRESS',{timeout:10000});
 const notice=observer.getByRole('region',{name:'Staff notifications'}).getByRole('button',{name:/Support ticket accepted/});await expect(notice).toBeVisible({timeout:10000});
 expect(frames.some(f=>f.type==='tickets-invalidated')).toBe(true);expect(frames.some(f=>f.type==='notifications-invalidated')).toBe(true);
 for(const frame of frames.filter(f=>['tickets-invalidated','notifications-invalidated'].includes(f.type)))expect(Object.keys(frame).sort()).toEqual(['eventId','type']);
 console.log('Synthetic single-event Ticket delivery observed in',Date.now()-started,'ms; not an SLA benchmark.');
 const readResponse=observer.waitForResponse(response=>response.url().includes('/staff/notifications/')&&response.url().endsWith('/read')&&response.request().method()==='POST');await notice.click();expect((await readResponse).status()).toBe(200);await expect(observer).toHaveURL(new RegExp('/staff/tickets/'+data.ticketId+'$'));
 const notices=await context.request.get('/api/v1/staff/notifications');const notification=(await notices.json()).items.find(x=>x.target.type==='TICKET'&&x.target.id===data.ticketId);expect(notification.isRead).toBe(true);
 for(const value of ['RESOLVED','CLOSED','IN_PROGRESS']) {
   await detail.getByRole('combobox',{name:'Update ticket status'}).selectOption(value);
   await expect(observer.getByRole('combobox',{name:'Update ticket status'})).toHaveValue(value,{timeout:10000});
 }
 await observer.getByRole('button',{name:'Notifications',exact:true}).click();
 await expect(observer.getByRole('region',{name:'Staff notifications'}).getByRole('button',{name:/Support ticket status updated/})).toHaveCount(3,{timeout:10000});
 const result=await context.request.get('/api/v1/staff/tickets/'+data.ticketId);expect(result.status()).toBe(200);const body=await result.json();expect(body.ticket.status).toBe('IN_PROGRESS');expect(body.ticket.version).toBe(4);expect(body.ticket.chatLink).toBeNull();expect(nav).toHaveLength(1);expect(errors).toEqual([]);
 }finally{try{await context?.close();}finally{expect(fixture('cleanup',runId)).toEqual({users:0,tickets:0});}}
});


async function customerContext(browser, actor) {
 const context = await browser.newContext();
 await context.addCookies([{name:'li_session',value:actor.token,domain:'localhost',path:'/api/v1',httpOnly:true,sameSite:'Lax'},
  {name:'li_csrf',value:actor.csrf,domain:'localhost',path:'/api/v1',httpOnly:true,sameSite:'Lax'}]);
 return context;
}
for (const fault of ['lost-ack', 'before-commit', 'close']) {
 test(`A2 real Customer manual request reconciles ${fault} with its original key`,async({browser})=>{
  test.setTimeout(120000); const runId=randomUUID(); let context;
  try {
   const data=fixture('setup',runId); context=await customerContext(browser,data.customer);
   const page=await context.newPage(), keys=[], errors=[]; page.setDefaultTimeout(15000); page.on('pageerror',error=>errors.push(error.message));
   let release; const gate=new Promise(resolve=>{release=resolve;}); let committed=false;
   await page.route('**/api/v1/customers/me/tickets/manual',async route=>{
    keys.push(route.request().postDataJSON().clientRequestId);
    if(keys.length>1) return route.continue();
    if(fault==='before-commit') return route.abort('failed');
    await route.fetch(); committed=true;
    if(fault==='close') await gate;
    return route.abort('failed');
   });
   await page.goto('/customer'); await page.getByRole('button',{name:'Support Tickets',exact:false}).click();
   await page.getByRole('button',{name:'New support ticket',exact:true}).click();
   const form=page.getByRole('dialog',{name:'New support ticket',exact:true});
   await form.getByRole('textbox',{name:'Ticket title',exact:true}).fill('Synthetic Phase 2 '+runId);
   await form.getByRole('textbox',{name:'Ticket description',exact:true}).fill('Synthetic description for recovery.');
   await form.getByRole('button',{name:'Submit request',exact:true}).click();
   if(fault==='before-commit') {
    await expect(form.getByRole('alert')).toContainText('not confirmed');
    await expect(form.getByRole('textbox',{name:'Ticket title',exact:true})).toBeDisabled();
    await form.getByRole('button',{name:'Check and retry',exact:true}).click();
   }
   if(fault==='close') {
    await expect.poll(()=>committed).toBe(true);
    await form.getByRole('button',{name:'Close request form',exact:true}).click(); release();
    await expect(page.getByRole('dialog',{name:'Ticket details',exact:true})).toHaveCount(0);
    await page.getByRole('button',{name:'New support ticket',exact:true}).click();
    await form.getByRole('button',{name:'Check and retry',exact:true}).click();
   }
   await expect(page.getByRole('status').filter({hasText:'has been created'})).toBeVisible();
   const detail=page.getByRole('dialog',{name:'Ticket details',exact:true});
   await expect(detail).toContainText('Synthetic description for recovery.');
   const response=await context.request.get('/api/v1/customers/me/tickets?search='+encodeURIComponent('Synthetic Phase 2 '+runId));
   const body=await response.json(); expect(body.total).toBe(1);
   expect(new Set(keys).size).toBe(1); expect(keys.length).toBe(fault==='before-commit'?2:1);
   const own=await (await context.request.get('/api/v1/customers/me/tickets/'+body.items[0].id)).json();
   expect(own.ticket.confirmationSource).toBe('CUSTOMER_SUBMITTED');
   const staff=await customerContext(browser,data.staff);
   try { const assigned=await staff.newPage(); await assigned.goto('/staff/tickets/'+body.items[0].id);
    await expect(assigned.getByRole('region',{name:'Confirmed ticket content',exact:true})).toContainText('Synthetic description for recovery.');
   }finally{await staff.close();}
   expect(errors).toEqual([]);
  } finally {try{await context?.close();}finally{expect(fixture('cleanup',runId)).toEqual({users:0,tickets:0});}}
 });
}

test('A2 real Customer draft edits policy/revision, confirms server wording and reconciles lost ACK',async({browser})=>{
 test.setTimeout(120000);const runId=randomUUID();let context;
 try {
  const data=fixture('setup',runId);context=await customerContext(browser,data.customer);
  const page=await context.newPage();page.setDefaultTimeout(15000);let sends=0;
  await page.route('**/api/v1/customers/me/tickets',async route=>{
   if(route.request().method()!=='POST')return route.continue();
   sends++;await route.fetch();return route.abort('failed');
  });
  await page.goto(`/customer?conversationId=${data.conversationId}&ticketDraftId=${data.draftId}`);
  const dialog=page.getByRole('dialog',{name:'Review support ticket',exact:true});
  await expect(dialog).toContainText('Synthetic browser draft');await expect(dialog).toContainText('ticket-v1');
  const source=await (await context.request.get(`/api/v1/customers/me/conversations/${data.conversationId}/ticket-drafts/${data.draftId}`)).json();
  await expect(dialog).toContainText(source.confirmation.text);
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);expect(sends).toBe(0);
  await page.evaluate(url=>window.history.pushState(null,'',url),`/customer?conversationId=${data.conversationId}&ticketDraftId=${data.draftId}`);
  await expect(dialog).toContainText(source.confirmation.text);

  await dialog.getByRole('button',{name:'Edit draft',exact:true}).click();
  await dialog.getByRole('textbox',{name:'Ticket title',exact:true}).fill('Synthetic edited title');
  await dialog.getByRole('textbox',{name:'Description',exact:true}).fill('Synthetic edited description');
  await dialog.getByRole('combobox',{name:'Related policy',exact:true}).selectOption('');
  await dialog.getByRole('button',{name:'Save and review',exact:true}).click();
  await expect(dialog).toContainText('Revision 2');await expect(dialog).toContainText('No related policy');
  await dialog.getByRole('button',{name:'Confirm ticket',exact:true}).click();
  const detail=page.getByRole('dialog',{name:'Ticket details',exact:true});
  await expect(detail).toContainText('Synthetic edited description');expect(sends).toBe(1);
  const tickets=await (await context.request.get('/api/v1/customers/me/tickets?search=Synthetic%20edited%20title')).json();
  expect(tickets.total).toBe(1);
  const ticket=await (await context.request.get('/api/v1/customers/me/tickets/'+tickets.items[0].id)).json();
  expect(ticket.ticket.confirmationSource).toBe('CUSTOMER_CONFIRMED');expect(ticket.ticket.confirmedContent.draftVersion).toBe(2);expect(ticket.ticket.confirmedContent.policyId).toBeNull();
 }finally{try{await context?.close();}finally{expect(fixture('cleanup',runId)).toEqual({users:0,tickets:0});}}
});


test('A2 stale confirmation invalidates the old review until the latest revision is loaded', async ({ browser }) => {
 test.setTimeout(120000); const runId=randomUUID(); let context;
 try {
  const data=fixture('setup',runId);context=await customerContext(browser,data.customer);
  const page=await context.newPage();page.setDefaultTimeout(15000);
  await page.goto(`/customer?conversationId=${data.conversationId}&ticketDraftId=${data.draftId}`);
  const dialog=page.getByRole('dialog',{name:'Review support ticket',exact:true});
  await expect(dialog).toContainText('Synthetic browser draft');
  const updated=await context.request.put(`/api/v1/customers/me/conversations/${data.conversationId}/ticket-drafts/${data.draftId}`,{
   headers:{Origin:'http://localhost:8080','X-Auth-Request':'1','X-CSRF-Token':data.customer.csrf},
   data:{expectedVersion:1,title:'Synthetic current revision',description:'Synthetic current content',policyId:data.policyId},
  });expect(updated.status()).toBe(200);
  const conflict=page.waitForResponse(response=>response.url().endsWith('/customers/me/tickets')&&response.request().method()==='POST');
  await dialog.getByRole('button',{name:'Confirm ticket',exact:true}).click();expect((await conflict).status()).toBe(409);
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Confirm ticket',exact:true})).toBeDisabled();
  await expect(dialog.getByText('Synthetic browser draft',{exact:true})).toHaveCount(0);
  await dialog.getByRole('button',{name:'Reload draft',exact:true}).click();
  await expect(dialog).toContainText('Synthetic current content');await expect(dialog).toContainText('Revision 2');
  await dialog.getByRole('button',{name:'Confirm ticket',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Ticket details',exact:true})).toContainText('Synthetic current content');
 } finally {try{await context?.close();}finally{expect(fixture('cleanup',runId)).toEqual({users:0,tickets:0});}}
});


test('A2 Ticket quota message uses the Retry-After returned by Core', async ({ browser }) => {
 test.setTimeout(120000);const runId=randomUUID();let context;
 try {
  const data=fixture('setup',runId);context=await customerContext(browser,data.customer);
  for(let index=0;index<10;index++) {
   const response=await context.request.post('/api/v1/customers/me/tickets/manual',{
    headers:{Origin:'http://localhost:8080','X-Auth-Request':'1','X-CSRF-Token':data.customer.csrf},
    data:{clientRequestId:randomUUID(),title:'Synthetic quota '+index,description:'Synthetic quota verification'},
   });expect(response.status()).toBe(200);
  }
  const page=await context.newPage();page.setDefaultTimeout(15000);
  await page.goto('/customer');await page.getByRole('button',{name:'Support Tickets',exact:false}).click();
  await page.getByRole('button',{name:'New support ticket',exact:true}).click();
  const form=page.getByRole('dialog',{name:'New support ticket',exact:true});
  await form.getByRole('textbox',{name:'Ticket title',exact:true}).fill('Synthetic limited request');
  await form.getByRole('textbox',{name:'Ticket description',exact:true}).fill('Synthetic quota verification');
  const limited=page.waitForResponse(response=>response.url().endsWith('/customers/me/tickets/manual')&&response.request().method()==='POST');
  await form.getByRole('button',{name:'Submit request',exact:true}).click();
  const response=await limited;expect(response.status()).toBe(429);
  const seconds=Number(response.headers()['retry-after']);expect(seconds).toBeGreaterThan(0);expect(seconds).toBeLessThanOrEqual(60);
  await expect(form.getByRole('alert')).toContainText(`${seconds} seconds`);
  await expect(form.getByRole('alert')).not.toContainText('15 minutes');
  // Only the missing-header fallback is injected; the quota above uses Core/DB.
  await page.route('**/api/v1/customers/me/tickets/manual',route=>route.fulfill({status:429,json:{}}));
  await form.getByRole('button',{name:'Check and retry',exact:true}).click();
  await expect(form.getByRole('alert')).toContainText('Try again later.');
  await expect(form.getByRole('alert')).not.toContainText('15 minutes');

 }finally{try{await context?.close();}finally{expect(fixture('cleanup',runId)).toEqual({users:0,tickets:0});}}
});


test('A2 policy selectors preserve the current policy and support policies beyond the first page',async({browser})=>{
 test.setTimeout(120000);const runId=randomUUID();let context;
 try {
  const data=fixture('setup',runId,11);context=await customerContext(browser,data.customer);
  const first=await (await context.request.get('/api/v1/customers/me/policies?page=1&pageSize=10')).json();
  expect(first.total).toBe(12);expect(first.items.map(policy=>policy.id)).not.toContain(data.policyId);expect(first.items.map(policy=>policy.id)).not.toContain(data.outsidePolicyId);
  const page=await context.newPage();page.setDefaultTimeout(15000);
  await page.goto(`/customer?conversationId=${data.conversationId}&ticketDraftId=${data.draftId}`);
  const draft=page.getByRole('dialog',{name:'Review support ticket',exact:true});
  await draft.getByRole('button',{name:'Edit draft',exact:true}).click();
  const policy=draft.getByRole('combobox',{name:'Related policy',exact:true});
  await expect(policy).toHaveValue(data.policyId);
  await expect(policy.locator('option:checked')).toHaveText(data.policyNumber);
  await draft.getByRole('button',{name:'Load more policies',exact:true}).click();
  await expect(policy.locator(`option[value="${data.outsidePolicyId}"]`)).toHaveCount(1);
  await policy.selectOption(data.outsidePolicyId);await draft.getByRole('button',{name:'Save and review',exact:true}).click();
  await expect(draft).toContainText(data.outsidePolicyNumber);await draft.getByRole('button',{name:'Confirm ticket',exact:true}).click();
  const detail=page.getByRole('dialog',{name:'Ticket details',exact:true});await expect(detail).toContainText(data.outsidePolicyNumber);
  await detail.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('button',{name:'New support ticket',exact:true}).click();
  const form=page.getByRole('dialog',{name:'New support ticket',exact:true});
  await form.getByRole('button',{name:'Load more policies',exact:true}).click();
  await form.getByRole('combobox',{name:'Related policy',exact:true}).selectOption(data.outsidePolicyId);
  await form.getByRole('textbox',{name:'Ticket title',exact:true}).fill('Synthetic manual paged policy');
  await form.getByRole('textbox',{name:'Ticket description',exact:true}).fill('Synthetic paged policy detail');
  await form.getByRole('button',{name:'Submit request',exact:true}).click();await expect(detail).toContainText(data.outsidePolicyNumber);
 }finally{try{await context?.close();}finally{expect(fixture('cleanup',runId)).toEqual({users:0,tickets:0});}}
});
