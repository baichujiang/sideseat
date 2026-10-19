// Fresh owner/participant + real browser guest: ideas → interest → timetable → explicit consent → Calendar.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomBytes, randomUUID } from 'node:crypto';
import { chromium, webkit, expect } from '@playwright/test';
const base = process.argv[2], stage = process.argv[3];
assert(base && ['local', 'candidate', 'production'].includes(stage));
const out = path.resolve(process.env.SIDESEAT_QA_OUTPUT || 'docs/qa/evidence/2026-10-19-plans135'); fs.mkdirSync(out, { recursive: true });
const privatePath = path.join(os.tmpdir(), `sideseat${process.env.SIDESEAT_QA_RUN_ID || "135"}-${stage}-private.json`);
assert(!fs.existsSync(privatePath), 'Clean the previous disposable fixture first.');
const fixture = { base, accounts: [], tokens: [] }; const checks = [];
const cookieFile = process.env.SIDESEAT_CANDIDATE_COOKIE_FILE;
const cookies = cookieFile ? fs.readFileSync(cookieFile, 'utf8').split('\n').filter(line => line.startsWith('#HttpOnly_') || (line && !line.startsWith('#'))).map(line => {
  const [domain, , cookiePath, secure, expires, name, value] = line.replace(/^#HttpOnly_/, '').split('\t');
  return { domain, path: cookiePath, secure: secure === 'TRUE', expires: Number(expires), name, value, httpOnly: line.startsWith('#HttpOnly_'), sameSite: 'Lax' };
}) : [];
const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
const protection = process.env.VERCEL_OIDC_TOKEN ? { 'x-vercel-trusted-oidc-idp-token': process.env.VERCEL_OIDC_TOKEN } : {};
async function call(route, account, method = 'GET', body, status = 200) {
  const response = await fetch(base + route, { method, headers: { ...protection, ...(cookieHeader ? { Cookie: cookieHeader } : {}), 'Content-Type': 'application/json', 'x-sideseat-platform': 'ios', 'Idempotency-Key': randomUUID(), ...(account ? { Authorization: `Bearer ${account.accessToken}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
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
    const account = { role, identifier: `planqa_ideas135_${role}_${randomBytes(4).toString('hex')}`, password: randomBytes(22).toString('base64url') };
    await call('/api/auth/signup', null, 'POST', { username: account.identifier, password: account.password, displayName: role === 'owner' ? 'Host Ming' : 'Peer Lin', school: 'TUM', studentStatus: 'CURRENT_STUDENT', degreeLevel: 'BACHELOR', semester: 3 }, 201);
    fixture.accounts.push(account); savePrivate();
    account.accessToken = (await call('/api/v1/auth/login', null, 'POST', { identifier: account.identifier, password: account.password, device: { id: randomUUID(), name: 'Activity ideas verification', appVersion: '1.0.0', platformVersion: '26.6.1' } })).tokens.accessToken; savePrivate();
  }
  const [owner, peer] = fixture.accounts;
  const date = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch();
    const context = await browser.newContext({ extraHTTPHeaders: protection, storageState: { cookies, origins: [] }, viewport: { width: 390, height: 844 }, colorScheme: engineName === 'webkit' ? 'dark' : 'light' });
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    try {
      let p = await call('/api/v1/time-polls', owner, 'POST', { title: '这周末一起做点什么？', timeZone: 'Europe/Berlin', dates: [date], startMinute: 540, endMinute: 660, chooseActivityTogether: true }, 201);
      fixture.tokens.push(p.token); savePrivate();
      assert(p.activitySelection.isOpen); assert.equal(p.participants.length, 0); assert.equal(p.invitationVersion, 0);
      await page.goto(`${base}/time-polls/${p.token}`);
      await page.getByLabel('你的名字', { exact: true }).fill('Guest Lin');
      await page.getByRole('button', { name: '加入一起选活动', exact: true }).click();
      await expect(page.getByTestId('time-poll-grid')).toBeVisible();
      await expect(page.getByTestId('activity-show-timetable')).toHaveCount(0);
      await page.getByTestId('activity-panel').locator('summary').click();
      await expect(page.getByTestId('activity-ideas')).toBeVisible();
      checks.push(`${engineName}: shared plan opens directly into the timetable with inline activity ideas`);
      p = await call(route(p) + '/activities', owner, 'POST', { title: '羽毛球', location: 'Campus court' });
      p = await call(route(p) + '/activities', peer, 'POST', { title: '火锅', location: 'Town centre' });
      const badminton = p.activitySelection.ideas.find(i => i.title === '羽毛球').id, hotpot = p.activitySelection.ideas.find(i => i.title === '火锅').id;
      assert((await call('/api/v1/time-polls', peer)).polls.some(row => row.token === p.token && row.activitySelection.hasParticipated));
      assert.equal(p.didRespond, false); assert.equal(p.participants.length, 0);
      const pending = (await call('/api/v1/time-polls', peer)).polls.find(row => row.token === p.token);
      assert.equal(pending.organizer.displayName, 'Host Ming');
      assert.equal(pending.didRespond, false, 'Activity interest must not become an availability response.');
      assert.deepEqual(pending.peoplePreview, []);

      await page.reload();
      await page.getByTestId('activity-panel').locator('summary').click();
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
      await page.getByTestId('activity-panel').locator('summary').click();
      await expect(page.getByTestId('time-poll-grid')).toBeVisible();
      await page.getByTestId('time-poll-cell-0').click(); await page.getByTestId('time-poll-cell-2').click();
      await expect(page.getByTestId('time-poll-cell-2')).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(async () => (await call(route(p), owner)).participants.find(x => x.isGuest)?.slotIds).toEqual([0, 1, 2, 3]);
      const hostRow = (await call('/api/v1/time-polls', owner)).polls.find(row => row.token === p.token);
      assert.equal(hostRow.didRespond, false, 'Other people filling availability must not mark the organizer as responded.');
      assert.deepEqual(hostRow.peoplePreview.map(x => x.displayName).sort(), ['Guest Lin', 'Peer Lin']);
      assert(hostRow.peoplePreview.every(x => Object.hasOwn(x, 'avatarUrl')));
      checks.push(`${engineName}: real organizer/guest previews without changing own response or attendance`);
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
      const confirmedRow = (await call('/api/v1/time-polls', owner)).polls.find(row => row.token === p.token);
      assert.deepEqual(confirmedRow.peoplePreview.map(x => x.displayName).sort(), ['Guest Lin', 'Peer Lin']);
      checks.push(`${engineName}: selected guest and account previews survive explicit confirmation`);
      assert.equal(p.phase, 'CONFIRMED'); assert.equal((await calendar(p, owner)).length, 1); assert.equal((await calendar(p, peer)).length, 1);
      assert.equal((await calendar(p, owner))[0].title, '火锅');
      await page.reload(); await expect(page.getByRole('heading', { name: '计划已确定', exact: true })).toBeVisible();
      assert.equal((await calendar(p, owner)).length, 1); assert.deepEqual(errors, []);
      checks.push(`${engineName}: exact invitation, separate explicit confirmations and unique calendars with the chosen activity`);
      let old = await call('/api/v1/time-polls', owner, 'POST', { title: 'Already decided activity', timeZone: 'Europe/Berlin', dates: [date], startMinute: 540, endMinute: 660 }, 201);
      fixture.tokens.push(old.token); savePrivate();assert.equal(old.activitySelection, null);
      checks.push(`${engineName}: existing creation skips the optional activity stage`);
      for (const ownerResponded of [false, true]) {
        let direct = await call('/api/v1/time-polls', owner, 'POST', { title: 'Coffee direct invitation', timeZone: 'Europe/Berlin', dates: [date], startMinute: 540, endMinute: 660 }, 201);
        fixture.tokens.push(direct.token); savePrivate();
        if (ownerResponded) direct = await call(route(direct) + '/response', owner, 'PUT', { displayName: 'Host Ming', slotIds: [0, 1, 2, 3] });
        const originalSlots = direct.slots, originalResponses = direct.participants;
        direct = await call(route(direct) + '/invitations', owner, 'POST', { start: direct.slots[0].start, end: direct.slots[3].end, attendeeIds: direct.participants.map(p => p.id), version: 0, linkParticipantCount: 3 });
        assert.equal(direct.planningMode, 'FIXED'); assert.equal(direct.expectedCount, 3); assert.equal(direct.phase, 'INVITING');
        assert.deepEqual(direct.slots, originalSlots); assert.deepEqual(direct.participants, originalResponses);
        assert.equal((await calendar(direct, owner)).length, 0);
        await page.goto(`${base}/time-polls/${direct.token}`);
        await page.getByLabel('你的名字', { exact: true }).fill('Guest Direct');
        await page.getByRole('button', { name: '继续查看邀请', exact: true }).click();
        await expect(page.getByTestId('plan-invitation-timetable')).toBeVisible();
        await expect(page.getByTestId('time-poll-grid')).toHaveCount(0);
        await expect(page.getByRole('button', { name: '确认参加', exact: true })).toBeVisible();
        await page.screenshot({ path: `${out}/${stage}-${engineName}-direct-${ownerResponded ? 'own-response' : 'zero-response'}.png`, fullPage: true });
        await page.getByRole('button', { name: '确认参加', exact: true }).click();
        await expect.poll(async () => (await call(route(direct), owner)).invitations.filter(i => i.selected && i.status === 'ACCEPTED').length).toBe(2);
        assert.equal((await calendar(direct, owner)).length, 0, 'A three-person invitation must wait for the third confirmation.');
        const peerView = await call(route(direct), peer); assert.equal(peerView.didRespond, false);
        direct = await call(route(direct) + '/invitation-response', peer, 'PUT', { status: 'ACCEPTED', version: direct.invitationVersion });
        assert.equal(direct.phase, 'CONFIRMED'); assert.equal(direct.participants.length, ownerResponded ? 1 : 0);
        assert.equal((await calendar(direct, owner)).length, 1); assert.equal((await calendar(direct, peer)).length, 1);
        await call(route(direct) + '/invitation-response', peer, 'PUT', { status: 'ACCEPTED', version: direct.invitationVersion });
        assert.equal((await calendar(direct, owner)).length, 1);
        checks.push(`${engineName}: ${ownerResponded ? 'only organizer availability' : 'zero availability'} → same-link direct guest/account invitation → explicit confirmations → unique Calendar`);
      }
      old = await call(route(old) + '/response', peer, 'PUT', { displayName: 'Peer Lin', slotIds: [0, 1, 2, 3] });
      old = await call(route(old) + '/invitations', owner, 'POST', { start: old.slots[0].start, end: old.slots[3].end, version: 0, attendeeIds: old.participants.map(person => person.id), linkParticipantCount: 3 });
      assert.equal(old.invitations.length, 2); assert.equal(old.invitations.find(person => person.displayName === 'Peer Lin').status, 'INVITED');
      await page.goto(`${base}/time-polls/${old.token}`);
      await page.getByLabel('你的名字', { exact: true }).fill('Guest Added');
      await page.getByRole('button', { name: '继续查看邀请', exact: true }).click();
      await page.getByRole('button', { name: '确认参加', exact: true }).click();
      await expect.poll(async () => (await call(route(old), owner)).invitations.filter(person => person.status === 'ACCEPTED').length).toBe(2);
      assert.equal((await calendar(old, owner)).length, 0);
      old = await call(route(old) + '/invitation-response', peer, 'PUT', { status: 'ACCEPTED', version: old.invitationVersion });
      assert.equal(old.phase, 'CONFIRMED'); assert.equal(old.participants.length, 1);
      assert.equal((await calendar(old, owner)).length, 1); assert.equal((await calendar(old, peer)).length, 1);
      checks.push(`${engineName}: selected respondent plus a new link guest both explicitly confirm before Calendar`);
      const fixed = await call('/api/v1/time-polls', owner, 'POST', { title: 'Coffee fixed invitation', timeZone: 'Europe/Berlin', dates: [date], startMinute: 540, endMinute: 660, planningMode: 'FIXED', fixedStart: p.slots[0].start, durationMinutes: 60, expectedCount: 2 }, 201);
      fixture.tokens.push(fixed.token); savePrivate();
      await call(route(fixed) + '/invitation-response', peer, 'PUT', { status: 'ACCEPTED', version: fixed.invitationVersion });
      const fixedRow = (await call('/api/v1/time-polls', owner)).polls.find(row => row.token === fixed.token);
      assert.equal(fixedRow.phase, 'CONFIRMED'); assert.equal(fixedRow.respondedCount, 0);
      assert.deepEqual(fixedRow.peoplePreview.map(x => x.displayName), ['Peer Lin']);
      checks.push(`${engineName}: fixed invitation previews real companions without requiring an availability response`);

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
    assert(account.accessToken, 'Keep the private recovery fixture when an account has no token.');
    await call('/api/v1/me', account, 'DELETE', { confirmUsername: account.identifier }); await call('/api/v1/me', account, 'GET', undefined, 401);
  }
  cleanupPassed = true;
  fs.writeFileSync(`${out}/${stage}-cleanup.json`, JSON.stringify({ accountsDeleted: fixture.accounts.length, plansAndLinksDeleted: fixture.tokens.length, oldTokens401: fixture.accounts.length, links404: fixture.tokens.length, cleanupPassed }, null, 2));
  if (cleanupPassed) fs.unlinkSync(privatePath);
}
