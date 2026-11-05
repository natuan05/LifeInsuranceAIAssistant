import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
function fixture(action,runId){return JSON.parse(execFileSync('docker',['compose','--profile','tests','run','--rm','-T','--no-deps','core-tests','node','test/support/browser-ticket-fixture.cjs'],{cwd:fileURLToPath(new URL('../../../../',import.meta.url)),input:JSON.stringify({action,runId}),encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:90000}));}
test('real gateway browser: search, detail and Accept persist without document reload',async({browser})=>{
 test.setTimeout(120000);const runId=randomUUID();let context;
 try{
 const data=fixture('setup',runId);context=await browser.newContext();await context.addCookies([{name:'li_session',value:data.staff.token,domain:'localhost',path:'/api/v1',httpOnly:true,sameSite:'Lax'},{name:'li_csrf',value:data.staff.csrf,domain:'localhost',path:'/api/v1',sameSite:'Lax'}]);
 const page=await context.newPage(),nav=[],errors=[];page.on('request',r=>{if(r.isNavigationRequest()&&r.frame()===page.mainFrame())nav.push(new URL(r.url()).pathname);});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/staff/tickets');const input=page.getByRole('searchbox',{name:'Search tickets'});await input.fill(data.search);await input.press('Enter');
 await page.getByRole('link',{name:new RegExp(data.search)}).click();const detail=page.getByRole('article',{name:'Ticket details'});await expect(detail).toContainText('no saved snapshot');
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
 }finally{await context?.close();expect(fixture('cleanup',runId)).toEqual({users:0,tickets:0});}
});
