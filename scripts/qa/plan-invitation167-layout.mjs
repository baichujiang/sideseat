// Presentation checks use real disposable invitation links; business-flow acceptance is separate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, webkit, expect } from '@playwright/test';

const [base, stage] = process.argv.slice(2);
assert(base?.startsWith('https://')); assert(stage);
const fixture = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'sideseat-plan-contacts152-phone-private.json')));
const out = path.resolve(process.env.SIDESEAT_QA_OUTPUT); fs.mkdirSync(out, { recursive: true });
const cookies = process.env.SIDESEAT_CANDIDATE_COOKIE_FILE ? fs.readFileSync(process.env.SIDESEAT_CANDIDATE_COOKIE_FILE, 'utf8').split('\n')
  .filter(l => l.startsWith('#HttpOnly_') || (l && !l.startsWith('#'))).map(l => {
    const [domain, , cookiePath, secure, expires, name, value] = l.replace(/^#HttpOnly_/, '').split('\t');
    return { domain, path: cookiePath, secure: secure === 'TRUE', expires: Number(expires) || -1, name, value, httpOnly: l.startsWith('#HttpOnly_'), sameSite: 'Lax' };
  }) : [];
const checks = [], errors = [];
for (const [name, engine, width] of [['chromium', chromium, 390], ['webkit', webkit, 320]]) {
  const browser = await engine.launch();
  try {
    const context = await browser.newContext({ viewport: { width, height: 844 }, colorScheme: name === 'webkit' ? 'dark' : 'light' });
    if (cookies.length) await context.addCookies(cookies);
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    let mutations = 0;
    page.on('request', request => { if (request.url().includes('/api/public/time-polls/') && request.method() !== 'GET') mutations++; });
    for (const item of fixture.invitationCases) {
      await page.goto(`${base}/time-polls/${item.token}`);
      const table = page.getByTestId('plan-invitation-timetable'); await expect(table).toBeVisible();
      await expect(table.getByRole('heading')).toHaveCount(0);
      await expect(table.locator(':scope > p')).toHaveCount(0);
      const windows = table.getByTestId('plan-invitation-window'); await expect(windows).toHaveCount(item.days);
      await expect(table.getByText('受邀时段', { exact: true })).toHaveCount(item.days);
      const dimensions = await table.locator('table').evaluateAll(tables => tables.map(table => {
        const rows = [...table.querySelectorAll('tr[data-highlighted="true"]')];
        const window = table.querySelector('[data-testid="plan-invitation-window"]');
        const top = rows[0].getBoundingClientRect(), last = rows.at(-1).getBoundingClientRect(), box = window.getBoundingClientRect();
        return { rows: rows.length, rowSpan: window.parentElement.rowSpan, height: box.height, parentHeight: window.parentElement.getBoundingClientRect().height,
          top: box.top - top.top, bottom: last.bottom - box.bottom, rowHeight: top.height, labels: window.innerText.trim(), clientWidth: table.clientWidth };
      }));
      for (const d of dimensions) {
        assert.equal(d.rowSpan, d.rows); assert(d.height > 0); assert(d.top >= -1 && d.bottom >= -1);
        assert(d.height <= d.parentHeight + 1); assert.equal(d.labels, '受邀时段');
      }
      if (item.name === 'continuous') assert(Math.abs(dimensions[0].height - dimensions[0].rows * dimensions[0].rowHeight) <= 2);
      if (item.name === 'partial') {
        assert(Math.abs(dimensions[0].top - dimensions[0].rowHeight / 2) <= 2);
        assert(Math.abs(dimensions[0].bottom - dimensions[0].rowHeight / 2) <= 2);
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await windows.first().click(); assert.equal(mutations, 0, 'Read-only highlights must never submit or accept');
      await page.screenshot({ path: `${out}/${stage}-${name}-${item.name}.png`, fullPage: true });
      checks.push({ engine: name, width, case: item.name, windows: item.days, dimensions });
    }
    await context.close();
  } finally { await browser.close(); }
}
assert.deepEqual(errors, []);
fs.writeFileSync(`${out}/${stage}-web-layout.json`, JSON.stringify({ passed: true, checks, pageErrors: errors }, null, 2));
console.log(`${stage}: ${checks.length} invitation layout checks passed; no mutations or browser errors.`);
