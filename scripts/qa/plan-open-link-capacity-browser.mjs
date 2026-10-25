// Current COLLECT → capacity-link invitations, using real anonymous browser identities.
// Only owned disposable plans are prepared by API; guest identity and replies use public UI.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { call, calendars, persist, readFixture, route, out } from './plan-six-participant-phone.mjs';

const require = createRequire(path.resolve('package.json'));
const { chromium, webkit, expect } = require('@playwright/test');
const [originArgument, stage, engineName, mode] = process.argv.slice(2);
const origin = new URL(originArgument).origin;
assert(['http:', 'https:'].includes(new URL(origin).protocol), 'A browser origin is required.');
assert(/^[a-z0-9-]+$/.test(stage ?? ''), 'A safe stage label is required.');
assert(['chromium', 'webkit'].includes(engineName), 'Choose chromium or webkit.');
assert(mode === undefined || mode === 'baseline', 'The optional mode is baseline.');
const baseline = mode === 'baseline';
const privateDirectory = '/tmp/sideseat227-private';
await fs.mkdir(privateDirectory, { recursive: true, mode: 0o700 });
await fs.chmod(privateDirectory, 0o700);
await fs.mkdir(out, { recursive: true });
const runName = `capacity-browser-${stage}-${engineName}${baseline ? '-baseline' : ''}`;
const resultPath = path.join(out, runName + '.json');
const f = await readFixture();
const owner = f.accounts.find(a => a.role === 'owner');
const peer1 = f.accounts.find(a => a.role === 'peer1');
assert(owner && peer1 && f.accounts.length === 6, 'Use the six owned test accounts.');
const variants = [
  { name: '390-zh-light', width: 390, height: 844, zh: true, colorScheme: 'light', fontSize: 16 },
  { name: '320-en-dark-20px', width: 320, height: 812, zh: false, colorScheme: 'dark', fontSize: 20 },
  { name: '1440-en-light', width: 1440, height: 1000, zh: false, colorScheme: 'light', fontSize: 16 },
].slice(0, baseline ? 1 : 3);
const checks = [], screenshots = [];
let currentStep = 'launch', failure, browser;
const contexts = [];
const report = async passed => fs.writeFile(resultPath, JSON.stringify({
  passed, stage, engine: engineName, baseline, origin, realNetwork: true,
  scope: 'Independent current COLLECT capacity-link plans; guest identity/acceptance/decline through public UI',
  checks, screenshots, failure: failure ? { step: currentStep, message: 'Verification failed; private diagnostics retained.' } : null,
  completedAt: new Date().toISOString(),
}, null, 2) + '\n');

const setStep = value => { currentStep = value; };
const latest = p => call(route(p), owner);
const confirmButton = (page, v) => page.getByRole('button', { name: v.zh ? '确认参加' : 'Confirm participation', exact: true });
const declineButton = (page, v) => page.getByRole('button', { name: v.zh ? '无法参加' : "I can't attend", exact: true });
const selected = p => p.invitations.filter(person => person.selected);
const accepted = p => selected(p).filter(person => person.status === 'ACCEPTED');

async function preparePlan(v) {
  const date = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  let p = await call('/api/v1/time-polls', owner, 'POST', {
    title: `${f.edgePrefix} browser-capacity ${stage} ${engineName} ${v.name} ${randomUUID().slice(0, 6)}`,
    dates: [date, new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10)],
    timeZone: 'Europe/Berlin', startMinute: 540, endMinute: 660, planningMode: 'COLLECT',
  }, 201);
  // Re-read before persisting so independent native observation cannot lose its tracked token.
  const tracked = await readFixture();
  tracked.tokens.push(p.token);
  (tracked.browserCapacityCases ??= []).push({ stage, engine: engineName, variant: v.name, baseline, token: p.token });
  await persist(tracked);
  for (const account of [owner, peer1]) await call(route(p) + '/response', account, 'PUT', { displayName: account.displayName, slotIds: [0, 1, 2, 3] });
  p = await latest(p);
  assert.equal(p.planningMode, 'COLLECT');
  p = await call(route(p) + '/invitations', owner, 'POST', {
    version: p.invitationVersion, start: p.slots[0].start, end: p.slots[3].end,
    attendeeIds: p.participants.map(person => person.id), linkParticipantCount: 2,
  });
  assert.equal(p.planningMode, 'FIXED'); assert.equal(p.expectedCount, 2);
  assert.equal(selected(p).length, 2); assert.equal(accepted(p).length, 1);
  return p;
}

async function openGuest(p, v, suffix) {
  const storageState = process.env.SIDESEAT_QA_STORAGE_STATE
    ? JSON.parse(await fs.readFile(process.env.SIDESEAT_QA_STORAGE_STATE, 'utf8')) : undefined;
  const context = await browser.newContext({
    baseURL: origin, viewport: { width: v.width, height: v.height }, colorScheme: v.colorScheme,
    reducedMotion: 'reduce', locale: v.zh ? 'zh-CN' : 'en-GB', ...(storageState ? { storageState } : {}),
  });
  contexts.push({ context, name: `${v.name}-${suffix}` });
  await context.addCookies([{ name: 'SIDESEAT_POLL_LOCALE', value: v.zh ? 'zh-CN' : 'en', url: origin + '/time-polls' }]);
  await context.addInitScript(({ fontSize, theme }) => {
    localStorage.setItem('theme', theme);
    const apply = () => {
      document.documentElement.style.fontSize = `${fontSize}px`;
      document.documentElement.classList.toggle('dark', theme === 'dark');
    };
    if (document.documentElement) apply();
    document.addEventListener('DOMContentLoaded', apply, { once: true });
  }, { fontSize: v.fontSize, theme: v.colorScheme });
  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  await page.goto(`/time-polls/${p.token}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(p.title, { timeout: 30_000 });
  const name = page.getByLabel(v.zh ? '你的名字' : 'Your name', { exact: true });
  await expect(name).toBeVisible();
  const displayName = `Browser ${engineName} ${v.name} ${suffix}`;
  await name.fill(displayName);
  const continueButton = page.getByRole('button', { name: v.zh ? '继续查看邀请' : 'Continue to invitation', exact: true });
  await target(continueButton); await continueButton.click();
  await expect(name).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByTestId('plan-invitation')).toBeVisible();
  return { context, page, displayName, runtimeErrors };
}

async function target(locator) {
  await expect(locator).toBeVisible(); await expect(locator).toBeEnabled();
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  assert(box && box.height >= 43.99 && box.width >= 43.99, 'An action needs a 44 px target.');
  const viewport = locator.page().viewportSize();
  assert(box.x >= -0.5 && box.x + box.width <= viewport.width + 0.5, 'An action must fit the viewport width.');
}

async function capture(page, v, name, focus) {
  if (focus) await focus.scrollIntoViewIfNeeded();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert(overflow <= 1, 'No page-level horizontal overflow.');
  const file = `${runName}-${v.name}-${name}.png`;
  await page.screenshot({ path: path.join(out, file), fullPage: false });
  screenshots.push({ file, variant: v.name, state: name, viewport: { width: v.width, height: v.height }, fontSize: v.fontSize });
}

async function fullState(guest, v, name) {
  await expect(guest.page.getByTestId('plan-invitation-full')).toContainText(v.zh ? '当前名额已满' : 'This plan is full', { timeout: 20_000 });
  await expect(confirmButton(guest.page, v)).toHaveCount(0);
  await capture(guest.page, v, name, guest.page.getByTestId('plan-invitation-full'));
}

async function checkCalendars(p, guestNames) {
  const current = await latest(p), result = await calendars(current, f.accounts);
  for (const [index, account] of f.accounts.entries()) {
    const rows = result.rows[index];
    assert.equal(rows.length, account.role === 'owner' ? 1 : 0, 'Only the accepted registered owner has a Calendar entry.');
    if (account.role !== 'owner') continue;
    assert.equal(rows[0].title, current.title);
    assert.equal(Date.parse(rows[0].startISO), Date.parse(current.chosenStart));
    assert.equal(Date.parse(rows[0].endISO), Date.parse(current.chosenEnd));
    assert.deepEqual((rows[0].eventParticipants ?? []).map(person => person.name).sort(), [...guestNames].sort());
  }
  return Object.fromEntries(f.accounts.map((account, index) => [account.role, result.rows[index].length]));
}

try {
  browser = await ({ chromium, webkit }[engineName]).launch();
  for (const v of variants) {
    setStep(`${v.name}: prepare owned capacity plan`);
    let p = await preparePlan(v);
    const first = await openGuest(p, v, 'first');
    if (baseline) {
      setStep(`${v.name}: reproduce full invitation offering confirmation`);
      const badConfirm = confirmButton(first.page, v);
      await target(badConfirm);
      assert.equal(selected(await latest(p)).length, 2);
      await capture(first.page, v, 'baseline-full-invitation-offers-confirmation', badConfirm);
      await capture(first.page, v, 'baseline-full-invited-timetable', first.page.getByTestId('plan-invitation-timetable'));
      checks.push({ variant: v.name, reproduced: true, selectedPlaces: 2, capacity: 2, unknownGuestShownConfirmation: true, guestAcceptanceAttempted: false });
      break;
    }
    setStep(`${v.name}: full outsider has no confirmation action`);
    await fullState(first, v, '01-full-no-confirmation');
    await capture(first.page, v, '02-full-readonly-timetable', first.page.getByTestId('plan-invitation-timetable'));
    // A reserved selected invitee can still use the reserved place while the public link is full.
    p = await call(route(p) + '/invitation-response', peer1, 'PUT', { version: p.invitationVersion, status: 'ACCEPTED' });
    assert.equal(selected(p).length, 2); assert.equal(accepted(p).length, 2);
    p = await call(route(p) + '/invitation-response', peer1, 'PUT', { version: p.invitationVersion, status: 'DECLINED' });
    assert.equal(selected(p).length, 1);
    setStep(`${v.name}: released place appears and first guest confirms`);
    await first.page.reload();
    await expect(first.page.getByTestId('plan-invitation-remaining')).toContainText('1');
    const firstConfirm = confirmButton(first.page, v);
    await target(firstConfirm); await capture(first.page, v, '03-released-place-confirmation', firstConfirm);
    await firstConfirm.click();
    await expect(firstConfirm).toHaveCount(0, { timeout: 20_000 });
    p = await latest(p);
    assert.equal(selected(p).length, 2); assert.equal(accepted(p).length, 2);
    assert.equal(p.invitations.find(person => person.displayName === first.displayName)?.status, 'ACCEPTED');
    await capture(first.page, v, '04-first-guest-accepted', first.page.getByTestId('plan-invitation'));
    setStep(`${v.name}: publication creates unique accepted Calendar`);
    p = await call(route(p) + '/publish', owner, 'POST', { version: p.invitationVersion });
    const beforeCounts = await checkCalendars(p, [first.displayName]);
    await call(route(p) + '/publish', owner, 'POST', { version: p.invitationVersion });
    assert.deepEqual(await checkCalendars(p, [first.displayName]), beforeCounts);
    const second = await openGuest(p, v, 'second');
    await fullState(second, v, '05-second-guest-full-after-publish');
    setStep(`${v.name}: first guest declines and second guest takes released place`);
    await first.page.reload();
    const firstDecline = declineButton(first.page, v);
    await target(firstDecline); await firstDecline.click();
    await expect(first.page.getByRole('button', { name: v.zh ? '已回复无法参加' : 'Declined', exact: true })).toBeDisabled({ timeout: 20_000 });
    p = await latest(p); assert.equal(selected(p).length, 1);
    await checkCalendars(p, []);
    await second.page.reload();
    await expect(second.page.getByTestId('plan-invitation-remaining')).toContainText('1');
    const secondConfirm = confirmButton(second.page, v);
    await target(secondConfirm); await capture(second.page, v, '06-second-guest-released-place', secondConfirm); await secondConfirm.click();
    await expect(secondConfirm).toHaveCount(0, { timeout: 20_000 });
    p = await latest(p); assert.equal(selected(p).length, 2); assert.equal(accepted(p).length, 2);
    assert.equal(p.invitations.find(person => person.displayName === second.displayName)?.status, 'ACCEPTED');
    const finalCounts = await checkCalendars(p, [second.displayName]);
    await capture(second.page, v, '07-second-guest-accepted-after-publish', second.page.getByTestId('plan-invitation'));
    await first.page.reload();
    await fullState(first, v, '08-original-declined-guest-full-no-confirmation');
    assert.equal(first.runtimeErrors.length + second.runtimeErrors.length, 0, 'No guest browser runtime errors.');
    checks.push({ variant: v.name, fullOutsiderBlocked: true, reservedInviteeCanAcceptAndDecline: true,
      releasedPlaces: [1, 1], firstGuestAcceptedByUI: true, secondGuestAcceptedByUI: true,
      originalGuestDeclinedByUI: true, declinedGuestCannotReclaimFullPlace: true,
      publicationRetryUnique: true, calendarCounts: finalCounts, runtimeErrors: 0 });
    await report(false);
  }
} catch (error) {
  failure = error;
  await fs.writeFile(path.join(privateDirectory, runName + '-error.private.txt'), String(error?.stack ?? error), { mode: 0o600 });
} finally {
  for (const { context, name } of contexts) {
    const tracePath = path.join(privateDirectory, `${runName}-${name}.private.zip`);
    await context.tracing.stop({ path: tracePath }).catch(() => {});
    await fs.chmod(tracePath, 0o600).catch(() => {});
    await context.close().catch(() => {});
  }
  await browser?.close();
  await report(!failure && checks.length === variants.length);
}
if (failure) {
  console.error(`Capacity browser verification failed at ${currentStep}; private diagnostics retained.`);
  process.exitCode = 1;
} else {
  console.log(`${stage} ${engineName}: ${checks.length} capacity browser ${baseline ? 'baseline reproduction' : 'flow'} variants passed.`);
}
