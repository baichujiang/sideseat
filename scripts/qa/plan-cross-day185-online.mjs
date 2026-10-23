// Real guest participation and cross-midnight invitations, using disposable data only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { fromZonedTime } from 'date-fns-tz';
import { chromium, webkit, expect } from '@playwright/test';
const [base, stage, engine = 'chromium'] = process.argv.slice(2);
assert(base && stage && ['chromium', 'webkit'].includes(engine));
const out = path.resolve(process.env.SIDESEAT_QA_OUTPUT || 'docs/qa/evidence/2026-10-23-cross-day185'); fs.mkdirSync(out, { recursive: true });
const privatePath = path.join(os.tmpdir(), `sideseat-crossday185-${stage}-${engine}-private.json`); assert(!fs.existsSync(privatePath));
const cookies = process.env.SIDESEAT_CANDIDATE_COOKIE_FILE ? fs.readFileSync(process.env.SIDESEAT_CANDIDATE_COOKIE_FILE, 'utf8').split('\n').filter(l => l.startsWith('#HttpOnly_') || (l && !l.startsWith('#'))).map(l => {
  const [domain, , cookiePath, secure, expires, name, value] = l.replace(/^#HttpOnly_/, '').split('\t');
  return { domain, path: cookiePath, secure: secure === 'TRUE', expires: Number(expires) || -1, name, value, httpOnly: l.startsWith('#HttpOnly_'), sameSite: 'Lax' };
}) : [];
const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
const fixture = { accounts: [], tokens: [] }, checks = [];
const persist = () => fs.writeFileSync(privatePath, JSON.stringify(fixture), { mode: 0o600 });
let failure, browser;
async function call(route, a, method = 'GET', body, status = 200) {
  const r = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', 'x-sideseat-platform': 'ios', 'Idempotency-Key': randomUUID(), ...(a ? { Authorization: `Bearer ${a.accessToken}` } : {}), ...(cookieHeader ? { Cookie: cookieHeader } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await r.json().catch(() => ({})); assert.equal(r.status, status, `${method} ${route}: ${r.status}; ${data.error?.message || ''}`); return data.data;
}
const check = s => { checks.push(s); console.log(`CROSS_DAY185 ${stage} ${engine}: ${s}`); };
const route = p => '/api/v1/time-polls/' + p.token;
async function entries(p, a) {
  const day = p.slots[0].date;
  return (await call(`/api/v1/home/schedule?windowStart=${day}T00:00:00Z&windowEnd=${new Date(Date.parse(day + 'T00:00:00Z') + 3 * 864e5).toISOString()}`, a)).studyEntries.filter(e => e.timePollToken === p.token);
}
try {
  persist();
  const a = { identifier: 'pqa_cross185_' + randomBytes(5).toString('hex'), password: randomBytes(22).toString('base64url') };
  await call('/api/auth/signup', null, 'POST', { username: a.identifier, password: a.password, displayName: 'Cross-day QA', school: 'TUM', studentStatus: 'CURRENT_STUDENT', degreeLevel: 'BACHELOR', semester: 3 }, 201);
  fixture.accounts.push(a); persist();
  const login = await call('/api/v1/auth/login', null, 'POST', { identifier: a.identifier, password: a.password, device: { id: randomUUID(), name: 'Cross-day QA', appVersion: '1.0.0', platformVersion: '26.6.1' } });
  a.accessToken = login.tokens.accessToken; persist();
  const dates = [3, 4].map(d => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10));
  let p = await call('/api/v1/time-polls', a, 'POST', { title: '跨天活动 · 夜间聚会', dates, timeZone: 'Europe/Berlin', startMinute: 540, endMinute: 660 }, 201);
  fixture.tokens.push(p.token); persist();
  const originalSlots = p.slots;
  p = await call(route(p) + '/response', a, 'PUT', { displayName: 'Owner', slotIds: [0, 1, 2, 3] });
  browser = await ({ chromium, webkit }[engine]).launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: engine === 'webkit' ? 'dark' : 'light' });
  if (cookies.length) await context.addCookies(cookies);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/time-polls/' + p.token);
  await page.getByLabel('你的名字', { exact: true }).fill('Lin');
  await page.getByRole('button', { name: '下一步：选择我的空闲', exact: true }).click();
  await page.getByTestId('time-poll-cell-0').click(); await page.getByTestId('time-poll-cell-2').click();
  await page.getByTestId('availability-submit').click();
  await expect.poll(async () => (await call(route(p), a)).summary.participantCount).toBe(2);
  p = await call(route(p), a); assert.deepEqual(p.mySlotIds, [0, 1, 2, 3]); assert.deepEqual(p.slots, originalSlots);
  check('guest fills and explicitly submits availability; original quarter IDs and owner response stay intact');
  const start = fromZonedTime(dates[0] + 'T23:00:00', p.timeZone).toISOString(), end = fromZonedTime(dates[1] + 'T01:00:00', p.timeZone).toISOString();
  await call(route(p) + '/invitations', a, 'POST', { version: 0, start, end: new Date(Date.parse(end) + 7 * 60e3).toISOString(), attendeeIds: p.invitees.map(x => x.id) }, 422);
  assert.equal((await call(route(p), a)).invitationVersion, 0);
  p = await call(route(p) + '/invitations', a, 'POST', { version: 0, start, end, attendeeIds: p.invitees.map(x => x.id) });
  assert.equal(p.phase, 'INVITING'); assert.equal(p.summary.participantCount, 2); assert.deepEqual(p.slots, originalSlots); assert.deepEqual(p.mySlotIds, [0, 1, 2, 3]); assert.equal((await entries(p, a)).length, 0);
  check('one exact continuous cross-midnight invitation works outside surveyed hours, without changing availability or creating a calendar');
  await page.reload(); await expect(page.getByTestId('plan-invitation-legend')).toHaveCount(2);
  await expect(page.getByTestId('plan-invitation-window')).toHaveCount(2);
  await expect(page.getByTestId('plan-invitation')).toContainText('23:00'); await expect(page.getByTestId('plan-invitation')).toContainText('01:00');
  await page.screenshot({ path: `${out}/${stage}-${engine}-invitation.png`, fullPage: true });
  await page.getByRole('button', { name: '确认参加', exact: true }).click();
  await expect.poll(async () => (await call(route(p), a)).invitations.filter(x => x.status === 'ACCEPTED').length).toBe(2);
  assert.equal((await entries(p, a)).length, 0);
  check('web highlights both dates; explicit acceptance preserves the wait-for-organizer rule');
  p = await call(route(p) + '/publish', a, 'POST', { version: 1 });
  for (let i = 0; i < 2; i++) {
    p = await call(route(p) + '/publish', a, 'POST', { version: 1 });
    const rows = await entries(p, a); assert.equal(rows.length, 1); assert.equal(rows[0].startISO, start); assert.equal(rows[0].endISO, end);
  }
  await page.reload(); await expect(page.getByText('计划已确定', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: `${out}/${stage}-${engine}-confirmed.png`, fullPage: true });
  check('organizer publication creates one exact cross-day calendar entry; publication retries never duplicate it');
  const same = await call('/api/v1/time-polls', a, 'POST', { title: 'Same-day compatibility', dates: [dates[0]], timeZone: p.timeZone, startMinute: 540, endMinute: 660 }, 201);
  fixture.tokens.push(same.token); persist();
  const invited = await call(route(same) + '/invitations', a, 'POST', { version: 0, start: same.slots[0].start, end: same.slots[3].end, attendeeIds: [], linkParticipantCount: 2 });
  assert.equal(invited.phase, 'INVITING'); assert.equal(invited.summary.participantCount, 0);
  const sent = await call(route(same) + '/publish', a, 'POST', { version: 1 }); assert.equal((await entries(sent, a)).length, 1);
  check('ordinary same-day clients and publication before others respond retain existing behavior');
  assert.deepEqual(errors, []); await context.close();
} catch (e) { failure = e; }
finally {
  if (browser) await browser.close();
  const cleanup = { accounts: 0, tokens401: 0, links404: 0, errors: [] };
  for (const a of fixture.accounts) {
    try { assert(a.identifier.startsWith('pqa_cross185_')); await call('/api/v1/me', a, 'DELETE', { confirmUsername: a.identifier }); cleanup.accounts++; await call('/api/v1/me', a, 'GET', undefined, 401); cleanup.tokens401++; }
    catch (e) { cleanup.errors.push(e.message); }
  }
  for (const token of fixture.tokens) {
    try { const r = await fetch(base + '/api/public/time-polls/' + token, { headers: cookieHeader ? { Cookie: cookieHeader } : {} }); assert.equal(r.status, 404); cleanup.links404++; } catch (e) { cleanup.errors.push(e.message); }
  }
  fs.writeFileSync(`${out}/${stage}-${engine}-result.json`, JSON.stringify({ passed: !failure, checks, cleanup, failure: failure?.message || null }, null, 2) + '\n');
  if (!cleanup.errors.length) fs.unlinkSync(privatePath);
  if (cleanup.errors.length && !failure) failure = new Error('Cleanup failed');
}
if (failure) throw failure;
