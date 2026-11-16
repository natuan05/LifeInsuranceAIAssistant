import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

function fixture(action, runId) {
  return JSON.parse(execFileSync('docker', ['compose', '--profile', 'tests', 'run', '--rm', '-T', '--no-deps',
    'core-tests', 'node', 'test/support/browser-ticket-fixture.cjs'], {
    cwd: fileURLToPath(new URL('../../../../', import.meta.url)), input: JSON.stringify({ action, runId }),
    encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 90000,
  }));
}

function cleanupFixtures(runs, cleanup = run => fixture('cleanup', run)) {
  const errors = [];
  for (const run of runs) {
    try { expect(cleanup(run)).toEqual({ users: 0, tickets: 0 }); }
    catch (error) { errors.push(error); }
  }
  if (errors.length) throw new AggregateError(errors, 'Ticket fixture cleanup failed.');
}

test('A2 fixture cleanup attempts every run after failures', () => {
  for (const failure of ['throw', 'remaining-data']) {
    const attempted = [];
    expect(() => cleanupFixtures(['first', 'second'], run => {
      attempted.push(run);
      if (run === 'first') {
        if (failure === 'throw') throw new Error('Synthetic cleanup fault');
        return { users: 1, tickets: 0 };
      }
      return { users: 0, tickets: 0 };
    })).toThrow(AggregateError);
    expect(attempted).toEqual(['first', 'second']);
  }
});

async function setActor(context, actor) {
  await context.addCookies([
    { name: 'li_session', value: actor.token, domain: 'localhost', path: '/api/v1', httpOnly: true, sameSite: 'Lax' },
    { name: 'li_csrf', value: actor.csrf, domain: 'localhost', path: '/api/v1', httpOnly: true, sameSite: 'Lax' },
  ]);
}

async function openManual(page, title) {
  await page.getByRole('button', { name: 'Support Tickets', exact: false }).click();
  await page.getByRole('button', { name: 'New support ticket', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'New support ticket', exact: true });
  await expect(form.getByRole('textbox', { name: 'Ticket title', exact: true })).toHaveValue('');
  await expect(form.getByRole('textbox', { name: 'Ticket description', exact: true })).toHaveValue('');
  await form.getByRole('textbox', { name: 'Ticket title', exact: true }).fill(title);
  await form.getByRole('textbox', { name: 'Ticket description', exact: true }).fill(title + ' description');
  return form;
}

for (const operation of ['manual', 'confirm']) {
  test(`A2 actor switch discards pending ${operation} intent and late committed response`, async ({ browser }) => {
    test.setTimeout(180000);
    const runs = [randomUUID(), randomUUID()];
    const created = [];
    let context, release = () => {};
    try {
      created.push(runs[0]);
      const first = fixture('setup', runs[0]);
      created.push(runs[1]);
      const second = fixture('setup', runs[1]);
      context = await browser.newContext();
      await setActor(context, first.customer);
      const page = await context.newPage(), navigations = [], errors = [], submissions = [];
      page.setDefaultTimeout(15000);
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => {
        if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations.push(request.url());
        if (request.method() === 'POST' && /\/customers\/me\/tickets(?:\/manual)?$/.test(new URL(request.url()).pathname)) {
          submissions.push({ key: request.postDataJSON().clientRequestId, path: new URL(request.url()).pathname });
        }
      });
      let committed;
      const held = new Promise(resolve => { release = resolve; });
      let finished;
      const settled = new Promise(resolve => { finished = resolve; });
      const endpoint = operation === 'manual' ? '**/api/v1/customers/me/tickets/manual' : '**/api/v1/customers/me/tickets';
      await page.route(endpoint, async route => {
        if (route.request().method() !== 'POST' || committed) return route.continue();
        try {
          const response = await route.fetch();
          expect(response.status()).toBe(200);
          committed = await response.json();
          await held;
          // The old actor's request may already be aborted by the unmounted form.
          await route.fulfill({ response }).catch(error => {
            if (!route.request().failure()) throw error;
          });
        } finally { finished(); }
      });

      const oldTitle = operation === 'manual' ? `Synthetic old actor ${runs[0]}` : 'Synthetic browser draft';
      if (operation === 'manual') {
        await page.goto('/customer');
        const form = await openManual(page, oldTitle);
        await form.getByRole('button', { name: 'Submit request', exact: true }).click();
      } else {
        await page.goto(`/customer?conversationId=${first.conversationId}&ticketDraftId=${first.draftId}`);
        const review = page.getByRole('dialog', { name: 'Review support ticket', exact: true });
        await expect(review).toContainText(oldTitle);
        await review.getByRole('button', { name: 'Confirm ticket', exact: true }).click();
      }
      await expect.poll(() => Boolean(committed)).toBe(true);
      expect(submissions).toHaveLength(1);
      const oldKey = submissions[0].key;

      // Simulate another tab replacing the login, then use the app's normal auth revalidation.
      await setActor(context, second.customer);
      const refreshed = page.waitForResponse(response => response.url().endsWith('/api/v1/auth/me') && response.status() === 200);
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('core:data-changed', { detail: { type: 'invalidate' } })));
      expect((await (await refreshed).json()).actor.id).toBe(second.customer.id);
      await expect(page.locator('body')).toContainText(second.customer.fullName);
      await expect(page.locator('body')).not.toContainText(first.customer.fullName);
      await expect(page.locator('body')).not.toContainText(oldTitle);
      if (operation === 'confirm') {
        expect((await context.request.get(`/api/v1/customers/me/conversations/${first.conversationId}/ticket-drafts/${first.draftId}`)).status()).toBe(404);
        const unavailable = page.getByRole('dialog', { name: 'Review support ticket', exact: true });
        await expect(unavailable).toContainText('Unable to load this draft.');
        await unavailable.getByRole('button', { name: 'Close', exact: true }).click();
      }

      const newTitle = `Synthetic new actor ${runs[1]}`;
      const form = await openManual(page, newTitle);
      // The new actor gets a fresh form, not the old actor's unresolved intent.
      await expect(form.getByRole('textbox', { name: 'Ticket description', exact: true })).toHaveValue(newTitle + ' description');
      release();
      await settled;
      await expect(form).toBeVisible();
      await expect(page.getByRole('dialog', { name: 'Ticket details', exact: true })).toHaveCount(0);
      await expect(page.locator('body')).not.toContainText(committed.ticket.ticketCode);
      await expect(page.getByRole('button', { name: 'Check and retry', exact: true })).toHaveCount(0);
      expect(submissions).toHaveLength(1);
      expect((await context.request.get(`/api/v1/customers/me/tickets/by-client-request-id/${oldKey}`)).status()).toBe(404);
      expect((await context.request.get(`/api/v1/customers/me/tickets/${committed.ticket.id}`)).status()).toBe(404);

      await form.getByRole('button', { name: 'Submit request', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Ticket details', exact: true })).toContainText(newTitle);
      expect(submissions).toHaveLength(2);
      expect(submissions[1].key).not.toBe(oldKey);
      expect(submissions[1].path).toBe('/api/v1/customers/me/tickets/manual');
      const own = await (await context.request.get('/api/v1/customers/me/tickets?search=' + encodeURIComponent(newTitle))).json();
      expect(own.total).toBe(1);
      expect(own.items[0].id).not.toBe(committed.ticket.id);
      await setActor(context, first.customer);
      const oldReceipt = await context.request.get(`/api/v1/customers/me/tickets/by-client-request-id/${oldKey}`);
      expect(oldReceipt.status()).toBe(200);
      expect((await oldReceipt.json()).ticket.id).toBe(committed.ticket.id);
      expect(navigations).toHaveLength(1);
      expect(errors).toEqual([]);
    } finally {
      release();
      try { await context?.close(); }
      finally { cleanupFixtures(created); }
    }
  });
}
