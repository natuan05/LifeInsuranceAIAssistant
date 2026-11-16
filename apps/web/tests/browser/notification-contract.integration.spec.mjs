import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

function fixture(action, runId) {
  return JSON.parse(execFileSync('docker', ['compose', '--profile', 'tests', 'run', '--rm', '-T', '--no-deps',
    'core-tests', 'node', 'test/support/browser-ticket-fixture.cjs'], {
    cwd: fileURLToPath(new URL('../../../../', import.meta.url)), input: JSON.stringify({ action, runId }),
    encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 90000,
  }));
}
async function contextFor(browser, actor) {
  const context = await browser.newContext();
  await context.addCookies([
    { name: 'li_session', value: actor.token, domain: 'localhost', path: '/api/v1', httpOnly: true, sameSite: 'Lax' },
    { name: 'li_csrf', value: actor.csrf, domain: 'localhost', path: '/api/v1', httpOnly: true, sameSite: 'Lax' },
  ]);
  return context;
}
async function post(context, actor, path, data, status = 201) {
  const response = await context.request.post('/api/v1/' + path, { data,
    headers: { Origin: 'http://localhost:8080', 'X-Auth-Request': '1', 'X-CSRF-Token': actor.csrf } });
  expect(response.status()).toBe(status);
  return response.json();
}

for (const role of ['STAFF', 'CUSTOMER']) test(`A4 real ${role} read receipts refresh older loaded pages without reload`, async ({ browser }) => {
  test.setTimeout(180000);
  const runId = randomUUID(), contexts = [];
  try {
    const data = fixture('setup', runId);
    const customer = await contextFor(browser, data.customer); contexts.push(customer);
    const staff = await contextFor(browser, data.staff); contexts.push(staff);
    const direct = await post(customer, data.customer, 'customers/me/conversations',
      { kind: 'DIRECT', clientRequestId: randomUUID(), expectedAssignmentVersion: 0, subject: 'Synthetic paged receipts' });
    const id = direct.conversation.id;
    const sender = role === 'STAFF' ? staff : customer;
    const actor = role === 'STAFF' ? data.staff : data.customer;
    const root = role === 'STAFF' ? 'staff' : 'customers/me';
    let oldest;
    for (let index = 0; index < 51; index++) {
      const sent = await post(sender, actor, `${root}/conversations/${id}/messages`,
        { clientMessageId: randomUUID(), expectedVersion: 0, content: `Synthetic paged receipt ${index}` });
      if (!index) oldest = sent.message.id;
    }
    const page = await sender.newPage(), documents = [], errors = [];
    page.on('request', r => { if (r.isNavigationRequest() && r.frame() === page.mainFrame()) documents.push(r.url()); });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(role === 'STAFF' ? '/staff/inbox/' + id : '/customer?conversationId=' + id);
    const region = page.getByRole('region', { name: 'Conversation messages', exact: true });
    await expect(region.locator('[data-message-id]')).toHaveCount(50);
    const earlier = region.getByRole('button', { name: 'Load earlier messages', exact: true });
    const first = region.locator(`[data-message-id="${oldest}"]`);
    // Queued real outbox invalidations may briefly disable pagination. Finish
    // loading the older page before exercising the read-receipt invalidation.
    await expect(async () => {
      if (await first.count()) return;
      await expect(earlier).toBeEnabled();
      await earlier.evaluate(button => button.click());
      await expect(first).toHaveCount(1, { timeout: 1000 });
    }).toPass({ timeout: 15000 });
    await expect(first).toContainText('Đã gửi');
    await expect(region.locator('[data-message-id]')).toHaveCount(51);
    const top = await region.evaluate(el => el.scrollTop);
    await post(role === 'STAFF' ? customer : staff, role === 'STAFF' ? data.customer : data.staff,
      `conversations/${id}/read`, {}, 200);
    await expect(first).toContainText('Đã xem', { timeout: 15000 });
    await expect(region.locator('[data-message-id]')).toHaveCount(51);
    expect(Math.abs(await region.evaluate(el => el.scrollTop) - top)).toBeLessThan(100);
    expect(documents).toHaveLength(1); expect(errors).toEqual([]);
  } finally {
    try { await Promise.all(contexts.map(context => context.close())); }
    finally { expect(fixture('cleanup', runId)).toEqual({ users: 0, tickets: 0 }); }
  }
});

test('A3 real Customer bell targets exact Tickets, including repeated clicks, with read/read-all contracts', async ({ browser }) => {
  test.setTimeout(120000);
  const runId = randomUUID(); let context;
  try {
    const data = fixture('setup', runId); context = await contextFor(browser, data.customer);
    const tickets = [];
    for (let index = 0; index < 2; index++) tickets.push((await post(context, data.customer, 'customers/me/tickets/manual',
      { clientRequestId: randomUUID(), title: 'Synthetic bell ' + index, description: 'Synthetic notification target' }, 200)).ticket);
    await expect.poll(async () => (await (await context.request.get('/api/v1/customers/me/notifications')).json()).items
      .filter(n => tickets.some(t => n.target.id === t.id)).length).toBe(2);
    const notices = (await (await context.request.get('/api/v1/customers/me/notifications')).json()).items;
    const page = await context.newPage(), navigations = [], errors = [];
    page.on('request', r => { if (r.isNavigationRequest() && r.frame() === page.mainFrame()) navigations.push(r.url()); });
    page.on('pageerror', e => errors.push(e.message));
    page.setDefaultTimeout(15000);
    await page.goto('/customer');
    for (const ticket of [tickets[0], tickets[1], tickets[1]]) {
      const item = notices.find(n => n.target.id === ticket.id);
      await page.getByRole('button', { name: /^Notifications, / }).click();
      const detailResponse = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/customers/me/tickets/' + ticket.id && r.request().method() === 'GET');
      await page.getByRole('button', { name: item.title, exact: false }).click();
      expect((await detailResponse).status()).toBe(200);
      const dialog = page.getByRole('dialog', { name: 'Ticket details', exact: true });
      await expect(dialog).toContainText(ticket.ticketCode);
      await dialog.getByRole('button', { name: '✕', exact: true }).click();
      if (ticket === tickets[0]) {
        await page.getByRole('button', { name: /^Notifications, / }).click();
        const allResponse = page.waitForResponse(r => r.url().endsWith('/customers/me/notifications/read-all') && r.request().method() === 'POST');
        await page.getByRole('button', { name: 'Mark all as read', exact: true }).click();
        const all = await allResponse; expect(all.status()).toBe(200);
        expect(Object.keys(await all.json()).sort()).toEqual(['count', 'success']);
        await page.getByRole('button', { name: /^Notifications, / }).click();
      }
    }
    expect(navigations).toHaveLength(1); expect(errors).toEqual([]);
  } finally {
    try { await context?.close(); } finally { expect(fixture('cleanup', runId)).toEqual({ users: 0, tickets: 0 }); }
  }
});

test('A3 real chat bell and both Web roles call common read with current session and CSRF', async ({ browser }) => {
  test.setTimeout(120000);
  const runId = randomUUID(); const contexts = [];
  try {
    const data = fixture('setup', runId);
    const customer = await contextFor(browser, data.customer); contexts.push(customer);
    const staff = await contextFor(browser, data.staff); contexts.push(staff);
    const direct = await post(customer, data.customer, 'customers/me/conversations',
      { kind: 'DIRECT', clientRequestId: randomUUID(), expectedAssignmentVersion: 0, subject: 'Synthetic bell chat' });
    const id = direct.conversation.id;
    await post(staff, data.staff, `staff/conversations/${id}/messages`,
      { clientMessageId: randomUUID(), expectedVersion: 0, content: 'Synthetic Staff bell message' });
    await expect.poll(async () => (await (await customer.request.get('/api/v1/customers/me/notifications')).json()).items
      .some(n => n.target.id === id && n.kind === 'STAFF_MESSAGE_UNREAD')).toBe(true);
    const page = await customer.newPage();
    page.setDefaultTimeout(15000);
    await page.goto('/customer');
    await page.getByRole('button', { name: /^Notifications, / }).click();
    const readResponse = page.waitForResponse(r => new URL(r.url()).pathname === `/api/v1/conversations/${id}/read`);
    await page.getByRole('button', { name: /Bạn có tin nhắn mới từ nhân viên hỗ trợ/ }).click();
    const read = await readResponse; expect(read.status()).toBe(200);
    expect(read.request().headers()['x-csrf-token']).toBe(data.customer.csrf);
    expect((await read.json()).success).toBe(true);
    await expect(page).toHaveURL(new RegExp('conversationId=' + id));
    await expect(page.getByRole('region', { name: 'Customer conversations', exact: true })).toContainText('Synthetic Staff bell message');
    await post(customer, data.customer, `customers/me/conversations/${id}/messages`,
      { clientMessageId: randomUUID(), expectedVersion: 0, content: 'Synthetic Customer bell reply' });
    const staffPage = await staff.newPage();
    const staffReadResponse = staffPage.waitForResponse(r => new URL(r.url()).pathname === `/api/v1/conversations/${id}/read`);
    await staffPage.goto('/staff/inbox/' + id);
    const staffRead = await staffReadResponse; expect(staffRead.status()).toBe(200);
    expect(staffRead.request().headers()['x-csrf-token']).toBe(data.staff.csrf);
    expect((await staffRead.json()).success).toBe(true);
    await expect(staffPage.getByRole('region', { name: 'Staff inbox', exact: true })).toContainText('Synthetic Customer bell reply');
  } finally {
    try { await Promise.all(contexts.map(context => context.close())); }
    finally { expect(fixture('cleanup', runId)).toEqual({ users: 0, tickets: 0 }); }
  }
});
