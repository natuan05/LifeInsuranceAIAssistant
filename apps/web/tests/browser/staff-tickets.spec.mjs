import { test, expect } from '@playwright/test';
const actor={id:'synthetic-tk04',role:'STAFF',fullName:'Synthetic Ticket Staff',accountCode:'STF-TK04',email:'tk04@synthetic.invalid',passwordChangeRecommended:false};
const rows=Array.from({length:23},(_,i)=>({id:`ticket-${i}`,ticketCode:`TK-${i}`,title:`Synthetic request ${i}`,status:'ASSIGNED',createdAt:'2026-01-01T00:00:00.000Z',customer:{id:'customer-1',fullName:'Synthetic Customer',accountCode:'CUS-TK04'},version:0,policy:null,confirmedAt:'2026-01-01T00:00:00.000Z',confirmationSource:'LEGACY_UNVERIFIED',confirmedContent:null,aiSummary:'Synthetic AI summary',allowedActions:{accept:true,transitions:['OPEN','IN_PROGRESS','RESOLVED','CLOSED']},chatLink:null}));
async function setup(page,path='/staff/tickets'){
 const state={rows:structuredClone(rows),posts:0,mode:null,detailFailure:null,listFailure:null,nav:[],errors:[]};
 page.on('pageerror',e=>state.errors.push(e.message));page.on('request',r=>{if(r.isNavigationRequest()&&r.frame()===page.mainFrame())state.nav.push(r.url());});
 await page.routeWebSocket('**/api/v1/realtime',()=>{});
 await page.route('**/api/v1/**',async route=>{
 const r=route.request(),u=new URL(r.url()),p=u.pathname;
 const json=(body,status=200)=>route.fulfill({json:body,status,headers:status===429?{'Retry-After':'1'}:{}});
 if(p.endsWith('/auth/me'))return json(state.sessionFailure?{}:{actor,csrfToken:'tk04-csrf'},state.sessionFailure||200);
 if(p.endsWith('/staff/notifications'))return json({items:state.notifications||[],pageInfo:{hasMore:false,nextCursor:null}});
 if(p.includes('/staff/notifications/')&&p.endsWith('/read')){expect(r.headers()['x-csrf-token']).toBe('tk04-csrf');state.reads=(state.reads||0)+1;return json({id:'notice',isRead:true});}
 if(p.endsWith('/staff/tickets')){
 if(state.listFailure)return json({},state.listFailure);
 const filtered=state.rows.filter(x=>(!u.searchParams.get('search')||(x.title+' '+x.ticketCode).includes(u.searchParams.get('search')))&&(!u.searchParams.get('status')||x.status===u.searchParams.get('status')));
 const start=u.searchParams.get('cursor')?20:0;return json({items:filtered.slice(start,start+20),pageInfo:{hasMore:start+20<filtered.length,nextCursor:start+20<filtered.length?'next':null}});
 }
 if(p.includes('/staff/tickets/')){
 const id=p.split('/')[5],row=state.rows.find(x=>x.id===id);
 if(r.method()==='PATCH'){
 state.posts++;if(state.acceptGate)await state.acceptGate;expect(r.postDataJSON()).toEqual({expectedVersion:row.version,status:r.postDataJSON().status});expect(r.headers()['x-csrf-token']).toBe('tk04-csrf');
 if(state.mode===429)return json({},429);
 if(state.mode===409){row.version=1;return json({},409);}
 row.status=r.postDataJSON().status;row.version++;row.allowedActions={accept:false,transitions:['OPEN','ASSIGNED','IN_PROGRESS','RESOLVED','CLOSED'].filter(value=>value!==row.status)};
 if(state.mode==='network'){state.detailFailure='network';return route.abort('failed');}
 return json({ticket:row});
 }
 if(state.detailDelay?.id===id)await state.detailDelay.promise;
 if(state.detailFailure==='network')return route.abort('failed');
 if(state.detailFailure){if(state.detailFailure===401)state.sessionFailure=401;return json({},state.detailFailure);}
 return json({ticket:row});
 }
 return json({items:[],total:0,page:1,pageSize:10});
 });
 await page.goto(path);return state;
}
const detail=page=>page.getByRole('article',{name:'Ticket details'});
const status=page=>detail(page).getByRole('combobox',{name:'Update ticket status'});
test('full-width list, Enter filters, detail and Back retain loaded results without F5',async({page})=>{
 const s=await setup(page);const input=page.getByRole('searchbox',{name:'Search tickets'});await page.getByRole('button',{name:'Load more tickets'}).click();await expect(page.getByRole('link',{name:/TK-22 /})).toBeVisible();
 await input.fill('TK-2');await input.press('Enter');await expect(input).toBeFocused();await page.getByRole('link',{name:/TK-22 /}).click();await expect(detail(page)).toContainText('Synthetic request 22');await expect(page.getByRole('region',{name:'Ticket results'})).toHaveCount(0);
 await detail(page).getByRole('link',{name:'Back to tickets'}).click();await expect(page.getByRole('searchbox',{name:'Search tickets'})).toHaveValue('TK-2');await page.getByLabel('Ticket status',{exact:true}).selectOption('RESOLVED');await expect(page.getByText('No tickets match these filters.')).toBeVisible();expect(s.nav).toHaveLength(1);expect(s.errors).toEqual([]);
});
test('status dropdown runs workflow and reopens Closed Ticket only through server transitions',async({page})=>{
 const s=await setup(page,'/staff/tickets/ticket-1');await expect(detail(page)).toContainText('no saved snapshot');await expect(detail(page).getByRole('link',{name:'Open conversation'})).toHaveCount(0);
 await expect(status(page).locator('option')).toHaveCount(5);
 for(const value of ['CLOSED','OPEN','RESOLVED','ASSIGNED','IN_PROGRESS']){await status(page).selectOption(value);await expect(detail(page).getByText('Ticket status updated.',{exact:true})).toBeVisible();await expect(status(page)).toHaveValue(value);}
 expect(s.posts).toBe(5);
});
test('unknown outcome allows only GET checking; no automatic status mutation retry',async({page})=>{
 const s=await setup(page,'/staff/tickets/ticket-1');s.mode='network';await status(page).selectOption('IN_PROGRESS');await expect(detail(page).getByRole('button',{name:'Check status'})).toBeVisible();await expect(status(page)).toBeDisabled();s.detailFailure=null;await detail(page).getByRole('button',{name:'Check status'}).click();await expect(status(page)).toHaveValue('IN_PROGRESS');expect(s.posts).toBe(1);
});
for(const code of [403,404,429,500])test(`detail ${code} clears denied data or recovers on retry`,async({page})=>{
 const s=await setup(page,'/staff/tickets/ticket-1');await expect(detail(page)).toContainText('Synthetic request 1');s.detailFailure=code;await page.evaluate(()=>window.dispatchEvent(new Event('core:data-changed')));await expect(detail(page).getByRole('alert')).toBeVisible();if([403,404].includes(code))await expect(detail(page)).not.toContainText('Synthetic request 1');s.detailFailure=null;if(code===429)await page.waitForTimeout(1100);await detail(page).getByRole('button',{name:'Try again'}).click();await expect(detail(page)).toContainText('Synthetic request 1');
});
test('409 reconciles without writing newer version; 429 waits before retry',async({page})=>{
 const s=await setup(page,'/staff/tickets/ticket-1');s.mode=409;await status(page).selectOption('IN_PROGRESS');await expect(detail(page)).toContainText('Review it before');expect(s.posts).toBe(1);s.mode=429;await status(page).selectOption('IN_PROGRESS');await expect(detail(page)).toContainText('Too many requests');await expect(status(page)).toBeDisabled();
});
test('401 clears Ticket and redirects login',async({page})=>{
 const s=await setup(page,'/staff/tickets/ticket-1');await expect(detail(page)).toContainText('Synthetic request 1');s.detailFailure=401;await page.evaluate(()=>window.dispatchEvent(new Event('core:data-changed')));await expect(page).toHaveURL(/staff\/login/);
});
test('notification portal is inside viewport and outside Inbox clipping; keyboard route and Escape focus work',async({page})=>{
 const s=await setup(page);s.notifications=[{id:'notice',kind:'TICKET_CREATED',title:'New support ticket',isRead:false,createdAt:'2026-01-01T00:00:00.000Z',target:{type:'TICKET',id:'ticket-1'}}];await page.setViewportSize({width:375,height:900});const bell=page.getByRole('button',{name:'Notifications',exact:true});await bell.click();const panel=page.getByRole('region',{name:'Staff notifications'});await expect(panel).toBeVisible();expect(await panel.evaluate(el=>{const r=el.getBoundingClientRect();return el.parentElement===document.body&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;})).toBe(true);
 await panel.getByRole('button',{name:/New support ticket/}).focus();await page.keyboard.press('Escape');await expect(bell).toBeFocused();await bell.press('Enter');await panel.getByRole('button',{name:/New support ticket/}).click();await expect(page).toHaveURL(/staff\/tickets\/ticket-1$/);expect(s.reads).toBe(1);
});
test('mobile and 200 percent zoom list/detail/back have no horizontal overflow',async({page})=>{
 await page.setViewportSize({width:375,height:900});const s=await setup(page);await page.getByRole('link',{name:/TK-1 /}).click();await page.evaluate(()=>document.documentElement.style.zoom='2');expect(await detail(page).evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);await detail(page).getByRole('link',{name:'Back to tickets'}).click();await expect(page.getByRole('searchbox',{name:'Search tickets'})).toBeVisible();expect(s.nav).toHaveLength(1);
});
test('background Ticket invalidation preserves list DOM, pages and search draft/focus',async({page})=>{
 await setup(page);await page.getByRole('button',{name:'Load more tickets'}).click();const last=page.getByRole('link',{name:/TK-22 /});await last.evaluate(el=>window.__ticketRow=el);const input=page.getByRole('searchbox',{name:'Search tickets'});await input.focus();await input.fill('draft');await page.evaluate(()=>window.dispatchEvent(new Event('core:tickets-changed')));await expect(last).toBeVisible();await expect(input).toBeFocused();await expect(input).toHaveValue('draft');expect(await last.evaluate(el=>el===window.__ticketRow)).toBe(true);
});
test('status control locks while mutation is pending',async({page})=>{
 const s=await setup(page,'/staff/tickets/ticket-1');let release;s.acceptGate=new Promise(r=>release=r);await status(page).selectOption('IN_PROGRESS');await expect(status(page)).toBeDisabled();expect(s.posts).toBe(1);release();await expect(status(page)).toHaveValue('IN_PROGRESS');
});
test('late detail response cannot replace new selection',async({page})=>{
 const s=await setup(page);let release;s.detailDelay={id:'ticket-1',promise:new Promise(r=>release=r)};await page.getByRole('link',{name:/TK-1 /}).click();await detail(page).getByRole('link',{name:'Back to tickets'}).click();await page.getByRole('link',{name:/TK-2 /}).click();await expect(detail(page)).toContainText('Synthetic request 2');release();await page.waitForTimeout(100);await expect(detail(page)).not.toContainText('Synthetic request 1');expect(s.nav).toHaveLength(1);
});
