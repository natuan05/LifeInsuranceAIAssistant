import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

function fixture(action, runId) {
  return JSON.parse(execFileSync('docker', ['compose', '--profile', 'tests', 'run', '--rm', '-T', '--no-deps', 'product-document-tests', 'node', 'test/support/browser-product-fixture.cjs'], {
    cwd: fileURLToPath(new URL('../../../../', import.meta.url)), input: JSON.stringify({ action, runId }), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 90000,
  }));
}
async function session(browser, actor) {
  const context = await browser.newContext();
  await context.addCookies([{ name: 'li_session', value: actor.token, domain: 'localhost', path: '/api/v1', httpOnly: true, sameSite: 'Lax' },
    { name: 'li_csrf', value: actor.csrf, domain: 'localhost', path: '/api/v1', sameSite: 'Lax' }]);
  return context;
}
async function downloadHash(page) {
  const event = page.waitForEvent('download', { predicate: download => download.suggestedFilename().startsWith('P03-') });
  await page.getByRole('region', { name: 'Product PDF', exact: true }).getByRole('button', { name: 'Download PDF', exact: true }).click();
  const download = await event, stream = await download.createReadStream(), hash = createHash('sha256');
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}
test('real gateway: product search/page/PDF/download/publication and Customer role isolation', async ({ browser }) => {
  test.setTimeout(180000);
  const runId = randomUUID(); let staffContext, customerContext;
  try {
    const data = fixture('setup', runId);
    staffContext = await session(browser, data.staff); const page = await staffContext.newPage();
    const navigations = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations.push(new URL(request.url()).pathname); });
    await page.goto('/staff/products');
    const input = page.getByRole('searchbox', { name: 'Search products', exact: true });
    await input.fill(data.search); await input.press('Enter'); await expect(page.getByText('11 products', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Next', exact: true }).click(); await expect(page.getByRole('link', { name: /Synthetic P03 Product 11/ })).toBeVisible();
    await page.getByRole('button', { name: 'Previous', exact: true }).click(); await page.getByRole('link', { name: /Synthetic P03 Product 01/ }).click();
    const docs = page.getByRole('region', { name: 'Product documents', exact: true }), frame = page.locator('iframe[title^="PDF preview:"]');
    await expect(docs).not.toContainText('PRIVATE_P03_MUST_NOT_APPEAR');
     await expect(frame).toBeVisible();
    expect(await downloadHash(page)).toBe(data.checksum);
    await frame.evaluate(node => { window.__p03Frame = node; window.__p03Source = node.src; });
    await page.evaluate(() => window.dispatchEvent(new Event('core:data-changed')));
    await expect(docs.getByRole('button', { name: 'Refresh documents', exact: true })).toHaveCount(0);
    expect(await frame.evaluate(node => node === window.__p03Frame && node.src === window.__p03Source)).toBe(true);
    const denied = await staffContext.request.post(`/api/v1/products/${data.productId}/documents/${data.privateDocumentId}/versions/${data.privateVersionId}/view`, {
      data: {}, headers: { Origin: 'http://localhost:8080', 'X-Auth-Request': '1', 'X-CSRF-Token': data.staff.csrf },
    });
    expect(denied.status()).toBe(404);
    fixture('publish', runId); await page.evaluate(() => window.dispatchEvent(new Event('core:data-changed')));
    await expect(frame).toHaveAttribute('title', /version 1\.0/); await expect(docs).toContainText('A new document version'); await docs.getByRole('button', { name: 'Open version 2.0', exact: true }).click();
     await expect(frame).toHaveAttribute('title', /version 2\.0/);
    expect(await downloadHash(page)).toBe(data.checksumV2); expect(navigations).toHaveLength(1); expect(errors).toEqual([]);
    customerContext = await session(browser, data.customer); const customer = await customerContext.newPage();
    await customer.goto(`/staff/products/${data.productId}`); await expect(customer).toHaveURL(/\/customer/);
    await expect(customer.getByRole('region', { name: 'Products', exact: true })).toHaveCount(0);
  } finally {
    await staffContext?.close(); await customerContext?.close();
    const result = fixture('cleanup', runId); expect(result).toEqual({ objects: 0, users: 0, products: 0 });
  }
});
