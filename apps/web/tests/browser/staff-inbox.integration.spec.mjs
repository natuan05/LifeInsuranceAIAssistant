import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Tokens travel only through child-process memory, never a file, attachment or console.
function fixture(action, runId) {
  return JSON.parse(execFileSync('docker', ['compose', '--profile', 'tests', 'run', '--rm', '-T', '--no-deps', 'core-tests', 'node', 'test/support/browser-inbox-fixture.cjs'], { cwd: fileURLToPath(new URL('../../../../', import.meta.url)), input: JSON.stringify({ action, runId }), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 90000 }));
}
async function session(context, actor) {
  await context.addCookies([{ name: 'li_session', value: actor.token, domain: 'localhost', path: '/api/v1', httpOnly: true, sameSite: 'Lax' }, { name: 'li_csrf', value: actor.csrf, domain: 'localhost', path: '/api/v1', sameSite: 'Lax' }]);
}
test('real gateway: pending privacy, consent/Accept, full history and another Staff denied', async ({ browser }) => {
  test.setTimeout(180000);
  const runId = `i04-${randomUUID()}`;
  let staffContext, otherContext;
  try {
    const data = fixture('setup', runId);
    staffContext = await browser.newContext(); otherContext = await browser.newContext();
    await session(staffContext, data.staff); await session(otherContext, data.other);
    const page = await staffContext.newPage(); const requests = [];
    page.on('request', request => requests.push(new URL(request.url()).pathname));
    await page.goto(`/staff/inbox/${data.conversationId}?filter=requests`);
    await expect(page.getByRole('button', { name: 'Accept request', exact: true })).toBeVisible();
    expect(requests.filter(path => path.endsWith('/messages'))).toHaveLength(0);
    await page.getByRole('button', { name: 'Accept request', exact: true }).click();
    const transcript = page.getByRole('region', { name: 'Conversation messages', exact: true });
    await expect(transcript.locator('[data-message-id]')).toHaveCount(50);
    while (await page.getByRole('button', { name: 'Load earlier messages', exact: true }).count()) {
      const count = await transcript.locator('[data-message-id]').count();
      await page.getByRole('button', { name: 'Load earlier messages', exact: true }).evaluate(button => button.click());
      await expect.poll(() => transcript.locator('[data-message-id]').count()).toBeGreaterThan(count);
    }
    await expect(transcript.getByText('Synthetic I04 history 0', { exact: true })).toBeAttached();
    await expect(transcript.getByText('I04_INTERNAL_MUST_NOT_APPEAR')).toHaveCount(0);
    const other = await otherContext.newPage(); await other.goto(`/staff/inbox/${data.conversationId}`);
    await expect(other.getByRole('button', { name: 'Retry inbox', exact: true })).toBeVisible();
    await expect(other.getByRole('region', { name: 'Conversation messages', exact: true })).toHaveCount(0);
    await page.goto(`/staff/inbox/${data.privateId}`);
    await expect(page.getByRole('button', { name: 'Retry inbox', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Conversation messages', exact: true })).toHaveCount(0);
  } finally {
    await staffContext?.close(); await otherContext?.close(); fixture('cleanup', runId);
  }
});
