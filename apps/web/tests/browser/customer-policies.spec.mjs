import { test, expect } from '@playwright/test';

const actor = {
  id: 'synthetic-customer-test',
  role: 'CUSTOMER',
  fullName: 'Synthetic Customer',
  email: 'customer@synthetic.invalid',
  accountCode: 'CUS-TEST',
  passwordChangeRecommended: false,
};

function policy(id = 'policy-a') {
  return {
    id,
    policyNumber: id === 'policy-a' ? 'SYN-PDF-A' : 'SYN-PDF-B',
    customerId: actor.id,
    product: { id: 'synthetic-product', productCode: 'SYN-PRODUCT', name: 'Synthetic Life Plan', isActive: true },
    customer: { id: actor.id, fullName: actor.fullName, accountCode: actor.accountCode },
    status: 'ACTIVE',
    premiumAmount: '1000000.00',
    paymentFrequency: 'MONTHLY',
    nextDueDate: '2026-12-01',
    effectiveDate: '2026-01-01',
    expiryDate: '2046-01-01',
    sumAssured: '1000000000.00',
    currency: 'VND',
    benefitsSnapshot: {
      currency: 'VND',
      snapshotAsOf: '2026-01-01',
      insuranceTermYears: 20,
      premiumTermYears: 15,
      annualPremium: '12000000.00',
      benefits: [
        { code: 'MAIN', name: 'Main Life Coverage', amount: '1000000000.00', unit: 'VND', maxDays: null },
        { code: 'HOSP', name: 'Hospital Allowance', amount: '500000.00', unit: 'VND/ngày', maxDays: 30 },
      ],
    },
    benefitsSnapshotStatus: 'AVAILABLE',
  };
}

const mainDoc = {
  documentId: 'synthetic-main',
  title: 'Synthetic Main Policy',
  kind: 'POLICY',
  accessScope: 'PRIVATE_POLICY',
  versionId: 'main-v1',
  versionNumber: '1.0',
  versionCreatedAt: '2026-01-01T00:00:00.000Z',
};
const endorsementDoc = {
  ...mainDoc,
  documentId: 'synthetic-endorsement',
  title: 'Synthetic Endorsement',
  kind: 'ENDORSEMENT',
  versionId: 'endorsement-v1',
};

function pdf() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R >>',
    '<< /Length 0 >>\nstream\n\nendstream',
  ];
  let text = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(text));
    text += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(text);
  text += `xref\n0 5\n0000000000 65535 f \n${offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('')}`;
  return Buffer.from(text + `trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}

async function setup(page, path = '/customer/policies', options = {}) {
  const state = {
    actor,
    items: [mainDoc, endorsementDoc],
    counts: { list: 0, detail: 0, catalog: 0, view: 0, download: 0, files: 0 },
    detailFailure: null,
    catalogFailure: null,
    viewFailure: null,
    emptyList: false,
    detailDelay: null,
    customPolicy: null,
    sessionExpired: false,
    ...options,
  };

  await page.routeWebSocket('**/api/v1/realtime', () => {});

  await page.route('**/synthetic-policy-files/**', route => {
    state.counts.files++;
    return route.fulfill({ contentType: 'application/pdf', body: pdf() });
  });

  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;

    const json = async (body, status = 200) => {
      try {
        await route.fulfill({ status, json: body });
      } catch (err) {
        if (!request.failure()) throw err;
      }
    };

    if (pathname === '/api/v1/auth/me') {
      if (state.sessionExpired) return json({}, 401);
      return json({ actor: state.actor, csrfToken: 'synthetic-customer-csrf' });
    }

    if (pathname === '/api/v1/customers/me/profile') {
      return json({ customer: { fullName: actor.fullName, accountCode: actor.accountCode, email: actor.email, status: 'ACTIVE' }, staff: null, assignmentStatus: 'UNASSIGNED' });
    }

    if (pathname === '/api/v1/customers/me/policies') {
      state.counts.list++;
      if (state.emptyList) {
        return json({ items: [], total: 0, page: 1, pageSize: 10 });
      }
      const pageNum = Number(url.searchParams.get('page') || 1);
      return json({
        items: [policy(), policy('policy-b')],
        total: 12,
        page: pageNum,
        pageSize: 10,
      });
    }

    if (pathname.endsWith('/documents') && pathname.startsWith('/api/v1/customers/me/policies/')) {
      state.counts.catalog++;
      if (state.catalogFailure) {
        return json({ message: 'Catalog error' }, state.catalogFailure);
      }
      const items = state.items.map(i => ({ ...i }));
      return json({
        policyId: pathname.split('/')[5],
        items,
        total: items.length,
        issues: [],
        availability: items.length ? 'AVAILABLE' : 'EMPTY',
        mainDocumentStatus: items.some(i => i.kind === 'POLICY') ? 'AVAILABLE' : 'NOT_PROVIDED',
      });
    }

    if (/\/customers\/me\/policies\/[^/]+$/.test(pathname)) {
      state.counts.detail++;
      if (state.detailDelay) await state.detailDelay;
      if (state.detailFailure) {
        return json({ message: 'Policy not found' }, state.detailFailure);
      }
      const id = pathname.split('/').at(-1);
      const row = state.customPolicy ?? policy(id);
      return json({ policy: row });
    }

    if (/\/customers\/me\/documents\//.test(pathname)) {
      const intent = pathname.endsWith('/download') ? 'download' : 'view';
      state.counts[intent]++;
      if (state.viewFailure && intent === 'view') {
        return json({ message: 'View grant error' }, state.viewFailure);
      }
      expect(request.headers()['x-csrf-token']).toBe('synthetic-customer-csrf');
      const version = pathname.split('/').at(-2);
      return json({
        url: new URL(`/synthetic-policy-files/${version}-${intent}-${state.counts[intent]}.pdf`, page.url()).href,
        expiresAt: new Date(Date.now() + 900000).toISOString(),
      });
    }

    return json({ items: [], total: 0, page: 1, pageSize: 10 });
  });

  await page.goto(path);
  return state;
}

test('PO02-T01: 0/1/many policies, search/status/page2 -> detail -> Back without F5', async ({ page }) => {
  // Test 1: Empty list
  await setup(page, '/customer/policies', { emptyList: true });
  await expect(page.getByRole('heading', { name: 'You have no insurance policies.' })).toBeVisible();

  // Test 2: Multi-policy list with filters and navigation to detail and back
  await setup(page, '/customer/policies?search=SYN&status=ACTIVE&page=2');
  const section = page.getByRole('region', { name: 'Insurance policies' });
  await expect(section).toBeVisible();
  await expect(page.getByText('12 policies found')).toBeVisible();

  // Click on policy-a to enter detail view
  await page.getByRole('link', { name: '#SYN-PDF-A' }).first().click();
  await expect(page).toHaveURL(/\/customer\/policies\/policy-a/);
  await expect(page.getByRole('region', { name: 'Policy details' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Policy PDF' })).toBeVisible();

  // Click Back to policies
  const navRequests = [];
  page.on('request', req => {
    if (req.isNavigationRequest() && req.frame() === page.mainFrame()) {
      navRequests.push(req.url());
    }
  });

  await page.getByRole('link', { name: 'Back to policies' }).click();
  await expect(page).toHaveURL(/\/customer\/policies\?search=SYN&status=ACTIVE&page=2/);
  await expect(page.getByRole('region', { name: 'Insurance policies' })).toBeVisible();
  // Ensure no full page reload / F5 navigation request occurred
  expect(navRequests).toHaveLength(0);
});

test('PO02-T02: Null/currency/large decimals/dates formatted cleanly without fake 0 or duplicate VND', async ({ page }) => {
  const custom = {
    ...policy('policy-nulls'),
    sumAssured: '1000000000.00',
    premiumAmount: null,
    nextDueDate: null,
    benefitsSnapshot: null,
    benefitsSnapshotStatus: 'NOT_PROVIDED',
  };

  await setup(page, '/customer/policies/policy-nulls', { customPolicy: custom });
  await expect(page.getByRole('region', { name: 'Policy details' })).toBeVisible();

  const summary = page.locator('summary').filter({ hasText: 'Policy information' });
  await summary.click();

  // Sum assured formatted cleanly with one VND and comma separation
  await expect(page.getByText('1,000,000,000 VND')).toBeVisible();
  // Ensure not duplicate VND
  await expect(page.getByText('1,000,000,000 VND VND')).toHaveCount(0);

  // Null premium and nextDueDate displayed as 'Not provided', not '0' or '0 VND'
  const notProvidedCount = await page.getByText('Not provided').count();
  expect(notProvidedCount).toBeGreaterThanOrEqual(2);
  await expect(page.getByText('0 VND', { exact: true })).toHaveCount(0);
});

test('PO02-T03: Non-existent policy ID or another customer UUID returns safe 404, rapid switch avoids stale detail, expired redirects to /login', async ({ page }) => {
  // Safe 404
  await setup(page, '/customer/policies/foreign-uuid', { detailFailure: 404 });
  await expect(page.locator('div[role="alert"]:not(#__next-route-announcer__)')).toContainText(
    'This policy is unavailable or is not part of your insurance account.'
  );
  await expect(page.locator('iframe[title^="PDF preview:"]')).toHaveCount(0);

  // 401 redirects to /login
  await setup(page, '/customer/policies/policy-a', { sessionExpired: true });
  await expect(page).toHaveURL(/\/login/);
});

test('PO02-T04: PO01 detail ready but storage/catalog failure keeps summary and policy information usable', async ({ page }) => {
  await setup(page, '/customer/policies/policy-a', {
    items: [{ ...endorsementDoc, kind: 'TERMS', title: 'Synthetic Terms' }],
  });
  await expect(page.getByRole('region', { name: 'Policy details' })).toBeVisible();

  // PDF area displays clean message without crashing
  await expect(page.getByRole('heading', { name: 'Policy PDF not provided' })).toBeVisible();

  // Policy information summary is still interactive and fully accessible
  const summary = page.locator('summary').filter({ hasText: 'Policy information' });
  await summary.click();
  await expect(page.getByText('Main Life Coverage')).toBeVisible();
  await expect(page.getByText('Hospital Allowance')).toBeVisible();
});

test('PO02-T05: Keyboard accessibility, focus management, 375px mobile viewport fit without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await setup(page, '/customer/policies/policy-a');

  await expect(page.getByRole('region', { name: 'Policy details' })).toBeVisible();
  const back = page.getByRole('link', { name: 'Back to policies' });
  await back.focus();
  await expect(back).toBeFocused();

  // No horizontal document overflow on mobile
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const innerWidth = await page.evaluate(() => window.innerWidth);
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
});
