import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
const crypto = { randomUUID };
const row = { id: 'one', subject: 'Synthetic send', status: 'STAFF_ACTIVE', entryType: 'DIRECT', customer: { id: 'customer', fullName: 'Synthetic Customer', accountCode: 'CUS-SEND' }, controlVersion: 0, allowedActions: { readMessages: true, send: true, accept: false } };
const chat = (body, sequence = '1') => ({ id: `message-${sequence}`, sequence, clientMessageId: body.clientMessageId, senderType: 'STAFF', sender: { displayName: 'Synthetic Staff' }, content: body.content, createdAt: '2026-11-04T00:00:00Z', citations: [] });
async function setup(page, options = {}) {
  const state = { posts: [], messages: [], documents: [], pending: null, sockets: [], requests: [], ...options };
  await page.routeWebSocket('**/api/v1/realtime', socket => state.sockets.push(socket));
  page.on('request', request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) state.documents.push(request.url()); });
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()); state.requests.push(url.pathname); const json = (body, status = 200) => route.fulfill({ json: body, status });
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
    if (state.denied && /\/staff\/conversations\/[^/]+$/.test(url.pathname)) return json({ code: 'NOT_FOUND' }, 404);
    if (/\/staff\/conversations\/[^/]+$/.test(url.pathname)) return json({ conversation: { ...row, id: url.pathname.split('/').at(-1) } });
    if (url.pathname.endsWith('/inbox/customers')) return json({ items: [{ customer: row.customer }], pageInfo: { hasMore: false, nextCursor: null } });
    if (url.pathname.endsWith('/conversations')) return json({ items: [row, { ...row, id: 'two', subject: 'Synthetic second' }], pageInfo: { hasMore: false, nextCursor: null } });
    return json({ items: [], total: 0 });
  });
  await page.goto('/staff/inbox/one'); await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
  return state;
}
const input = page => page.getByRole('textbox', { name: 'Message', exact: true });

const emit = (state, type = 'chat-invalidated', eventId = crypto.randomUUID()) => state.sockets.at(-1).send(JSON.stringify({ type, eventId, ...(type === 'chat-invalidated' ? { conversationId: '20000000-0000-4000-8000-000000000001' } : {}) }));
const transcript = page => page.getByRole('region', { name: 'Conversation messages', exact: true });
test('socket messages refresh transcript once per burst, no auth spam, draft/focus/document preserved', async ({ page }) => {
  const state = await setup(page); await expect(transcript(page).getByText('No messages yet.', { exact: true })).toBeVisible();
  await input(page).fill('Unsent live draft'); await input(page).focus();
  const auth = state.requests.filter(path => path.endsWith('/auth/me')).length;
  state.messages.push(chat({ clientMessageId: crypto.randomUUID(), content: 'Synthetic realtime inbound' }));
  const key = crypto.randomUUID(); for (let i = 0; i < 20; i++) emit(state, 'chat-invalidated', key);
  await expect(transcript(page).getByText('Synthetic realtime inbound', { exact: true })).toBeVisible();
  await expect(input(page)).toHaveValue('Unsent live draft'); await expect(input(page)).toBeFocused();
  expect(state.requests.filter(path => path.endsWith('/auth/me'))).toHaveLength(auth); expect(state.documents).toHaveLength(1);
  await expect(transcript(page).locator('[data-message-id]')).toHaveCount(1);
});
test('scope invalidation clears private transcript/composer and does not use stale history as authority', async ({ page }) => {
  const state = await setup(page); await expect(input(page)).toBeVisible(); await input(page).fill('Private draft');
  state.denied = true; emit(state, 'chat-scope-invalidated');
  await expect(input(page)).toHaveCount(0); await expect(transcript(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retry inbox', exact: true })).toBeVisible();
  state.denied = false; await page.getByRole('button', { name: 'Retry inbox', exact: true }).click();
  await expect(input(page)).toHaveValue('');
});
test('reconnect ready and tab resume resync without document navigation or forced auth per message', async ({ page }) => {
  const state = await setup(page); await expect(input(page)).toBeVisible();
  state.sockets.at(-1).close({ code: 1012, reason: 'Synthetic disconnect' });
  await expect(page.getByText(/Reconnecting live updates/)).toBeVisible();
  state.messages.push(chat({ clientMessageId: crypto.randomUUID(), content: 'Synthetic while disconnected' }));
  await expect.poll(() => state.sockets.length).toBeGreaterThan(1);
  state.sockets.at(-1).send(JSON.stringify({ type: 'ready' }));
  await expect(transcript(page).getByText('Synthetic while disconnected', { exact: true })).toBeVisible();
  await expect(page.getByText(/Reconnecting live updates/)).toHaveCount(0); expect(state.documents).toHaveLength(1);
});
test('notification read routes to request, preserves CSRF and has no Inbox count', async ({ page }) => {
  const state = await setup(page); const reads = [];
  await page.route('**/api/v1/staff/notifications**', route => route.fulfill({ json: { items: [{ id: 'synthetic-notification', title: 'Staff support requested', kind: 'HANDOFF_REQUESTED', isRead: false, createdAt: '2026-11-04T00:00:00Z', target: { type: 'CONVERSATION', id: 'two' } }], pageInfo: { hasMore: false, nextCursor: null } } }));
  await page.route('**/api/v1/staff/notifications/*/read', route => { reads.push(route.request()); return route.fulfill({ json: { id: 'synthetic-notification', isRead: true } }); });
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  await page.getByRole('region', { name: 'Staff notifications', exact: true }).getByRole('button', { name: /Staff support requested/ }).click();
  await expect(page).toHaveURL(/inbox\/two\?filter=requests/); expect(reads).toHaveLength(1);
  expect(reads[0].headers()['x-csrf-token']).toBe('synthetic-csrf'); expect(reads[0].postDataJSON()).toEqual({}); expect(state.documents).toHaveLength(1);
});
test('new message while reading earlier content preserves anchor and offers Jump to latest', async ({ page }) => {
  const state = await setup(page, { messages: Array.from({ length: 35 }, (_, i) => chat({ clientMessageId: crypto.randomUUID(), content: `Synthetic old ${i}` }, String(i + 1))) });
  await expect(transcript(page).locator('[data-message-id]')).toHaveCount(35);
  const anchor = transcript(page).getByText('Synthetic old 10', { exact: true }); await anchor.scrollIntoViewIfNeeded(); const before = await anchor.boundingBox();
  state.messages.push(chat({ clientMessageId: crypto.randomUUID(), content: 'Synthetic new while reading' }, '36')); emit(state);
  await expect(transcript(page).locator('[data-message-id]')).toHaveCount(36);
  expect(Math.abs((await anchor.boundingBox()).y - before.y)).toBeLessThan(5); await expect(page.getByRole('button', { name: 'Jump to latest', exact: true })).toBeVisible();
});

test('event received during metadata refresh schedules another resync instead of losing the last update', async ({ page }) => {
  const state = await setup(page); await expect(transcript(page).getByText('No messages yet.', { exact: true })).toBeVisible();
  let release; const blocked = new Promise(resolve => { release = resolve; }); let calls = 0;
  await page.route('**/api/v1/staff/conversations/one', async route => { calls++; if (calls === 1) await blocked; return route.fulfill({ json: { conversation: row } }); });
  try {
    emit(state); await expect.poll(() => calls).toBe(1);
    state.messages.push(chat({ clientMessageId: crypto.randomUUID(), content: 'Synthetic final dirty update' })); emit(state);
    release(); await expect.poll(() => calls).toBeGreaterThanOrEqual(2);
    await expect(transcript(page).getByText('Synthetic final dirty update', { exact: true })).toBeVisible();
  } finally { release(); }
});
test('scope revoke aborts an old in-flight response and never restores its private state', async ({ page }) => {
  const state = await setup(page); await expect(transcript(page).getByText('No messages yet.', { exact: true })).toBeVisible();
  let release; const blocked = new Promise(resolve => { release = resolve; }); let calls = 0;
  await page.route('**/api/v1/staff/conversations/one', async route => { calls++; if (calls === 1) { await blocked; return route.fulfill({ json: { conversation: row } }); } return route.fulfill({ status: 404, json: { code: 'NOT_FOUND' } }); });
  try {
    emit(state); await expect.poll(() => calls).toBe(1); emit(state, 'chat-scope-invalidated');
    await expect(input(page)).toHaveCount(0); release();
    await expect(page.getByRole('button', { name: 'Retry inbox', exact: true })).toBeVisible();
    await expect(input(page)).toHaveCount(0); await expect(transcript(page)).toHaveCount(0);
  } finally { release(); }
});
