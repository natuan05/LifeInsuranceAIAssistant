import { test, expect } from '@playwright/test';

const customer = { id: 'customer-one', fullName: 'Synthetic Inbox Customer', accountCode: 'CUS-INBOX-01' };
const second = { id: 'customer-two', fullName: 'Synthetic Second Customer', accountCode: 'CUS-INBOX-02' };
const conversation = (id, active = false) => ({ id, subject: `Synthetic topic ${id}`, status: active ? 'STAFF_ACTIVE' : 'PENDING_HANDOFF', entryType: active ? 'DIRECT' : 'REQUEST', activityAt: '2026-11-04T01:00:00Z', customer, controlVersion: active ? 2 : 1, request: { id: 'request-one', sharedReason: 'Synthetic help request', requestedAt: '2026-11-04T01:00:00Z' }, allowedActions: { readMessages: active, accept: !active, send: active } });
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
    if (url.pathname.endsWith('/messages')) {
      if (state.denied) return json({ code: 'NOT_FOUND' }, 404);
      const before = url.searchParams.has('before'), after = url.searchParams.has('after');
      return json({ items: after ? [message(101), message(100)] : Array.from({ length: 50 }, (_, index) => message(index + (before ? 1 : 51))), pageInfo: { beforeCursor: before ? null : 'older', afterCursor: after ? 'newer' : 'latest', hasMoreBefore: !before, hasMoreAfter: false } });
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
test('pending deep link never loads history until Accept commits', async ({ page }) => {
  const state = await setup(page, '/staff/inbox/one?filter=requests');
  await expect(page.getByRole('button', { name: 'Accept request', exact: true })).toBeVisible();
  expect(state.requests.filter(url => url.pathname.endsWith('/messages'))).toHaveLength(0);
  await page.getByRole('button', { name: 'Accept request', exact: true }).click();
  await expect(messages(page)).toBeVisible();
  expect(state.accepts).toHaveLength(1); expect(state.accepts[0].csrf).toBe('synthetic-csrf');
  expect(state.accepts[0].body.expectedVersion).toBe(1);
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible();
});
test('unknown Accept outcome reconciles committed receipt without another command', async ({ page }) => {
  const state = await setup(page, '/staff/inbox/one', { failAccept: true });
  await page.getByRole('button', { name: 'Accept request', exact: true }).click();
  await page.getByRole('button', { name: 'Check acceptance result', exact: true }).click();
  await expect(messages(page)).toBeVisible(); expect(state.accepts).toHaveLength(1);
  expect(state.requests.some(url => url.pathname.includes('/commands/'))).toBe(true);
});
test('conflicting Accept revalidates metadata and never loads pending messages', async ({ page }) => {
  const state = await setup(page, '/staff/inbox/one', { conflict: true });
  await page.getByRole('button', { name: 'Accept request', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'has changed' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept request', exact: true })).toBeVisible();
  expect(state.requests.filter(url => url.pathname.endsWith('/messages'))).toHaveLength(0);
});
test('history prepends in bigint order, preserves anchor and deduplicates refresh', async ({ page }) => {
  await setup(page, '/staff/inbox/one', { active: true });
  await expect(messages(page).locator('[data-message-id]')).toHaveCount(50);
  const anchor = messages(page).locator('[data-message-id="message-75"]');
  await anchor.scrollIntoViewIfNeeded(); const before = await anchor.boundingBox();
  await page.getByRole('button', { name: 'Load earlier messages', exact: true }).evaluate(button => button.click());
  await expect(messages(page).locator('[data-message-id]')).toHaveCount(100);
  const after = await anchor.boundingBox(); expect(Math.abs(after.y - before.y)).toBeLessThan(5);
  const sequences = await messages(page).locator('[data-sequence]').evaluateAll(nodes => nodes.map(node => node.dataset.sequence));
  expect(sequences.every((sequence, index) => !index || BigInt(sequence) > BigInt(sequences[index - 1]))).toBe(true);
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
