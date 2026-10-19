// Real browser gestures and API state: request coalescing, slow writes, retry and page departure.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { chromium, webkit, expect } from '@playwright/test';

const base = process.argv[2], stage = process.argv[3];
assert(base && ['candidate', 'production'].includes(stage));
const out = path.resolve('docs/qa/evidence/2026-10-20-plans136'); fs.mkdirSync(out, { recursive: true });
const privatePath = path.join(os.tmpdir(), `sideseat136-autosave-${stage}-private.json`);
assert(!fs.existsSync(privatePath), 'Clean the previous fixture first.');
const fixture = { accounts: [], tokens: [] }, checks = [], measurements = [];
const persist = () => fs.writeFileSync(privatePath, JSON.stringify(fixture), { mode: 0o600 });
const cookies = process.env.SIDESEAT_CANDIDATE_COOKIE_FILE
  ? fs.readFileSync(process.env.SIDESEAT_CANDIDATE_COOKIE_FILE, 'utf8').split('\n').filter(l => l.startsWith('#HttpOnly_') || (l && !l.startsWith('#'))).map(l => {
    const [domain, , cookiePath, secure, expires, name, value] = l.replace(/^#HttpOnly_/, '').split('\t');
    return { domain, path: cookiePath, secure: secure === 'TRUE', expires: Number(expires), name, value, httpOnly: l.startsWith('#HttpOnly_'), sameSite: 'Lax' };
  }) : [];
const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
async function call(route, account, method = 'GET', body, expected = 200) {
  const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', 'x-sideseat-platform': 'ios', 'Idempotency-Key': randomUUID(), ...(cookieHeader ? { Cookie: cookieHeader } : {}), ...(account ? { Authorization: `Bearer ${account.accessToken}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal(response.status, expected, `${method} ${route}: ${response.status}`);
  return [200, 201].includes(expected) ? (await response.json()).data : null;
}
try {
  persist();
  const owner = { identifier: `planqa_save136_${randomBytes(4).toString('hex')}`, password: randomBytes(22).toString('base64url') };
  await call('/api/auth/signup', null, 'POST', { username: owner.identifier, password: owner.password, displayName: 'Host Ming', school: 'TUM', studentStatus: 'CURRENT_STUDENT', degreeLevel: 'BACHELOR', semester: 3 }, 201);
  fixture.accounts.push(owner); persist();
  owner.accessToken = (await call('/api/v1/auth/login', null, 'POST', { identifier: owner.identifier, password: owner.password, device: { id: randomUUID(), name: 'Autosave verification', appVersion: '1.0.0', platformVersion: '26.6.1' } })).tokens.accessToken; persist();
  for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch();
    const context = await browser.newContext({ storageState: { cookies, origins: [] }, viewport: { width: 390, height: 844 }, locale: 'zh-CN' });
    const page = await context.newPage(), requests = [], errors = [];
    try {
      const date = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
      const p = await call('/api/v1/time-polls', owner, 'POST', { title: '一起约个时间', timeZone: 'Europe/Berlin', dates: [date], startMinute: 540, endMinute: 900 }, 201);
      fixture.tokens.push(p.token); persist();
      const api = `/api/v1/time-polls/${p.token}`, responseURL = `**/api/public/time-polls/${p.token}/response`;
      page.on('request', r => { if (r.method() === 'PUT' && r.url().endsWith(`/time-polls/${p.token}/response`)) requests.push({ at: Date.now(), slotIds: r.postDataJSON().slotIds }); });
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(`${base}/time-polls/${p.token}`);
      await page.getByLabel('你的名字', { exact: true }).fill('Guest Lin');
      await page.getByRole('button', { name: '下一步：选择我的空闲', exact: true }).click();
      const cell = n => page.getByTestId(`time-poll-cell-${n}`);
      const saved = () => expect(page.getByText('已自动保存', { exact: true })).toBeVisible();
      for (let n = 0; n < 20; n += 2) await cell(n).click({ force: true });
      await expect(cell(18)).toHaveAttribute('aria-pressed', 'true');
      await saved();
      assert.equal(requests.length, 1); assert.deepEqual(requests[0].slotIds, Array.from({ length: 20 }, (_, i) => i));
      assert.deepEqual((await call(api, owner)).participants.find(x => x.isGuest).slotIds, requests[0].slotIds);
      measurements.push({ engineName, rapidTaps: 10, saves: requests.length });
      checks.push(`${engineName}: ten rapid taps highlight immediately and produce one complete durable save`);

      let release, intercepted;
      const held = new Promise(r => { release = r; }), started = new Promise(r => { intercepted = r; });
      await page.route(responseURL, async route => { const result = await route.fetch(); intercepted(); await held; await route.fulfill({ response: result }); }, { times: 1 });
      await cell(0).click({ force: true }); await started;
      await cell(2).click({ force: true }); await cell(4).click({ force: true });
      const lastEdit = Date.now(); release();
      await expect(cell(4)).toHaveAttribute('aria-pressed', 'false');
      await saved();
      assert.equal(requests.length, 3);
      assert(requests[2].at - lastEdit >= 600, 'The next snapshot must still respect its quiet period after an older response.');
      assert.deepEqual((await call(api, owner)).participants.find(x => x.isGuest).slotIds, Array.from({ length: 14 }, (_, i) => i + 6));
      checks.push(`${engineName}: edits during a slow save remain visible and follow serially after their quiet period`);

      let fail, failStarted;
      const failGate = new Promise(r => { fail = r; }), failReady = new Promise(r => { failStarted = r; });
      await page.route(responseURL, async route => { failStarted(); await failGate; await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Autosave verification failure' } }) }); }, { times: 1 });
      await cell(6).click({ force: true }); await failReady;
      await cell(8).click({ force: true }); fail();
      await expect(page.getByText('保存失败', { exact: true })).toBeVisible();
      await expect(cell(6)).toHaveAttribute('aria-pressed', 'false'); await expect(cell(8)).toHaveAttribute('aria-pressed', 'false');
      assert.equal(requests.length, 4);
      await page.getByRole('button', { name: '重试保存', exact: true }).click(); await saved();
      assert.equal(requests.length, 5);
      assert.deepEqual(requests[4].slotIds, Array.from({ length: 10 }, (_, i) => i + 10));
      checks.push(`${engineName}: failure preserves the newest local choices and one explicit retry saves them`);

      await cell(10).click({ force: true });
      await page.goto('about:blank');
      await expect.poll(async () => (await call(api, owner)).participants.find(x => x.isGuest).slotIds).toEqual(Array.from({ length: 8 }, (_, i) => i + 12));
      await page.goto(`${base}/time-polls/${p.token}`);
      await expect(cell(10)).toHaveAttribute('aria-pressed', 'false'); await expect(cell(12)).toHaveAttribute('aria-pressed', 'true');
      checks.push(`${engineName}: leaving before the debounce deadline flushes and reopening restores the saved selection`);
      const body = { displayName: 'Host Ming', slotIds: [0, 1] };
      const first = await call(api + '/response', owner, 'PUT', body), duplicate = await call(api + '/response', owner, 'PUT', body);
      assert.equal(duplicate.updatedAt, first.updatedAt); assert.deepEqual(duplicate.mySlotIds, body.slotIds);
      checks.push(`${engineName}: an identical acknowledged snapshot returns current data without another plan update`);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: `${out}/${stage}-${engineName}-autosaved.png`, fullPage: true });
    } finally { await context.close(); await browser.close(); }
  }
  fs.writeFileSync(`${out}/${stage}-autosave.json`, JSON.stringify({ base, checkedAt: new Date().toISOString(), checks, measurements, passed: checks.length, failed: 0 }, null, 2));
  console.log(`${stage}: ${checks.length} autosave checks passed`);
} finally {
  const owner = fixture.accounts[0];
  for (const token of fixture.tokens) { await call(`/api/v1/time-polls/${token}`, owner, 'DELETE'); await call(`/api/public/time-polls/${token}`, null, 'GET', undefined, 404); }
  for (const account of fixture.accounts) { await call('/api/v1/me', account, 'DELETE', { confirmUsername: account.identifier }); await call('/api/v1/me', account, 'GET', undefined, 401); }
  fs.writeFileSync(`${out}/${stage}-autosave-cleanup.json`, JSON.stringify({ accountsDeleted: fixture.accounts.length, plansAndLinksDeleted: fixture.tokens.length, oldTokens401: fixture.accounts.length, links404: fixture.tokens.length }, null, 2));
  fs.unlinkSync(privatePath);
}
