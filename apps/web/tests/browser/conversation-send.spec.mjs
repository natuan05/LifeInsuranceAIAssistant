import { test, expect } from '@playwright/test';
const row = { id: 'one', subject: 'Synthetic send', status: 'STAFF_ACTIVE', entryType: 'DIRECT', customer: { id: 'customer', fullName: 'Synthetic Customer', accountCode: 'CUS-SEND' }, controlVersion: 0, allowedActions: { readMessages: true, send: true, accept: false } };
const chat = (body, sequence = '1') => ({ id: `message-${sequence}`, sequence, clientMessageId: body.clientMessageId, senderType: 'STAFF', sender: { displayName: 'Synthetic Staff' }, content: body.content, createdAt: '2026-11-04T00:00:00Z', citations: [] });
async function setup(page, options = {}) {
  const state = { posts: [], messages: [], documents: [], pending: null, ...options };
  await page.routeWebSocket('**/api/v1/realtime', () => {});
  page.on('request', request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) state.documents.push(request.url()); });
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()); const json = (body, status = 200) => route.fulfill({ json: body, status });
    if (url.pathname.endsWith('/auth/me')) return json({ actor: { id: 'synthetic-send-staff', fullName: 'Synthetic Staff', accountCode: 'STF-SEND', role: 'STAFF', email: 'staff@synthetic.invalid', passwordChangeRecommended: false }, csrfToken: 'synthetic-csrf' });
    if (url.pathname.includes('/by-client-id/')) {
      const found = state.messages.find(message => message.clientMessageId === url.pathname.split('/').at(-1));
      return found ? json({ message: found, controlVersion: 0 }) : json({ code: 'NOT_FOUND' }, 404);
    }
    if (url.pathname.endsWith('/messages') && request.method() === 'POST') {
      const body = request.postDataJSON(); state.posts.push(body);
      if (state.delay) await new Promise(resolve => { state.pending = resolve; });
      if (state.failure) return json({ code: 'STALE_CONVERSATION' }, state.failure);
      const existing = state.messages.find(message => message.clientMessageId === body.clientMessageId);
      const message = existing ?? chat(body, String(state.messages.length + 1));
      if (!existing && state.network !== 'uncommitted') state.messages.push(message);
      if (state.network) { state.network = false; return route.abort('failed'); }
      if (!existing && !state.messages.includes(message)) state.messages.push(message);
      return json({ message, controlVersion: 0, replayed: Boolean(existing) }, existing ? 200 : 201);
    }
    if (url.pathname.endsWith('/messages')) return json({ items: state.messages, pageInfo: { beforeCursor: null, afterCursor: 'latest', hasMoreBefore: false, hasMoreAfter: false } });
    if (/\/staff\/conversations\/[^/]+$/.test(url.pathname)) return json({ conversation: { ...row, id: url.pathname.split('/').at(-1) } });
    if (url.pathname.endsWith('/inbox/customers')) return json({ items: [{ customer: row.customer }], pageInfo: { hasMore: false, nextCursor: null } });
    if (url.pathname.endsWith('/conversations')) return json({ items: [row, { ...row, id: 'two', subject: 'Synthetic second' }], pageInfo: { hasMore: false, nextCursor: null } });
    return json({ items: [], total: 0 });
  });
  await page.goto('/staff/inbox/one'); await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
  return state;
}
const input = page => page.getByRole('textbox', { name: 'Message', exact: true });
test('Enter sends, Shift Enter preserves newline, blank/oversize do not send and focus stays', async ({ page }) => {
  const state = await setup(page);
  await input(page).fill('first'); await input(page).press('Shift+Enter'); await input(page).press('x');
  expect(state.posts).toHaveLength(0);
  await input(page).press('Enter'); await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled(); await expect(page.getByText('Message saved.', { exact: true })).toHaveCount(0);
  expect(state.posts[0].content).toBe('first\nx'); await expect(input(page)).toBeFocused();
  await input(page).press('Enter'); await expect(page.getByRole('form', { name: 'Message composer' }).getByRole('alert')).toContainText('1–4000');
  await input(page).fill('a'.repeat(4001)); await input(page).press('Enter'); expect(state.posts).toHaveLength(1);
  await input(page).fill('Refresh draft'); await page.evaluate(() => window.dispatchEvent(new Event('core:chat-changed'))); await expect(input(page)).toHaveValue('Refresh draft');
  expect(state.documents).toHaveLength(1);
});
test('IME does not submit before composition ends', async ({ page }) => {
  const state = await setup(page);
  await input(page).dispatchEvent('compositionstart'); await input(page).fill('Synthetic composed'); await input(page).press('Enter');
  expect(state.posts).toHaveLength(0); await input(page).dispatchEvent('compositionend'); await input(page).press('Enter');
  await expect.poll(() => state.posts.length).toBe(1);
});
test('pending send deduplicates clicks and preserves a newer draft after ACK', async ({ page }) => {
  const state = await setup(page, { delay: true }); await input(page).fill('Original snapshot'); await input(page).press('Enter');
  await expect.poll(() => Boolean(state.pending)).toBe(true); await input(page).fill('New unsent draft'); await input(page).press('Enter');
  expect(state.posts).toHaveLength(1); state.delay = false; state.pending();
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled(); await expect(page.getByText('Message saved.', { exact: true })).toHaveCount(0); await expect(input(page)).toHaveValue('New unsent draft');
});
for (const outcome of ['committed', 'uncommitted']) test(`lost ACK ${outcome}: reconcile/replay produces one bubble and one intent`, async ({ page }) => {
  const state = await setup(page, { network: outcome }); await input(page).fill('Synthetic lost ACK'); await input(page).press('Enter');
  await expect(page.getByRole('button', { name: 'Check message result', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Check message result', exact: true }).click(); await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled(); await expect(page.getByText('Message saved.', { exact: true })).toHaveCount(0);
  expect(state.messages).toHaveLength(1);
  if (outcome === 'uncommitted') { expect(state.posts).toHaveLength(2); expect(state.posts[1]).toEqual(state.posts[0]); }
  await expect(page.getByRole('region', { name: 'Conversation messages', exact: true }).getByText('Synthetic lost ACK', { exact: true })).toHaveCount(1);
  await page.evaluate(() => window.dispatchEvent(new Event('core:chat-changed')));
  await expect(page.getByRole('region', { name: 'Conversation messages', exact: true }).getByText('Synthetic lost ACK', { exact: true })).toHaveCount(1);
});
test('403 removes private composer and transcript', async ({ page }) => {
  await setup(page, { failure: 403 }); await input(page).fill('Synthetic denied'); await input(page).press('Enter');
  await expect(input(page)).toHaveCount(0); await expect(page.getByRole('region', { name: 'Conversation messages', exact: true })).toHaveCount(0);
});
test('409 revalidates metadata and keeps the draft for explicit retry', async ({ page }) => {
  const state = await setup(page, { failure: 409 }); await input(page).fill('Synthetic stale'); await input(page).press('Enter');
  await expect(input(page)).toHaveValue('Synthetic stale'); state.failure = null;
  await input(page).press('Enter'); await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled(); await expect(page.getByText('Message saved.', { exact: true })).toHaveCount(0);
  expect(state.posts).toHaveLength(2); expect(state.posts[0].clientMessageId).not.toBe(state.posts[1].clientMessageId);
});
test('HTML is plain text and navigation keeps per-conversation draft', async ({ page }) => {
  await setup(page); await input(page).fill('<b>Synthetic draft</b>');
  await page.getByRole('link', { name: /Synthetic second/ }).click(); await expect(page).toHaveURL(/inbox\/two/); await expect(page.locator('#compose-two')).toBeVisible(); await input(page).fill('Second draft');
  await page.goBack(); await expect(input(page)).toHaveValue('<b>Synthetic draft</b>');
  await input(page).press('Enter'); await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled(); await expect(page.getByText('Message saved.', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Conversation messages', exact: true }).locator('b')).toHaveCount(0);
});
