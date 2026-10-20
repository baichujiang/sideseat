// Organizer-controlled final sending, using disposable accounts and actual public browser UI.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { chromium, webkit, expect } from '@playwright/test';
const [base, stage = 'local'] = process.argv.slice(2); assert(base);
const out = path.resolve(process.env.SIDESEAT_QA_OUTPUT || 'docs/qa/evidence/2026-10-20-plans145'); fs.mkdirSync(out, { recursive: true });
const privatePath = path.join(os.tmpdir(), `sideseat-publish145-${stage}-private.json`); assert(!fs.existsSync(privatePath));
const fixture = { accounts: [], tokens: [] }, checks = [];
const persist = () => fs.writeFileSync(privatePath, JSON.stringify(fixture), { mode: 0o600 });
const cookies = process.env.SIDESEAT_CANDIDATE_COOKIE_FILE ? fs.readFileSync(process.env.SIDESEAT_CANDIDATE_COOKIE_FILE, 'utf8').split('\n').filter(l => l.startsWith('#HttpOnly_') || (l && !l.startsWith('#'))).map(l => {
  const [domain, , cookiePath, secure, expires, name, value] = l.replace(/^#HttpOnly_/, '').split('\t');
  return { domain, path: cookiePath, secure: secure === 'TRUE', expires: Number(expires), name, value, httpOnly: l.startsWith('#HttpOnly_'), sameSite: 'Lax' };
}) : [];
const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
async function call(route, account, method = 'GET', body, expected = 200) {
  const r = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', 'x-sideseat-platform': 'ios', 'Idempotency-Key': randomUUID(), ...(cookieHeader ? { Cookie: cookieHeader } : {}), ...(account ? { Authorization: `Bearer ${account.accessToken}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal(r.status, expected, `${method} ${route}: ${r.status}`);
  return [200, 201].includes(expected) ? (await r.json()).data : null;
}
const route = p => `/api/v1/time-polls/${p.token}`;
async function calendar(p, a) {
  const day = (p.chosenStart || p.slots[0].start).slice(0, 10);
  return (await call(`/api/v1/home/schedule?windowStart=${day}T00:00:00Z&windowEnd=${day}T23:59:59Z`, a)).studyEntries.filter(e => e.timePollToken === p.token);
}
try {
  persist();
  for (const role of ['owner', 'accepted', 'pending', 'declined']) {
    const a = { role, identifier: `planqa_pub145_${role}_${randomBytes(4).toString('hex')}`, password: randomBytes(22).toString('base64url') };
    await call('/api/auth/signup', null, 'POST', { username: a.identifier, password: a.password, displayName: role, school: 'TUM', studentStatus: 'CURRENT_STUDENT', degreeLevel: 'BACHELOR', semester: 3 }, 201);
    fixture.accounts.push(a); persist();
    a.accessToken = (await call('/api/v1/auth/login', null, 'POST', { identifier: a.identifier, password: a.password, device: { id: randomUUID(), name: 'Final plan QA', appVersion: '1.0.0', platformVersion: '26.6.1' } })).tokens.accessToken; persist();
  }
  const [owner, accepted, pending, declined] = fixture.accounts;
  const date = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch(), context = await browser.newContext({ storageState: { cookies, origins: [] }, viewport: { width: 390, height: 844 }, locale: 'zh-CN', colorScheme: engineName === 'webkit' ? 'dark' : 'light' });
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    try {
      let p = await call('/api/v1/time-polls', owner, 'POST', { title: '接受后由发起人正式发出', timeZone: 'Europe/Berlin', dates: [date], startMinute: 540, endMinute: 660 }, 201);
      fixture.tokens.push(p.token); persist();
      await call(route(p) + '/publish', owner, 'POST', { version: 1 }, 409);
      for (const a of [accepted, pending, declined]) p = await call(route(p) + '/response', a, 'PUT', { displayName: a.role, slotIds: [0, 1, 2, 3] });
      await page.goto(`${base}/time-polls/${p.token}`);
      await page.getByLabel('你的名字', { exact: true }).fill('网页朋友');
      await page.getByRole('button', { name: '下一步：选择我的空闲', exact: true }).click();
      await expect(page.getByTestId('time-poll-grid')).toBeVisible();
      await page.getByTestId('time-poll-cell-0').click(); await page.getByTestId('time-poll-cell-2').click();
      assert.equal((await call(route(p), owner)).participants.filter(i => i.isGuest).length, 0);
      await page.getByTestId('availability-submit').click();
      await expect.poll(async () => (await call(route(p), owner)).participants.filter(i => i.isGuest).length).toBe(1);
      p = await call(route(p), owner);
      p = await call(route(p) + '/invitations', owner, 'POST', { version: 0, start: p.slots[0].start, end: p.slots[3].end, attendeeIds: p.participants.map(i => i.id) });
      await call(route(p) + '/publish', accepted, 'POST', { version: 1 }, 404);
      await call(route(p) + '/publish', owner, 'POST', { version: 0 }, 422);
      await call(route(p) + '/publish', owner, 'POST', { version: 2 }, 409);
      await page.reload(); await expect(page.getByTestId('plan-invitation-timetable')).toBeVisible();
      await page.getByRole('button', { name: '暂不回复', exact: true }).click();
      assert.equal((await call(route(p), owner)).invitations.find(i => i.isGuest).status, 'INVITED');
      await page.getByRole('button', { name: '回复邀请', exact: true }).click();
      checks.push(`${engineName}: create → manual availability → select time/roster; explicit ignore preserves pending; owner/version guards`);
      p = await call(route(p) + '/invitation-response', accepted, 'PUT', { version: 1, status: 'ACCEPTED' });
      p = await call(route(p) + '/invitation-response', declined, 'PUT', { version: 1, status: 'DECLINED' });
      assert.equal(p.phase, 'INVITING'); for (const a of fixture.accounts) assert.equal((await calendar(p, a)).length, 0);
      p = await call(route(p) + '/publish', owner, 'POST', { version: 1 });
      assert.equal(p.phase, 'CONFIRMED'); assert.equal((await calendar(p, owner)).length, 1); assert.equal((await calendar(p, accepted)).length, 1);
      assert.equal((await calendar(p, pending)).length, 0); assert.equal((await calendar(p, declined)).length, 0);
      const entry = (await calendar(p, owner))[0];
      assert(!JSON.stringify(entry.eventParticipants).includes('pending'));
      assert(!JSON.stringify(entry.eventParticipants).includes('declined'));
      assert(JSON.stringify(entry.eventParticipants).includes('accepted'));
      assert.equal(p.invitations.find(i => i.displayName === 'pending').status, 'INVITED');
      await call(route(p) + '/publish', owner, 'POST', { version: 1 }); assert.equal((await calendar(p, accepted)).length, 1);
      checks.push(`${engineName}: pending + declined never block publication; only accepted calendars; repeat send stays unique`);
      await page.reload(); await expect(page.getByRole('button', { name: '确认参加', exact: true })).toBeVisible();
      await page.getByRole('button', { name: '确认参加', exact: true }).click();
      await expect(page.getByText('已接受参加 · 安排已正式发出', { exact: true })).toBeVisible();
      await page.screenshot({ path: `${out}/${stage}-${engineName}-published-guest.png`, fullPage: true });
      p = await call(route(p), owner); assert.equal(p.invitations.find(i => i.isGuest).status, 'ACCEPTED');
      p = await call(route(p) + '/invitation-response', pending, 'PUT', { version: 1, status: 'ACCEPTED' });
      assert.equal((await calendar(p, pending)).length, 1);
      p = await call(route(p) + '/invitation-response', accepted, 'PUT', { version: 1, status: 'DECLINED' });
      assert.equal((await calendar(p, accepted)).length, 0);
      p = await call(route(p) + '/invitation-response', accepted, 'PUT', { version: 1, status: 'ACCEPTED' });
      await call(route(p) + '/invitation-response', accepted, 'PUT', { version: 1, status: 'ACCEPTED' }); assert.equal((await calendar(p, accepted)).length, 1);
      await call(route(p) + '/invitation-response', owner, 'PUT', { version: 1, status: 'DECLINED' }, 409);
      await page.getByRole('button', { name: '无法参加', exact: true }).click();
      await expect(page.getByRole('button', { name: '已回复无法参加', exact: true })).toBeDisabled();
      p = await call(route(p), owner); assert.equal(p.invitations.find(i => i.isGuest).status, 'DECLINED');
      assert.equal((await calendar(p, owner)).length, 1);
      checks.push(`${engineName}: published link still accepts; later account joins/calendar unique; withdrawal removes only their entry; guest may decline`);
      // Nobody else has replied. A fixed invitation may still be finalized by its owner.
      let solo = await call('/api/v1/time-polls', owner, 'POST', { title: '随时发出 · 无需等人', timeZone: 'Europe/Berlin', dates: [date], startMinute: 540, endMinute: 660 }, 201);
      fixture.tokens.push(solo.token); persist();
      solo = await call(route(solo) + '/invitations', owner, 'POST', { version: 0, start: solo.slots[0].start, end: solo.slots[3].end, attendeeIds: [], linkParticipantCount: 4 });
      solo = await call(route(solo) + '/publish', owner, 'POST', { version: 1 }); assert.equal(solo.phase, 'CONFIRMED'); assert.equal((await calendar(solo, owner)).length, 1);
      await page.goto(`${base}/time-polls/${solo.token}`);
      await page.getByLabel('你的名字', { exact: true }).fill('发出后才加入'); await page.getByRole('button', { name: '继续查看邀请', exact: true }).click();
      await page.getByRole('button', { name: '确认参加', exact: true }).click(); await expect(page.getByText('已接受参加 · 安排已正式发出', { exact: true })).toBeVisible();
      solo = await call(route(solo), owner); assert.equal(solo.invitations.filter(i => i.selected && i.status === 'ACCEPTED').length, 2);
      checks.push(`${engineName}: owner-only publication below planned capacity; brand-new guest joins after sending`);
      let all = await call('/api/v1/time-polls', owner, 'POST', { title: '全员接受也由发起人发出', timeZone: 'Europe/Berlin', dates: [date], startMinute: 540, endMinute: 660, planningMode: 'FIXED', fixedStart: p.slots[0].start, durationMinutes: 60, expectedCount: 2 }, 201);
      fixture.tokens.push(all.token); persist(); all = await call(route(all) + '/invitation-response', accepted, 'PUT', { version: 1, status: 'ACCEPTED' });
      assert.equal(all.phase, 'INVITING'); assert.equal((await calendar(all, accepted)).length, 0);
      await call(route(all) + '/publish', owner, 'POST', { version: 1 }); assert.equal((await calendar(all, accepted)).length, 1);
      checks.push(`${engineName}: even all accepted requires organizer action; existing fixed invitation rules retain capacity`);
      await call(route(p) + '/cancel', owner, 'POST', { version: 1 });
      for (const a of fixture.accounts) assert.equal((await calendar(p, a)).length, 0);
      assert.deepEqual(errors, []); checks.push(`${engineName}: cancellation removes accepted calendars; no browser errors`);
    } finally { await browser.close(); }
  }
  fs.writeFileSync(`${out}/${stage}-publish145.json`, JSON.stringify({ base, checkedAt: new Date().toISOString(), passed: true, checks }, null, 2)); console.log(`${checks.length} end-to-end checks passed.`);
} finally {
  const owner = fixture.accounts[0];
  for (const token of fixture.tokens) {
    const p = await call(`/api/v1/time-polls/${token}`, owner);
    if (['INVITING', 'CONFIRMED'].includes(p.phase)) await call(route(p) + '/cancel', owner, 'POST', { version: p.invitationVersion });
    await call(route(p), owner, 'DELETE'); await call(`/api/public/time-polls/${token}`, null, 'GET', undefined, 404);
  }
  for (const a of fixture.accounts) { await call('/api/v1/me', a, 'DELETE', { confirmUsername: a.identifier }); await call('/api/v1/me', a, 'GET', undefined, 401); }
  fs.writeFileSync(`${out}/${stage}-publish145-cleanup.json`, JSON.stringify({ accounts: fixture.accounts.length, links404: fixture.tokens.length, tokens401: fixture.accounts.length, at: new Date().toISOString() }, null, 2));
  fs.unlinkSync(privatePath);
}
