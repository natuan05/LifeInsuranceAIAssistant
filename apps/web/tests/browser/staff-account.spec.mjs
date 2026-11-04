import { test, expect } from '@playwright/test';

// Browser regression against the real Docker UI with isolated synthetic API responses.
// These tests exercise DOM, keyboard and fetch handling, not Core authorization.
const initial = {
  id: 'synthetic-browser-staff', accountCode: 'STF-TEST', role: 'STAFF',
  email: 'staff.browser@dev.example.invalid', fullName: 'Synthetic Browser Staff',
  phone: null, department: 'Synthetic team', updatedAt: '2026-11-03T00:00:00.000Z',
};

async function setup(page, options = {}) {
  let staff = { ...initial };
  let reads = 0;
  const writes = [];
  let expired = false;
  const documents = [];
  page.on('request', request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents.push(request.url()); });
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body, status = 200) => route.fulfill({ status, json: body });
    if (path === '/api/v1/auth/me') return expired ? json({}, 401) : json({ actor: { ...staff, passwordChangeRecommended: false }, csrfToken: 'synthetic-browser-csrf' });
    if (path === '/api/v1/staff/me') {
      if (request.method() === 'GET') {
        reads++;
        if (options.loadFailure && reads === 1) return route.abort('failed');
        return json({ staff });
      }
      const body = request.postDataJSON();
      writes.push({ body, headers: request.headers() });
      if (options.patch) return options.patch({ route, json, body, expire: () => { expired = true; }, setStaff: value => { staff = value; } });
      staff = { ...staff, ...body, updatedAt: '2026-11-03T00:01:00.000Z' };
      return json({ staff });
    }
    // No mocked session is sent to real business APIs.
    return json({ items: [], total: 0, page: 1, pageSize: 10 });
  });
  await page.goto('/account');
  return { writes, documents };
}

const edit = page => page.getByRole('button', { name: 'Edit personal information', exact: true });
const form = page => page.getByRole('form', { name: 'Edit personal information' });
const name = page => page.getByRole('textbox', { name: 'Full name', exact: true });
const phone = page => page.getByRole('textbox', { name: /Phone number/ });
const save = page => page.getByRole('button', { name: 'Save changes', exact: true });

test('keyboard open, Tab order, Escape and Cancel restore focus and discard draft', async ({ page }) => {
  const { writes, documents } = await setup(page);
  await edit(page).focus();
  await page.keyboard.press('Enter');
  await expect(name(page)).toBeFocused();
  await expect(save(page)).toBeDisabled();
  await name(page).fill('Draft');
  await page.keyboard.press('Tab'); await expect(phone(page)).toBeFocused();
  await page.keyboard.press('Tab'); await expect(save(page)).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(edit(page)).toBeFocused();
  await edit(page).press('Enter'); await expect(name(page)).toHaveValue(initial.fullName);
  await name(page).fill('Another draft');
  await page.getByRole('button', { name: 'Cancel', exact: true }).press('Enter');
  await expect(edit(page)).toBeFocused();
  expect(writes).toHaveLength(0); expect(documents).toHaveLength(1);
});

test('Enter saves normalized payload, updates shell and restores focus without reload', async ({ page }) => {
  const { writes, documents } = await setup(page);
  await edit(page).click(); await name(page).fill('  Synthetic Updated Staff  ');
  await phone(page).fill('+99900012345'); await phone(page).press('Enter');
  await expect(page.getByRole('status')).toHaveText('Your profile has been updated.');
  await expect(edit(page)).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Synthetic Updated Staff', exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0].body).toEqual({ fullName: 'Synthetic Updated Staff', phone: '+99900012345', expectedUpdatedAt: initial.updatedAt });
  expect(writes[0].headers['x-csrf-token']).toBe('synthetic-browser-csrf');
  expect(documents).toHaveLength(1);
});

test('invalid phone and whitespace name never send PATCH; error receives focus', async ({ page }) => {
  const { writes } = await setup(page);
  await edit(page).click(); await name(page).fill('   '); await save(page).click();
  await expect(page.locator('p[role="alert"]')).toBeFocused();
  await expect(page.locator('p[role="alert"]')).toContainText('Enter a full name');
  await name(page).fill('Synthetic valid'); await phone(page).fill('abc'); await save(page).click();
  await expect(page.locator('p[role="alert"]')).toContainText('Use 7–15 digits');
  await expect(page.locator('p[role="alert"]')).toBeFocused(); expect(writes).toHaveLength(0);
});

test('pending save disables controls and prevents duplicate submit or Escape', async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { writes } = await setup(page, { patch: async ({ json, body }) => { await gate; return json({ staff: { ...initial, ...body } }); } });
  await edit(page).click(); await name(page).fill('Synthetic Pending'); await save(page).click();
  try {
    await expect(form(page)).toHaveAttribute('aria-busy', 'true');
    await expect(name(page)).toBeDisabled(); await expect(phone(page)).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
    await page.keyboard.press('Enter'); await page.keyboard.press('Escape');
    await expect(form(page)).toBeVisible(); expect(writes).toHaveLength(1);
  } finally { release(); }
  await expect(edit(page)).toBeFocused();
});

test('load failure retries in place and focuses Edit', async ({ page }) => {
  const { documents } = await setup(page, { loadFailure: true });
  await expect(page.locator('p[role="alert"]')).toContainText('Unable to load');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(edit(page)).toBeFocused(); expect(documents).toHaveLength(1);
});

for (const failure of ['network', 400, 403, 429, 500]) {
  test(`save failure ${failure} keeps draft, shows error and enables controls`, async ({ page }) => {
    const { writes, documents } = await setup(page, { patch: ({ route, json }) => failure === 'network' ? route.abort('failed') : json({}, failure) });
    await edit(page).click(); await name(page).fill('Synthetic Unsaved'); await save(page).click();
    await expect(page.locator('p[role="alert"]')).toBeVisible(); await expect(page.locator('p[role="alert"]')).toBeFocused();
    await expect(name(page)).toHaveValue('Synthetic Unsaved'); await expect(name(page)).toBeEnabled();
    await expect(page.getByText('Your profile has been updated.', { exact: true })).toHaveCount(0);
    expect(writes).toHaveLength(1); expect(documents).toHaveLength(1);
  });
}

test('409 blocks resubmit until explicit reload, then uses latest version', async ({ page }) => {
  let attempts = 0;
  const current = { ...initial, fullName: 'Synthetic Concurrent Update', updatedAt: '2026-11-03T00:02:00.000Z' };
  const { writes, documents } = await setup(page, { patch: ({ json, setStaff, body }) => {
    attempts++;
    if (attempts === 1) { setStaff(current); return json({}, 409); }
    return json({ staff: { ...current, ...body } });
  } });
  await edit(page).click(); await name(page).fill('Synthetic Conflict'); await save(page).click();
  await expect(page.locator('p[role="alert"]')).toContainText('Reload your profile');
  await expect(save(page)).toBeDisabled(); await expect(name(page)).toHaveValue('Synthetic Conflict');
  await phone(page).press('Enter'); expect(writes).toHaveLength(1);
  await page.getByRole('button', { name: 'Reload profile and discard changes' }).click();
  await expect(edit(page)).toBeFocused(); await edit(page).click();
  await expect(name(page)).toHaveValue(current.fullName);
  await name(page).fill('Synthetic After Reload'); await save(page).click();
  await expect(edit(page)).toBeVisible(); expect(writes[1].body.expectedUpdatedAt).toBe(current.updatedAt);
  expect(documents).toHaveLength(1);
});

test('expired session removes private form and redirects to Staff login', async ({ page }) => {
  await setup(page, { patch: ({ json, expire }) => { expire(); return json({}, 401); } });
  await edit(page).click(); await name(page).fill('Synthetic Expired'); await save(page).click();
  await expect(page).toHaveURL(/\/staff\/login$/);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(form(page)).toHaveCount(0); await expect(page.locator('#staff-full-name')).toHaveCount(0);
});

for (const width of [375, 768, 1600]) {
  test(`responsive ${width}px: form and error stay within viewport, keyboard cancel works`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await setup(page);
    await edit(page).click(); await name(page).fill('Synthetic Responsive');
    await phone(page).fill('invalid'); await save(page).click();
    await expect(page.locator('p[role="alert"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    for (const control of [name(page), phone(page), save(page)]) {
      await control.scrollIntoViewIfNeeded(); const box = await control.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    await name(page).focus(); await page.keyboard.press('Escape'); await expect(edit(page)).toBeFocused();
  });
}
