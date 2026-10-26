// Independent two-same-name guest boundary. Owner setup uses API; both guests use actual UI.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { call, readFixture, persist, route, calendars, evidence, out } from './plan-six-participant-phone.mjs';

const f = await readFixture(), owner = f.accounts.find(a => a.role === 'owner');
assert(f.title.startsWith('混合闭环 ') && !f.mixedIdentityProbe, 'Use a fresh owned mixed fixture.');
const title = f.edgePrefix + ' same-name guests';
const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
let p = await call('/api/v1/time-polls', owner, 'POST', { title, dates: [date], location: f.location,
  timeZone: 'Europe/Berlin', startMinute: 540, endMinute: 660, planningMode: 'COLLECT' }, 201);
f.tokens.push(p.token); f.mixedIdentityProbe = { token: p.token, title }; await persist(f);
await call(route(p) + '/response', owner, 'PUT', { displayName: owner.displayName, slotIds: [0, 1, 2, 3] });
const browser = await chromium.launch(); const contexts = [], pages = [];
const name = '同名网页朋友';
let failure;
await fs.mkdir(out, { recursive: true });
try {
  for (let n = 0; n < 2; n++) {
    const c = await browser.newContext({ baseURL: 'https://www.sideseat.de', viewport: { width: 390, height: 844 }, locale: 'zh-CN' });
    contexts.push(c); await c.addCookies([{ name: 'SIDESEAT_POLL_LOCALE', value: 'zh-CN', url: 'https://www.sideseat.de/time-polls' }]);
    const page = await c.newPage(); pages.push(page);
    await page.goto('/time-polls/' + p.token); await page.getByLabel('你的名字', { exact: true }).fill(name);
    await page.getByRole('button', { name: '下一步：选择我的空闲', exact: true }).click();
    const panel = page.getByTestId('guest-recovery-panel');
    if (await panel.getAttribute('open') !== null) await panel.locator('summary').click();
    await page.getByTestId('time-poll-cell-0').click(); await page.getByTestId('time-poll-cell-2').click();
    await page.getByTestId('availability-submit').click(); await expect(page.getByText('已提交空闲', { exact: true })).toBeVisible();
  }
  p = await call(route(p), owner);
  const same = p.participants.filter(x => x.isGuest && x.displayName === name);
  assert.equal(same.length, 2); assert.notEqual(same[0].id, same[1].id);
  p = await call(route(p) + '/invitations', owner, 'POST', { version: 0, start: p.slots[0].start, end: p.slots[3].end, attendeeIds: p.participants.map(x => x.id) });
  for (const page of pages) {
    const accept = page.getByRole('button', { name: '确认参加', exact: true });
    await expect(accept).toBeVisible({ timeout: 35_000 });
    const response = page.waitForResponse(r => r.url().endsWith('/invitation-response') && r.request().method() === 'PUT');
    await accept.click(); assert.equal((await response).status(), 200);
  }
  p = await call(route(p), owner); assert.equal(p.invitations.filter(x => x.status === 'ACCEPTED').length, 3);
  const calendarMessage = await pages[0].getByTestId('plan-invitation').innerText();
  const misleadingGuestCalendarPromise = calendarMessage.includes('同步他们的 SideSeat 日历');
  await pages[0].getByTestId('plan-invitation').screenshot({ path: path.join(out, 'same-name-guest-invitation-baseline.png') });
  p = await call(route(p) + '/publish', owner, 'POST', { version: 1 });
  const result = await calendars(p, [owner]); assert.equal(result.rows[0].length, 1);
  const people = result.rows[0][0].eventParticipants;
  assert.equal(people.length, 2); assert(people.every(x => x.name === name && x.userId === null));
  const payload = { ...f, title, mixedGuests: f.mixedGuests.map(g => g.role === 'guestA' ? { ...g, displayName: name } : g), location: f.location };
  await fs.writeFile('/tmp/sideseat-mixed230-private/same-name-phone-fixture.json', JSON.stringify(payload), { mode: 0o600 });
  await evidence('same-name-web-baseline.json', { passed: true, independentOwnedPlan: true, sameNamedGuestsRemainDistinct: true,
    acceptedCount: 3, registeredOwnerCalendarCount: 1, sameNamedGuestCalendarCompanions: people.length,
    currentGuestInvitationMisleadinglyPromisesSideSeatCalendar: misleadingGuestCalendarPromise,
    nativeCalendarRenderingStillRequiresPhysicalProbe: true, at: new Date().toISOString() });
  console.log('Same-name web identity and owner Calendar API baseline verified; native display probe ready.');
} catch (e) { failure = e; await fs.writeFile('/tmp/sideseat-mixed230-private/identity-probe-failure.txt', String(e.stack), { mode: 0o600 }); }
finally { await Promise.all(contexts.map(c => c.close())); await browser.close(); }
if (failure) { console.error('Same-name boundary failed; private diagnostics retained.'); process.exitCode = 1; }
