import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
function fixture(action, runId, extra = {}) {
  return JSON.parse(execFileSync('docker', ['compose', '--profile', 'tests', 'run', '--rm', '-T', '--no-deps', 'core-tests', 'node', 'test/support/browser-inbox-fixture.cjs'], { cwd: fileURLToPath(new URL('../../../../', import.meta.url)), input: JSON.stringify({ action, runId, ...extra }), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 90000 }));
}
async function context(browser, actor) {
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: 'li_session', value: actor.token, domain: 'localhost', path: '/api/v1', httpOnly: true, sameSite: 'Lax' }, { name: 'li_csrf', value: actor.csrf, domain: 'localhost', path: '/api/v1', sameSite: 'Lax' }]);
  return ctx;
}

test('I06 real gateway: notification, Accept SYSTEM and two-way messages arrive without Refresh, reconnect catches 130, revoke clears', async ({ browser }) => {
  test.setTimeout(180000);
  const runId = `i04-${randomUUID()}`; let customerContext, staffContext;
  try {
    const data = fixture('setup', runId);
    customerContext = await context(browser, data.customer); staffContext = await context(browser, data.staff);
    await customerContext.addInitScript(() => { const NativeSocket = window.WebSocket; window.__chatSockets = []; window.WebSocket = class extends NativeSocket { constructor(...args) { super(...args); window.__chatSockets.push(this); } }; });
    const customer = await customerContext.newPage(), staff = await staffContext.newPage();
    const documents = [], auth = [];
    for (const page of [customer, staff]) page.on('request', request => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents.push(request.url());
      if (new URL(request.url()).pathname === '/api/v1/auth/me') auth.push(request.url());
    });
    await customer.goto(`/customer?conversationId=${data.conversationId}`);
    await staff.goto('/staff/inbox?filter=requests');
    await staff.getByRole('button', { name: 'Notifications', exact: true }).click();
    await expect(staff.getByRole('region', { name: 'Staff notifications', exact: true }).getByRole('button', { name: /Staff support requested/ })).toBeVisible({ timeout: 15000 });
    await staff.getByRole('region', { name: 'Staff notifications', exact: true }).getByRole('button', { name: /Staff support requested/ }).click();
    await expect(staff.getByRole('button', { name: 'Accept request', exact: true })).toBeVisible();
    await expect(staff.getByRole('region', { name: 'Conversation messages', exact: true })).toHaveCount(0);
    await staff.getByRole('button', { name: 'Accept request', exact: true }).click();
    const systemText = 'Staff Synthetic I04 Staff has accepted your request and will respond as soon as possible.';
    await expect(customer.getByRole('region', { name: 'Conversation messages', exact: true }).getByText(systemText, { exact: true })).toBeAttached({ timeout: 15000 });
    await expect(staff.getByRole('region', { name: 'Conversation messages', exact: true }).getByText(systemText, { exact: true })).toBeAttached();
    await customer.evaluate(() => { window.__i06Sentinel = 'same-document'; });
    await staff.evaluate(() => { window.__i06Sentinel = 'same-document'; });
    const initialAuth = auth.length;
    await customer.getByRole('textbox', { name: 'Message', exact: true }).fill('Synthetic retained Customer draft');
    await staff.getByRole('textbox', { name: 'Message', exact: true }).fill('Synthetic automatic Staff reply');
    await staff.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(customer.getByRole('region', { name: 'Conversation messages', exact: true }).getByText('Synthetic automatic Staff reply', { exact: true })).toBeAttached({ timeout: 15000 });
    await expect(customer.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('Synthetic retained Customer draft');
    await customer.getByRole('textbox', { name: 'Message', exact: true }).fill('Synthetic automatic Customer reply');
    await customer.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(staff.getByRole('region', { name: 'Conversation messages', exact: true }).getByText('Synthetic automatic Customer reply', { exact: true })).toBeAttached({ timeout: 15000 });
    expect(auth.length).toBe(initialAuth);
    await customerContext.setOffline(true);
    await customer.evaluate(() => { for (const socket of window.__chatSockets) socket.close(3001, 'Synthetic reconnect test'); });
    await expect(customer.getByText(/Reconnecting live updates/)).toBeVisible();
    fixture('append', runId, { conversationId: data.conversationId, count: 130 });
    await customerContext.setOffline(false);
    const transcript = customer.getByRole('region', { name: 'Conversation messages', exact: true });
    await expect(transcript.getByText('Synthetic reconnect backlog 129', { exact: true })).toBeAttached({ timeout: 20000 });
    await expect(transcript.getByText('Synthetic reconnect backlog 0', { exact: true })).toBeAttached();
    await expect(transcript.getByText(/^Synthetic reconnect backlog /)).toHaveCount(130);
    await expect(transcript.getByText(systemText, { exact: true })).toHaveCount(1);
    const sequence = await transcript.locator('[data-sequence]').evaluateAll(nodes => nodes.map(node => node.dataset.sequence));
    expect(sequence.every((value, index) => !index || BigInt(value) > BigInt(sequence[index - 1]))).toBe(true);
    expect(documents).toHaveLength(2);
    expect(await customer.evaluate(() => window.__i06Sentinel)).toBe('same-document');
    expect(await staff.evaluate(() => window.__i06Sentinel)).toBe('same-document');
    fixture('reassign', runId, { conversationId: data.conversationId, staffId: data.other.id });
    await expect(staff.getByRole('region', { name: 'Conversation messages', exact: true })).toHaveCount(0, { timeout: 15000 });
    await expect(staff.getByRole('form', { name: 'Message composer' })).toHaveCount(0);
    await expect(customer.getByRole('form', { name: 'Message composer' })).toHaveCount(0, { timeout: 15000 });
  } finally { await customerContext?.close(); await staffContext?.close(); fixture('cleanup', runId); }
});
