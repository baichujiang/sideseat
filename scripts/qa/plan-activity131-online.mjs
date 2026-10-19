// Fresh owner/participant + real browser guest: ideas → interest → timetable → explicit consent → Calendar.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomBytes, randomUUID } from 'node:crypto';
import { chromium, webkit, expect } from '@playwright/test';
const base = process.argv[2], stage = process.argv[3];
assert(base && ['local', 'candidate', 'production'].includes(stage));
const out = path.resolve('docs/qa/evidence/2026-10-19-plans131'); fs.mkdirSync(out, { recursive: true });
const privatePath = path.join(os.tmpdir(), `sideseat131-${stage}-private.json`);
assert(!fs.existsSync(privatePath), 'Clean the previous disposable fixture first.');
const fixture = { base, accounts: [], tokens: [] }; const checks = [];
const protection = process.env.VERCEL_OIDC_TOKEN ? { 'x-vercel-trusted-oidc-idp-token': process.env.VERCEL_OIDC_TOKEN } : {};
async function call(route, account, method = 'GET', body, status = 200) {
  const response = await fetch(base + route, { method, headers: { ...protection, 'Content-Type': 'application/json', 'x-sideseat-platform': 'ios', 'Idempotency-Key': randomUUID(), ...(account ? { Authorization: `Bearer ${account.accessToken}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal(response.status, status, `${method} ${route}: expected ${status}, got ${response.status}`);
  return [200, 201].includes(status) ? (await response.json()).data : null;
}
const savePrivate = () => fs.writeFileSync(privatePath, JSON.stringify(fixture), { mode: 0o600 });
const route = p => `/api/v1/time-polls/${p.token}`;
async function calendar(p, account) {
  const day = (p.chosenStart || p.slots[0].start).slice(0, 10);
  return (await call(`/api/v1/home/schedule?windowStart=${day}T00:00:00Z&windowEnd=${day}T23:59:59Z`, account)).studyEntries.filter(e => e.timePollToken === p.token);
}
let cleanupPassed = false;
try {
  savePrivate();
  for (const role of ['owner', 'peer']) {
    const account = { role, identifier: `planqa_ideas131_${role}_${randomBytes(4).toString('hex')}`, password: randomBytes(22).toString('base64url') };
    await call('/api/auth/signup', null, 'POST', { username: account.identifier, password: account.password, displayName: role === 'owner' ? 'Host Ming' : 'Peer Lin', school: 'TUM', studentStatus: 'CURRENT_STUDENT', degreeLevel: 'BACHELOR', semester: 3 }, 201);
    fixture.accounts.push(account); savePrivate();
    account.accessToken = (await call('/api/v1/auth/login', null, 'POST', { identifier: account.identifier, password: account.password, device: { id: randomUUID(), name: 'Activity ideas verification', appVersion: '1.0.0', platformVersion: '26.6.1' } })).tokens.accessToken; savePrivate();
  }
  const [owner, peer] = fixture.accounts;
  const date = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch();
    const context = await browser.newContext({ extraHTTPHeaders: protection, viewport: { width: 390, height: 844 }, colorScheme: engineName === 'webkit' ? 'dark' : 'light' });
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    try {
      let p = await call('/api/v1/time-polls', owner, 'POST', { title: '这周末一起做点什么？', timeZone: 'Europe/Berlin', dates: [date], startMinute: 540, endMinute: 660, chooseActivityTogether: true }, 201);
      fixture.tokens.push(p.token); savePrivate();
      assert(p.activitySelection.isOpen); assert.equal(p.participants.length, 0); assert.equal(p.invitationVersion, 0);
      await page.goto(`${base}/time-polls/${p.token}`);
      await page.getByLabel('你的名字', { exact: true }).fill('Guest Lin');
      await page.getByRole('button', { name: '加入一起选活动', exact: true }).click();
      await expect(page.getByTestId('activity-ideas')).toBeVisible();
      await expect(page.getByTestId('time-poll-grid')).toHaveCount(0);
      checks.push(`${engineName}: shared theme opens into activity ideas, not an invitation`);
      p = await call(route(p) + '/activities', owner, 'POST', { title: '羽毛球', location: 'Campus court' });
      p = await call(route(p) + '/activities', peer, 'POST', { title: '火锅', location: 'Town centre' });
      const badminton = p.activitySelection.ideas.find(i => i.title === '羽毛球').id, hotpot = p.activitySelection.ideas.find(i => i.title === '火锅').id;
      assert((await call('/api/v1/time-polls', peer)).polls.some(row => row.token === p.token && row.activitySelection.hasParticipated));
      assert.equal(p.didRespond, false); assert.equal(p.participants.length, 0);
      await page.reload();
      await page.getByLabel('我想提议', { exact: true }).fill('逛展');
      await page.getByTestId('activity-suggest').click();
      await expect(page.getByRole('heading', { name: '逛展', exact: true })).toBeVisible();
      await page.getByTestId('activity-interest-' + badminton).click();
      await expect(page.getByTestId('activity-interest-' + badminton)).toHaveAttribute('aria-pressed', 'true');
      await page.getByTestId('activity-interest-' + hotpot).click();
      await expect(page.getByTestId('activity-interest-' + hotpot)).toHaveAttribute('aria-pressed', 'true');
      p = await call(route(p), owner); assert.equal(p.activitySelection.ideas.length, 3); assert.equal(p.participants.length, 0);
      assert.equal(p.activitySelection.ideas.find(i => i.id === hotpot).interestedBy.length, 1);
      await call(route(p) + '/activities/choose', peer, 'POST', { ideaId: hotpot }, 404);
      await call(route(p) + '/invitations', owner, 'POST', { version: 0, start: p.slots[0].start, end: p.slots[3].end, attendeeIds: ['not-yet-a-roster'] }, 409);
      assert.equal((await calendar(p, owner)).length, 0);
      await page.screenshot({ path: `${out}/${stage}-${engineName}-activity-ideas.png`, fullPage: true });
      checks.push(`${engineName}: App and guest suggestions, multiple interests, owner-only choice, no implicit attendance`);
      p = await call(route(p) + '/activities/interest', peer, 'PUT', { ideaId: hotpot, interested: true });
      p = await call(route(p) + '/activities/interest', peer, 'PUT', { ideaId: hotpot, interested: true });
      assert.equal(p.activitySelection.ideas.find(i => i.id === hotpot).interestedBy.length, 2);
      p = await call(route(p) + '/response', peer, 'PUT', { displayName: 'Peer Lin', slotIds: [0, 1, 2, 3] });
      await page.getByTestId('activity-show-timetable').click();
      await page.getByTestId('time-poll-cell-0').click(); await page.getByTestId('time-poll-cell-2').click();
      await expect(page.getByTestId('time-poll-cell-2')).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(async () => (await call(route(p), owner)).participants.find(x => x.isGuest)?.slotIds).toEqual([0, 1, 2, 3]);
      p = await call(route(p) + '/activities/choose', owner, 'POST', { ideaId: hotpot });
      assert(!p.activitySelection.isOpen); assert.equal(p.title, '火锅'); assert.equal(p.location, 'Town centre'); assert.equal(p.activitySelection.topic, '这周末一起做点什么？');
      assert.equal(p.invitationVersion, 0); assert.equal(p.chosenStart, null);
      assert(p.participants.every(person => JSON.stringify(person.slotIds) === '[0,1,2,3]'));
      await page.reload(); await expect(page.getByTestId('time-poll-grid')).toBeVisible();
      await expect(page.getByRole('heading', { level: 1, name: '火锅', exact: true })).toBeVisible();
      await expect(page.getByTestId('activity-ideas')).not.toBeVisible();
      await page.screenshot({ path: `${out}/${stage}-${engineName}-activity-chosen.png`, fullPage: true });
      checks.push(`${engineName}: free time can be filled before choice; same plan/link/guest and selections retained after choice`);
      p = await call(route(p) + '/response', owner, 'PUT', { displayName: 'Host Ming', slotIds: [0, 1, 2, 3] });
      p = await call(route(p) + '/invitations', owner, 'POST', { version: 0, start: p.slots[0].start, end: p.slots[3].end, attendeeIds: p.participants.map(x => x.id) });
      await call(route(p) + '/activities/choose', owner, 'POST', { ideaId: badminton }, 409);
      await call(route(p) + '/activities/interest', peer, 'PUT', { ideaId: hotpot, interested: false }, 409);
      await page.reload(); await expect(page.getByTestId('plan-invitation-timetable')).toBeVisible();
      await page.getByTestId('plan-invitation-cell-1').click();
      assert.equal((await calendar(p, owner)).length, 0);
      await page.getByRole('button', { name: '确认参加', exact: true }).click();
      await expect.poll(async () => (await call(route(p), owner)).invitations.filter(i => i.selected && i.status === 'ACCEPTED').length).toBe(2);
      assert.equal((await calendar(p, owner)).length, 0);
      p = await call(route(p) + '/invitation-response', peer, 'PUT', { status: 'ACCEPTED', version: p.invitationVersion });
      assert.equal(p.phase, 'CONFIRMED'); assert.equal((await calendar(p, owner)).length, 1); assert.equal((await calendar(p, peer)).length, 1);
      assert.equal((await calendar(p, owner))[0].title, '火锅');
      await page.reload(); await expect(page.getByRole('heading', { name: '计划已确定', exact: true })).toBeVisible();
      assert.equal((await calendar(p, owner)).length, 1); assert.deepEqual(errors, []);
      checks.push(`${engineName}: exact invitation, separate explicit confirmations and unique calendars with the chosen activity`);
      let old = await call('/api/v1/time-polls', owner, 'POST', { title: 'Already decided activity', timeZone: 'Europe/Berlin', dates: [date], startMinute: 540, endMinute: 660 }, 201);
      fixture.tokens.push(old.token); savePrivate();assert.equal(old.activitySelection, null);
      checks.push(`${engineName}: existing creation skips the optional activity stage`);
    } finally { await context.close(); await browser.close(); }
  }
  fs.writeFileSync(`${out}/${stage}-web-flows.json`, JSON.stringify({ base, stage, checkedAt: new Date().toISOString(), checks, passed: checks.length, failed: 0 }, null, 2));
  console.log(`${stage}: ${checks.length} activity-to-calendar checks passed`);
} finally {
  const owner = fixture.accounts[0];
  for (const token of fixture.tokens) {
    let p = await call(`/api/v1/time-polls/${token}`, owner);
    if (['INVITING', 'CONFIRMED'].includes(p.phase)) await call(route(p) + '/cancel', owner, 'POST', { version: p.invitationVersion });
    await call(route(p), owner, 'DELETE');
    await call(`/api/public/time-polls/${token}`, null, 'GET', undefined, 404);
  }
  for (const account of fixture.accounts) {
    if (!account.accessToken) continue;
    await call('/api/v1/me', account, 'DELETE', { confirmUsername: account.identifier }); await call('/api/v1/me', account, 'GET', undefined, 401);
  }
  cleanupPassed = true;
  fs.writeFileSync(`${out}/${stage}-cleanup.json`, JSON.stringify({ accountsDeleted: fixture.accounts.length, plansAndLinksDeleted: fixture.tokens.length, oldTokens401: fixture.accounts.length, links404: fixture.tokens.length, cleanupPassed }, null, 2));
  if (cleanupPassed) fs.unlinkSync(privatePath);
}
