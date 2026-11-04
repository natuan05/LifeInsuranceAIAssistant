import { test, expect } from '@playwright/test';

const actor = { id: 'p03-staff', role: 'STAFF', fullName: 'Synthetic Product Staff', accountCode: 'STF-P03', email: 'p03@synthetic.invalid', passwordChangeRecommended: false };
const products = Array.from({ length: 12 }, (_, i) => ({ id: `product-${i + 1}`, name: `Synthetic Product ${String(i + 1).padStart(2, '0')}`,
  productCode: `SYN-PROD-${String(i + 1).padStart(2, '0')}`, summary: i === 1 ? null : 'Synthetic product description.', isActive: true }));
const document = (i = 1) => ({ documentId: `doc-${i}`, title: `Synthetic terms ${i}`, accessScope: 'PUBLIC', versionId: `doc-${i}-v1`, versionNumber: '1.0', versionCreatedAt: '2026-01-01T00:00:00.000Z' });
const frame = page => page.locator('iframe[title^="PDF preview:"]');
const detail = page => page.getByRole('region', { name: 'Product details', exact: true });
const documents = page => page.getByRole('region', { name: 'Product documents', exact: true });
const viewer = page => page.getByRole('region', { name: 'Product PDF', exact: true });
const gate = () => { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; };
function pdf() {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R >>', '<< /Length 0 >>\nstream\n\nendstream'];
  let text = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(text)); text += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(text);
  return Buffer.from(text + `xref\n0 5\n0000000000 65535 f \n${offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}
async function setup(page, path = '/staff/products/product-1', overrides = {}) {
  const state = { rows: products, docs: [document()], counts: { me: 0, list: 0, detail: 0, catalog: 0, view: 0, download: 0 }, navigations: [],
    listFailure: null, detailFailure: null, catalogFailure: null, viewFailure: null, downloadFailure: null,
    sessionFailure: null, delayDetail: null, delayView: null, ttl: 900000, errors: [], ...overrides };
  page.on('pageerror', error => state.errors.push(error.message));
  page.on('request', request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) state.navigations.push(request.url()); });
  await page.routeWebSocket('**/api/v1/realtime', () => {});
  await page.route('**/synthetic-product-files/**', route => route.fulfill({ contentType: 'application/pdf', body: pdf() }));
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    const json = async (body, status = 200, headers = {}) => {
      try { await route.fulfill({ status, json: body, headers }); } catch (error) { if (!request.failure()) throw error; }
    };
    const fail = async value => {
      if (value === 'network') { await route.abort('failed'); return true; }
      if (value) { if (value === 401) state.sessionFailure = 401; await json({}, value, value === 429 ? { 'Retry-After': '1' } : {}); return true; }
      return false;
    };
    if (path === '/api/v1/auth/me') { state.counts.me++; return json(state.sessionFailure ? {} : { actor, csrfToken: 'p03-csrf' }, state.sessionFailure || 200); }
    if (path === '/api/v1/staff/notifications') return json({ items: [], pageInfo: { hasMore: false, nextCursor: null } });
    if (path === '/api/v1/staff/customers') return json({ items: [], total: 0, page: 1, pageSize: 10 });
    if (path === '/api/v1/products') {
      state.counts.list++; if (await fail(state.listFailure)) return;
      const search = (url.searchParams.get('search') || '').toLowerCase(), page = Number(url.searchParams.get('page') || 1);
      const rows = state.rows.filter(x => (x.name + ' ' + x.productCode).toLowerCase().includes(search));
      return json({ items: rows.slice((page - 1) * 10, page * 10), total: rows.length, page, pageSize: 10 });
    }
    if (/\/products\/[^/]+\/documents$/.test(path)) {
      state.counts.catalog++; if (await fail(state.catalogFailure)) return;
      const start = url.searchParams.get('cursor') ? 20 : 0, items = state.docs.slice(start, start + 20);
      return json({ items, pageInfo: { hasMore: start + 20 < state.docs.length, nextCursor: start + 20 < state.docs.length ? 'page-two' : null } });
    }
    if (/\/products\/[^/]+$/.test(path)) {
      const id = path.split('/').at(-1); state.counts.detail++;
      if (id === 'product-1' && state.delayDetail) await state.delayDetail;
      if (await fail(state.detailFailure)) return;
      return json({ product: state.rows.find(x => x.id === id) ?? products[0] });
    }
    if (/\/products\/[^/]+\/documents\//.test(path)) {
      const intent = path.endsWith('/download') ? 'download' : 'view'; state.counts[intent]++;
      expect(request.postDataJSON()).toEqual({}); expect(request.headers()['x-csrf-token']).toBe('p03-csrf');
      if (intent === 'view' && state.delayView) await state.delayView;
      if (await fail(state[intent + 'Failure'])) return;
      return json({ url: new URL(`/synthetic-product-files/${path.split('/').at(-2)}-${intent}-${state.counts[intent]}.pdf`, page.url()).href,
        expiresAt: new Date(Date.now() + state.ttl).toISOString() });
    }
    return json({});
  });
  await page.goto(path); await expect(page.getByRole('heading', { name: path.startsWith('/staff/customers') ? 'Customers' : 'Products', exact: true })).toBeVisible();
  state.invalidate = () => page.evaluate(() => window.dispatchEvent(new Event('core:data-changed')));
  return state;
}
async function openPdf(page, name = 'Synthetic terms 1') {
  const select = documents(page).getByRole('combobox', { name: 'Document', exact: true });
  if (await select.count()) await select.selectOption({ label: `${name} - Version 1.0` });
  await expect(frame(page)).toBeVisible();
}

test('Products joins Tools; Enter, clear and retry preserve the document and focus', async ({ page }) => {
  const state = await setup(page, '/staff/customers');
  await page.getByRole('link', { name: 'Products', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Products', exact: true })).toHaveAttribute('aria-current', 'page');
  const input = page.getByRole('searchbox', { name: 'Search products', exact: true });
  await input.fill('PROD-02'); await input.press('Enter'); await expect(page).toHaveURL(/search=PROD-02/);
  await expect(page.getByRole('link', { name: /Synthetic Product 02/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toHaveCount(0); await expect(page.getByRole('button', { name: 'Clear search', exact: true })).toHaveCount(0);
  await input.fill(''); await input.press('Enter'); await expect(input).toBeFocused(); await expect(input).toHaveValue('');
  await expect(page).not.toHaveURL(/search=/); expect(state.navigations).toHaveLength(1); expect(state.errors).toEqual([]);
});
test('pagination, selected route and browser Back preserve search/page without F5', async ({ page }) => {
  const state = await setup(page, '/staff/products?search=SYN');
  await page.getByRole('button', { name: 'Next', exact: true }).click(); await expect(page).toHaveURL(/page=2/);
  await page.getByRole('link', { name: /Synthetic Product 11/ }).click(); await expect(detail(page).getByRole('heading', { name: 'Synthetic Product 11', exact: true })).toBeVisible();
  await page.goBack(); await expect(page).toHaveURL(/page=2/); await expect(page.getByRole('link', { name: /Synthetic Product 11/ })).toBeVisible();
  expect(state.navigations).toHaveLength(1);
});
test('summary null, empty documents and no-results have distinct useful states', async ({ page }) => {
  const state = await setup(page, '/staff/products/product-2', { docs: [] });
  await expect(detail(page)).toContainText('No description provided.'); await expect(documents(page)).toContainText('No product documents are currently available.');
  const input = page.getByRole('searchbox', { name: 'Search products', exact: true }); await input.fill('not-a-product'); await input.press('Enter');
  await expect(page.getByText('No products match your search.', { exact: true })).toBeVisible();
  await expect(detail(page)).toContainText('Synthetic Product 02'); expect(state.errors).toEqual([]);
});
test('preview/download use separate grants, original bytes and the shared CSRF without extra auth calls', async ({ page }) => {
  const state = await setup(page); const authReads = state.counts.me; await openPdf(page);
  await expect(documents(page).getByRole('combobox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'View PDF', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Refresh documents', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Close preview', exact: true })).toHaveCount(0);
  const downloadEvent = page.waitForEvent('download', { predicate: download => download.suggestedFilename().startsWith('SYN-PROD-01-') }); await viewer(page).getByRole('button', { name: 'Download PDF', exact: true }).click();
  const download = await downloadEvent, stream = await download.createReadStream(), chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  expect(Buffer.concat(chunks).equals(pdf())).toBe(true); expect(download.suggestedFilename()).toMatch(/^SYN-PROD-01-doc-1-v1.0.pdf$/);
  expect(state.counts.view).toBe(1); expect(state.counts.download).toBe(1); expect(state.counts.me).toBe(authReads); expect(state.navigations).toHaveLength(1);
});
test('background refresh retains the same iframe/src, scroll and unsent search', async ({ page }) => {
  const state = await setup(page); await openPdf(page);
  const source = await frame(page).getAttribute('src'); await frame(page).evaluate(node => { window.__productFrame = node; });
  const input = page.getByRole('searchbox', { name: 'Search products', exact: true }); await input.fill('Unsent draft');
  const position = await detail(page).evaluate(node => { node.scrollTop = 140; return node.scrollTop; });
  const catalogReads = state.counts.catalog; await state.invalidate(); await expect.poll(() => state.counts.catalog).toBeGreaterThan(catalogReads);
  await expect(documents(page).getByRole('button', { name: 'Refresh documents', exact: true })).toHaveCount(0);
  expect(await frame(page).evaluate(node => node === window.__productFrame)).toBe(true); await expect(frame(page)).toHaveAttribute('src', source);
  expect(await detail(page).evaluate(node => node.scrollTop)).toBe(position); await expect(input).toHaveValue('Unsent draft'); expect(state.counts.view).toBe(1);
});
test('load more appends one batch; refresh rechecks loaded pages and preserves a later selected file', async ({ page }) => {
  const state = await setup(page, undefined, { docs: Array.from({ length: 25 }, (_, i) => document(i + 1)) });
  await expect(documents(page).getByRole('combobox').locator('option:not([disabled])')).toHaveCount(20); const reads = state.counts.catalog;
  await documents(page).getByRole('button', { name: 'Load more documents', exact: true }).click(); await expect(documents(page).getByRole('combobox').locator('option:not([disabled])')).toHaveCount(25);
  expect(state.counts.catalog).toBe(reads + 1); await openPdf(page, 'Synthetic terms 25');
  const source = await frame(page).getAttribute('src'); await state.invalidate();
  await expect(documents(page).getByRole('button', { name: 'Refresh documents', exact: true })).toHaveCount(0); await expect(frame(page)).toHaveAttribute('src', source); expect(state.counts.view).toBe(2);
});
test('a new published version keeps the old preview until explicit version switch', async ({ page }) => {
  const state = await setup(page); await openPdf(page);
  const source = await frame(page).getAttribute('src');
  state.docs = [{ ...document(), versionId: 'doc-1-v2', versionNumber: '2.0' }]; await state.invalidate();
  await expect(frame(page)).toHaveAttribute('title', /version 1\.0/); await expect(documents(page)).toContainText('A new document version'); expect(state.counts.view).toBe(1);
  await expect(frame(page)).toHaveAttribute('src', source);
  await documents(page).getByRole('button', { name: 'Open version 2.0', exact: true }).click(); await expect(frame(page)).toHaveAttribute('title', /version 2\.0/); expect(state.counts.view).toBe(2);
});
test('removed document clears an automatically opened PDF', async ({ page }) => {
  const state = await setup(page); await openPdf(page);
  state.docs = []; await state.invalidate();
  await expect(frame(page)).toHaveCount(0);
  await expect(documents(page)).toContainText('This document is no longer available.');
});
for (const level of ['detail', 'catalog']) test(`${level} access loss clears the PDF without keeping stale metadata`, async ({ page }) => {
  const state = await setup(page); await openPdf(page); state[level + 'Failure'] = 404; await state.invalidate();
  await expect(frame(page)).toHaveCount(0); await expect(detail(page).getByRole('alert').first()).toContainText('no longer published');
});
test('document service errors preserve product information and retry only the failed region', async ({ page }) => {
  const state = await setup(page, undefined, { catalogFailure: 503 });
  await expect(detail(page).getByRole('heading', { name: 'Synthetic Product 01', exact: true })).toBeVisible();
  await expect(documents(page).getByRole('alert')).toBeVisible(); const productReads = state.counts.detail; state.catalogFailure = null;
  await documents(page).getByRole('button', { name: 'Retry documents', exact: true }).click(); await openPdf(page); expect(state.counts.detail).toBe(productReads);
});
test('quota honors Retry-After and never automatically reissues a grant', async ({ page }) => {
  await page.clock.install(); const state = await setup(page, undefined, { viewFailure: 429 });
  await expect.poll(() => state.counts.view).toBe(1);
  const retry = viewer(page).getByRole('button', { name: 'Try again', exact: true }); await expect(retry).toBeDisabled();
  const views = state.counts.view; state.viewFailure = null; await page.clock.runFor(1100); await expect(retry).toBeEnabled(); expect(state.counts.view).toBe(views);
  await retry.click(); await expect(frame(page)).toBeVisible();
});
test('a failed download does not reset a valid preview; denied download clears it', async ({ page }) => {
  const state = await setup(page); await openPdf(page); const source = await frame(page).getAttribute('src');
  state.downloadFailure = 503; await viewer(page).getByRole('button', { name: 'Download PDF', exact: true }).click();
  await expect(viewer(page).getByRole('alert')).toContainText('Unable to download'); await expect(frame(page)).toHaveAttribute('src', source);
  state.downloadFailure = 403; await viewer(page).getByRole('button', { name: 'Download PDF', exact: true }).click(); await expect(frame(page)).toHaveCount(0);
});
test('a late view response cannot restore another product or an expired session', async ({ page }) => {
  const delayed = gate(), state = await setup(page, undefined, { delayView: delayed.promise });
  await expect.poll(() => state.counts.view).toBe(1);
  await page.getByRole('link', { name: /Synthetic Product 02/ }).click(); await expect(detail(page).getByRole('heading', { name: 'Synthetic Product 02', exact: true })).toBeVisible();
  delayed.release(); await expect(frame(page)).toHaveCount(0);
  state.detailFailure = 401; await state.invalidate(); await expect(page).toHaveURL(/\/staff\/login/); await expect(frame(page)).toHaveCount(0);
});
test('a late product detail cannot overwrite a newer selection', async ({ page }) => {
  const state = await setup(page, '/staff/products'), delayed = gate(); state.delayDetail = delayed.promise;
  await page.getByRole('link', { name: /Synthetic Product 01/ }).click(); await expect.poll(() => state.counts.detail).toBeGreaterThan(0);
  await page.getByRole('link', { name: /Synthetic Product 02/ }).click();
  try { await expect(detail(page).getByRole('heading', { name: 'Synthetic Product 02', exact: true })).toBeVisible(); }
  finally { delayed.release(); }
  await expect(detail(page).getByRole('heading', { name: 'Synthetic Product 01', exact: true })).toHaveCount(0);
  expect(state.navigations).toHaveLength(1);
});
test('expired preview requires an explicit new grant without routine refresh or close controls', async ({ page }) => {
  const state = await setup(page, undefined, { ttl: 700 }); await openPdf(page);
  await expect(viewer(page)).toContainText('preview link has expired'); await expect(frame(page)).toHaveCount(0);
  const views = state.counts.view; await state.invalidate(); expect(state.counts.view).toBe(views); state.ttl = 900000;
  await viewer(page).getByRole('button', { name: 'Reload preview', exact: true }).click(); await expect(frame(page)).toBeVisible();
  await expect(viewer(page).getByRole('button', { name: 'Close preview', exact: true })).toHaveCount(0); await expect(viewer(page).getByRole('button', { name: 'Reload preview', exact: true })).toHaveCount(0);
});
test('collapse icon remains inside search; keyboard expand restores draft and the same PDF', async ({ page }) => {
  await setup(page); await openPdf(page); const source = await frame(page).getAttribute('src');
  const input = page.getByRole('searchbox', { name: 'Search products', exact: true }); await input.fill('Draft query');
  await page.getByRole('button', { name: 'Collapse product results', exact: true }).click();
  const expand = page.getByRole('button', { name: 'Expand product results', exact: true }); await expect(expand).toBeFocused(); await expand.press('Enter');
  await expect(input).toBeFocused(); await expect(input).toHaveValue('Draft query'); await expect(frame(page)).toHaveAttribute('src', source);
});
test('375px list/detail/back and 200% text zoom keep controls usable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 }); const state = await setup(page, '/staff/products?search=SYN');
  await page.getByRole('link', { name: /Synthetic Product 01/ }).click(); await expect(detail(page)).toBeVisible();
  await openPdf(page); await page.getByRole('link', { name: 'Back to results', exact: true }).click();
  await expect(page.getByRole('searchbox', { name: 'Search products', exact: true })).toHaveValue('SYN');
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  expect(await page.getByRole('region', { name: 'Products', exact: true }).evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  expect(state.navigations).toHaveLength(1); expect(state.errors).toEqual([]);
});
