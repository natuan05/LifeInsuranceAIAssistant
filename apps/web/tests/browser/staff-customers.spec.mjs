import { test, expect } from '@playwright/test';

// Synthetic, in-memory fixtures: independent of personal seeds and database contents.
// The Docker UI, browser navigation and WebSocket handler run for real; Core is mocked.
const customers = Array.from({ length: 23 }, (_, index) => ({
  id: `browser-customer-${index + 1}`,
  accountCode: `CUS-TEST-${String(index + 1).padStart(3, '0')}`,
  fullName: `Synthetic ${index < 12 ? 'Alpha' : 'Beta'} ${String(index + 1).padStart(2, '0')}`,
  email: `customer.browser.${index + 1}@dev.example.invalid`,
  phone: index === 0 ? null : `+9990000${String(index + 1).padStart(4, '0')}`,
  status: index === 1 ? 'LOCKED' : 'ACTIVE', birth: null, address: null,
}));
const directory = page => page.getByRole('region', { name: 'Customer management' });
const input = page => page.getByRole('searchbox', { name: 'Search customers', exact: true });
const clearSearch = page => search(page, '');
const next = page => page.getByRole('navigation', { name: 'Customer pagination' }).getByRole('button', { name: 'Next', exact: true });
const view = (page, customer = customers[0]) => page.getByRole('button', { name: `View profile ${customer.fullName}`, exact: true });
const rows = page => directory(page).locator('tbody tr');
const alert = page => directory(page).getByRole('alert');
const retry = page => directory(page).getByRole('button', { name: 'Try again', exact: true });
const breadcrumb = page => page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('button', { name: 'Customers', exact: true });

async function setup(page, path = '/staff/customers', options = {}) {
  const state = { items: customers.map(customer => ({ ...customer })), requests: [], listResponses: [], documents: [], listFailure: null, detailFailure: null, expired: false, beforeList: null };
  const sockets = [];
  await page.routeWebSocket('**/api/v1/realtime', socket => { sockets.push(socket); });
  page.on('request', request => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) state.documents.push(request.url());
  });
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url());
    const json = (body, status = 200) => route.fulfill({ status, json: body });
    if (url.pathname === '/api/v1/auth/me') return json(state.expired ? {} : { actor: {
      id: 'synthetic-browser-staff', accountCode: 'STF-TEST', role: 'STAFF', email: 'staff.browser@dev.example.invalid',
      fullName: 'Synthetic Browser Staff', passwordChangeRecommended: false,
    }, csrfToken: 'synthetic-browser-csrf' }, state.expired ? 401 : 200);
    if (url.pathname.startsWith('/api/v1/staff/customers')) {
      state.requests.push(url);
      const isList = url.pathname === '/api/v1/staff/customers';
      const failure = isList ? state.listFailure : state.detailFailure;
      if (failure === 'network') return route.abort('failed');
      if (failure) { if (failure === 401) state.expired = true; return json({}, failure); }
      if (isList) {
        const term = (url.searchParams.get('search') || '').toLowerCase();
        const items = state.items.filter(customer => [customer.fullName, customer.accountCode, customer.email, customer.phone || ''].some(value => value.toLowerCase().includes(term)));
        const pageNumber = Number(url.searchParams.get('page') || 1), pageSize = Number(url.searchParams.get('pageSize') || 10);
        const response = { items: items.slice((pageNumber - 1) * pageSize, pageNumber * pageSize), total: items.length, page: pageNumber, pageSize };
        if (state.beforeList) await state.beforeList(url);
        await json(response);
        state.listResponses.push(url);
        return;
      }
      if (url.pathname.endsWith('/policies')) return json({ items: [], total: 0, page: 1, pageSize: 10 });
      const customer = state.items.find(item => url.pathname.endsWith(`/${item.id}`));
      return customer ? json({ customer }) : json({}, 404);
    }
    return json({ items: [], total: 0, page: 1, pageSize: 10 });
  });
  Object.assign(state, options);
  await page.goto(path);
  state.invalidate = async () => {
    await expect.poll(() => sockets.length).toBeGreaterThan(0);
    sockets.at(-1).send(JSON.stringify({ type: 'invalidate' }));
  };
  return state;
}

async function search(page, term) {
  await input(page).fill(term); await input(page).press('Enter');
}

test('pagination, deep link, breadcrumb and Back/Forward preserve search/page without reload', async ({ page }) => {
  const state = await setup(page, '/staff/customers?search=Alpha&page=2');
  await expect(rows(page)).toHaveCount(2); await expect(input(page)).toHaveValue('Alpha');
  await view(page, customers[10]).click();
  await expect(page).toHaveURL(/browser-customer-11\?search=Alpha&page=2$/);
  await expect(page.getByRole('heading', { name: customers[10].fullName, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Insurance policies', exact: true })).toBeVisible();
  await page.goBack(); await expect(rows(page)).toHaveCount(2); await expect(input(page)).toHaveValue('Alpha');
  await page.goForward(); await expect(breadcrumb(page)).toBeVisible();
  await breadcrumb(page).click(); await expect(rows(page)).toHaveCount(2);
  await expect(page).toHaveURL(/\/staff\/customers\?search=Alpha&page=2$/);
  expect(state.documents).toHaveLength(1);
});

test('keyboard search trims query, resets page and clear discards unsent draft with focus', async ({ page }) => {
  const state = await setup(page, '/staff/customers?page=2');
  await expect(rows(page)).toHaveCount(10);
  await input(page).focus();
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Clear search', exact: true })).toHaveCount(0);
  await search(page, '  Beta  '); await expect(rows(page)).toHaveCount(10);
  await expect(page).toHaveURL(/\?search=Beta$/); await expect(input(page)).toBeFocused();
  await next(page).click(); await expect(rows(page)).toHaveCount(1);
  await expect(page).toHaveURL(/search=Beta&page=2$/);
  await input(page).fill('unsent draft'); await clearSearch(page);
  await expect(page).toHaveURL(/\/staff\/customers$/); await expect(input(page)).toHaveValue('');
  await expect(input(page)).toBeFocused(); await expect(rows(page)).toHaveCount(10);
  expect(state.documents).toHaveLength(1);
});

test('search can return a customer outside the initial page and distinguishes empty results', async ({ page }) => {
  const state = await setup(page);
  await expect(view(page, customers[22])).toHaveCount(0);
  await search(page, customers[22].email); await expect(rows(page)).toHaveCount(1);
  await expect(view(page, customers[22])).toBeVisible();
  expect(state.requests.at(-1).searchParams.get('search')).toBe(customers[22].email);
  await search(page, 'no-synthetic-match');
  await expect(page.getByText('No customers match your search.', { exact: true })).toBeVisible();
  await expect(alert(page)).toHaveCount(0); await expect(input(page)).toBeVisible();
});

test('unassigned Staff sees empty state and disabled pagination', async ({ page }) => {
  await setup(page, '/staff/customers', { items: [] });
  await expect(page.getByText('No customers are currently assigned to you.', { exact: true })).toBeVisible();
  await expect(next(page)).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();
});

test('list network error retries current filter/page without navigation', async ({ page }) => {
  const state = await setup(page, '/staff/customers?search=Alpha&page=2', { listFailure: 'network' });
  await expect(alert(page)).toContainText('Unable to load data');
  state.listFailure = null; await retry(page).press('Enter');
  await expect(rows(page)).toHaveCount(2); await expect(input(page)).toHaveValue('Alpha');
  expect(state.requests.at(-1).searchParams.get('page')).toBe('2');
  expect(state.documents).toHaveLength(1);
});

test('detail network error retries profile and policies in place', async ({ page }) => {
  const state = await setup(page, '/staff/customers/browser-customer-1?search=Alpha', { detailFailure: 'network' });
  await expect(alert(page)).toContainText('Unable to load data');
  state.detailFailure = null; await retry(page).click();
  await expect(page.getByRole('heading', { name: customers[0].fullName, exact: true })).toBeVisible();
  await expect(page.getByText(customers[0].email, { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Insurance policies', exact: true })).toBeVisible();
  expect(state.documents).toHaveLength(1);
});

test('WebSocket invalidation refreshes filtered page in background without losing draft/focus/sidebar', async ({ page }) => {
  const state = await setup(page, '/staff/customers?search=Alpha&page=2');
  await expect(rows(page)).toHaveCount(2);
  await page.getByRole('button', { name: 'Collapse / Expand sidebar', exact: true }).click();
  await input(page).fill('unsent retained');
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  state.items[10].fullName = 'Synthetic Alpha Updated';
  state.beforeList = () => gate;
  const count = state.requests.length; await state.invalidate();
  try {
    await expect.poll(() => state.requests.length).toBeGreaterThan(count);
    await expect(view(page, customers[10])).toBeVisible();
    await expect(directory(page).getByRole('status')).toHaveCount(0);
    await expect(input(page)).toHaveValue('unsent retained'); await expect(input(page)).toBeFocused();
    expect(state.requests.at(-1).searchParams.get('search')).toBe('Alpha');
    expect(state.requests.at(-1).searchParams.get('page')).toBe('2');
  } finally { release(); }
  await expect(page.getByRole('button', { name: 'View profile Synthetic Alpha Updated', exact: true })).toBeVisible();
  await expect(page.locator('.inbox-nav-col')).toHaveClass(/collapsed/);
  expect(state.documents).toHaveLength(1);
});

for (const status of [403, 404]) {
  test(`realtime detail ${status} removes private profile and policy content`, async ({ page }) => {
    const state = await setup(page, '/staff/customers/browser-customer-1');
    await expect(page.getByText(customers[0].email, { exact: true })).toBeVisible();
    state.detailFailure = status; await state.invalidate();
    await expect(alert(page)).toContainText(status === 403 ? 'permission' : 'no longer assigned');
    await expect(page.getByText(customers[0].email, { exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: customers[0].fullName, exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Insurance policies', exact: true })).toHaveCount(0);
    expect(state.documents).toHaveLength(1);
  });
}

test('realtime assignment removal updates filtered list/count', async ({ page }) => {
  const state = await setup(page, '/staff/customers?search=Alpha');
  await expect(rows(page)).toHaveCount(10);
  state.items = state.items.filter(customer => !customer.fullName.includes('Alpha')); await state.invalidate();
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByText('No customers match your search.', { exact: true })).toBeVisible();
  await expect(page.locator('.directory-count')).toHaveText('0 customers matching your search');
  await expect(input(page)).toHaveValue('Alpha'); expect(state.documents).toHaveLength(1);
});

test('expired session clears customer content and routes to login', async ({ page }) => {
  const state = await setup(page, '/staff/customers/browser-customer-1');
  await expect(page.getByText(customers[0].email, { exact: true })).toBeVisible();
  state.listFailure = 401; await state.invalidate();
  await expect(page).toHaveURL(/\/staff\/login$/);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(directory(page)).toHaveCount(0);
});

test('late search response cannot overwrite newer filter after Clear', async ({ page }) => {
  const state = await setup(page); await expect(rows(page)).toHaveCount(10);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  state.beforeList = url => url.searchParams.get('search') === 'Alpha' ? gate : Promise.resolve();
  await search(page, 'Alpha');
  try {
    await expect.poll(() => state.requests.at(-1).searchParams.get('search')).toBe('Alpha');
    await clearSearch(page); await expect(rows(page)).toHaveCount(10);
  } finally { release(); }
  await expect.poll(() => state.listResponses.length).toBe(3);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.locator('.directory-count')).toHaveText('23 customers');
  await expect(input(page)).toHaveValue(''); await expect(page).toHaveURL(/\/staff\/customers$/);
});

for (const width of [375, 768, 1600]) {
  test(`responsive ${width}px: search, table scroll, keyboard detail/back and profile fit viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const state = await setup(page); await expect(rows(page)).toHaveCount(10);
    await expect(input(page)).toBeVisible();
    const overflow = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(overflow.scroll, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.width);
    await view(page, customers[1]).scrollIntoViewIfNeeded(); await view(page, customers[1]).press('Enter');
    await expect(page.getByRole('heading', { name: customers[1].fullName, exact: true })).toBeVisible();
    await expect(page.getByText('Locked', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if (width === 375) {
      const policies = await page.getByRole('heading', { name: 'Insurance policies', exact: true }).boundingBox();
      const personal = await page.getByRole('heading', { name: 'Personal information', exact: true }).boundingBox();
      expect(policies.y).toBeLessThan(personal.y);
    }
    await breadcrumb(page).press('Enter'); await expect(rows(page)).toHaveCount(10);
    expect(state.documents).toHaveLength(1);
  });
}
