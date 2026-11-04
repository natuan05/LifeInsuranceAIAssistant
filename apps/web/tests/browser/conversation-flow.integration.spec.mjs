import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
function fixture(action, runId) {
  return JSON.parse(execFileSync('docker', ['compose', '--profile', 'tests', 'run', '--rm', '-T', '--no-deps', 'core-tests', 'node', 'test/support/browser-inbox-fixture.cjs'], { cwd: fileURLToPath(new URL('../../../../', import.meta.url)), input: JSON.stringify({ action, runId }), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 90000 }));
}
async function context(browser, actor) {
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: 'li_session', value: actor.token, domain: 'localhost', path: '/api/v1', httpOnly: true, sameSite: 'Lax' }, { name: 'li_csrf', value: actor.csrf, domain: 'localhost', path: '/api/v1', sameSite: 'Lax' }]);
  return ctx;
}
test('real Docker: Customer Direct, two-way send, AI consent, pending privacy and Staff Accept', async ({ browser }) => {
  test.setTimeout(180000);
  const runId = `i04-${randomUUID()}`; let customerContext, staffContext;
  try {
    const data = fixture('setup', runId);
    customerContext = await context(browser, data.customer); staffContext = await context(browser, data.staff);
    const customer = await customerContext.newPage(), staff = await staffContext.newPage();
    const documents = []; customer.on('request', request => { if (request.isNavigationRequest() && request.frame() === customer.mainFrame()) documents.push(request.url()); });
    await customer.goto('/customer');
    await customer.getByRole('button', { name: 'Message Staff', exact: true }).click();
    await customer.getByRole('textbox', { name: 'Subject', exact: true }).fill('Synthetic Direct browser flow');
    await customer.getByRole('button', { name: 'Create conversation', exact: true }).click();
    await expect(customer.getByRole('form', { name: 'Message composer' })).toBeVisible();
    const directId = new URL(customer.url()).searchParams.get('conversationId'); expect(directId).toBeTruthy();
    await customer.getByRole('textbox', { name: 'Message', exact: true }).fill('Synthetic browser Customer to Staff');
    await customer.getByRole('textbox', { name: 'Message', exact: true }).press('Enter');
    await expect(customer.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('');
    await staff.goto(`/staff/inbox/${directId}`);
    await expect(staff.getByRole('region', { name: 'Conversation messages', exact: true }).getByText('Synthetic browser Customer to Staff', { exact: true })).toBeVisible();
    await staff.getByRole('textbox', { name: 'Message', exact: true }).fill('Synthetic browser Staff reply');
    await staff.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(staff.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('');
    await customer.evaluate(() => window.dispatchEvent(new Event('core:chat-changed')));
    await expect(customer.getByRole('region', { name: 'Conversation messages', exact: true }).getByText('Synthetic browser Staff reply', { exact: true })).toBeVisible();
    expect(documents).toHaveLength(1);
    await customer.goto(`/customer?conversationId=${data.privateId}`);
    await customer.getByRole('textbox', { name: 'Message', exact: true }).fill('Synthetic pre-consent private message');
    await customer.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(customer.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('');
    await customer.getByRole('button', { name: 'Request Staff support', exact: true }).click();
    await expect(customer.getByRole('dialog')).toContainText('entire Customer-visible history');
    await customer.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(customer.getByRole('button', { name: 'Request Staff support', exact: true })).toBeFocused();
    await customer.getByRole('button', { name: 'Request Staff support', exact: true }).click();
    await customer.getByRole('button', { name: 'Agree and request Staff support', exact: true }).click();
    await expect(customer.getByText('Awaiting Staff acceptance. You can continue writing here.', { exact: true })).toBeVisible();
    const reads = []; staff.on('request', request => { if (new URL(request.url()).pathname.endsWith('/messages')) reads.push(request.method()); });
    await staff.goto(`/staff/inbox/${data.privateId}?filter=requests`);
    await expect(staff.getByRole('button', { name: 'Accept request', exact: true })).toBeVisible();
    expect(reads).toHaveLength(0);
    await staff.getByRole('button', { name: 'Accept request', exact: true }).click();
    await expect(staff.getByRole('region', { name: 'Conversation messages', exact: true }).getByText('Synthetic pre-consent private message', { exact: true })).toBeVisible();
    await staff.getByRole('textbox', { name: 'Message', exact: true }).fill('Synthetic accepted Staff reply');
    await staff.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(staff.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('');
    await customer.getByRole('button', { name: 'Refresh conversations', exact: true }).click();
    await customer.evaluate(() => window.dispatchEvent(new Event('core:chat-changed')));
    await expect(customer.getByRole('region', { name: 'Conversation messages', exact: true }).getByText('Synthetic accepted Staff reply', { exact: true })).toBeVisible();
  } finally { await customerContext?.close(); await staffContext?.close(); fixture('cleanup', runId); }
});
