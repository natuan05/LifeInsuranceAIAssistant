import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Browsers run on the host against the Docker gateway. Web/Core never start here.
const workspace = fileURLToPath(new URL('../', import.meta.url));
const cli = fileURLToPath(new URL('../../../node_modules/@playwright/test/cli.js', import.meta.url));
const temporaryRoot = path.resolve(tmpdir());
const output = await mkdtemp(path.join(temporaryRoot, 'lifeinsurance-staff-browser-'));
const suites = ['staff-account.spec.mjs', 'staff-session.spec.mjs', 'staff-customers.spec.mjs', 'staff-policies.spec.mjs',
  'staff-inbox.spec.mjs', 'staff-foundation.integration.spec.mjs'];
try {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'test', ...suites, ...process.argv.slice(2)], { cwd: workspace, stdio: 'inherit',
      env: { ...process.env, BROWSER_TEST_BROWSERS: process.env.BROWSER_TEST_BROWSERS || 'chromium,firefox,webkit', BROWSER_TEST_OUTPUT_DIR: output,
        BROWSER_TEST_REPORTER: 'dot' } });
    child.once('error', reject); child.once('exit', value => resolve(value ?? 1));
  });
  const report = JSON.parse(await readFile(path.join(output, 'results.json'), 'utf8'));
  console.log(`Staff browser checks: ${report.stats.expected} passed, ${report.stats.unexpected} failed, ${report.stats.skipped} skipped.`);
  process.exitCode = code;
} finally {
  const resolved = path.resolve(output);
  if (!resolved.startsWith(temporaryRoot + path.sep) || !path.basename(resolved).startsWith('lifeinsurance-staff-browser-')) throw new Error('Unsafe test artifact cleanup path');
  await rm(resolved, { recursive: true, force: true });
}
