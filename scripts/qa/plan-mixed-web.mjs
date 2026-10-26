// Real App UI + three private browser identities. The Mac never writes the main plan.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chromium, webkit, expect } from '@playwright/test';
import { call, calendars, persist, readFixture, route } from './plan-six-participant-phone.mjs';

const [logPath] = process.argv.slice(2);
assert(logPath, 'Supply the actual physical XCTest log.');
const origin = process.env.SIDESEAT_MIXED_WEB_ORIGIN || 'https://www.sideseat.de';
const appBuild = Number(process.env.SIDESEAT_QA_UI_BUILD || '232');
assert(Number.isSafeInteger(appBuild) && appBuild > 0, 'Supply a positive native build number.');
const privateDir = path.resolve(process.env.SIDESEAT_MIXED_PRIVATE_DIR || `/tmp/sideseat-mixed${appBuild}-private`);
const out = path.resolve(process.env.SIDESEAT_QA_OUTPUT || `docs/qa/evidence/2026-10-26-plan-direct-invitation${appBuild}`);
await fs.mkdir(privateDir, { recursive: true, mode: 0o700 });
await fs.chmod(privateDir, 0o700);
await fs.mkdir(out, { recursive: true });
const evidence = async (name, value) => fs.writeFile(path.join(out, name), JSON.stringify(value, null, 2) + '\n');
const f = await readFixture();
assert(f.title.startsWith('混合闭环 ') && f.mixedGuests.length === 3);
const owner = f.accounts.find(a => a.role === 'owner');
const phases = ['created', 'owner-draft', 'owner-submitted', 'app-shared', 'app1-submitted', 'app2-submitted',
  'six-responses-ready', 'invited', 'app1-accepted', 'mixed-replies-ready', 'published',
  'app2-late-accepted', 'app1-withdrawn', 'cancelled', 'final-calendar-verified'];
const checks = [], webChecks = [], screenshots = [], guests = [], browsers = [];
let current = 'starting', failed, completed = false, main;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha = value => createHash('sha256').update(value).digest('hex');
const report = async () => evidence('mixed-real-flow.json', { passed: completed && !failed, origin,
  appBuild, physicalUDID: '00008110-001A69110CC1401E', phases, checks, webChecks, screenshots,
  mainMutations: 'App owner/registered peers through physical UI; guests through actual public browser UI only',
  browserEngines: ['chromium', 'webkit'], realNetwork: true,
  failure: failed ? { phase: current, message: 'Failed boundary; private diagnostics retained.' } : null,
  harnessSHA256: sha(await fs.readFile(new URL(import.meta.url))), at: new Date().toISOString() });

async function poll() {
  if (!main) {
    const found = (await call('/api/v1/time-polls', owner)).polls.filter(p => p.isOwner && p.title === f.title);
    assert.equal(found.length, 1, 'The App must create one main plan.');
    main = { token: found[0].token }; f.pollToken = main.token;
    if (!f.tokens.includes(main.token)) f.tokens.push(main.token);
    await persist(f);
  }
  return call(route(main), owner);
}

async function publicPoll(g) {
  const r = await g.context.request.get(`/api/public/time-polls/${main.token}`);
  assert.equal(r.status(), 200, 'Private browser read must succeed.');
  return (await r.json()).data;
}

async function capture(g, name, locator) {
  const input = g.page.getByRole('textbox', { name: '个人恢复链接', exact: true });
  assert.equal(await input.isVisible(), false, 'Never capture a personal recovery credential.');
  if (locator) await locator.scrollIntoViewIfNeeded();
  const file = `mixed-${g.role}-${name}.png`;
  const bytes = await g.page.screenshot({ path: path.join(out, file) });
  screenshots.push({ role: g.role, engine: g.engine, file, sha256: sha(bytes), viewport: g.page.viewportSize() });
}

async function openGuest(data, index) {
  const engine = index === 1 ? 'webkit' : 'chromium';
  let browser = browsers.find(x => x.engine === engine)?.browser;
  if (!browser) { browser = await ({ chromium, webkit }[engine]).launch(); browsers.push({ engine, browser }); }
  const context = await browser.newContext({ baseURL: origin, viewport: { width: index === 1 ? 320 : 390, height: 844 },
    locale: 'zh-CN', colorScheme: index === 1 ? 'dark' : 'light', reducedMotion: 'reduce', hasTouch: true, isMobile: true });
  await context.addCookies([{ name: 'SIDESEAT_POLL_LOCALE', value: 'zh-CN', url: origin + '/time-polls' }]);
  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();
  const g = { ...data, engine, context, page, runtimeErrors: 0 };
  guests.push(g);
  page.on('pageerror', () => { g.runtimeErrors++; });
  await page.goto(`/time-polls/${main.token}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(f.title, { timeout: 30_000 });
  await expect(page.getByTestId('plan-next-step')).toContainText('以网页访客参与');
  await expect(page.getByRole('link', { name: '打开 App', exact: true })).toHaveAttribute('href', `sideseat://time-polls/${main.token}`);
  await page.getByLabel('你的名字', { exact: true }).fill(g.displayName);
  await page.getByRole('button', { name: '下一步：选择我的空闲', exact: true }).click();
  const grid = page.getByTestId('time-poll-grid'); await expect(grid).toBeVisible();
  const panel = page.getByTestId('guest-recovery-panel');
  if (await panel.getAttribute('open') !== null) await panel.locator('summary').click();
  const before = await publicPoll(g); assert.deepEqual(before.mySlotIds, []);
  g.viewerId = before.viewerId; assert(g.viewerId);
  const cell0 = page.getByTestId('time-poll-cell-0'), cell2 = page.getByTestId('time-poll-cell-2');
  await cell0.click(); await cell2.click(); await cell2.click();
  await expect(cell0).toHaveAttribute('aria-pressed', 'true'); await expect(cell2).toHaveAttribute('aria-pressed', 'false');
  await cell2.click();
  assert.deepEqual((await publicPoll(g)).mySlotIds, [], 'Unsubmitted choices must remain a browser draft.');
  await capture(g, 'unsubmitted', grid);
  await page.reload(); await expect(cell0).toHaveAttribute('aria-pressed', 'true', { timeout: 25_000 });
  await expect(cell2).toHaveAttribute('aria-pressed', 'true');
  if (index === 0) {
    // Controlled single transport failure, then the same real submission is retried.
    await page.route(`**/api/public/time-polls/${main.token}/response`, async r => {
      await r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Controlled QA transport failure' } }) });
    }, { times: 1 });
    await page.getByTestId('availability-submit').click();
    await expect(page.getByText('提交失败', { exact: true })).toBeVisible();
    assert.deepEqual((await publicPoll(g)).mySlotIds, []);
    await expect(cell0).toHaveAttribute('aria-pressed', 'true');
    await capture(g, 'controlled-failure-keeps-draft');
    webChecks.push({ role: g.role, check: 'single controlled 503 preserves draft and server snapshot; retry uses real server', passed: true });
  }
  const submitted = page.waitForResponse(r => r.url().endsWith('/response') && r.request().method() === 'PUT');
  await page.getByTestId('availability-submit').click(); assert.equal((await submitted).status(), 200);
  await expect(page.getByText('已提交空闲', { exact: true })).toBeVisible();
  assert.deepEqual((await publicPoll(g)).mySlotIds, [0, 1, 2, 3]);
  await capture(g, 'submitted', grid);
  webChecks.push({ role: g.role, check: 'private identity, tap/cancel, draft reload, explicit submission', passed: true });
  return g;
}

async function recoverGuest(g) {
  const panel = g.page.getByTestId('guest-recovery-panel');
  if (await panel.getAttribute('open') === null) await panel.locator('summary').click();
  const result = g.page.waitForResponse(r => r.url().includes('/participant/recovery?'));
  await g.page.getByTestId('guest-recovery-copy').click();
  const r = await result; assert.equal(r.status(), 200); assert(r.headers()['cache-control'].includes('no-store'));
  const link = (await r.json()).data.recoveryUrl;
  const recover = new URLSearchParams(new URL(link).hash.slice(1)).get('recover'); assert(recover);
  const original = g.viewerId;
  await g.context.clearCookies(); await g.page.evaluate(() => localStorage.clear());
  await g.page.reload(); await expect(g.page.getByLabel('你的名字', { exact: true })).toBeVisible();
  assert.equal((await publicPoll(g)).viewerId, null);
  const urls = []; g.page.on('request', r => urls.push(r.url()));
  await g.page.goto(new URL(link).pathname + new URL(link).hash);
  await expect(g.page.getByText('已恢复你的填写，可以继续修改。', { exact: true })).toBeVisible({ timeout: 25_000 });
  assert.equal(new URL(g.page.url()).hash, ''); assert(!urls.some(u => u.includes(recover)));
  const restored = await publicPoll(g); assert.equal(restored.viewerId, original); assert.deepEqual(restored.mySlotIds, [0, 1, 2, 3]);
  if (await panel.getAttribute('open') !== null) await panel.locator('summary').click();
  await capture(g, 'restored-original-response', g.page.getByTestId('time-poll-grid'));
  webChecks.push({ role: g.role, check: 'cleared browser data; personal fragment recovery preserves original identity and slots; credential absent from network URLs', passed: true });
}

async function reply(g, status) {
  const button = g.page.getByRole('button', { name: status === 'ACCEPTED' ? '确认参加' : '无法参加', exact: true });
  await expect(button).toBeVisible({ timeout: 30_000 });
  const result = g.page.waitForResponse(r => r.url().endsWith('/invitation-response') && r.request().method() === 'PUT');
  await button.click(); assert.equal((await result).status(), 200);
  assert.equal((await publicPoll(g)).invitations.find(i => i.isMe)?.status, status);
  if (status === 'DECLINED') {
    const label = g.page.getByRole('button', { name: '已拒绝', exact: true });
    await expect(label).toBeDisabled();
    const fits = await label.evaluate(el => {
      const range = document.createRange(); range.selectNodeContents(el);
      return range.getBoundingClientRect().height <= parseFloat(getComputedStyle(el).lineHeight) + 1;
    });
    assert(fits, 'The declined status must fit on one line inside its button.');
    webChecks.push({ role: g.role, check: 'declined status stays within one text line', passed: true });
  }
}

async function verifyInvitation(g) {
  await expect(g.page.getByTestId('plan-invitation')).toBeVisible({ timeout: 35_000 });
  await expect(g.page.getByTestId('plan-invitation-legend')).toHaveCount(1);
  assert.equal(await g.page.locator('[data-testid^="plan-invitation-cell-"][data-highlighted="true"]').count(), 2);
  await expect(g.page.getByTestId('plan-invitation-timetable')).toContainText('09:00–10:00');
  await expect(g.page.getByTestId('plan-invitation')).toContainText('已接受的 App 用户会收到通知并同步 SideSeat 日历');
  await expect(g.page.getByTestId('plan-invitation')).toContainText('网页访客请保留此链接查看更新');
  await capture(g, 'final-time-highlight', g.page.getByTestId('plan-invitation-timetable'));
}

async function verify(phase) {
  const p = await poll();
  const included = p.phase === 'CONFIRMED' ? p.invitations.filter(i => i.selected && i.status === 'ACCEPTED') : [];
  const result = await calendars(p, f.accounts);
  const counts = {};
  for (const [index, account] of f.accounts.entries()) {
    const rows = result.rows[index], mine = included.find(i => !i.isGuest && i.displayName === account.displayName);
    assert.equal(rows.length, mine ? 1 : 0, `${account.role}: calendar count`); counts[account.role] = rows.length;
    if (rows.length) {
      const row = rows[0]; assert.equal(row.title, f.title); assert.equal(row.location, f.location);
      assert.equal(Date.parse(row.startISO), Date.parse(p.chosenStart)); assert.equal(Date.parse(row.endISO), Date.parse(p.chosenEnd));
      const expected = included.filter(i => i.id !== mine.id).map(i => ({ name: i.displayName, userId: i.isGuest ? null : f.accounts.find(a => a.displayName === i.displayName)?.id }));
      const sort = x => x.map(y => JSON.stringify(y)).sort();
      assert.deepEqual(sort(row.eventParticipants.map(y => ({ name: y.name, userId: y.userId }))), sort(expected), `${account.role}: all accepted companions including guests`);
    }
    if (['published', 'app2-late-accepted', 'app1-withdrawn', 'cancelled', 'final-calendar-verified'].includes(phase)) {
      const search = await call('/api/v1/calendar/search?q=' + encodeURIComponent(f.title), account);
      const matching = search.results.filter(r => r.timePollToken === main.token);
      assert.equal(matching.length, rows.length);
      if (rows.length) assert.deepEqual(matching[0].eventParticipants.map(x => JSON.stringify(x)).sort(), rows[0].eventParticipants.map(x => JSON.stringify(x)).sort());
    }
  }
  for (const g of guests) {
    const view = await publicPoll(g); assert.equal(view.viewerId, g.viewerId); assert.deepEqual(view.mySlotIds, [0, 1, 2, 3]);
  }
  assert.equal(p.summary.participantCount, p.participants.length);
  assert.deepEqual(p.summary.counts, p.slots.map(s => p.participants.filter(person => person.slotIds.includes(s.id)).length));
  for (const role of ['owner', 'peer1', 'peer2']) {
    const a = f.accounts.find(x => x.role === role), view = await call(route(main), a);
    const submitted = phase !== 'created' && phase !== 'owner-draft' && (role === 'owner' || phases.indexOf(phase) >= phases.indexOf(role === 'peer1' ? 'app1-submitted' : 'app2-submitted'));
    if (phase === 'app1-submitted' && role === 'peer2') {
      // Browser UI work may finish after the phone has already submitted App 2.
      // Preserve exact own values without mislabeling a later read as an earlier snapshot.
      assert([JSON.stringify([]), JSON.stringify([0, 1, 2, 3])].includes(JSON.stringify(view.mySlotIds)));
    } else assert.deepEqual(view.mySlotIds, submitted ? [0, 1, 2, 3] : [], `${role}: own availability snapshot`);
  }
  if (['six-responses-ready', 'invited', 'mixed-replies-ready'].includes(phase)) assert.equal(p.summary.participantCount, 6);
  if (phase === 'invited') {
    assert.equal(p.phase, 'INVITING'); assert.equal(p.invitationVersion, 1);
    const identity = person => JSON.stringify({ name: person.displayName, guest: Boolean(person.isGuest) });
    assert.deepEqual(p.invitations.filter(i => i.selected).map(identity).sort(), p.participants.map(identity).sort(),
      'Direct sending includes all six submitted App and guest identities, without a review-page selection.');
  }
  if (phase === 'created' || phase === 'owner-draft') assert.equal(p.phase, 'COLLECTING');
  if (phase === 'mixed-replies-ready') {
    assert.equal(p.phase, 'INVITING'); assert.equal(included.length, 0);
    for (const [name, status] of [[owner.displayName, 'ACCEPTED'], [f.accounts[1].displayName, 'ACCEPTED'], [f.accounts[2].displayName, 'INVITED'], [f.mixedGuests[0].displayName, 'ACCEPTED'], [f.mixedGuests[1].displayName, 'INVITED'], [f.mixedGuests[2].displayName, 'DECLINED']]) assert.equal(p.invitations.find(i => i.displayName === name)?.status, status);
  }
  if (phase === 'cancelled' || phase === 'final-calendar-verified') assert.equal(p.phase, 'CANCELLED');
  checks.push({ phase, actualPhase: p.phase, submissions: p.summary.participantCount,
    invitationVersion: p.invitationVersion, acceptedNames: p.invitations.filter(i => i.selected && i.status === 'ACCEPTED').map(i => i.displayName),
    calendarCounts: counts, exactRegisteredAndGuestCompanionsChecked: true, at: new Date().toISOString() });
}

try {
  const deadline = Date.now() + 30 * 60_000;
  while (Date.now() < deadline) {
    const log = await fs.readFile(logPath, 'utf8').catch(() => '');
    for (const [, phase] of log.matchAll(/PLAN_MIXED_PHASE ([a-z0-9-]+)/g)) {
      if (checks.some(c => c.phase === phase)) continue;
      current = phase; assert.equal(phase, phases[checks.length], 'Native phases must remain ordered.');
      await verify(phase);
      if (phase === 'app-shared') {
        for (const [index, data] of f.mixedGuests.entries()) await openGuest(data, index);
        assert.equal(new Set(guests.map(g => g.viewerId)).size, 3);
        await recoverGuest(guests[0]);
      }
      if (phase === 'invited') {
        for (const g of guests) await verifyInvitation(g);
        await reply(guests[0], 'ACCEPTED');
        await guests[1].page.getByRole('button', { name: '暂不回复', exact: true }).click();
        assert.equal((await publicPoll(guests[1])).invitations.find(i => i.isMe)?.status, 'INVITED');
        await reply(guests[2], 'DECLINED');
        webChecks.push({ check: 'final highlight, accept / local defer / decline; no registered Calendar before explicit publish', passed: true });
      }
      if (phase === 'published') {
        for (const g of guests) await expect(g.page.getByRole('heading', { name: '计划已确定', exact: true })).toBeVisible({ timeout: 35_000 });
        await guests[1].page.getByRole('button', { name: '回复邀请', exact: true }).click();
        await reply(guests[1], 'ACCEPTED');
        await capture(guests[1], 'late-acceptance', guests[1].page.getByTestId('plan-invitation'));
        webChecks.push({ check: 'web late acceptance updates existing registered Calendars and companions', passed: true });
      }
      if (phase === 'app2-late-accepted') {
        await reply(guests[0], 'DECLINED');
        await capture(guests[0], 'withdrawn', guests[0].page.getByTestId('plan-invitation'));
        webChecks.push({ check: 'web withdrawal after publication removes guest from all registered Calendar companion lists', passed: true });
      }
      if (phase === 'cancelled') {
        for (const g of guests) {
          await expect(g.page.getByRole('heading', { name: '计划已取消', exact: true })).toBeVisible({ timeout: 35_000 });
          await expect(g.page.getByRole('button', { name: '确认参加', exact: true })).toHaveCount(0);
          await expect(g.page.getByTestId('availability-submit')).toHaveCount(0);
          await capture(g, 'cancelled-without-page-reload', g.page.getByTestId('plan-invitation'));
        }
        webChecks.push({ check: 'three still-open web pages automatically show cancellation without manual reload; no editing or reply action', passed: true });
      }
      await report(); console.log('PLAN_MIXED_WEB verified ' + phase);
    }
    assert(!log.includes('** TEST EXECUTE FAILED **') && !/Test Case .*PlanMixedWebPhoneUITests.* failed/.test(log), 'Physical test failed.');
    if (log.includes('** TEST EXECUTE SUCCEEDED **')) {
      assert(/Executed 1 test, with 0 failures/.test(log)); assert.equal(checks.length, phases.length);
      assert(guests.every(g => g.runtimeErrors === 0)); completed = true; break;
    }
    await sleep(300);
  }
  assert(completed, 'Mixed flow did not finish successfully.');
} catch (cause) { failed = cause; await fs.writeFile(path.join(privateDir, 'coordinator-failure.txt'), String(cause?.stack), { mode: 0o600 }); }
finally {
  for (const g of guests) { await g.context.tracing.stop({ path: path.join(privateDir, g.role + '-browser-trace.zip') }).catch(() => {}); await g.context.close(); }
  await Promise.all(browsers.map(x => x.browser.close())); await report();
}
if (failed) { console.error('Mixed UI boundary failed; inspect private diagnostics.'); process.exitCode = 1; }
