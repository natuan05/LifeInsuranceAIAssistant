import { test, expect } from '@playwright/test';

async function setup(page, role) {
  const state = { total: 50, requests: [], successful: [], documents: [], afterCount: 0, budget: Infinity, readThrough: '0' };
  const customer = { id: 'customer', fullName: 'Synthetic Catch-up Customer', accountCode: 'CUS-CATCHUP' };
  const detail = { id: 'one', subject: 'Synthetic catch-up', status: 'STAFF_ACTIVE', entryType: 'DIRECT', customer,
    controlVersion: 0, allowedActions: { canView: true, canAccept: false, canTakeover: false, canSend: true } };
  await page.routeWebSocket('**/api/v1/realtime', () => {});
  page.on('request', r => { if (r.isNavigationRequest() && r.frame() === page.mainFrame()) state.documents.push(r.url()); });
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url()), json = (body, status = 200) => route.fulfill({ json: body, status });
    if (url.pathname.endsWith('/auth/me')) return json({ actor: { id: 'catchup-viewer', role, fullName: 'Synthetic Catch-up Viewer', accountCode: 'SYN-CATCHUP', email: 'catchup@synthetic.invalid', passwordChangeRecommended: false }, csrfToken: 'synthetic-csrf' });
    if (url.pathname.endsWith('/read')) return json({ success: true, readAt: '2026-11-16T00:00:00Z' });
    if (url.pathname.endsWith('/read-state')) return json({ readThroughSequence: state.readThrough });
    if (url.pathname.endsWith('/messages')) {
      const after = url.searchParams.get('after');
      if (after !== null) {
        state.requests.push(after); state.afterCount++;
        if (state.holdAt === state.afterCount) await new Promise(resolve => { state.release = resolve; });
        if (state.failAt === state.afterCount) return state.failure === 'network' ? route.abort('failed') : json({ code: 'UNAVAILABLE' }, state.failure);
        if (state.afterCount > state.budget) return json({ code: 'RATE_LIMITED' }, 429);
      }
      const from = after === null ? Math.max(1, state.total - 49) : Number(after) + 1;
      const through = Math.min(state.total, from + 49);
      const result = { items: Array.from({ length: Math.max(0, through - from + 1) }, (_, i) => ({ id: `message-${from + i}`, sequence: String(from + i), senderType: role, sender: { displayName: 'Synthetic sender' }, content: `Synthetic catch-up ${from + i}`, createdAt: '2026-11-16T00:00:00Z', readAt: null, citations: [] })),
        pageInfo: { beforeCursor: String(from), afterCursor: String(Math.max(Number(after ?? 0), through)), hasMoreBefore: after !== null && from > 1, hasMoreAfter: through < state.total } };
      if (after !== null) state.successful.push(after);
      if (state.stuckAt === state.afterCount && after !== null) result.pageInfo.afterCursor = after;
      await json(result);
      if (state.release) state.releasedResponse = true;
      return;
    }
    if (/\/conversations\/one$/.test(url.pathname)) return state.denied ? json({ code: 'NOT_FOUND' }, 404) : json({ conversation: detail });
    if (url.pathname.endsWith('/conversations')) return json({ items: [detail], pageInfo: { hasMore: false, nextCursor: null } });
    if (url.pathname.endsWith('/inbox/customers')) return json({ items: [{ customer }], pageInfo: { hasMore: false, nextCursor: null } });
    return json({ items: [], total: 0 });
  });
  await page.goto(role === 'STAFF' ? '/staff/inbox/one' : '/customer?conversationId=one');
  const region = page.getByRole('region', { name: 'Conversation messages', exact: true });
  await expect(region.locator('[data-message-id]')).toHaveCount(50);
  return { state, region, rows: region.locator('[data-message-id]'), draft: page.getByRole('textbox', { name: 'Message', exact: true }) };
}
const refresh = page => page.evaluate(() => window.dispatchEvent(new Event('core:chat-changed')));
async function failed(region) {
  await expect(region.getByRole('alert')).toContainText('Unable to refresh message read status');
  await expect(region.getByText('Loading messages…', { exact: true })).toHaveCount(0);
}

for (const role of ['CUSTOMER', 'STAFF']) {
  test(`A4 ${role} catch-up resumes successful pages after quota reset without losing history or scroll`, async ({ page }) => {
    const { state, region, rows, draft } = await setup(page, role);
    await draft.fill('Synthetic preserved draft');
    await region.evaluate(el => { el.scrollTop = 200; });
    const anchor = region.locator('[data-message-id="message-5"]'), top = (await anchor.boundingBox()).y;
    state.total = 1250; state.budget = 12; state.readThrough = '50';
    await refresh(page); await failed(region);
    await expect(rows).toHaveCount(650);
    expect(state.afterCount).toBe(13); expect(state.requests[0]).toBe('50');
    await expect(region.locator('[data-message-id="message-1"]')).toContainText('Đã xem');
    expect(Math.abs((await anchor.boundingBox()).y - top)).toBeLessThan(5);
    const retryStart = state.requests.length; state.afterCount = 0;
    // Keep the scroll check independent of Playwright scrolling to the error control.
    await region.getByRole('button', { name: 'Retry messages', exact: true }).evaluate(button => button.click());
    await expect(rows).toHaveCount(1250);
    await expect(region.getByText('Loading messages…', { exact: true })).toHaveCount(0);
    await expect(region.getByRole('alert')).toHaveCount(0);
    expect(state.requests[retryStart]).toBe('650'); expect(state.afterCount).toBe(12);
    expect(new Set(state.successful).size).toBe(24);
    expect(state.successful).toHaveLength(24);
    await expect(draft).toHaveValue('Synthetic preserved draft');
    expect(Math.abs((await anchor.boundingBox()).y - top)).toBeLessThan(5);
    expect(state.documents).toHaveLength(1);
  });

  for (const failure of [500, 'network']) test(`A4 ${role} catch-up keeps partial batch after ${failure} and retries only the failed page`, async ({ page }) => {
    const { state, region, rows, draft } = await setup(page, role);
    state.total = 250; state.failAt = 3; state.failure = failure;
    await draft.fill('Synthetic retry draft'); await refresh(page); await failed(region);
    await expect(rows).toHaveCount(150);
    expect(state.requests).toEqual(['50', '100', '150']);
    state.failAt = null;
    await region.getByRole('button', { name: 'Retry messages', exact: true }).click();
    await expect(rows).toHaveCount(250); await expect(region.getByRole('alert')).toHaveCount(0);
    expect(state.requests).toEqual(['50', '100', '150', '150', '200']);
    await expect(draft).toHaveValue('Synthetic retry draft');
  });

  test(`A4 ${role} denied catch-up clears committed pages and a partial batch`, async ({ page }) => {
    const { state, region, draft } = await setup(page, role);
    state.total = 1000; state.failAt = 13; state.failure = 403;
    await draft.fill('Synthetic private draft'); await refresh(page);
    await expect(region).toHaveCount(0); await expect(draft).toHaveCount(0);
    expect(state.afterCount).toBe(13);
    await expect(page.locator('[data-message-id]')).toHaveCount(0);
  });

  test(`A4 ${role} scope loss aborts a late catch-up response after committed progress`, async ({ page }) => {
    const { state, region, rows, draft } = await setup(page, role);
    state.total = 1000; state.holdAt = 11;
    await refresh(page); await expect.poll(() => Boolean(state.release)).toBe(true);
    await expect(rows).toHaveCount(550);
    state.denied = true;
    await page.evaluate(() => window.dispatchEvent(new Event('core:chat-scope-changed')));
    await expect(region).toHaveCount(0); state.release();
    await expect.poll(() => Boolean(state.releasedResponse)).toBe(true);
    await expect(page.locator('[data-message-id]')).toHaveCount(0); await expect(draft).toHaveCount(0);
  });

  test(`A4 ${role} nonadvancing catch-up cursor stops and retains its last safe page`, async ({ page }) => {
    const { state, region, rows } = await setup(page, role);
    state.total = 350; state.stuckAt = 3;
    await refresh(page); await failed(region); await expect(rows).toHaveCount(150);
    expect(state.afterCount).toBe(3);
    state.stuckAt = null;
    await region.getByRole('button', { name: 'Retry messages', exact: true }).click();
    await expect(rows).toHaveCount(350); await expect(region.getByRole('alert')).toHaveCount(0);
    expect(state.requests[3]).toBe('150');
  });
}
