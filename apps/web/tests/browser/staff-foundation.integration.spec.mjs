import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Application, auth, queries, mutations and storage are real Docker services.
// Network faults are explicitly injected by aborting requests, never fake success.
function fixture(action, runId) {
  return JSON.parse(execFileSync('docker', ['compose', '--profile', 'tests', 'run', '--rm', '-T', '--no-deps', 'product-document-tests', 'node', 'test/support/browser-staff-fixture.cjs'], {
    cwd: fileURLToPath(new URL('../../../../', import.meta.url)), input: JSON.stringify({ action, runId }), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000,
  }));
}
async function session(browser, actor) {
  const context = await browser.newContext();
  context.setDefaultTimeout(15000);
  context.setDefaultNavigationTimeout(30000);
  await context.addCookies([{ name: 'li_session', value: actor.token, domain: 'localhost', path: '/api/v1', httpOnly: true, sameSite: 'Lax' },
    { name: 'li_csrf', value: actor.csrf, domain: 'localhost', path: '/api/v1', httpOnly: true, sameSite: 'Lax' }]);
  return context;
}
function writeHeaders(actor) { return { Origin: 'http://localhost:8080', 'X-Auth-Request': '1', 'X-CSRF-Token': actor.csrf }; }
function observe(page) {
  const documents = [], errors = [];
  page.on('request', request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  return { documents, errors };
}
async function isolated(browser, work) {
  const runId = randomUUID(), contexts = [];
  try {
    const data = fixture('setup', runId);
    await work(data, runId, async actor => { const context = await session(browser, actor); contexts.push(context); return context; }, contexts);
  } finally {
    for (const context of contexts) await context.close();
    expect(fixture('cleanup', runId)).toEqual({ users: 0, products: 0, objects: 0 });
  }
}
test.beforeEach(() => test.setTimeout(240000));

test('real auth: Staff login, keyboard edit, conflict, password rotation and logout', async ({ browser }) => {
  await isolated(browser, async (data, runId, connect, contexts) => {
    const context = await browser.newContext(); context.setDefaultTimeout(15000); contexts.push(context);
    const page = await context.newPage();
    await page.goto('/staff/login');
    await page.getByRole('textbox', { name: 'Email address', exact: true }).fill(data.staff.email);
    await page.locator('input[name="password"]').fill(data.staff.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/staff\/(?:customers|inbox)(?:\?|$)/);
    await page.goto('/account'); const nav = observe(page);
    const edit = page.getByRole('button', { name: 'Edit personal information', exact: true });
    await edit.focus(); await page.keyboard.press('Enter');
    const name = page.getByRole('textbox', { name: 'Full name', exact: true });
    await expect(name).toBeFocused();
    await name.fill(`${data.search} Updated Staff`);
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByText('Your profile has been updated.', { exact: true })).toBeVisible();
    expect(fixture('inspect', runId).staff.fullName).toBe(`${data.search} Updated Staff`);
    expect(fixture('inspect', runId).profileAudits).toBe(1);
    await edit.click(); await name.fill(`${data.search} Stale draft`); fixture('conflict', runId);
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.locator('p[role="alert"]')).toContainText(/changed|updated|conflict/i);
    await expect(name).toHaveValue(`${data.search} Stale draft`);
    expect(fixture('inspect', runId).staff.fullName).toBe(`${data.search} Concurrent edit`);
    const old = await connect(data.staff);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Change password', exact: true }).click();
    await page.locator('input[name="currentPassword"]').fill(data.staff.password);
    await page.locator('input[name="newPassword"]').fill(`${data.staff.password}-new`);
    await page.locator('input[name="confirmPassword"]').fill(`${data.staff.password}-new`);
    await page.getByRole('button', { name: 'Save new password', exact: true }).click();
    await expect(page.getByText('Password updated. Previous sessions have been signed out.', { exact: true })).toBeVisible();
    expect((await old.request.get('/api/v1/auth/me')).status()).toBe(401);
    await page.getByRole('button', { name: 'Open account options', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/staff\/login/);
    expect((await context.request.get('/api/v1/auth/me')).status()).toBe(401);
    expect(nav.documents).toHaveLength(0); expect(nav.errors).toEqual([]);
  });
});

test('real Customers: pagination, keyboard support links, Back and scoped hidden AI/Tickets', async ({ browser }) => {
  await isolated(browser, async (data, runId, connect) => {
    const context = await connect(data.staff), page = await context.newPage(), nav = observe(page);
    await page.goto(`/staff/customers?search=${data.search}&page=2`);
    const region = page.getByRole('region', { name: 'Customer management' });
    await expect(region.locator('tbody tr')).toHaveCount(2);
    await region.getByRole('button', { name: 'Previous', exact: true }).click();
    await expect(region.locator('tbody tr')).toHaveCount(10);
    await region.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(region.locator('tbody tr')).toHaveCount(2);
    const search = page.getByRole('searchbox', { name: 'Search customers', exact: true });
    await search.fill(data.owner.accountCode); await search.press('Enter');
    await expect(region.locator('tbody tr')).toHaveCount(1);
    await page.getByRole('button', { name: `View profile ${data.owner.fullName}`, exact: true }).click();
    const support = page.getByRole('navigation', { name: 'Customer support' });
    await support.getByRole('link', { name: 'Conversations', exact: true }).focus(); await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/staff/inbox\\?customerId=${data.owner.id}$`));
    await expect(page.getByRole('link', { name: new RegExp('Direct support') })).toBeVisible();
    await expect(page.getByText(`${data.search} Private AI must stay hidden`, { exact: false })).toHaveCount(0);
    await page.goBack(); await expect(support).toBeVisible();
    await support.getByRole('link', { name: 'Tickets', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/staff/tickets\\?customerId=${data.owner.id}$`));
    await expect(page.getByRole('link', { name: new RegExp(data.search + '-TK') })).toBeVisible();
    await page.goBack(); await expect(support).toBeVisible();
    await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('button', { name: 'Customers' }).click();
    await expect(region.locator('tbody tr')).toHaveCount(1);
    expect(new URL(page.url()).searchParams.get('search')).toBe(data.owner.accountCode);
    expect(nav.documents).toHaveLength(1); expect(nav.errors).toEqual([]);
    const other = await connect(data.otherStaff);
    for (const path of [`/staff/customers/${data.owner.id}`, `/staff/conversations/${data.conversationId}`]) expect((await other.request.get('/api/v1' + path)).status()).toBe(404);
    expect((await other.request.get(`/api/v1/staff/tickets?customerId=${data.owner.id}`)).status()).toBe(404);
    const denied = await other.request.get(`/api/v1/staff/inbox/customers?customerId=${data.owner.id}`);
    expect((await denied.json()).items).toEqual([]);
    fixture('revoke', runId);
    await page.goto(`/staff/customers/${data.owner.id}`);
    await expect(page.getByRole('navigation', { name: 'Customer support' })).toHaveCount(0);
    expect((await context.request.get(`/api/v1/staff/customers/${data.owner.id}`)).status()).toBe(404);
  });
});

test('real policy PDF: exact applied version, Range/download hash, Customer ownership and assignment revoke', async ({ browser }) => {
  await isolated(browser, async (data, runId, connect) => {
    const context = await connect(data.staff), page = await context.newPage(), nav = observe(page);
    await page.goto(`/staff/policies/${data.policy.id}`);
    const frame = page.locator('iframe[title^="PDF preview:"]');
    await expect(frame).toHaveAttribute('title', /version 1\.0/);
    const grant = await context.request.post(`/api/v1/staff/documents/${data.mainId}/versions/${data.versionId}/view`, { headers: writeHeaders(data.staff), data: { policyId: data.policy.id } });
    expect(grant.status()).toBe(200); const { url } = await grant.json();
    const bytes = await context.request.get(url); expect(bytes.status()).toBe(200);
    expect(createHash('sha256').update(await bytes.body()).digest('hex')).toBe(data.checksum);
    const range = await context.request.get(url, { headers: { Range: 'bytes=0-31' } });
    expect(range.status()).toBe(206); expect((await range.body()).length).toBe(32);
    const event = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
    const stream = await (await event).createReadStream(), hash = createHash('sha256');
    for await (const part of stream) hash.update(part);
    expect(hash.digest('hex')).toBe(data.checksum);
    expect((await context.request.post(`/api/v1/staff/documents/${data.mainId}/versions/${data.otherVersionId}/view`, { headers: writeHeaders(data.staff), data: { policyId: data.policy.id } })).status()).toBe(404);
    const owner = await connect(data.owner), customerPage = await owner.newPage();
    await customerPage.goto(`/customer/policies/${data.policy.id}`);
    await expect(customerPage.locator('iframe[title^="PDF preview:"]')).toHaveAttribute('title', /version 1\.0/);
    const foreign = await connect(data.foreign);
    expect((await foreign.request.get(`/api/v1/customers/me/policies/${data.policy.id}`)).status()).toBe(404);
    expect((await foreign.request.post(`/api/v1/customers/me/documents/${data.mainId}/versions/${data.versionId}/view`, { headers: writeHeaders(data.foreign), data: { policyId: data.policy.id } })).status()).toBe(404);
    fixture('revoke', runId); await page.evaluate(() => window.dispatchEvent(new Event('core:data-changed')));
    await expect(frame).toHaveCount(0);
    expect((await context.request.get(`/api/v1/staff/policies/${data.policy.id}`)).status()).toBe(404);
    expect((await owner.request.get(`/api/v1/customers/me/policies/${data.policy.id}`)).status()).toBe(200);
    expect(nav.documents).toHaveLength(1); expect(nav.errors).toEqual([]);
  });
});

test('real PDF recovery: missing object, network retry, expiry and inactive applied version', async ({ browser }) => {
  await isolated(browser, async (data, runId, connect) => {
    const context = await connect(data.staff), page = await context.newPage(), nav = observe(page);
    fixture('remove-object', runId);
    await page.clock.install();
    await page.goto(`/staff/policies/${data.policy.id}`);
    await expect(page.getByRole('alert').filter({ hasText: /unavailable|no longer|load/i })).toBeVisible();
    await expect(page.locator('iframe[title^="PDF preview:"]')).toHaveCount(0);
    fixture('restore-object', runId);
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.locator('iframe[title^="PDF preview:"]')).toBeVisible();
    await page.route('**/api/v1/staff/documents/**/download', route => route.abort('failed'));
    await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Unable to download' })).toBeVisible();
    await page.unroute('**/api/v1/staff/documents/**/download');
    const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download PDF', exact: true }).click(); await download;
    await page.clock.fastForward(905000);
    await expect(page.getByText('The preview link has expired.', { exact: true })).toBeVisible();
    // Only the browser clock moved; restore it before requesting a new grant
    // whose expiresAt is produced by the unchanged Core clock.
    await page.clock.setSystemTime(new Date());
    await page.getByRole('button', { name: 'Reload preview', exact: true }).click();
    await expect(page.locator('iframe[title^="PDF preview:"]')).toBeVisible();
    fixture('deactivate', runId); await page.evaluate(() => window.dispatchEvent(new Event('core:data-changed')));
    await expect(page.locator('iframe[title^="PDF preview:"]')).toHaveCount(0);
    expect(nav.documents).toHaveLength(1); expect(nav.errors).toEqual([]);
  });
});

test('real session loss and mobile: profile controls, scoped links and safe clearing', async ({ browser }) => {
  await isolated(browser, async (data, runId, connect) => {
    const context = await connect(data.staff), page = await context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/account'); await page.getByRole('button', { name: 'Edit personal information', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Full name', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.goto(`/staff/customers/${data.owner.id}`);
    const links = page.getByRole('navigation', { name: 'Customer support' }); await expect(links).toBeVisible();
    for (const name of ['Conversations', 'Tickets']) {
      const box = await links.getByRole('link', { name, exact: true }).boundingBox(); expect(box.width).toBeGreaterThan(44);
      expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(390);
    }
    fixture('expire-sessions', runId); await page.evaluate(() => window.dispatchEvent(new Event('core:data-changed')));
    await expect(page).toHaveURL(/\/staff\/login/);
    await expect(links).toHaveCount(0);
  });
});
