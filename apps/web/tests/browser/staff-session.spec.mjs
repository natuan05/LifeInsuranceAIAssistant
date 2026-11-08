import { test, expect } from '@playwright/test';

// Real Docker UI, isolated synthetic API/socket responses; not Core authorization E2E.
const staff = { id: 'synthetic-session-staff', role: 'STAFF', accountCode: 'STF-SESSION',
  email: 'staff.session@dev.example.invalid', fullName: 'Synthetic Session Staff', passwordChangeRecommended: false };
const customer = { ...staff, id: 'synthetic-session-customer', role: 'CUSTOMER', accountCode: 'CUS-SESSION',
  email: 'customer.session@dev.example.invalid', fullName: 'Synthetic Session Customer' };
const session = actor => ({ actor, csrfToken: 'synthetic-session-csrf' });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const retry = page => page.getByRole('button', { name: 'Try again', exact: true });

async function setup(page, authenticate, actor = staff) {
  const state = { attempts: 0, active: 0, maxActive: 0, documents: [], authRequests: [], sockets: [] };
  page.on('request', request => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) state.documents.push(request.url());
  });
  await page.routeWebSocket('**/api/v1/realtime', socket => state.sockets.push(socket));
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = async (body, status = 200) => {
      try { await route.fulfill({ status, json: body }); }
      catch (error) { if (!request.failure()) throw error; }
    };
    if (path === '/api/v1/auth/me') {
      state.attempts++; state.active++; state.maxActive = Math.max(state.maxActive, state.active);
      state.authRequests.push(request);
      try { return await authenticate({ attempt: state.attempts, route, json, request }); }
      finally { state.active--; }
    }
    if (path === '/api/v1/staff/me') return json({ staff: { ...actor, phone: null, department: null, updatedAt: '2026-11-03T00:00:00.000Z' } });
    if (path === '/api/v1/customers/me') return json({ customer: { ...actor, status: 'ACTIVE', phone: null, birth: null, address: null }, assignmentStatus: 'UNASSIGNED', staff: null });
    if (path === '/api/v1/customers/me/conversations') return json({ items: [], pageInfo: { hasMore: false, nextCursor: null } });
    return json({ items: [], total: 0, page: 1, pageSize: 10 });
  });
  return state;
}

for (const failure of ['network', 500]) {
  test(`bootstrap ${failure}: keyboard retry restores Account without reload or losing query/hash`, async ({ page }) => {
    const state = await setup(page, ({ attempt, route, json }) => attempt === 1
      ? failure === 'network' ? route.abort('failed') : json({}, failure)
      : json(session(staff)));
    await page.goto('/account?tab=profile#personal');
    await expect(retry(page)).toBeFocused();
    await expect(page.getByRole('button', { name: 'Edit personal information' })).toHaveCount(0);
    await retry(page).press('Enter');
    await expect(page.getByRole('button', { name: 'Edit personal information' })).toBeVisible();
    await expect(page).toHaveURL(/\/account\?tab=profile#personal$/);
    expect(state.attempts).toBe(2); expect(state.maxActive).toBe(1); expect(state.documents).toHaveLength(1);
  });
}

test('repeated 500/403/429 errors allow manual retry and restore keyboard focus', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  const statuses = [500, 403, 429];
  const state = await setup(page, ({ attempt, json }) => attempt <= statuses.length ? json({}, statuses[attempt - 1]) : json(session(staff)));
  await page.goto('/account');
  for (let attempt = 1; attempt <= statuses.length; attempt++) {
    await expect(retry(page)).toBeEnabled(); await expect(retry(page)).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await retry(page).press('Enter');
  }
  await expect(page.getByRole('button', { name: 'Edit personal information' })).toBeVisible();
  expect(state.attempts).toBe(4); expect(state.documents).toHaveLength(1);
});

test('pending retry deduplicates click, focus, visibility and realtime triggers', async ({ page }) => {
  const gate = deferred();
  const state = await setup(page, async ({ attempt, json }) => {
    if (attempt === 1) return json({}, 500);
    await gate.promise; return json(session(staff));
  });
  await page.goto('/account'); await retry(page).click();
  try {
    await expect(retry(page)).toBeDisabled();
    await expect(page.getByRole('status')).toHaveText('Checking your session\u2026');
    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('core:data-changed'));
    });
    expect(state.attempts).toBe(2); expect(state.maxActive).toBe(1);
  } finally { gate.resolve(); }
  await expect(page.getByRole('button', { name: 'Edit personal information' })).toBeVisible();
  expect(state.documents).toHaveLength(1);
});

test('session request timeout re-enables retry without document navigation', async ({ page }) => {
  test.setTimeout(35000);
  const gate = deferred();
  const state = await setup(page, async ({ attempt, json }) => {
    if (attempt === 1) return json({}, 500);
    if (attempt === 2) await gate.promise;
    return json(session(staff));
  });
  await page.goto('/account'); await retry(page).click();
  try {
    await expect(retry(page)).toBeDisabled();
    await expect(retry(page)).toBeEnabled({ timeout: 22000 });
    await expect(retry(page)).toBeFocused();
    expect(state.authRequests[1].failure()).toBeTruthy();
  } finally { gate.resolve(); }
  await retry(page).press('Enter');
  await expect(page.getByRole('button', { name: 'Edit personal information' })).toBeVisible();
  expect(state.documents).toHaveLength(1);
});

for (const [path, destination] of [['/staff/customers?search=Alpha&page=2', '/staff/login'], ['/customer', '/login']]) {
  test(`retry 401 from ${path} goes to the correct portal and retains Staff next`, async ({ page }) => {
    const state = await setup(page, ({ attempt, json }) => json({}, attempt === 1 ? 500 : 401));
    await page.goto(path); await retry(page).press('Enter');
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
    const current = new URL(page.url());
    expect(current.pathname).toBe(destination);
    expect(current.searchParams.get('next')).toBe(destination === '/staff/login' ? path : null);
    await expect(page.getByText(staff.fullName, { exact: true })).toHaveCount(0);
    expect(state.documents).toHaveLength(1);
  });
}

test('Customer session recovered on a Staff route goes to Customer home', async ({ page }) => {
  const state = await setup(page, ({ attempt, json }) => attempt === 1 ? json({}, 500) : json(session(customer)), customer);
  await page.goto('/staff/customers'); await retry(page).press('Enter');
  await expect(page).toHaveURL(/\/customer$/);
  await expect(page.getByRole('heading', { name: `Welcome back, ${customer.fullName}`, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit personal information' })).toHaveCount(0);
  expect(state.documents).toHaveLength(1);
});

for (const path of ['/staff/login', '/login']) {
  test(`unauthenticated ${path} keeps the login form usable`, async ({ page }) => {
    await setup(page, ({ json }) => json({}, 401)); await page.goto(path);
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
    await expect(page.getByRole('textbox', { name: /Email address/ })).toBeEnabled();
    await expect(page.getByLabel(/^Password/)).toBeEnabled();
    await expect(page).toHaveURL(new RegExp(path + '$'));
  });
}

test('Customer Account also recovers in place with its own role', async ({ page }) => {
  const state = await setup(page, ({ attempt, route, json }) => attempt === 1 ? route.abort('failed') : json(session(customer)), customer);
  await page.goto('/account'); await retry(page).press('Enter');
  await expect(page.getByRole('heading', { name: 'Personal Information & Account Security', exact: true })).toBeVisible();
  await expect(page.getByText(customer.fullName, { exact: true }).first()).toBeVisible();
  expect(state.documents).toHaveLength(1);
});

test('switching portal aborts an old session request and ignores its late actor', async ({ page }) => {
  const gate = deferred();
  const state = await setup(page, async ({ attempt, json }) => {
    if (attempt === 1) { await gate.promise; return json(session(staff)); }
    return json({}, 401);
  });
  await page.goto('/staff/login');
  await expect.poll(() => state.attempts).toBe(1);
  await page.getByRole('link', { name: 'Customer Portal', exact: true }).click();
  try {
    await expect(page).toHaveURL(/\/login$/);
    await expect.poll(() => state.authRequests[0].failure()).toBeTruthy();
  } finally { gate.resolve(); }
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  await expect(page.getByText(staff.fullName, { exact: true })).toHaveCount(0);
  expect(state.documents).toHaveLength(1);
});

test('revalidation with a different actor removes the previous Staff Account', async ({ page }) => {
  await setup(page, ({ attempt, json }) => json(session(attempt === 1 ? staff : customer)), customer);
  await page.goto('/account');
  await expect(page.getByRole('button', { name: 'Edit personal information' })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('core:data-changed')));
  await expect(page.getByRole('heading', { name: 'Personal Information & Account Security', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit personal information' })).toHaveCount(0);
  await expect(page.getByText(staff.fullName, { exact: true })).toHaveCount(0);
});

async function passiveTriggers(page) {
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

async function socketSignal(page, state, type) {
  await expect.poll(() => state.sockets.length).toBeGreaterThan(0);
  await page.evaluate(() => {
    window.__sessionSignalSeen = false;
    window.addEventListener('core:data-changed', () => { window.__sessionSignalSeen = true; }, { once: true });
  });
  state.sockets.at(-1).send(JSON.stringify({ type }));
  await expect.poll(() => page.evaluate(() => window.__sessionSignalSeen)).toBe(true);
}

test('recent tab returns and socket ready do not recheck auth or disturb an unsaved profile', async ({ page }) => {
  const state = await setup(page, ({ json }) => json(session(staff)));
  await page.goto('/account');
  await page.getByRole('button', { name: 'Edit personal information' }).click();
  const name = page.getByRole('textbox', { name: 'Full name', exact: true });
  await name.fill('Synthetic unsaved name');
  for (let i = 0; i < 4; i++) await passiveTriggers(page);
  await socketSignal(page, state, 'ready');
  await expect(name).toHaveValue('Synthetic unsaved name'); await expect(name).toBeFocused();
  expect(state.attempts).toBe(1); expect(state.documents).toHaveLength(1);
});

test('passive checks honor the exact 30-second boundary and ignore hidden focus', async ({ page }) => {
  await page.clock.install();
  const state = await setup(page, ({ json }) => json(session(staff)));
  await page.goto('/account');
  await expect(page.getByRole('button', { name: 'Edit personal information' })).toBeVisible();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.evaluate(() => window.dispatchEvent(new Event('core:data-changed')));
  await expect.poll(() => state.attempts).toBe(2);
  await expect.poll(() => state.active).toBe(0);
  await page.clock.fastForward(29999); await passiveTriggers(page);
  expect(state.attempts).toBe(2);
  await page.clock.fastForward(1);
  await page.evaluate(() => Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }));
  await passiveTriggers(page); expect(state.attempts).toBe(2);
  await page.evaluate(() => Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }));
  await passiveTriggers(page); await expect.poll(() => state.attempts).toBe(3);
  await expect.poll(() => state.active).toBe(0);
  await passiveTriggers(page); expect(state.attempts).toBe(3);
  expect(state.maxActive).toBe(1); expect(state.documents).toHaveLength(1);
});

for (const type of ['invalidate', 'session-expired']) {
  test(`socket ${type} bypasses recent auth freshness and observes 401`, async ({ page }) => {
    const state = await setup(page, ({ attempt, json }) => attempt === 1 ? json(session(staff)) : json({}, 401));
    await page.goto('/account');
    await expect(page.getByRole('button', { name: 'Edit personal information' })).toBeVisible();
    await socketSignal(page, state, type);
    await expect(page).toHaveURL(/\/staff\/login/);
    await expect(page.getByRole('button', { name: 'Edit personal information' })).toHaveCount(0);
    expect(state.attempts).toBeGreaterThanOrEqual(2); expect(state.documents).toHaveLength(1);
  });
}

test('socket close 4001 rechecks current cookies without waiting for tab freshness', async ({ page }) => {
  const state = await setup(page, ({ attempt, json }) => attempt === 1 ? json(session(staff)) : json({}, 401));
  await page.goto('/account');
  await expect(page.getByRole('button', { name: 'Edit personal information' })).toBeVisible();
  await expect.poll(() => state.sockets.length).toBeGreaterThan(0);
  state.sockets.at(-1).close({ code: 4001 });
  await expect(page).toHaveURL(/\/staff\/login/);
});

test('session-expired during a pending check queues one recheck instead of losing revocation', async ({ page }) => {
  const gate = deferred();
  const state = await setup(page, async ({ attempt, json }) => {
    if (attempt === 2) { await gate.promise; return json(session(staff)); }
    return attempt === 1 ? json(session(staff)) : json({}, 401);
  });
  await page.goto('/account');
  await expect(page.getByRole('button', { name: 'Edit personal information' })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('core:data-changed')));
  try {
    await expect.poll(() => state.attempts).toBe(2);
    await socketSignal(page, state, 'session-expired');
    expect(state.attempts).toBe(2);
  } finally { gate.resolve(); }
  await expect(page).toHaveURL(/\/staff\/login/);
  expect(state.maxActive).toBe(1);
});

test('passive events do not loop after failure; manual retry still bypasses freshness', async ({ page }) => {
  const state = await setup(page, ({ attempt, json }) => attempt === 1 ? json({}, 500) : json(session(staff)));
  await page.goto('/account'); await expect(retry(page)).toBeEnabled();
  await passiveTriggers(page); await passiveTriggers(page);
  expect(state.attempts).toBe(1);
  await retry(page).press('Enter');
  await expect(page.getByRole('button', { name: 'Edit personal information' })).toBeVisible();
  expect(state.attempts).toBe(2); expect(state.documents).toHaveLength(1);
});

test('Customer Account expiry still uses the Customer login portal', async ({ page }) => {
  const state = await setup(page, ({ attempt, json }) => attempt === 1 ? json(session(customer)) : json({}, 401), customer);
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'Personal Information & Account Security', exact: true })).toBeVisible();
  await socketSignal(page, state, 'session-expired');
  await expect(page).toHaveURL(/\/login$/);
  expect(new URL(page.url()).pathname).toBe('/login');
});

test('old socket revocation keeps a newly verified session signed in', async ({ page }) => {
  const state = await setup(page, ({ json }) => json(session(staff)));
  await page.goto('/account');
  await expect(page.getByRole('button', { name: 'Edit personal information' })).toBeVisible();
  await expect.poll(() => state.sockets.length).toBeGreaterThan(0);
  state.sockets.at(-1).close({ code: 4001 });
  await expect.poll(() => state.attempts).toBe(2);
  await expect.poll(() => state.active).toBe(0);
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole('button', { name: 'Edit personal information' })).toBeVisible();
  expect(state.documents).toHaveLength(1);
});
