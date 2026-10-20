// Explicit-submission acceptance against an isolated database or a verified deployment.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { chromium, webkit, expect } from '@playwright/test';
const base = process.argv[2], stage = process.argv[3] ?? 'stage1';
assert(base);
const out = path.resolve(process.env.SIDESEAT_QA_OUTPUT ?? 'docs/qa/evidence/2026-10-20-plans137-141');
fs.mkdirSync(out, { recursive: true });
const privatePath = path.join(os.tmpdir(), `sideseat-manual-${stage}-private.json`);
assert(!fs.existsSync(privatePath));
const fixture = { accounts: [], tokens: [] }, checks = [];
const persist = () => fs.writeFileSync(privatePath, JSON.stringify(fixture), { mode: 0o600 });
const cookies = process.env.SIDESEAT_CANDIDATE_COOKIE_FILE ? fs.readFileSync(process.env.SIDESEAT_CANDIDATE_COOKIE_FILE, 'utf8').split('\n').filter(l => l.startsWith('#HttpOnly_') || (l && !l.startsWith('#'))).map(l => {
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
  const owner = { identifier: `planqa_manual_${randomBytes(5).toString('hex')}`, password: randomBytes(22).toString('base64url') };
  await call('/api/auth/signup', null, 'POST', { username: owner.identifier, password: owner.password, displayName: 'Host Ming', school: 'TUM', studentStatus: 'CURRENT_STUDENT', degreeLevel: 'BACHELOR', semester: 3 }, 201);
  fixture.accounts.push(owner); persist();
  owner.accessToken = (await call('/api/v1/auth/login', null, 'POST', { identifier: owner.identifier, password: owner.password, device: { id: randomUUID(), name: 'Manual availability QA', appVersion: '1.0.0', platformVersion: '26.6.1' } })).tokens.accessToken; persist();
  for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch();
    const context = await browser.newContext({ storageState: { cookies, origins: [] }, viewport: { width: 1280, height: 1200 }, locale: 'zh-CN', hasTouch: stage === 'selection143' });
    const page = await context.newPage(), requests = [], errors = [];
    try {
      const dates = [new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10)];
      if (stage === 'selection143') dates.push(new Date(Date.now() + 4 * 864e5).toISOString().slice(0, 10));
      const p = await call('/api/v1/time-polls', owner, 'POST', { title: '手动提交完整验收', timeZone: 'Europe/Berlin', dates, startMinute: 540, endMinute: 900 }, 201);
      fixture.tokens.push(p.token); persist();
      const api = `/api/v1/time-polls/${p.token}`, responseURL = `**/api/public/time-polls/${p.token}/response`;
      const detail = () => call(api, owner), guest = async () => (await detail()).participants.find(x => x.isGuest);
      page.on('request', r => { if (r.method() === 'PUT' && r.url().endsWith(`/time-polls/${p.token}/response`)) requests.push(r.postDataJSON().slotIds); });
      page.on('pageerror', e => errors.push(e.message));
      page.on('dialog', d => void d.accept());
      await page.goto(`${base}/time-polls/${p.token}`);
      await page.getByLabel('你的名字', { exact: true }).fill('Guest Lin');
      await page.getByRole('button', { name: '下一步：选择我的空闲', exact: true }).click();
      const cell = n => page.getByTestId(`time-poll-cell-${n}`), submit = () => page.getByTestId('availability-submit').click();
      const saved = () => expect(page.getByText('已提交空闲', { exact: true })).toBeVisible();
      if (stage === 'selection143') {
        const assertSelected = async ids => {
          for (const slot of p.slots.filter(s => s.id % 2 === 0)) await expect(cell(slot.id)).toHaveAttribute('aria-pressed', String(ids.includes(slot.id)));
        };
        const undo = () => page.getByTestId('time-poll-undo').click();
        for (const id of [0, 4, 8, 24]) await cell(id).click();
        await assertSelected([0, 4, 8, 24]);
        await cell(4).click(); await assertSelected([0, 8, 24]);
        await undo(); await assertSelected([0, 4, 8, 24]);
        checks.push(`${engineName}: repeated disjoint taps retain every earlier cell across dates; erasing and undo affect only the intended change`);
        const drag = async (from, to) => {
          const a = await cell(from).boundingBox(), b = await cell(to).boundingBox();
          await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
          await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 }); await page.mouse.up();
        };
        await drag(12, 14); await assertSelected([0, 4, 8, 12, 14, 24]);
        await drag(0, 4); await assertSelected([8, 12, 14, 24]);
        await undo(); await assertSelected([0, 4, 8, 12, 14, 24]);
        checks.push(`${engineName}: paint and erase drags preserve selections outside the rectangle; undo restores the exact previous selection`);
        const secondDay = page.getByTestId(`time-poll-day-${dates[1]}`);
        const wholeSecondDay = p.slots.filter(s => s.date === dates[1] && s.id % 2 === 0).map(s => s.id);
        await secondDay.click(); await assertSelected([0, 4, 8, 12, 14, ...wholeSecondDay]);
        await secondDay.click(); await assertSelected([0, 4, 8, 12, 14]);
        await undo(); await assertSelected([0, 4, 8, 12, 14, ...wholeSecondDay]);
        checks.push(`${engineName}: date select/deselect never clears another day; undo retains both days`);
        const box = await cell(18).boundingBox();
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
        await assertSelected([0, 4, 8, 12, 14, 18, ...wholeSecondDay]);
        assert.equal(requests.length, 0); assert.equal((await detail()).participants.length, 0);
        checks.push(`${engineName}: touch tap preserves existing mouse/day selections without auto-submitting`);
        await page.getByRole('button', { name: '这些时间我都没空', exact: true }).click();
        await assertSelected([]);
      }
      for (let n = 0; n < 20; n += 2) { await cell(n).click(); await expect(cell(n)).toHaveAttribute('aria-pressed', 'true'); }
      await page.waitForTimeout(2100);
      assert.equal(requests.length, 0); assert.equal((await detail()).participants.length, 0);
      checks.push(`${engineName}: ten taps and two seconds waiting publish no availability`);
      if (stage !== 'stage1') {
        await expect(cell(0)).toHaveAttribute('aria-label', /0 人有空$/);
        await expect(page.getByText('已选 1 天 · 5 小时', { exact: true })).toBeVisible();
        checks.push(`${engineName}: own draft is highlighted but excluded from submitted counts; selected duration is visible`);
      }
      await submit(); await saved(); assert.equal(requests.length, 1);
      assert.deepEqual((await guest()).slotIds, Array.from({ length: 20 }, (_, i) => i));
      checks.push(`${engineName}: one explicit submission persists the complete selection`);
      if (stage !== 'stage1') {
        await expect(cell(0)).toHaveAttribute('aria-label', /1 人有空$/);
        checks.push(`${engineName}: submitted availability updates heatmap and respondent count together`);
      }
      let release, started;
      const gate = new Promise(r => { release = r; }), ready = new Promise(r => { started = r; });
      await page.route(responseURL, async route => { const response = await route.fetch(); started(); await gate; await route.fulfill({ response }); }, { times: 1 });
      await cell(0).click();
      if (stage !== 'stage1') {
        await expect(cell(0)).toHaveAttribute('aria-pressed', 'false');
        await expect(cell(0)).toHaveAttribute('aria-label', /1 人有空$/);
        checks.push(`${engineName}: editing a submitted response preserves its published heatmap until resubmission`);
      }
      await submit(); await ready;
      await cell(2).click(); release();
      await expect(page.getByText('未提交', { exact: true })).toBeVisible();
      await page.waitForTimeout(1100); assert.equal(requests.length, 2);
      await expect(cell(2)).toHaveAttribute('aria-pressed', 'false');
      assert.deepEqual((await guest()).slotIds, Array.from({ length: 18 }, (_, i) => i + 2));
      await submit(); await saved(); assert.equal(requests.length, 3);
      assert.deepEqual((await guest()).slotIds, Array.from({ length: 16 }, (_, i) => i + 4));
      checks.push(`${engineName}: edits during a slow response stay local until a second explicit submission`);
      await page.route(responseURL, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Submission QA failure' } }) }), { times: 1 });
      await cell(4).click(); await submit();
      await expect(page.getByText('提交失败', { exact: true })).toBeVisible();
      await page.waitForTimeout(1100); assert.equal(requests.length, 4);
      await expect(cell(4)).toHaveAttribute('aria-pressed', 'false');
      await submit(); await saved(); assert.equal(requests.length, 5);
      checks.push(`${engineName}: failed submission keeps choices and explicit retry succeeds`);
      await page.getByRole('button', { name: '这些时间我都没空', exact: true }).click();
      await submit(); await saved(); assert.deepEqual((await guest()).slotIds, []); assert.equal((await detail()).summary.participantCount, 1);
      checks.push(`${engineName}: empty availability is a submitted response`);
      await cell(0).click();
      await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
      await page.waitForTimeout(1100); assert.equal(requests.length, 6); assert.deepEqual((await guest()).slotIds, []);
      checks.push(`${engineName}: page departure never implicitly submits a draft`);
      let expectedWrites = 6;
      if (['stage5', 'candidate', 'production'].includes(stage)) {
        const restored = () => expect(page.getByText('已恢复草稿 · 未提交', { exact: true })).toBeVisible();
        await page.reload(); await restored(); await expect(cell(0)).toHaveAttribute('aria-pressed', 'true');
        assert.equal(requests.length, 6); assert.deepEqual((await guest()).slotIds, []);
        checks.push(`${engineName}: reload restores an explicitly unsubmitted local draft without any save`);
        const switchTo = async name => {
          await page.getByRole('button', { name: '切换填写人', exact: true }).click();
          await page.getByLabel('你的名字', { exact: true }).fill(name);
          await page.getByRole('button', { name: '下一步：选择我的空闲', exact: true }).click();
          await expect(page.getByLabel('你的名字', { exact: true })).not.toBeVisible();
          await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
        };
        await switchTo('Guest Other'); await expect(cell(0)).toHaveAttribute('aria-pressed', 'false');
        await cell(2).click(); await switchTo('Guest Lin'); await restored();
        await expect(cell(0)).toHaveAttribute('aria-pressed', 'true'); await expect(cell(2)).toHaveAttribute('aria-pressed', 'false');
        await switchTo('Guest Other'); await expect(cell(2)).toHaveAttribute('aria-pressed', 'true');
        await switchTo('Guest Lin');
        checks.push(`${engineName}: switching identities isolates and restores each guest's own draft`);
        const other = await call('/api/v1/time-polls', owner, 'POST', { title: 'Separate draft scope', timeZone: 'Europe/Berlin', dates: p.dates, startMinute: 540, endMinute: 660 }, 201);
        fixture.tokens.push(other.token); persist();
        await page.goto(`${base}/time-polls/${other.token}`);
        await page.getByLabel('你的名字', { exact: true }).fill('Guest Lin');
        await page.getByRole('button', { name: '下一步：选择我的空闲', exact: true }).click();
        await expect(cell(0)).toHaveAttribute('aria-pressed', 'false');
        await page.goto(`${base}/time-polls/${p.token}`); await restored(); await expect(cell(0)).toHaveAttribute('aria-pressed', 'true');
        checks.push(`${engineName}: drafts do not leak between plans`);
        let releaseOld, oldStarted;
        const oldGate = new Promise(r => { releaseOld = r; }), oldReady = new Promise(r => { oldStarted = r; });
        await page.route(responseURL, async route => { const response = await route.fetch(); oldStarted(); await oldGate; await route.fulfill({ response }); }, { times: 1 });
        await submit(); await oldReady; await cell(0).click(); releaseOld();
        await expect(page.getByTestId('availability-submit')).toBeEnabled();
        await page.reload(); await restored(); await expect(cell(0)).toHaveAttribute('aria-pressed', 'false');
        assert.deepEqual((await guest()).slotIds, [0, 1]); assert.equal(requests.length, 7);
        await submit(); await saved(); await page.reload(); await saved();
        assert.equal(requests.length, 8); assert.deepEqual((await guest()).slotIds, []);
        checks.push(`${engineName}: a newer draft that reverts to the previous server value survives an older acknowledgement and reload; its own acknowledgement clears it`);
        await page.route(responseURL, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Durable draft QA failure' } }) }), { times: 1 });
        await cell(0).click(); await submit(); await expect(page.getByText('提交失败', { exact: true })).toBeVisible();
        await page.reload(); await restored(); await expect(cell(0)).toHaveAttribute('aria-pressed', 'true');
        assert.equal(requests.length, 9); assert.deepEqual((await guest()).slotIds, []);
        await cell(0).click(); await submit(); await saved(); await cell(0).click();
        expectedWrites = 10;
        checks.push(`${engineName}: failed submissions restore after reload and remain private until explicit retry`);
      }
      if (!['stage1', 'stage2'].includes(stage)) {
        if (!['stage3', 'stage3-final'].includes(stage)) {
          await page.getByRole('button', { name: '编辑昵称', exact: true }).click();
          await page.getByLabel('你的名字', { exact: true }).fill('Guest Renamed');
          await page.getByRole('button', { name: '保存昵称', exact: true }).click();
          await expect(page.getByText('Guest Renamed', { exact: true }).first()).toBeVisible();
          await expect(cell(0)).toHaveAttribute('aria-pressed', 'true');
          assert.deepEqual((await guest()).slotIds, []); assert.equal(requests.length, expectedWrites);
          checks.push(`${engineName}: nickname action works with a draft and neither publishes nor clears availability`);
        }
        await call(api + '/response', owner, 'PUT', { displayName: 'Host Ming', slotIds: [0, 1] });
        await expect(cell(0)).toHaveAttribute('aria-label', /1 人有空$/, { timeout: 20000 });
        await expect(cell(0)).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByRole('status').filter({ hasText: '未提交' })).toBeVisible();
        assert.deepEqual((await guest()).slotIds, []);
        checks.push(`${engineName}: peer refresh continues with a dirty draft and never overwrites or publishes it`);
        const before = await detail();
        await call(api + '/invitations', owner, 'POST', { start: p.slots[0].start, end: p.slots[3].end, version: before.invitationVersion, attendeeIds: before.participants.map(x => x.id) });
        await expect(page.getByTestId('plan-invitation-timetable')).toBeVisible({ timeout: 20000 });
        const confirm = page.getByRole('button', { name: '确认参加', exact: true });
        await expect(confirm).toBeEnabled(); await confirm.click();
        await expect.poll(async () => (await detail()).phase).toBe('CONFIRMED');
        assert.deepEqual((await guest()).slotIds, []); assert.equal(requests.length, expectedWrites);
        checks.push(`${engineName}: incoming final invitation replaces collection view and confirms without submitting the availability draft`);
      }
      assert.deepEqual(errors, []);
      await page.setViewportSize({ width: 390, height: 844 });
      if (['stage1', 'stage2'].includes(stage)) await expect(page.getByTestId('availability-submit')).toBeInViewport();
      await page.screenshot({ path: `${out}/${stage}-${engineName}.png`, fullPage: true });
    } finally { await context.close(); await browser.close(); }
  }
  fs.writeFileSync(`${out}/${stage}.json`, JSON.stringify({ base, checkedAt: new Date().toISOString(), checks, passed: checks.length, failed: 0 }, null, 2));
  console.log(`${stage}: ${checks.length} checks passed`);
} finally {
  for (const token of fixture.tokens) { const p = await call(`/api/v1/time-polls/${token}`, fixture.accounts[0]); if (['INVITING', 'CONFIRMED'].includes(p.phase)) await call(`/api/v1/time-polls/${token}/cancel`, fixture.accounts[0], 'POST', { version: p.invitationVersion }); await call(`/api/v1/time-polls/${token}`, fixture.accounts[0], 'DELETE'); await call(`/api/public/time-polls/${token}`, null, 'GET', undefined, 404); }
  for (const account of fixture.accounts) { await call('/api/v1/me', account, 'DELETE', { confirmUsername: account.identifier }); await call('/api/v1/me', account, 'GET', undefined, 401); }
  fs.writeFileSync(`${out}/${stage}-cleanup.json`, JSON.stringify({ accountsDeleted: fixture.accounts.length, plansDeleted: fixture.tokens.length, links404: fixture.tokens.length, oldTokens401: fixture.accounts.length }, null, 2));
  fs.unlinkSync(privatePath);
}
