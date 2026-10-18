// Real guest web/API/Calendar integration using the disposable phone-QA account.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(path.resolve('package.json'));
const { chromium, webkit, expect, request } = require('@playwright/test');
const base = process.argv[2], stage = process.argv[3];
assert(base?.startsWith('https://')); assert(['candidate', 'production'].includes(stage));
const fixture = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'sideseat-first-plan-phone-private.json')));
assert(fixture.identifier.startsWith('planqa_phone120_'));
const out = path.resolve('docs/qa/evidence/2026-10-18-plans120'); fs.mkdirSync(out, { recursive: true });
const access = await request.newContext();
if (stage === 'candidate') {
  const privateAccess = JSON.parse(fs.readFileSync('/tmp/sideseat-plans120-candidate-access.json'));
  const granted = await access.get(privateAccess.url);
  assert.equal(new URL(granted.url()).origin, new URL(base).origin, 'Candidate access must stay on the deployment, not the Vercel login page.');
}
const storageState = await access.storageState();
const cookies = storageState.cookies.map(c => `${c.name}=${c.value}`).join('; ');
async function api(route, method = 'GET', body, expected = 200) {
  const r = await fetch(base + route, { method, headers: { Authorization: `Bearer ${fixture.accessToken}`, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID(), ...(cookies ? { Cookie: cookies } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const j = await r.json(); assert.equal(r.status, expected, `${method} ${route}: ${r.status} ${j.error?.message ?? ''}`); return j.data;
}
const date = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10), created = [], checks = [];
async function create(extra = {}) {
  const p = await api('/api/v1/time-polls', 'POST', { title: `Share120 ${stage} ${randomUUID().slice(0, 6)}`, timeZone: 'Europe/Berlin', dates: [date], startMinute: 540, endMinute: 660, expectedCount: 2, planningMode: 'COLLECT', ...extra }, 201);
  created.push(p.token); return p;
}
const endpoint = p => `/api/v1/time-polls/${p.token}`;
async function calendar(p) {
  const date = (p.chosenStart ?? p.slots[0].start).slice(0, 10);
  return (await api(`/api/v1/home/schedule?windowStart=${date}T00:00:00Z&windowEnd=${date}T23:59:59Z`)).studyEntries.filter(e => e.timePollToken === p.token);
}
try {
  for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch();
    const options = { baseURL: base, storageState, viewport: { width: 390, height: 844 }, colorScheme: engineName === 'webkit' ? 'dark' : 'light' };
    let context = await browser.newContext(options);
    try {
      let p = await create();
      p = await api(endpoint(p) + '/response', 'PUT', { displayName: 'Host Ming', slotIds: [0, 1, 2, 3] });
      let page = await context.newPage(); await page.goto(`/time-polls/${p.token}`);
      await expect(page.getByTestId('time-poll-grid')).toHaveCount(0);
      await page.getByLabel('你的名字', { exact: true }).waitFor({ timeout: 15000 }).catch(async error => {
        await page.screenshot({ path: `/tmp/sideseat-plans120-${stage}-initial-failure.png`, fullPage: true });
        console.error('Initial page:', new URL(page.url()).origin + new URL(page.url()).pathname, (await page.locator('body').innerText()).slice(0, 1800));
        throw error;
      });
      await page.getByLabel('你的名字', { exact: true }).fill(`Guest ${engineName}`);
      await page.getByRole('button', { name: '下一步：选择我的空闲', exact: true }).click();
      await expect(page.getByRole('button', { name: '保存并继续', exact: true })).toHaveCount(0);
      await page.getByTestId('time-poll-cell-0').click(); await page.getByTestId('time-poll-cell-2').click();
      await expect(page.getByRole('status')).toHaveText('已自动保存');
      await expect(page.getByTestId('time-poll-grid')).toBeVisible();
      await expect(page.getByTestId('availability-next-step')).toContainText('请回到这里点「确认参加」');
      await expect(page.getByRole('button', { name: '确认参加', exact: true })).toHaveCount(0);
      const cell = page.getByTestId('time-poll-cell-0');
      await expect(cell).toContainText('2');
      await cell.click(); await expect(cell).toHaveAttribute('aria-pressed', 'false');
      await expect(page.getByRole('status')).toHaveText('已自动保存');
      await expect(cell).toContainText('1');
      let edited = await api(endpoint(p));
      assert.deepEqual(edited.participants.find(x => x.isGuest).slotIds, [2, 3]);
      assert.deepEqual(edited.participants.find(x => !x.isGuest).slotIds, [0, 1, 2, 3]);
      await page.getByTestId('time-poll-undo').click();
      await expect(page.getByRole('status')).toHaveText('已自动保存');
      await expect(cell).toContainText('2');
      await page.reload();
      await expect(page.getByTestId('time-poll-cell-0')).toHaveAttribute('aria-pressed', 'true');
      p = await api(endpoint(p)); assert.equal(p.phase, 'COLLECTING'); assert.equal((await calendar(p)).length, 0);
      assert.deepEqual(p.participants.find(x => x.isGuest).slotIds, [0, 1, 2, 3]);
      await page.screenshot({ path: `${out}/${stage}-${engineName}-wait.png`, fullPage: true });
      checks.push(`${engineName}: real name/save/wait keeps COLLECTING and calendar empty`);
      await context.close(); context = await browser.newContext(options); page = await context.newPage(); await page.goto(`/time-polls/${p.token}`);
      await page.getByLabel('你的名字', { exact: true }).fill(`Guest ${engineName}`);
      await page.getByRole('button', { name: '下一步：选择我的空闲', exact: true }).click();
      await expect(page.getByTestId('time-poll-cell-0')).toHaveAttribute('aria-pressed', 'true');
      p = await api(endpoint(p)); assert.equal(p.participants.length, 2, 'same name resumes, no duplicate participant');
      p = await api(endpoint(p) + '/invitations', 'POST', { version: 0, start: p.slots[0].start, end: p.slots[3].end, attendeeIds: p.participants.map(x => x.id) });
      assert.equal(p.phase, 'INVITING'); assert.equal((await calendar(p)).length, 0);
      await page.reload(); await expect(page.getByRole('heading', { name: '最后一步：确认最终时间', exact: true })).toBeVisible();
      await page.getByRole('button', { name: '确认参加', exact: true }).click();
      await expect(page.getByRole('heading', { name: '计划已确定', exact: true })).toBeVisible();
      p = await api(endpoint(p)); assert.equal(p.phase, 'CONFIRMED'); assert.equal(p.invitations.filter(x => x.selected && x.status === 'ACCEPTED').length, 2);
      const entries = await calendar(p); assert.equal(entries.length, 1); assert.equal(entries[0].title, p.title);
      assert.equal(Date.parse(p.chosenEnd) - Date.parse(p.chosenStart), 3600000);
      await page.reload(); assert.equal((await calendar(p)).length, 1);
      await page.screenshot({ path: `${out}/${stage}-${engineName}-confirmed.png`, fullPage: true });
      checks.push(`${engineName}: same-name resume → exact invitation → explicit acceptance → one Calendar entry`);
      await api(endpoint(p) + '/cancel', 'POST', { version: p.invitationVersion }); assert.equal((await calendar(p)).length, 0);
      const fixed = await create({ planningMode: 'FIXED', fixedStart: `${date}T12:00:00Z`, durationMinutes: 60 });
      await page.goto(`/time-polls/${fixed.token}`); await page.getByLabel('你的名字', { exact: true }).fill(`Fixed ${engineName}`);
      await page.getByRole('button', { name: '继续查看邀请', exact: true }).click();
      assert.equal((await api(endpoint(fixed))).phase, 'INVITING'); assert.equal((await calendar(fixed)).length, 0);
      await expect(page.getByTestId('time-poll-grid')).toHaveCount(0);
      await page.getByRole('button', { name: 'Switch to English', exact: true }).click();
      await page.getByRole('button', { name: 'Confirm participation', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Plan confirmed', exact: true })).toBeVisible(); assert.equal((await calendar(fixed)).length, 1);
      checks.push(`${engineName}: FIXED name does not accept; English explicit confirmation writes Calendar`);
    } finally { await context.close(); await browser.close(); }
  }
  fs.writeFileSync(`${out}/${stage}-web-flows.json`, JSON.stringify({ base, stage, realNetwork: true, checkedAt: new Date().toISOString(), checks, passed: checks.length, failed: 0 }, null, 2) + '\n');
  console.log(`${stage}: ${checks.length} real guest/API/Calendar flow groups passed`);
} finally {
  for (const token of created) {
    let p = await api(`/api/v1/time-polls/${token}`);
    if (['INVITING', 'CONFIRMED'].includes(p.phase)) p = await api(endpoint(p) + '/cancel', 'POST', { version: p.invitationVersion });
    await api(`/api/v1/time-polls/${token}`, 'DELETE');
    const r = await fetch(base + `/api/public/time-polls/${token}`, { headers: cookies ? { Cookie: cookies } : {} }); assert.equal(r.status, 404);
  }
  const remainingPlans = (await api('/api/v1/time-polls')).polls.length;
  assert.equal(remainingPlans, 0, 'The disposable account returns to an empty Plans page.');
  fs.writeFileSync(`${out}/${stage}-web-cleanup.json`, JSON.stringify({ cleanedAt: new Date().toISOString(), plansDeleted: created.length, shareLinks404: created.length, remainingPlans }, null, 2) + '\n');
  await access.dispose();
}
