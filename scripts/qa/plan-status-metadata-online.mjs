// Real public-web metadata and cross-day journey. Only disposable QA records are written.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { fromZonedTime } from 'date-fns-tz';
import { chromium, webkit, expect } from '@playwright/test';

const [base, stage, engine = 'chromium'] = process.argv.slice(2);
assert(base && stage && ['chromium', 'webkit'].includes(engine));
assert(/^[a-z0-9-]+$/i.test(stage), 'Use a simple evidence stage name');
const origin = new URL(base).origin;
assert.equal(base.replace(/\/$/, ''), origin, 'Pass an origin without a path');
const out = path.resolve(process.env.SIDESEAT_QA_OUTPUT || 'docs/qa/evidence/2026-10-24-web-status-metadata');
fs.mkdirSync(out, { recursive: true });
const privatePath = path.join(os.tmpdir(), `sideseat-status-metadata-${stage}-${engine}-private.json`);
assert(!fs.existsSync(privatePath), 'Recover the prior private fixture before repeating this stage');
const cookies = process.env.SIDESEAT_CANDIDATE_COOKIE_FILE ? fs.readFileSync(process.env.SIDESEAT_CANDIDATE_COOKIE_FILE, 'utf8').split('\n').filter(l => l.startsWith('#HttpOnly_') || (l && !l.startsWith('#'))).map(l => {
  const [domain, , cookiePath, secure, expires, name, value] = l.replace(/^#HttpOnly_/, '').split('\t');
  return { domain, path: cookiePath, secure: secure === 'TRUE', expires: Number(expires) || -1, name, value, httpOnly: l.startsWith('#HttpOnly_'), sameSite: 'Lax' };
}) : [];
const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
const fixture = { base: origin, accounts: [], tokens: [] }, checks = [], layouts = [], browserErrors = [];
const persist = () => fs.writeFileSync(privatePath, JSON.stringify(fixture), { mode: 0o600 });
const route = p => '/api/v1/time-polls/' + p.token;
const publicRoute = p => '/api/public/time-polls/' + p.token;
const check = text => { checks.push(text); console.log(`STATUS_METADATA ${stage} ${engine}: ${text}`); };
const safe = message => fixture.tokens.reduce((s, token) => s.replaceAll(token, '[plan]'), String(message)).replace(/#recover=\S+/g, '#recover=[redacted]');
let failure, browser;

async function call(url, account, method = 'GET', body, status = 200) {
  const response = await fetch(origin + url, { method, headers: { 'Content-Type': 'application/json', 'x-sideseat-platform': 'ios', 'Idempotency-Key': randomUUID(), ...(account ? { Authorization: `Bearer ${account.accessToken}` } : {}), ...(cookieHeader ? { Cookie: cookieHeader } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await response.json().catch(() => ({}));
  assert.equal(response.status, status, `${method} ${url}: ${response.status}; ${value.error?.message || ''}`);
  return value.data;
}
async function calendar(p, account) {
  const day = p.dates[0];
  const until = new Date(Date.parse(day + 'T00:00:00Z') + 3 * 864e5).toISOString();
  return (await call(`/api/v1/home/schedule?windowStart=${day}T00:00:00Z&windowEnd=${until}`, account)).studyEntries.filter(e => e.timePollToken === p.token);
}
async function snapshot(page, name) {
  await page.screenshot({ path: path.join(out, `${stage}-${engine}-${name}.png`), fullPage: true });
}
const variants = [
  { name: 'mobile-light', viewport: { width: 390, height: 844 }, colorScheme: 'light', zh: true },
  { name: 'narrow-large-dark', viewport: { width: 320, height: 740 }, colorScheme: 'dark', zh: false, fontSize: 20 },
  { name: 'desktop-light', viewport: { width: 1440, height: 1000 }, colorScheme: 'light', zh: false },
];
async function contextFor(variant) {
  const context = await browser.newContext({ viewport: variant.viewport, colorScheme: variant.colorScheme, locale: variant.zh ? 'zh-CN' : 'en-GB' });
  if (cookies.length) await context.addCookies(cookies);
  await context.addCookies([{ name: 'SIDESEAT_POLL_LOCALE', value: variant.zh ? 'zh-CN' : 'en', domain: new URL(origin).hostname, path: '/time-polls', secure: origin.startsWith('https:'), sameSite: 'Lax' }]);
  if (variant.fontSize) await context.addInitScript(size => { document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = size + 'px'; }, { once: true }); }, variant.fontSize);
  context.on('page', page => page.on('pageerror', error => browserErrors.push(error.message)));
  return context;
}
async function publicData(context, p) {
  const response = await context.request.get(origin + publicRoute(p));
  assert.equal(response.status(), 200);
  return (await response.json()).data;
}
async function button44(button) {
  await expect(button).toBeVisible();
  const box = await button.boundingBox();
  assert(box && box.width >= 44 && box.height >= 44, 'Action has an actual 44px target');
}
async function metadata(page, variant, phase, activity = false) {
  const status = page.getByTestId('plan-display-status');
  await expect(status).toHaveCount(1);
  await expect(status).toHaveText((activity ? variant.zh ? '选择活动' : 'Choosing an activity' : variant.zh ? '收集空闲' : 'Collecting availability') + ' · Europe/Berlin');
  await page.getByRole('heading', { level: 1 }).scrollIntoViewIfNeeded();
  if (variant.fontSize) await page.getByTestId('plan-collection-metadata').evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const result = await page.getByTestId('plan-collection-metadata').evaluate(element => {
    const date = element.querySelector('[data-testid="time-poll-date-range"]');
    const status = element.querySelector('[data-testid="plan-display-status"]');
    const title = element.closest('section').querySelector('h1');
    const rect = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
    const style = getComputedStyle(status), dot = status.querySelector('[aria-hidden]'), dotStyle = getComputedStyle(dot);
    const lines = node => { const range = document.createRange(); range.selectNodeContents(node); return Array.from(range.getClientRects(), r => ({ x: r.x, right: r.right, y: r.y, bottom: r.bottom })); };
    // The submit button disappears after saving; the existing next-step text stays in that same fixed bar.
    const saveBar = (document.querySelector('[data-testid="availability-submit"]') || document.querySelector('[data-testid="availability-next-step"]'))?.closest('.fixed');
    const visible = window.visualViewport;
    return { date: rect(date), status: rect(status), title: rect(title), container: rect(element), textLines: lines(status.lastElementChild), dateTextLines: lines(date.lastElementChild), dateText: date.textContent, color: style.color, background: style.backgroundColor, border: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth], radius: style.borderRadius, shadow: style.boxShadow, fontSize: parseFloat(style.fontSize), dateFontSize: parseFloat(getComputedStyle(date).fontSize), interactive: !!status.closest('button,a,[role="button"]') || status.tabIndex >= 0, dot: rect(dot), dotColor: dotStyle.backgroundColor, rootFontSize: getComputedStyle(document.documentElement).fontSize, scheme: getComputedStyle(document.querySelector('main')).colorScheme, viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, visibleViewport: { x: visible?.offsetLeft || 0, y: visible?.offsetTop || 0, right: (visible?.offsetLeft || 0) + (visible?.width || innerWidth), bottom: (visible?.offsetTop || 0) + (visible?.height || innerHeight) }, footer: saveBar ? { ...rect(saveBar), position: getComputedStyle(saveBar).position } : null };
  });
  assert(result.date.bottom <= result.status.y + 1, 'Status is below the complete date row');
  assert(result.title.bottom <= result.date.y, 'Title precedes timetable metadata');
  assert(!result.dateText.includes('Europe/Berlin'), 'Timezone is presented once in the status line');
  assert(!result.interactive, 'Status remains informational');
  assert.equal(result.background, 'rgba(0, 0, 0, 0)');
  assert(result.border.every(value => parseFloat(value) === 0), 'Status has no outline');
  assert.equal(result.radius, '0px'); assert.equal(result.shadow, 'none');
  assert(result.fontSize < result.dateFontSize, 'Status is a caption below the date');
  const channels = result.color.match(/[\d.]+/g).slice(0, 3).map(Number);
  assert(Math.max(...channels) - Math.min(...channels) <= 22, 'Status uses a neutral grey');
  assert.equal(result.dotColor, result.color); assert(result.dot.width >= 4 && result.dot.width <= 7 && result.dot.height >= 4 && result.dot.height <= 7, 'Small matching status dot');
  assert(result.documentWidth <= result.viewport + 1, 'Header does not cause page-wide horizontal overflow');
  for (const line of result.textLines) assert(line.x >= result.status.x - 1 && line.right <= result.status.right + 1 && line.bottom <= result.status.bottom + 1, 'Entire status/timezone text fits its row');
  assert(result.container.x >= 0 && result.container.right <= result.viewport + 1, 'Metadata stays inside the viewport');
  assert.equal(result.scheme, variant.colorScheme);
  if (variant.fontSize) {
    assert.equal(result.rootFontSize, '20px');
    if (!phase.endsWith('anonymous')) assert(result.footer, 'Joined/submitted metadata is checked against the actual save bar');
    if (result.footer) assert.equal(result.footer.position, 'fixed');
    const visible = result.visibleViewport, bottom = Math.min(visible.bottom, result.footer?.y ?? visible.bottom);
    for (const bounds of [result.container, result.date, result.status, ...result.dateTextLines, ...result.textLines]) {
      assert(bounds.x >= visible.x && bounds.right <= visible.right && bounds.y >= visible.y && bounds.bottom <= bottom, 'Entire narrow metadata, date and status text are visible above the fixed save bar');
    }
  }
  layouts.push({ variant: variant.name, phase, ...result });
  if (variant.fontSize) await page.screenshot({ path: path.join(out, `${stage}-${engine}-${variant.name}-${phase}.png`), fullPage: false });
  else await snapshot(page, `${variant.name}-${phase}`);
}
async function join(page, variant, name, activity = false) {
  await page.getByLabel(variant.zh ? '你的名字' : 'Your name', { exact: true }).fill(name);
  const next = page.getByRole('button', { name: activity ? variant.zh ? '加入一起选活动' : 'Join the activity ideas' : variant.zh ? '下一步：选择我的空闲' : 'Next: choose my free time', exact: true });
  await button44(next); await next.click();
  await expect(page.getByRole('button', { name: variant.zh ? '编辑昵称' : 'Edit nickname', exact: true })).toBeVisible();
}
async function noCollectStatus(page) {
  await expect(page.getByTestId('plan-collection-metadata')).toHaveCount(0);
  await expect(page.getByTestId('plan-display-status')).toHaveCount(0);
  await expect(page.getByTestId('time-poll-date-range')).toHaveCount(0);
}

try {
  persist();
  const owner = { identifier: 'pqa_status_' + randomBytes(5).toString('hex'), password: randomBytes(22).toString('base64url') };
  await call('/api/auth/signup', null, 'POST', { username: owner.identifier, password: owner.password, displayName: 'Status QA owner', school: 'TUM', studentStatus: 'CURRENT_STUDENT', degreeLevel: 'BACHELOR', semester: 3 }, 201);
  fixture.accounts.push(owner); persist();
  owner.accessToken = (await call('/api/v1/auth/login', null, 'POST', { identifier: owner.identifier, password: owner.password, device: { id: randomUUID(), name: 'Status metadata QA', appVersion: '1.0.0', platformVersion: '26.6.1' } })).tokens.accessToken; persist();
  const now = new Date();
  let first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 12));
  if (first.getTime() < Date.now() + 3 * 864e5) first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 0, 12));
  const dates = [first, new Date(first.getTime() + 864e5)].map(date => date.toISOString().slice(0, 10));
  const input = { title: '周末一起去看展，顺便喝杯咖啡 · Weekend exhibition', location: 'Treffpunkt am Haupteingang der Pinakothek der Moderne, anschließend gemeinsam Kaffee trinken', dates, timeZone: 'Europe/Berlin', startMinute: 540, endMinute: 660 };
  const create = async extra => { const p = await call('/api/v1/time-polls', owner, 'POST', { ...input, ...extra }, 201); fixture.tokens.push(p.token); persist(); return p; };
  let p = await create({}); const originalSlots = p.slots;
  p = await call(route(p) + '/response', owner, 'PUT', { displayName: 'Owner', slotIds: [0, 1, 2, 3] });
  browser = await ({ chromium, webkit }[engine]).launch();
  const guests = [];
  for (const [index, variant] of variants.entries()) {
    const context = await contextFor(variant), page = await context.newPage();
    await page.goto(origin + '/time-polls/' + p.token);
    await metadata(page, variant, 'anonymous');
    const name = ['QA accepted guest', 'QA pending guest', 'QA declined guest'][index];
    await join(page, variant, name); await metadata(page, variant, 'joined');
    const submit = page.getByTestId('availability-submit'); await expect(submit).toBeDisabled();
    await page.getByTestId('time-poll-cell-0').click(); await page.getByTestId('time-poll-cell-2').click();
    const before = await publicData(context, p); assert.equal(before.didRespond, false); assert.deepEqual(before.mySlotIds, []);
    assert(!(await call(route(p), owner)).participants.some(person => person.displayName === name), 'Pointing at cells does not submit a response');
    await button44(submit); await submit.click();
    await expect(page.getByText(variant.zh ? '已提交空闲' : 'Availability submitted', { exact: true })).toBeVisible();
    const submitted = await publicData(context, p); assert(submitted.didRespond); assert.deepEqual(submitted.mySlotIds, [0, 1, 2, 3]);
    await metadata(page, variant, 'submitted');
    await page.close(); const reopened = await context.newPage(); await reopened.goto(origin + '/time-polls/' + p.token);
    await expect(reopened.getByTestId('time-poll-cell-0')).toHaveAttribute('aria-pressed', 'true');
    const restored = await publicData(context, p); assert.equal(restored.viewerId, submitted.viewerId); assert.deepEqual(restored.mySlotIds, submitted.mySlotIds);
    await metadata(reopened, variant, 'reopened');
    guests.push({ context, page: reopened, variant, viewerId: submitted.viewerId, name });
  }
  check('390px light, 320px/20px dark and desktop: anonymous → joined → explicit submit → reopen retain complete date/status/timezone metadata and guest identity');
  p = await call(route(p), owner); assert.deepEqual(p.slots, originalSlots); assert.deepEqual(p.mySlotIds, [0, 1, 2, 3]); assert.equal(p.summary.participantCount, 4);
  const start = fromZonedTime(dates[0] + 'T23:00:00', p.timeZone).toISOString(), end = fromZonedTime(dates[1] + 'T01:00:00', p.timeZone).toISOString();
  await call(route(p) + '/invitations', owner, 'POST', { version: 0, start, end: new Date(Date.parse(end) + 7 * 60e3).toISOString(), attendeeIds: p.invitees.map(person => person.id) }, 422);
  assert.equal((await call(route(p), owner)).invitationVersion, 0);
  p = await call(route(p) + '/invitations', owner, 'POST', { version: 0, start, end, attendeeIds: p.invitees.map(person => person.id) });
  assert.equal(p.phase, 'INVITING'); assert.deepEqual(p.slots, originalSlots); assert.equal((await calendar(p, owner)).length, 0);
  for (const guest of guests) {
    await guest.page.reload(); await expect(guest.page.getByTestId('plan-invitation-legend')).toHaveCount(2);
    await expect(guest.page.getByTestId('plan-invitation-window')).toHaveCount(2);
    await expect(guest.page.getByTestId('plan-invitation')).toContainText('23:00'); await expect(guest.page.getByTestId('plan-invitation')).toContainText('01:00');
    await noCollectStatus(guest.page); await snapshot(guest.page, `${guest.variant.name}-cross-day-invitation`);
  }
  const [accepted, pending, declined] = guests;
  for (const guest of [accepted, pending]) {
    const later = guest.page.getByRole('button', { name: guest.variant.zh ? '暂不回复' : 'Reply later', exact: true }); await button44(later); await later.click();
    const mine = (await publicData(guest.context, p)).invitations.find(person => person.isMe); assert.equal(mine.status, 'INVITED');
  }
  await accepted.page.getByRole('button', { name: '回复邀请', exact: true }).click();
  const accept = accepted.page.getByRole('button', { name: '确认参加', exact: true }); await button44(accept); await accept.click();
  await expect(accepted.page.getByText('你已接受，等待发起人正式发出', { exact: true }).first()).toBeVisible();
  const decline = declined.page.getByRole('button', { name: "I can't attend", exact: true }); await button44(decline); await decline.click();
  await expect(declined.page.getByRole('button', { name: 'Declined', exact: true })).toBeDisabled();
  const statuses = ['ACCEPTED', 'INVITED', 'DECLINED'];
  for (const [index, guest] of guests.entries()) { assert.equal((await publicData(guest.context, p)).invitations.find(person => person.isMe).status, statuses[index]); await snapshot(guest.page, `${guest.variant.name}-reply`); }
  assert.equal((await calendar(p, owner)).length, 0);
  check('Both final dates stay highlighted; guest UI ignore/accept/decline are distinct and acceptance alone creates no owner Calendar entry');
  p = await call(route(p) + '/publish', owner, 'POST', { version: 1 }); assert.equal(p.phase, 'CONFIRMED');
  for (let index = 0; index < 2; index++) {
    p = await call(route(p) + '/publish', owner, 'POST', { version: 1 });
    const rows = await calendar(p, owner); assert.equal(rows.length, 1); assert.equal(rows[0].startISO, start); assert.equal(rows[0].endISO, end);
  }
  for (const [index, guest] of guests.entries()) {
    await guest.page.reload(); await expect(guest.page.getByText(guest.variant.zh ? '计划已确定' : 'Plan confirmed', { exact: true }).first()).toBeVisible();
    await noCollectStatus(guest.page); assert.equal((await publicData(guest.context, p)).invitations.find(person => person.isMe).status, statuses[index]);
    await snapshot(guest.page, `${guest.variant.name}-published`);
  }
  check('Owner publishes with pending/declined guests; statuses remain distinct and repeat publication creates one exact cross-day owner Calendar entry (guests have no account calendars)');
  const ideas = await create({ chooseActivityTogether: true });
  const fixed = await create({ planningMode: 'FIXED', fixedStart: start, durationMinutes: 120, expectedCount: 3, chooseActivityTogether: true });
  assert.equal(fixed.phase, 'COLLECTING'); assert.equal(fixed.planningMode, 'FIXED');
  for (const guest of guests) {
    await guest.page.goto(origin + '/time-polls/' + ideas.token); await metadata(guest.page, guest.variant, 'activity-anonymous', true);
    await join(guest.page, guest.variant, 'QA activity guest', true);
    await expect(guest.page.getByTestId('activity-toggle')).toContainText(guest.variant.zh ? '活动待定' : 'Activity undecided');
    await button44(guest.page.getByTestId('activity-compose')); await metadata(guest.page, guest.variant, 'activity-joined', true);
    await guest.page.goto(origin + '/time-polls/' + fixed.token); await join(guest.page, guest.variant, 'QA fixed guest', true);
    await noCollectStatus(guest.page); await expect(guest.page.getByTestId('plan-invitation-timetable')).toBeVisible();
    await expect(guest.page.getByTestId('time-poll-grid')).toHaveCount(0); await expect(guest.page.getByTestId('availability-submit')).toHaveCount(0);
    await expect(guest.page.getByTestId('activity-toggle')).toContainText(guest.variant.zh ? '活动待定' : 'Activity undecided');
    await snapshot(guest.page, `${guest.variant.name}-fixed-activity`);
  }
  check('Activity-undecided preserves its distinct state and activity controls; FIXED/INVITING/CONFIRMED never acquire collection metadata');
  assert.deepEqual(browserErrors, []);
} catch (error) { failure = error; }
finally {
  if (browser) await browser.close();
  const cleanup = { accounts: 0, tokens401: 0, links404: 0, errors: [] };
  for (const account of fixture.accounts) {
    try {
      assert(account.identifier.startsWith('pqa_status_'));
      await call('/api/v1/me', account, 'DELETE', { confirmUsername: account.identifier }); cleanup.accounts++;
      await call('/api/v1/me', account, 'GET', undefined, 401); cleanup.tokens401++;
    } catch (error) { cleanup.errors.push(safe(error.message)); }
  }
  for (const token of fixture.tokens) {
    try { const response = await fetch(origin + '/api/public/time-polls/' + token, { headers: cookieHeader ? { Cookie: cookieHeader } : {} }); assert.equal(response.status, 404); cleanup.links404++; }
    catch (error) { cleanup.errors.push(safe(error.message)); }
  }
  if (cleanup.errors.length) failure ||= new Error('QA cleanup failed; private fixture retained');
  fs.writeFileSync(path.join(out, `${stage}-${engine}-result.json`), JSON.stringify({ stage, engine, passed: !failure, checks, layouts, browserErrors: browserErrors.map(safe), cleanup, failure: failure ? safe(failure.message) : null, at: new Date().toISOString() }, null, 2) + '\n');
  if (!cleanup.errors.length) fs.unlinkSync(privatePath);
}
if (failure) throw new Error(safe(failure.message));
