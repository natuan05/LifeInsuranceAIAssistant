import { test, expect } from '@playwright/test';

// Real Docker React/DOM lifecycle with synthetic API/socket/PDF responses.
// Assertions do not inspect native PDF page/zoom or prove Core/MinIO authorization.
const actor = { id: 'synthetic-policy-staff', role: 'STAFF', fullName: 'Synthetic Policy Staff',
  accountCode: 'STF-PDF', email: 'staff.pdf@dev.example.invalid', passwordChangeRecommended: false };
const owner = { id: 'synthetic-policy-owner', fullName: 'Synthetic Policy Owner', accountCode: 'CUS-PDF',
  email: 'customer.pdf@dev.example.invalid', phone: null, birth: null, address: null, status: 'ACTIVE' };
function policy(id = 'policy-a') {
  return { id, policyNumber: id === 'policy-a' ? 'SYN-PDF-A' : 'SYN-PDF-B', customerId: owner.id,
    product: { id: 'synthetic-product', productCode: 'SYN-PRODUCT', name: 'Synthetic Life Plan', isActive: true },
    customer: owner, status: 'ACTIVE', premiumAmount: '1000000.00', paymentFrequency: 'MONTHLY',
    nextDueDate: '2026-12-01', effectiveDate: '2026-01-01', expiryDate: '2046-01-01',
    sumAssured: '1000000000.00', currency: 'VND', benefitsSnapshot: null, benefitsSnapshotStatus: 'NOT_PROVIDED' };
}
const main = { documentId: 'synthetic-main', title: 'Synthetic Main Policy', kind: 'POLICY', accessScope: 'PRIVATE_POLICY',
  versionId: 'main-v1', versionNumber: '1.0', versionCreatedAt: '2026-01-01T00:00:00.000Z' };
const endorsement = { ...main, documentId: 'synthetic-endorsement', title: 'Synthetic Endorsement', kind: 'ENDORSEMENT', versionId: 'endorsement-v1' };
const frame = page => page.locator('iframe[title^="PDF preview:"]');
const detail = page => page.getByRole('region', { name: 'Policy details', exact: true });
const viewer = page => page.getByRole('region', { name: 'Policy PDF', exact: true });
const gate = () => { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; };

// A valid one-page synthetic PDF, generated entirely in memory, never rendered to images.
function pdf() {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R >>', '<< /Length 0 >>\nstream\n\nendstream'];
  let text = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(text)); text += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(text);
  text += `xref\n0 5\n0000000000 65535 f \n${offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('')}`;
  return Buffer.from(text + `trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}

async function setup(page, path = '/staff/policies/policy-a?search=SYN&status=ACTIVE&page=2', options = {}) {
  const state = { actor, items: [main, endorsement], counts: { detail: 0, catalog: 0, list: 0, view: 0, download: 0, files: 0 },
    detailFailure: null, catalogFailure: null, viewFailure: null, downloadFailure: null,
    detailDelay: null, catalogDelay: null, listDelay: null, beforeDetail: null, sessionFailure: null, ttl: 900000, documents: [], ...options };
  const sockets = [];
  page.on('request', request => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) state.documents.push(request.url());
  });
  await page.routeWebSocket('**/api/v1/realtime', socket => sockets.push(socket));
  await page.route('**/synthetic-policy-files/**', route => {
    state.counts.files++;
    return route.fulfill({ contentType: 'application/pdf', body: pdf() });
  });
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    const json = async (body, status = 200) => {
      try { await route.fulfill({ status, json: body }); }
      catch (error) { if (!request.failure()) throw error; }
    };
    const failure = async value => {
      if (value === 'network') { await route.abort('failed'); return true; }
      if (value) { if (value === 401) state.sessionFailure = 401; await json({}, value); return true; }
      return false;
    };
    if (path === '/api/v1/auth/me') return json(state.sessionFailure ? {} : { actor: state.actor, csrfToken: 'synthetic-pdf-csrf' }, state.sessionFailure || 200);
    if (path === '/api/v1/staff/policies') {
      state.counts.list++;
      if (state.listDelay) await state.listDelay;
      return json({ items: [policy(), policy('policy-b')], total: 12, page: Number(url.searchParams.get('page') || 1), pageSize: 10 });
    }
    if (path.endsWith('/documents') && path.startsWith('/api/v1/staff/policies/')) {
      state.counts.catalog++;
      const items = state.items.map(item => ({ ...item }));
      if (state.catalogDelay) await state.catalogDelay;
      if (await failure(state.catalogFailure)) return;
      return json({ policyId: path.split('/')[5], items, total: items.length, issues: [], availability: items.length ? 'AVAILABLE' : 'EMPTY', mainDocumentStatus: items.some(item => item.kind === 'POLICY') ? 'AVAILABLE' : 'NOT_PROVIDED' });
    }
    if (/\/staff\/policies\/[^/]+$/.test(path)) {
      state.counts.detail++;
      const row = policy(path.split('/').at(-1));
      if (state.beforeDetail) await state.beforeDetail(row.id, request);
      if (state.detailDelay) await state.detailDelay;
      if (await failure(state.detailFailure)) return;
      return json({ policy: row });
    }
    if (/\/staff\/documents\//.test(path)) {
      const intent = path.endsWith('/download') ? 'download' : 'view';
      state.counts[intent]++;
      if (await failure(state[intent + 'Failure'])) return;
      expect(request.headers()['x-csrf-token']).toBe('synthetic-pdf-csrf');
      const version = path.split('/').at(-2);
      return json({ url: new URL(`/synthetic-policy-files/${version}-${intent}-${state.counts[intent]}.pdf`, page.url()).href,
        expiresAt: new Date(Date.now() + state.ttl).toISOString() });
    }
    if (path.endsWith('/policies') && path.includes('/staff/customers/')) {
      state.counts.list++;
      if (state.listDelay) await state.listDelay;
      return json({ items: [policy()], total: 12, page: Number(url.searchParams.get('page') || 1), pageSize: 10 });
    }
    if (path === '/api/v1/staff/customers') return json({ items: [owner], total: 1, page: 1, pageSize: 10 });
    if (path.includes('/staff/customers/')) return json({ customer: owner });
    return json({ items: [], total: 0, page: 1, pageSize: 10 });
  });
  await page.goto(path);
  state.invalidate = async () => {
    await expect.poll(() => sockets.length).toBeGreaterThan(0);
    sockets.at(-1).send(JSON.stringify({ type: 'invalidate' }));
  };
  return state;
}

async function rememberFrame(page) {
  await expect(frame(page)).toBeVisible();
  await frame(page).evaluate(node => { window.__originalPolicyFrame = node; });
  return frame(page).getAttribute('src');
}
async function sameFrame(page, source) {
  expect(await frame(page).evaluate(node => node === window.__originalPolicyFrame)).toBe(true);
  await expect(frame(page)).toHaveAttribute('src', source);
}

for (const selected of ['main', 'endorsement']) {
  test(`realtime retains ${selected} iframe, disclosure, focus and scroll without issuing a new view grant`, async ({ page }) => {
    const state = await setup(page);
    if (selected === 'endorsement') await page.getByRole('button', { name: 'View Synthetic Endorsement', exact: true }).click();
    const summary = page.locator('summary').filter({ hasText: 'Policy information' });
    await summary.click();
    const source = await rememberFrame(page);
    await summary.focus();
    const scroll = await detail(page).evaluate(node => { node.scrollTop = 120; return node.scrollTop; });
    const views = state.counts.view, files = state.counts.files;
    const delayed = gate(); state.detailDelay = delayed.promise; state.catalogDelay = delayed.promise;
    const reads = state.counts.detail;
    try {
      await state.invalidate(); await expect.poll(() => state.counts.detail).toBeGreaterThan(reads);
      await state.invalidate(); await state.invalidate();
      await expect.poll(() => state.counts.detail).toBeGreaterThan(reads + 1);
      await sameFrame(page, source); await expect(summary).toBeFocused();
      expect(await summary.locator('..').evaluate(node => node.open)).toBe(true);
      expect(await detail(page).evaluate(node => node.scrollTop)).toBe(scroll);
      expect(state.counts.view).toBe(views); expect(state.counts.files).toBe(files);
    } finally { state.detailDelay = null; state.catalogDelay = null; delayed.release(); }
    await expect(viewer(page)).toHaveAttribute('aria-busy', 'false');
    await sameFrame(page, source); expect(state.counts.view).toBe(views); expect(state.documents).toHaveLength(1);
  });
}

for (const level of ['detail', 'catalog']) for (const failure of ['network', 500]) {
  test(`${level} ${failure} retains the current PDF with stale warning and retries in place`, async ({ page }) => {
    const state = await setup(page); const source = await rememberFrame(page);
    state[level + 'Failure'] = failure; await state.invalidate();
    await expect(detail(page).getByRole('alert').first()).toContainText('Previously loaded information may be out of date');
    await sameFrame(page, source);
    state[level + 'Failure'] = null;
    await detail(page).getByRole('button', { name: 'Try again', exact: true }).first().click();
    await expect(detail(page).getByRole('alert')).toHaveCount(0);
    await sameFrame(page, source); expect(state.counts.view).toBe(1); expect(state.documents).toHaveLength(1);
  });
}

for (const level of ['detail', 'catalog']) for (const status of [401, 403, 404]) {
  test(`${level} ${status} removes the previously visible PDF`, async ({ page }) => {
    const state = await setup(page); await rememberFrame(page);
    state[level + 'Failure'] = status; await state.invalidate();
    await expect(frame(page)).toHaveCount(0);
    if (status === 401) await expect(page).toHaveURL(/\/staff\/login/);
    else await expect(detail(page).getByRole('alert').first()).toContainText('no longer assigned');
  });
}

for (const status of [401, 403, 404]) {
  test(`initial view grant ${status} never creates a PDF iframe`, async ({ page }) => {
    await setup(page, undefined, { viewFailure: status });
    if (status === 401) await expect(page).toHaveURL(/\/staff\/login/);
    else await expect(viewer(page).getByRole('alert')).toContainText('no longer assigned');
    await expect(frame(page)).toHaveCount(0);
  });
}

test('catalog version change replaces the main PDF, and attachment removal never keeps its old frame', async ({ page }) => {
  const state = await setup(page); const old = await rememberFrame(page);
  state.items = [{ ...main, versionId: 'main-v2', versionNumber: '2.0' }, endorsement];
  await state.invalidate(); await expect(frame(page)).not.toHaveAttribute('src', old);
  await expect(frame(page)).toHaveAttribute('title', /version 2\.0/);
  await page.getByRole('button', { name: 'View Synthetic Endorsement', exact: true }).click();
  const attachment = await rememberFrame(page);
  state.items = [state.items[0]]; await state.invalidate();
  await expect(frame(page)).not.toHaveAttribute('src', attachment);
  await expect(viewer(page)).toContainText('selected document has changed');
  await expect(frame(page)).toHaveAttribute('title', /Synthetic Main Policy/);
});

test('missing main PDF has an explicit state and is not replaced by terms', async ({ page }) => {
  await setup(page, undefined, { items: [{ ...endorsement, kind: 'TERMS', title: 'Synthetic Terms' }] });
  await expect(page.getByRole('heading', { name: 'Policy PDF not provided', exact: true })).toBeVisible();
  await expect(frame(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'View Synthetic Terms', exact: true }).click();
  await expect(frame(page)).toBeVisible();
});

test('expired grant stays expired until explicit reload succeeds, and the renewed grant gets its own timer', async ({ page }) => {
  const state = await setup(page, undefined, { ttl: 900 });
  await expect(frame(page)).toBeVisible();
  await expect(viewer(page)).toContainText('preview link has expired');
  const before = state.counts.view; await state.invalidate();
  await expect(viewer(page)).toHaveAttribute('aria-busy', 'false');
  expect(state.counts.view).toBe(before); await expect(frame(page)).toHaveCount(0);
  state.viewFailure = 500;
  await viewer(page).getByRole('button', { name: 'Reload preview', exact: true }).click();
  await expect(viewer(page).getByRole('alert')).toBeVisible(); await expect(frame(page)).toHaveCount(0);
  state.viewFailure = null; state.ttl = 900000;
  await viewer(page).getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(frame(page)).toBeVisible();
  await expect(viewer(page).getByText('The preview link has expired.', { exact: true })).toHaveCount(0);
  await state.invalidate(); await expect(viewer(page)).toHaveAttribute('aria-busy', 'false');
  await expect(frame(page)).toBeVisible();
});

test('Lookup collapse/filter/page and background refresh keep the selected PDF and unsent search draft', async ({ page }) => {
  const state = await setup(page); const source = await rememberFrame(page);
  const input = page.getByRole('searchbox', { name: 'Search policies', exact: true });
  await input.fill('Unsent policy search');
  await page.getByRole('button', { name: 'Collapse policy results' }).click();
  await state.invalidate(); await expect(viewer(page)).toHaveAttribute('aria-busy', 'false');
  await sameFrame(page, source);
  await page.getByRole('button', { name: 'Expand policy results' }).click();
  await expect(input).toHaveValue('Unsent policy search');
  await page.getByRole('navigation', { name: 'Policy search pagination' }).getByRole('button', { name: 'Previous' }).click();
  await expect(page).not.toHaveURL(/page=2/); await sameFrame(page, source);
  await page.getByLabel('Status', { exact: true }).selectOption('PENDING');
  await expect(page).toHaveURL(/status=PENDING/); await sameFrame(page, source);
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Clear search', exact: true })).toHaveCount(0);
  await input.fill('Synthetic'); await input.press('Enter');
  await expect(page).toHaveURL(/search=Synthetic/); await expect(input).toBeFocused();
  await input.fill(''); await input.press('Enter');
  await expect(page).not.toHaveURL(/search=/); await expect(page).toHaveURL(/status=PENDING/);
  await sameFrame(page, source);
  expect(state.documents).toHaveLength(1);
});

test('switching policy aborts old metadata, and a late response cannot restore the previous PDF', async ({ page }) => {
  const state = await setup(page); await rememberFrame(page);
  const delayed = gate(); let oldRequest;
  state.beforeDetail = async (id, request) => { if (id === 'policy-a') { oldRequest = request; await delayed.promise; } };
  await state.invalidate(); await expect.poll(() => !!oldRequest).toBe(true);
  await page.getByRole('link').filter({ hasText: 'SYN-PDF-B' }).click();
  try {
    await expect(page).toHaveURL(/\/policy-b/);
    await expect.poll(() => oldRequest.failure()).toBeTruthy();
  } finally { delayed.release(); }
  await expect(detail(page).getByRole('heading', { name: 'SYN-PDF-B', exact: true })).toBeVisible();
  await expect(frame(page)).toBeVisible();
  expect(state.documents).toHaveLength(1);
});

test('Customers policyPage refetches in the background and pagination remains client-side', async ({ page }) => {
  const state = await setup(page, `/staff/customers/${owner.id}?search=Synthetic&policyPage=2`);
  const policies = page.getByRole('region', { name: 'Insurance policies', exact: true });
  await expect(policies.getByRole('link', { name: 'SYN-PDF-A', exact: true })).toBeVisible();
  const delayed = gate(); const previous = state.counts.list; state.listDelay = delayed.promise;
  await policies.locator('table').evaluate(node => { window.__originalPolicyTable = node; });
  try {
    await state.invalidate(); await expect.poll(() => state.counts.list).toBeGreaterThan(previous);
    await expect(policies.getByRole('link', { name: 'SYN-PDF-A', exact: true })).toBeVisible();
    expect(await policies.locator('table').evaluate(node => node === window.__originalPolicyTable)).toBe(true);
  } finally { state.listDelay = null; delayed.release(); }
  await expect(policies.getByRole('status')).toHaveCount(0);
  await policies.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(page).not.toHaveURL(/policyPage=2/); await expect(page).toHaveURL(/search=Synthetic/);
  expect(state.documents).toHaveLength(1);
});

test('download failure retains preview; retry requests a separate download grant and returns PDF bytes', async ({ page }) => {
  const state = await setup(page); const source = await rememberFrame(page);
  state.downloadFailure = 500;
  await viewer(page).getByRole('button', { name: 'Download PDF', exact: true }).click();
  await expect(viewer(page).getByRole('alert')).toContainText('Unable to download'); await sameFrame(page, source);
  state.downloadFailure = null;
  const downloadEvent = page.waitForEvent('download');
  await viewer(page).getByRole('button', { name: 'Download PDF', exact: true }).click();
  const download = await downloadEvent;
  const stream = await download.createReadStream(); const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  expect(Buffer.concat(chunks).equals(pdf())).toBe(true);
  await download.delete();
  await sameFrame(page, source); expect(state.counts.download).toBe(2); expect(state.counts.view).toBe(1);
  expect(state.documents).toHaveLength(1);
});

for (const status of [401, 403, 404]) {
  test(`download denial ${status} immediately removes an existing preview even with slow metadata`, async ({ page }) => {
    const state = await setup(page); await rememberFrame(page);
    const delayed = gate(); state.catalogDelay = delayed.promise; state.detailDelay = delayed.promise; state.downloadFailure = status;
    try {
      await viewer(page).getByRole('button', { name: 'Download PDF', exact: true }).click();
      await expect(frame(page)).toHaveCount(0);
      if (status === 401) await expect(page).toHaveURL(/\/staff\/login/);
    } finally { delayed.release(); }
  });
}

test('changing actor resets all private policy state before the new actor loads', async ({ page }) => {
  const state = await setup(page); const source = await rememberFrame(page);
  const delayed = gate(); state.detailDelay = delayed.promise;
  state.actor = { ...actor, id: 'different-synthetic-staff', fullName: 'Other Synthetic Staff' };
  try {
    await state.invalidate(); await expect(frame(page)).toHaveCount(0);
  } finally { state.detailDelay = null; delayed.release(); }
  await expect(frame(page)).toBeVisible(); await expect(frame(page)).not.toHaveAttribute('src', source);
});
