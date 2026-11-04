import { test, expect } from '@playwright/test';
const detail = { id: 'one', subject: 'Synthetic AI question', status: 'AI_ACTIVE', controlVersion: 0, entryType: 'AI', staff: null, allowedActions: { readMessages: true, send: true, requestStaff: true } };
async function setup(page, options = {}) {
  const state = { posts: [], version: 0, staffName: 'Synthetic Staff A', ...options };
  await page.routeWebSocket('**/api/v1/realtime', () => {});
  await page.route('**/api/v1/**', async route => {
    const req = route.request(), url = new URL(req.url()); const json = (body, status = 200) => route.fulfill({ json: body, status });
    if (url.pathname.endsWith('/auth/me')) return json({ actor: { id: 'synthetic-customer-test', role: 'CUSTOMER', fullName: 'Synthetic Customer', email: 'customer@synthetic.invalid', accountCode: 'CUS-TEST', passwordChangeRecommended: false }, csrfToken: 'synthetic-csrf' });
    if (url.pathname.endsWith('/chat-support')) return json({ availability: state.unavailable ? 'UNAVAILABLE' : 'AVAILABLE', assignmentVersion: state.version, staff: { fullName: state.staffName }, handoffConsent: { textVersion: 'handoff-v1', scope: 'ENTIRE_CUSTOMER_VISIBLE_CONVERSATION', text: 'Synthetic consent text' } });
    if (req.method() === 'POST') {
      const body = req.postDataJSON(); state.posts.push(body);
      if (state.conflict) { state.conflict = false; state.version = 1; state.staffName = 'Synthetic Staff B'; return json({ code: 'ROUTING_CHANGED' }, 409); }
      if (state.network) { state.network = false; return route.abort('failed'); }
      return json({ conversation: { ...detail, status: 'PENDING_HANDOFF', allowedActions: { ...detail.allowedActions, requestStaff: false } } }, 201);
    }
    if (url.pathname.endsWith('/messages')) return json({ items: [], pageInfo: { beforeCursor: null, afterCursor: 'zero', hasMoreBefore: false, hasMoreAfter: false } });
    if (url.pathname.endsWith('/conversations/one')) return json({ conversation: state.legacy ? { ...detail, allowedActions: { readMessages: false, send: false, requestStaff: false } } : detail });
    if (url.pathname.endsWith('/conversations')) return json({ items: [detail], pageInfo: { hasMore: false, nextCursor: null } });
    return json({ customer: { fullName: 'Synthetic Customer', accountCode: 'CUS-TEST', email: 'customer@synthetic.invalid', status: 'ACTIVE' }, staff: null, assignmentStatus: 'UNASSIGNED' });
  });
  await page.goto('/customer?conversationId=one');
  await expect(page.getByRole('region', { name: 'Customer conversations', exact: true })).toBeVisible(); return state;
}
test('handoff cancel/Escape restores focus and never records consent', async ({ page }) => {
  const state = await setup(page); const open = page.getByRole('button', { name: 'Request Staff support', exact: true });
  await open.click(); const dialog = page.getByRole('dialog'); await expect(dialog).toContainText('entire Customer-visible history');
  await expect(dialog).toContainText('does not create a Ticket');
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(open).toBeFocused(); expect(state.posts).toHaveLength(0);
});
test('routing conflict refreshes Staff and requires a new explicit confirmation', async ({ page }) => {
  const state = await setup(page, { conflict: true });
  await page.getByRole('button', { name: 'Request Staff support', exact: true }).click();
  await page.getByRole('button', { name: 'Agree and request Staff support', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Synthetic Staff B'); expect(state.posts).toHaveLength(1);
  await page.getByRole('button', { name: 'Agree and request Staff support', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.posts[1].expectedAssignmentVersion).toBe(1); expect(state.posts[1].clientRequestId).not.toBe(state.posts[0].clientRequestId);
});
test('unknown create retries same UUID/payload, disables cancellation and does not duplicate intent', async ({ page }) => {
  const state = await setup(page, { network: true }); await page.getByRole('button', { name: 'New AI chat', exact: true }).click();
  await page.getByRole('textbox', { name: 'Subject', exact: true }).fill('Synthetic retry');
  await page.getByRole('button', { name: 'Create conversation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Retry same request', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.posts).toHaveLength(2); expect(state.posts[1]).toEqual(state.posts[0]);
});
test('unavailable Staff blocks Direct confirmation; legacy chat has no composer', async ({ page }) => {
  await setup(page, { unavailable: true, legacy: true });
  await expect(page.getByRole('form', { name: 'Message composer' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Message Staff', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create conversation', exact: true })).toBeDisabled();
});
test('mobile chat and consent dialog fit viewport and trap keyboard focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await setup(page);
  await page.getByRole('button', { name: 'Request Staff support', exact: true }).click();
  const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true); }
  const box = await dialog.boundingBox(); expect(box.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
