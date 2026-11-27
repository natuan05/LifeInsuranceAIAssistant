import { test, expect } from '@playwright/test';

const customer = { id: 'customer-one', fullName: 'Synthetic Inbox Customer', accountCode: 'CUS-INBOX-01' };
const second = { id: 'customer-two', fullName: 'Synthetic Second Customer', accountCode: 'CUS-INBOX-02' };
const conversation = (id, active = false) => ({ id, subject: `Synthetic topic ${id}`, status: active ? 'STAFF_ACTIVE' : 'PENDING_HANDOFF', entryType: active ? 'DIRECT' : 'REQUEST', activityAt: '2026-11-04T01:00:00Z', customer, controlVersion: active ? 2 : 1, request: { id: 'request-one', sharedReason: 'Synthetic help request', requestedAt: '2026-11-04T01:00:00Z' }, allowedActions: { canView: true, canAccept: !active, canTakeover: false, canSend: active } });
const message = index => ({ id: `message-${index}`, sequence: (9007199254740992n + BigInt(index)).toString(), senderType: index % 2 ? 'CUSTOMER' : 'AI_AGENT', sender: { displayName: 'Synthetic customer' }, content: `Synthetic message ${index} with enough text to verify scrolling and history.`, createdAt: '2026-11-04T01:00:00Z', citations: [] });
async function setup(page, path = '/staff/inbox', options = {}) {
  const state = { active: false, requests: [], documents: [], accepts: [], failAccept: false, committed: false, denied: false, searchDelay: false, ...options };
  await page.routeWebSocket('**/api/v1/realtime', () => {});
  page.on('request', request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) state.documents.push(request.url()); });
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()); state.requests.push(url);
    const json = (body, status = 200) => route.fulfill({ status, json: body });
    if (url.pathname.endsWith('/auth/me') && state.expired) return json({ code: 'UNAUTHORIZED' }, 401);
    if (url.pathname.endsWith('/auth/me')) return json({ actor: { id: 'staff-inbox-test', accountCode: 'STF-INBOX', fullName: 'Synthetic Staff', role: 'STAFF', email: 'staff.inbox@synthetic.invalid', passwordChangeRecommended: false }, csrfToken: 'synthetic-csrf' });
    if (url.pathname.endsWith('/copilot/messages') && state.copilot) {
      const intent = request.postDataJSON();
      state.copilot.sends.push(intent);
      if (state.copilot.holdFirst && state.copilot.sends.length === 1) {
        await new Promise(resolve => { state.copilot.releaseFirst = resolve; });
        return route.abort('failed').catch(() => {});
      }
      state.copilot.turn = { id: 'copilot-run', status: 'RUNNING', question: { id: 'question', ...intent }, answer: null, sourceThroughSequence: '9' };
      return json({ id: 'copilot-run', status: 'RUNNING', replayed: false }, 201);
    }
    if (url.pathname.endsWith('/copilot') && state.copilot) {
      if (state.copilot.revoked) return json({ code: 'NOT_FOUND' }, 404);
      if (state.copilot.readUnavailable) return json({ code: 'UNAVAILABLE' }, 503);
      if (state.copilot.holdRead) await state.copilot.holdRead;
      const turn = state.copilot.turn;
      return json({ items: turn ? [turn] : [], beforeCursor: null,
        activeRun: turn?.status === 'RUNNING' ? { id: turn.id, status: turn.status } : null }).catch(() => {});
    }
    if (url.pathname.endsWith('/documents/copilot-doc/versions/copilot-v1/view')) {
      return json({ url: new URL('/synthetic-copilot-source.pdf', request.url()).href });
    }
    if (url.pathname.includes('/commands/')) return state.committed ? json({ state: 'COMMITTED', conversationId: 'one', resourceId: 'one', controlVersion: 2 }) : json({ code: 'NOT_FOUND' }, 404);
    if (url.pathname.endsWith('/accept')) {
      state.accepts.push({ body: request.postDataJSON(), csrf: request.headers()['x-csrf-token'] });
      if (state.acceptFailure) return json({ code: 'FORBIDDEN' }, state.acceptFailure);
      if (state.failAccept === 'uncommitted') return route.abort('failed');
      state.active = true; state.committed = true;
      if (state.failAccept) return route.abort('failed');
      if (state.conflict) { state.active = false; return json({ code: 'STALE_CONVERSATION' }, 409); }
      return json({ conversation: conversation('one', true), replayed: false });
    }
    if (url.pathname.endsWith('/read-state')) return state.denied ? json({ code: 'NOT_FOUND' }, 404)
      : state.receiptFailure ? json({ code: 'UNAVAILABLE' }, state.receiptFailure) : json({ readThroughSequence: state.readThroughSequence ?? '0' });
    if (url.pathname.endsWith('/messages')) {
      if (state.denied) return json({ code: 'NOT_FOUND' }, 404);
      if (state.historySize) {
        const before = url.searchParams.get('before'), after = url.searchParams.get('after');
        const from = after ? Number(after) + 1 : before ? Math.max(1, Number(before) - 50) : Math.max(1, state.historySize - 49);
        const through = after ? Math.min(state.historySize, from + 49) : before ? Number(before) - 1 : state.historySize;
        return json({ items: Array.from({ length: Math.max(0, through - from + 1) }, (_, index) => ({ ...message(from + index), senderType: 'STAFF' })),
          pageInfo: { beforeCursor: String(from), afterCursor: String(Math.max(Number(after ?? 0), through)), hasMoreBefore: from > 1, hasMoreAfter: through < state.historySize } });
      }
      const before = url.searchParams.has('before'), after = url.searchParams.has('after');
      return json({ items: after ? [message(101), message(100)] : Array.from({ length: 50 }, (_, index) => message(index + (before ? 1 : state.appended ? 52 : 51))), pageInfo: { beforeCursor: before ? null : 'older', afterCursor: after ? 'newer' : 'latest', hasMoreBefore: !before, hasMoreAfter: false } });
    }
    if (/\/staff\/conversations\/[^/]+$/.test(url.pathname) && state.detailFailure === 401) state.expired = true;
    if (/\/staff\/conversations\/[^/]+$/.test(url.pathname)) return state.detailFailure ? json({ code: 'UNAVAILABLE' }, state.detailFailure) : state.denied ? json({ code: 'NOT_FOUND' }, 404) : json({ conversation: conversation(url.pathname.split('/').at(-1), state.active) });
    if (url.pathname.endsWith('/conversations')) return json({ items: [conversation(url.pathname.includes(second.id) ? 'two' : 'one', state.active)], pageInfo: { hasMore: false, nextCursor: null } });
    if (url.pathname.endsWith('/inbox/customers')) {
      const search = url.searchParams.get('search') ?? '';
      if (state.searchDelay && search === 'old') await new Promise(resolve => setTimeout(resolve, 700));
      const items = [customer, second].filter(item => `${item.fullName} ${item.accountCode}`.toLowerCase().includes(search.toLowerCase()));
      return json({ items: items.map(customer => ({ customer, lastActivityAt: '2026-11-04T01:00:00Z' })), pageInfo: { hasMore: false, nextCursor: null } });
    }
    return json({ items: [], total: 0, page: 1, pageSize: 10 });
  });
  await page.goto(path);
  await expect(page.getByRole('region', { name: 'Staff inbox', exact: true })).toBeVisible();
  await page.evaluate(() => { window.__inboxSentinel = 'alive'; });
  return state;
}
const search = page => page.getByRole('searchbox', { name: 'Search customers', exact: true });
const messages = page => page.getByRole('region', { name: 'Conversation messages', exact: true });

test('Copilot receives its own update, keeps the next draft and clears revoked content', async ({ page }) => {
  const state = await setup(page, '/staff/inbox/one', { active: true, copilot: { sends: [] } });
  const trigger = page.getByRole('button', { name: 'AI Copilot', exact: true });
  await trigger.click();
  const panel = page.getByRole('complementary', { name: 'AI Copilot', exact: true });
  const draft = panel.getByRole('textbox', { name: 'Ask Copilot' });
  const send = panel.getByRole('button', { name: 'Send', exact: true });
  await draft.fill('Synthetic Copilot question');
  await expect(send).toBeEnabled();
  await send.click();
  await expect(panel.getByRole('status')).toHaveText('Working on your question…');
  await draft.fill('Synthetic next question');
  await draft.press('Enter');
  await expect(send).toBeDisabled();
  expect(state.copilot.sends).toHaveLength(1);
  state.copilot.turn = { ...state.copilot.turn, status: 'COMPLETED', answer: {
    id: 'answer', content: '**Synthetic internal answer**', citations: [],
  } };
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('core:copilot-changed', { detail: { conversationId: 'one' } })));
  await expect(panel.getByText('Synthetic internal answer')).toBeVisible();
  await expect(panel.locator('strong')).toHaveText('Synthetic internal answer');
  await expect(panel.getByRole('status')).toHaveCount(0);
  await expect(panel.getByText(/Chat through message/)).toHaveCount(0);
  await expect(messages(page).getByText('Synthetic internal answer')).toHaveCount(0);
  await expect(draft).toHaveValue('Synthetic next question');
  await expect(send).toBeEnabled();
  await draft.press('Escape');
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(draft).toHaveValue('Synthetic next question');
  state.copilot.revoked = true;
  await page.evaluate(() => window.dispatchEvent(new Event('core:chat-scope-changed')));
  await expect(panel.getByText('Synthetic internal answer')).toHaveCount(0);
  await expect(panel.getByText('Copilot is unavailable for this conversation.')).toBeVisible();
  expect(state.documents).toHaveLength(1);
});

test('Copilot pane is resizable by dragging and keyboard', async ({ page }) => {
  await setup(page, '/staff/inbox/one', { active: true, copilot: { sends: [] } });
  await page.getByRole('button', { name: 'AI Copilot', exact: true }).click();
  const handle = page.getByRole('separator', { name: 'Resize Copilot panel' });
  const panel = page.getByRole('complementary', { name: 'AI Copilot', exact: true });
  await expect(handle).toHaveAttribute('aria-valuenow', '35');
  const initialWidth = (await panel.boundingBox()).width;
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 120, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  expect(Number(await handle.getAttribute('aria-valuenow'))).toBeGreaterThan(35);
  expect((await panel.boundingBox()).width).toBeGreaterThan(initialWidth);
  await handle.press('Home');
  await expect(handle).toHaveAttribute('aria-valuenow', '25');
  const draft = await panel.getByRole('textbox', { name: 'Ask Copilot' }).boundingBox();
  const send = await panel.getByRole('button', { name: 'Send', exact: true }).boundingBox();
  expect(send.x).toBeGreaterThanOrEqual(draft.x + draft.width);
  expect(Math.abs(send.y + send.height - (draft.y + draft.height))).toBeLessThanOrEqual(1);
});

test('Staff can open and close Copilot at a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 680 });
  await setup(page, '/staff/inbox/one', { active: true, copilot: { sends: [] } });
  const trigger = page.getByRole('button', { name: 'Copilot', exact: true });
  await trigger.click();
  const panel = page.getByRole('complementary', { name: 'AI Copilot', exact: true });
  await expect(panel).toBeVisible();
  const bounds = await panel.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(375);
  const composer = await panel.locator('form').boundingBox();
  expect(Math.abs(composer.y + composer.height - (bounds.y + bounds.height))).toBeLessThanOrEqual(1);
  await trigger.click();
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('Copilot reconciles an active turn without any WebSocket event', async ({ page }) => {
  const state = await setup(page, '/staff/inbox/one', { active: true, copilot: { sends: [] } });
  await page.getByRole('button', { name: 'AI Copilot', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'AI Copilot', exact: true });
  const draft = panel.getByRole('textbox', { name: 'Ask Copilot' });
  const send = panel.getByRole('button', { name: 'Send', exact: true });
  await draft.fill('Synthetic question');
  await send.click();
  await expect(panel.getByText('Working on your question…')).toBeVisible();
  await draft.fill('Synthetic next draft');
  await expect(send).toBeDisabled();
  state.copilot.turn = { ...state.copilot.turn, status: 'COMPLETED', answer: {
    id: 'answer', content: 'Synthetic result after realtime stopped', citations: [],
  } };
  await expect(panel.getByText('Synthetic result after realtime stopped')).toBeVisible({ timeout: 10000 });
  await expect(draft).toHaveValue('Synthetic next draft');
  await expect(send).toBeEnabled();
});

test('Copilot rechecks access while idle and hides content if access cannot be verified', async ({ page }) => {
  const state = await setup(page, '/staff/inbox/one', { active: true, copilot: { sends: [], turn: {
    id: 'copilot-run', status: 'COMPLETED', question: { id: 'question', content: 'Synthetic internal question' },
    answer: { id: 'answer', content: 'Synthetic private answer', citations: [] },
  } } });
  await page.clock.install();
  await page.getByRole('button', { name: 'AI Copilot', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'AI Copilot', exact: true });
  const answer = panel.getByText('Synthetic private answer');
  const draft = panel.getByRole('textbox', { name: 'Ask Copilot' });
  await expect(answer).toBeVisible();
  await draft.fill('Synthetic unsent draft');
  state.copilot.readUnavailable = true;
  await page.clock.fastForward(10000);
  await expect(panel.getByText('Couldn’t load Copilot. Try again.')).toBeVisible();
  await expect(answer).toHaveCount(0);
  await expect(draft).toHaveValue('');
  await expect(draft).toBeDisabled();

  state.copilot.readUnavailable = false;
  await page.clock.fastForward(10000);
  await expect(answer).toBeVisible();
  await expect(draft).toHaveValue('Synthetic unsent draft');

  state.copilot.revoked = true;
  await page.clock.fastForward(10000);
  await expect(panel.getByText('Copilot is unavailable for this conversation.')).toBeVisible();
  await expect(answer).toHaveCount(0);
  await expect(draft).toHaveValue('');

  state.copilot.revoked = false;
  await panel.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(answer).toBeVisible();
  await expect(draft).toHaveValue('');
});

test('Copilot keeps Send disabled when realtime supersedes the read after ACK', async ({ page }) => {
  const state = await setup(page, '/staff/inbox/one', { active: true, copilot: { sends: [] } });
  await page.getByRole('button', { name: 'AI Copilot', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'AI Copilot', exact: true });
  const draft = panel.getByRole('textbox', { name: 'Ask Copilot' });
  const send = panel.locator('button[type=submit]');
  const reads = () => state.requests.filter(url => url.pathname.endsWith('/copilot')).length;
  await draft.fill('Synthetic first question');
  const initialReads = reads();
  let release;
  state.copilot.holdRead = new Promise(resolve => { release = resolve; });
  try {
    await send.click();
    await expect.poll(reads).toBe(initialReads + 1);
    await draft.fill('Synthetic second question');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('core:copilot-changed', { detail: { conversationId: 'one' } })));
    await expect.poll(reads).toBe(initialReads + 2);
    await expect(send).toHaveText('Send');
    await expect(send).toBeDisabled();
    await draft.press('Enter');
    expect(state.copilot.sends).toHaveLength(1);
    await expect(draft).toHaveValue('Synthetic second question');
  } finally {
    state.copilot.holdRead = null;
    release();
  }
  await expect(panel.getByText('Working on your question…')).toBeVisible();
  state.copilot.turn = { ...state.copilot.turn, status: 'COMPLETED', answer: {
    id: 'answer', content: 'Synthetic result', citations: [],
  } };
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('core:copilot-changed', { detail: { conversationId: 'one' } })));
  await expect(send).toBeEnabled();
});

test('Copilot retries an interrupted send for the same source after rechecking the grant', async ({ page }) => {
  const state = await setup(page, '/staff/inbox/one', { active: true, copilot: { sends: [], holdFirst: true } });
  await page.getByRole('button', { name: 'AI Copilot', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'AI Copilot', exact: true });
  const draft = panel.getByRole('textbox', { name: 'Ask Copilot' });
  await draft.fill('Synthetic interrupted question');
  await panel.getByRole('button', { name: 'Send', exact: true }).click();
  await expect.poll(() => Boolean(state.copilot.releaseFirst)).toBe(true);
  await draft.fill('Synthetic next draft');
  await page.evaluate(() => window.dispatchEvent(new Event('core:chat-scope-changed')));
  state.copilot.releaseFirst();

  const retry = panel.getByRole('button', { name: 'Retry delivery' });
  await expect(retry).toBeEnabled();
  await expect(draft).toHaveValue('Synthetic next draft');
  await retry.click();
  await expect(panel.getByText('Working on your question…')).toBeVisible();
  expect(state.copilot.sends).toEqual([state.copilot.sends[0], state.copilot.sends[0]]);
  expect(state.copilot.sends[0].content).toBe('Synthetic interrupted question');
  await expect(draft).toHaveValue('Synthetic next draft');

  state.copilot.revoked = true;
  await page.evaluate(() => window.dispatchEvent(new Event('core:chat-scope-changed')));
  await expect(panel.getByText('Copilot is unavailable for this conversation.')).toBeVisible();
  await expect(draft).toHaveValue('');
  await expect(retry).toHaveCount(0);
  state.copilot.revoked = false;
  await panel.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(draft).toBeEnabled();
  await expect(draft).toHaveValue('');
});

test('Copilot displays source locators and opens the exact PDF without using source pagination', async ({ page, context }) => {
  await context.route('**/synthetic-copilot-source.pdf', route => route.fulfill({ body: 'Synthetic PDF viewer' }));
  const citation = { documentId: 'copilot-doc', versionId: 'copilot-v1', label: 'Synthetic terms',
    sourceLocation: { pages: [28, 29], clause: '4.2', anchor: 'limitations' }, productId: 'copilot-product', policyId: null };
  const state = await setup(page, '/staff/inbox/one', { active: true, copilot: { sends: [], turn: {
    id: 'copilot-run', status: 'COMPLETED', question: { id: 'question', content: 'Synthetic question' },
    answer: { id: 'answer', content: 'Synthetic cited answer', citations: [citation] },
  } } });
  await page.getByRole('button', { name: 'AI Copilot', exact: true }).click();
  const source = page.getByRole('button', { name: 'Synthetic terms · Source p. 28, 29 · 4.2 · limitations' });
  const [popup] = await Promise.all([page.waitForEvent('popup'), source.click()]);
  await expect(popup).toHaveURL(/\/synthetic-copilot-source\.pdf$/);
  expect(state.requests.some(url => url.pathname.endsWith('/products/copilot-product/documents/copilot-doc/versions/copilot-v1/view'))).toBe(true);
  await popup.close();
});

test('A4 receipt resync stays bounded with 1000 loaded messages and catches up only new pages', async ({ page }) => {
  test.setTimeout(120000);
  const state = await setup(page, '/staff/inbox/one', { active: true, historySize: 1000 });
  const region = messages(page), rows = region.locator('[data-message-id]');
  await expect(rows).toHaveCount(50);
  for (let loaded = 100; loaded <= 1000; loaded += 50) {
    const button = region.getByRole('button', { name: 'Load earlier messages', exact: true });
    await expect(button).toBeEnabled(); await button.evaluate(b => b.click());
    await expect(rows).toHaveCount(loaded);
  }
  const oldest = region.locator('[data-message-id="message-1"]');
  await expect(oldest).toContainText('Đã gửi');
  const draft = page.getByRole('textbox', { name: 'Message', exact: true });
  await draft.fill('Synthetic retained draft');
  const count = suffix => state.requests.filter(u => u.pathname.endsWith(suffix)).length;
  const before = count('/messages'), receiptBefore = count('/read-state');
  state.readThroughSequence = (9007199254740992n + 1000n).toString();
  for (let index = 1; index <= 12; index++) {
    await page.evaluate(() => window.dispatchEvent(new Event('core:chat-changed')));
    await expect.poll(() => count('/read-state') - receiptBefore).toBe(index);
    await expect.poll(() => count('/messages') - before).toBe(index);
    await expect(region.getByText('Loading messages…', { exact: true })).toHaveCount(0);
  }
  await expect(oldest).toContainText('Đã xem'); await expect(rows).toHaveCount(1000);
  await expect(draft).toHaveValue('Synthetic retained draft');
  // A real backlog needs new pages, but none of the 20 loaded pages is fetched again.
  state.historySize = 1120;
  const appendBefore = count('/messages');
  await page.evaluate(() => window.dispatchEvent(new Event('core:chat-changed')));
  await expect(rows).toHaveCount(1120);
  expect(count('/messages') - appendBefore).toBe(3);
  const retryBefore = count('/read-state'); state.receiptFailure = 429;
  await page.evaluate(() => window.dispatchEvent(new Event('core:chat-changed')));
  await expect(region.getByRole('alert')).toContainText('Unable to refresh message read status');
  state.receiptFailure = false;
  await region.getByRole('button', { name: 'Retry messages', exact: true }).click();
  await expect(region.getByRole('alert')).toHaveCount(0);
  expect(count('/read-state') - retryBefore).toBe(2);
  await expect(rows).toHaveCount(1120);
  expect(state.documents).toHaveLength(1);
});

test('debounced search, Enter, empty search preserve document and focus', async ({ page }) => {
  const state = await setup(page);
  await search(page).fill('CUS-INBOX-01'); await search(page).press('Enter');
  await expect(page).toHaveURL(/search=CUS-INBOX-01/);
  await expect(page.getByRole('button', { name: /Synthetic Inbox Customer/ })).toBeVisible();
  await expect(search(page)).toBeFocused();
  await search(page).fill('');
  await expect(page).not.toHaveURL(/search=/);
  expect(state.documents).toHaveLength(1);
  expect(await page.evaluate(() => window.__inboxSentinel)).toBe('alive');
  await expect(page.getByRole('button', { name: 'Clear search', exact: true })).toHaveCount(0);
});
test('IME waits until composition ends and late search cannot replace current results', async ({ page }) => {
  await setup(page, '/staff/inbox', { searchDelay: true });
  await search(page).focus();
  await search(page).dispatchEvent('compositionstart', { data: '' });
  // fill() ends native composition in Firefox. Emit an actual composing input
  // instead, through the native setter so React observes the controlled value.
  await search(page).evaluate(input => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'old');
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'old', inputType: 'insertCompositionText', isComposing: true }));
  });
  await page.waitForTimeout(350); await expect(page).not.toHaveURL(/search=/);
  await search(page).dispatchEvent('compositionend'); await expect(page).toHaveURL(/search=old/);
  await search(page).fill('CUS-INBOX-02'); await search(page).press('Enter');
  await expect(page.getByRole('button', { name: /Synthetic Second Customer/ })).toBeVisible();
  await page.waitForTimeout(750);
  await expect(page.getByRole('button', { name: /Synthetic Second Customer/ })).toBeVisible();
});
test('accordion keyboard and multiple open groups load rows without transcripts', async ({ page }) => {
  const state = await setup(page);
  const one = page.getByRole('button', { name: /Synthetic Inbox Customer/ });
  await one.focus(); await one.press('Enter'); await expect(one).toHaveAttribute('aria-expanded', 'true');
  const two = page.getByRole('button', { name: /Synthetic Second Customer/ });
  await two.focus(); await two.press('Space'); await expect(two).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('link', { name: /Synthetic topic/ })).toHaveCount(2);
  expect(state.requests.filter(url => url.pathname.endsWith('/messages'))).toHaveLength(0);
});
test('pending deep link loads view-only history without marking read until Accept commits', async ({ page }) => {
  const state = await setup(page, '/staff/inbox/one?filter=requests');
  await expect(page.getByRole('button', { name: 'Accept request', exact: true })).toBeVisible();
  await expect(messages(page)).toBeVisible();
  expect(state.requests.filter(url => url.pathname.endsWith('/read'))).toHaveLength(0);
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Accept request', exact: true }).click();
  await expect(messages(page)).toBeVisible();
  expect(state.accepts).toHaveLength(1); expect(state.accepts[0].csrf).toBe('synthetic-csrf');
  expect(state.accepts[0].body.expectedVersion).toBe(1);
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible();
  await expect.poll(() => state.requests.filter(url => url.pathname.endsWith('/read')).length).toBeGreaterThan(0);
});
test('unknown Accept outcome reconciles committed receipt without another command', async ({ page }) => {
  const state = await setup(page, '/staff/inbox/one', { failAccept: true });
  await page.getByRole('button', { name: 'Accept request', exact: true }).click();
  await page.getByRole('button', { name: 'Check acceptance result', exact: true }).click();
  await expect(messages(page)).toBeVisible(); expect(state.accepts).toHaveLength(1);
  expect(state.requests.some(url => url.pathname.includes('/commands/'))).toBe(true);
});
test('conflicting Accept revalidates metadata and keeps view-only without marking read', async ({ page }) => {
  const state = await setup(page, '/staff/inbox/one', { conflict: true });
  await page.getByRole('button', { name: 'Accept request', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'has changed' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept request', exact: true })).toBeVisible();
  expect(state.requests.filter(url => url.pathname.endsWith('/read'))).toHaveLength(0);
});
test('history prepends in bigint order, preserves anchor and deduplicates refresh', async ({ page }) => {
  const state = await setup(page, '/staff/inbox/one', { active: true });
  await expect(messages(page).locator('[data-message-id]')).toHaveCount(50);
  const anchor = messages(page).locator('[data-message-id="message-75"]');
  await anchor.scrollIntoViewIfNeeded(); const before = await anchor.boundingBox();
  await page.getByRole('button', { name: 'Load earlier messages', exact: true }).evaluate(button => button.click());
  await expect(messages(page).locator('[data-message-id]')).toHaveCount(100);
  const after = await anchor.boundingBox(); expect(Math.abs(after.y - before.y)).toBeLessThan(5);
  const sequences = await messages(page).locator('[data-sequence]').evaluateAll(nodes => nodes.map(node => node.dataset.sequence));
  expect(sequences.every((sequence, index) => !index || BigInt(sequence) > BigInt(sequences[index - 1]))).toBe(true);
  state.appended = true;
  await page.evaluate(() => window.dispatchEvent(new Event('core:chat-changed')));
  await expect(messages(page).locator('[data-message-id]')).toHaveCount(101);
  await expect(page.getByRole('button', { name: 'Jump to latest', exact: true })).toBeVisible();
});
test('revoked transcript clears private messages and supports retry', async ({ page }) => {
  const state = await setup(page, '/staff/inbox/one', { active: true });
  await expect(messages(page).locator('[data-message-id]')).toHaveCount(50); await expect(page.getByRole('button', { name: 'Refresh messages', exact: true })).toHaveCount(0); state.denied = true;
  await page.evaluate(() => window.dispatchEvent(new Event('core:chat-changed')));
  await expect(messages(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retry inbox', exact: true })).toBeVisible();
  state.denied = false; await page.getByRole('button', { name: 'Retry inbox', exact: true }).click();
  await expect(messages(page)).toBeVisible();
});
test('desktop directory icon collapses and reopens; legacy filter normalizes without reload', async ({ page }) => {
  const state = await setup(page, '/staff/inbox/one?filter=recent', { active: true });
  await expect(page).toHaveURL(/filter=active/);
  await page.getByRole('button', { name: 'Collapse conversation directory', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Conversation directory' })).toBeHidden();
  await page.getByRole('button', { name: 'Expand conversation directory', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Conversation directory' })).toBeVisible();
  expect(state.documents).toHaveLength(1);
});
test('mobile list/chat navigation preserves query without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await setup(page, '/staff/inbox?search=CUS-INBOX-01', { active: true });
  await page.getByRole('button', { name: /Synthetic Inbox Customer/ }).click();
  await page.getByRole('link', { name: /Synthetic topic one/ }).click();
  await expect(messages(page)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Inbox list', exact: true }).click();
  await expect(search(page)).toHaveValue('CUS-INBOX-01'); expect(state.documents).toHaveLength(1);
});
test('Back and Forward keep query, accordion expansion and document', async ({ page }) => {
  const state = await setup(page);
  await page.getByRole('button', { name: /Synthetic Inbox Customer/ }).click();
  await search(page).fill('CUS-INBOX-01'); await search(page).press('Enter');
  await expect(page).toHaveURL(/search=CUS-INBOX-01/);
  await page.goBack(); await expect(search(page)).toHaveValue('');
  await expect(page.getByRole('button', { name: /Synthetic Inbox Customer/ })).toHaveAttribute('aria-expanded', 'true');
  await page.goForward(); await expect(search(page)).toHaveValue('CUS-INBOX-01');
  expect(state.documents).toHaveLength(1);
});
test('metadata network failure retries locally and desktop panes stay within viewport', async ({ page }) => {
  const state = await setup(page, '/staff/inbox/one', { detailFailure: 500 });
  await expect(page.getByRole('alert').filter({ hasText: 'Unable to load' })).toBeVisible();
  state.detailFailure = null; await page.getByRole('button', { name: 'Retry inbox', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Accept request', exact: true })).toBeVisible();
  const box = await page.getByRole('region', { name: 'Staff inbox', exact: true }).boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(1001);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(state.documents).toHaveLength(1);
});
test('unauthorized metadata returns to Staff login without rendering messages', async ({ page }) => {
  await setup(page, '/staff/inbox/one', { detailFailure: 401 });
  await expect(page).toHaveURL(/\/staff\/login/);
  await expect(messages(page)).toHaveCount(0);
});

test('uncommitted unknown acceptance replays exactly the same key and payload', async ({ page }) => {
  const state = await setup(page, '/staff/inbox/one', { failAccept: 'uncommitted' });
  await page.getByRole('button', { name: 'Accept request', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Check acceptance result', exact: true })).toBeEnabled();
  state.failAccept = false;
  await page.getByRole('button', { name: 'Check acceptance result', exact: true }).click();
  await expect(messages(page)).toBeVisible();
  expect(state.accepts).toHaveLength(2); expect(state.accepts[1].body).toEqual(state.accepts[0].body);
});
test('denied Accept clears pending state so explicit retry can recover', async ({ page }) => {
  const state = await setup(page, '/staff/inbox/one', { acceptFailure: 403 });
  await page.getByRole('button', { name: 'Accept request', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry inbox', exact: true })).toBeVisible();
  state.acceptFailure = null;
  await page.getByRole('button', { name: 'Retry inbox', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Accept request', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Accept request', exact: true }).click();
  await expect(messages(page)).toBeVisible();
});


test('live directory refresh preserves DOM, open groups, focus and scroll while requests are pending', async ({ page }) => {
  const state = await setup(page, '/staff/inbox/one', { active: true });
  const directory = page.locator('[aria-label="Inbox customers"]');
  const group = page.getByRole('button', { name: new RegExp(customer.fullName) });
  await expect(directory.getByRole('link').first()).toBeVisible();
  await group.focus();
  await page.evaluate(() => {
    window.__directory = document.querySelector('[aria-label="Inbox customers"]');
    window.__group = document.activeElement;
    window.__row = window.__directory.querySelector('a');
  });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/v1/staff/inbox/**', async route => { await gate; await route.fallback(); });
  const before = state.requests.length;
  await page.evaluate(() => window.dispatchEvent(new Event('core:chat-changed')));
  await expect.poll(() => state.requests.length).toBeGreaterThan(before);
  await expect.poll(() => page.evaluate(() => document.querySelector('[aria-label="Inbox customers"]') === window.__directory && window.__row.isConnected && document.activeElement === window.__group)).toBe(true);
  await expect(directory.getByText(/Loading customers|Loading conversations/)).toHaveCount(0);
  release();
  await expect.poll(() => state.requests.filter(url => url.pathname.endsWith('/inbox/customers')).length).toBeGreaterThan(1);
  await expect.poll(() => page.evaluate(() => document.querySelector('[aria-label="Inbox customers"]') === window.__directory && window.__row.isConnected && document.activeElement === window.__group)).toBe(true);
  await expect(group).toHaveAttribute('aria-expanded', 'true');
  expect(state.documents).toHaveLength(1);
});


test('live refresh keeps loaded customer and conversation pages and replaces removed rows', async ({ page }) => {
  await setup(page, '/staff/inbox/one', { active: true });
  let removed = false;
  await page.route('**/api/v1/staff/inbox/customers**', route => {
    const more = new URL(route.request().url()).searchParams.has('cursor');
    return route.fulfill({ json: { items: (more ? [second] : [customer]).map(customer => ({ customer, lastActivityAt: '2026-11-04T01:00:00Z' })), pageInfo: { hasMore: !more, nextCursor: more ? null : 'customer-next' } } });
  });
  await page.route('**/api/v1/staff/inbox/customers/*/conversations**', route => {
    const more = new URL(route.request().url()).searchParams.has('cursor');
    return route.fulfill({ json: { items: more ? (removed ? [] : [{ ...conversation('older', true), subject: 'Synthetic loaded older' }]) : [conversation('one', true)], pageInfo: { hasMore: !more, nextCursor: more ? null : 'conversation-next' } } });
  });
  const directory = page.locator('[aria-label="Inbox customers"]');
  await page.evaluate(() => window.dispatchEvent(new Event('core:chat-changed')));
  await page.getByRole('button', { name: 'Load more customers', exact: true }).click();
  await expect(directory.getByRole('button', { name: new RegExp(second.fullName) })).toBeVisible();
  await page.getByRole('button', { name: 'Load more conversations', exact: true }).click();
  await expect(directory.getByRole('link', { name: /Synthetic loaded older/ })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('core:chat-changed')));
  await expect(directory.getByRole('link', { name: /Synthetic loaded older/ })).toBeVisible();
  await expect(directory.getByRole('button', { name: new RegExp(second.fullName) })).toBeVisible();
  removed = true;
  await page.evaluate(() => window.dispatchEvent(new Event('core:chat-changed')));
  await expect(directory.getByRole('link', { name: /Synthetic loaded older/ })).toHaveCount(0);
});

test('customer policy lookup: renders policy list, search filter, and dossier link', async ({ page }) => {
  const policiesMock = {
    items: [
      {
        id: 'policy-01',
        policyNumber: 'POL-884920',
        customerId: customer.id,
        product: { id: 'prod-01', productCode: 'PRD-BATD', name: 'Kế hoạch Bảo An Toàn Diện', isActive: true },
        status: 'ACTIVE',
        sumAssured: '500000000',
        premiumAmount: '25000000',
        currency: 'VND',
        paymentFrequency: 'ANNUAL',
        effectiveDate: '2023-03-15T00:00:00Z',
        nextDueDate: '2027-03-15T00:00:00Z',
        expiryDate: null,
      },
      {
        id: 'policy-02',
        policyNumber: 'POL-123456',
        customerId: customer.id,
        product: { id: 'prod-02', productCode: 'PRD-HTAV', name: 'Hưu Trí An Vui', isActive: true },
        status: 'PENDING',
        sumAssured: '300000000',
        premiumAmount: '12000000',
        currency: 'VND',
        paymentFrequency: 'QUARTERLY',
        effectiveDate: '2024-01-01T00:00:00Z',
        nextDueDate: null,
        expiryDate: null,
      },
    ],
    total: 2,
    page: 1,
    pageSize: 10,
  };

  await setup(page, '/staff/inbox/one', { active: true });
  await page.route('**/api/v1/staff/customers/*/policies**', route => route.fulfill({ json: policiesMock }));

  // Switch to Policy Lookup tab on the right panel
  await page.getByRole('button', { name: 'Policy Lookup', exact: true }).click();

  // Check right panel header and counter
  await expect(page.getByRole('heading', { name: 'Policy Lookup' })).toBeVisible();
  await expect(page.getByText('2 / 2')).toBeVisible();

  // Check policy card details
  await expect(page.getByText('#POL-884920')).toBeVisible();
  await expect(page.getByText('Kế hoạch Bảo An Toàn Diện')).toBeVisible();
  await expect(page.getByRole('article', { name: 'Policy POL-884920' }).getByText('Active')).toBeVisible();
  await expect(page.getByText('500,000,000 VND')).toBeVisible();
  const newTabLink = page.getByRole('link', { name: 'Open in new tab' }).first();
  await expect(newTabLink).toHaveAttribute('href', '/staff/policies/policy-01');
  await expect(newTabLink).toHaveAttribute('target', '_blank');

  // Client-side search by policy number
  const searchInput = page.getByPlaceholder('Search by policy number, product name…');
  await searchInput.fill('884920');
  await expect(page.getByText('#POL-884920')).toBeVisible();
  await expect(page.getByText('#POL-123456')).toHaveCount(0);
  await expect(page.getByText('1 / 2')).toBeVisible();

  // Search by non-matching string
  await searchInput.fill('NON_EXISTENT');
  await expect(page.getByText('No matching policies')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear search filter' })).toBeVisible();

  // Clear search filter
  await page.getByRole('button', { name: 'Clear search filter' }).click();
  await expect(page.getByText('#POL-884920')).toBeVisible();
  await expect(page.getByText('#POL-123456')).toBeVisible();
});

test('customer policy lookup: shows empty state when customer has no policies', async ({ page }) => {
  await setup(page, '/staff/inbox/one', { active: true });
  await page.route('**/api/v1/staff/customers/*/policies**', route =>
    route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 10 } }),
  );

  await page.getByRole('button', { name: 'Policy Lookup', exact: true }).click();
  await expect(page.getByText('No policies found')).toBeVisible();
  await expect(page.getByText('This customer has no active insurance policies registered in the system.')).toBeVisible();
});

test('customer policy lookup: handles error and in-place retry', async ({ page }) => {
  let shouldFail = true;
  await setup(page, '/staff/inbox/one', { active: true });
  await page.route('**/api/v1/staff/customers/*/policies**', route => {
    if (shouldFail) {
      return route.fulfill({ status: 500, json: { message: 'Internal Server Error' } });
    }
    return route.fulfill({
      json: {
        items: [
          {
            id: 'policy-retry-01',
            policyNumber: 'POL-999999',
            customerId: customer.id,
            product: { id: 'p1', productCode: 'PRD-RETRY', name: 'Hợp đồng phục hồi', isActive: true },
            status: 'ACTIVE',
            sumAssured: '100000000',
            premiumAmount: '5000000',
            currency: 'VND',
            paymentFrequency: 'ANNUAL',
            effectiveDate: null,
            nextDueDate: null,
            expiryDate: null,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
      },
    });
  });

  await page.getByRole('button', { name: 'Policy Lookup', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();

  // Retry after fix
  shouldFail = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('#POL-999999')).toBeVisible();
  await expect(page.getByText('Hợp đồng phục hồi')).toBeVisible();
});
