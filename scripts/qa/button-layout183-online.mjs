// Disposable account integration: actual contact delivery, consent boundaries and guest compatibility.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { chromium, webkit, expect } from '@playwright/test';

const [base, stage = 'local', engineName = 'chromium'] = process.argv.slice(2); assert(base); assert(["chromium", "webkit"].includes(engineName));
const out = path.resolve(process.env.SIDESEAT_QA_OUTPUT || 'docs/qa/evidence/2026-10-23-buttons183'); fs.mkdirSync(out, { recursive: true });
const privatePath = path.join(os.tmpdir(), `sideseat-button-layout183-${stage}-${engineName}-private.json`); assert(!fs.existsSync(privatePath));
const fixture = { base, accounts: [], tokens: [] }, checks = [];
const persist = () => fs.writeFileSync(privatePath, JSON.stringify(fixture), { mode: 0o600 });
const cookies = process.env.SIDESEAT_CANDIDATE_COOKIE_FILE ? fs.readFileSync(process.env.SIDESEAT_CANDIDATE_COOKIE_FILE, 'utf8').split('\n').filter(l => l.startsWith('#HttpOnly_') || (l && !l.startsWith('#'))).map(l => {
  const [domain, , cookiePath, secure, expires, name, value] = l.replace(/^#HttpOnly_/, '').split('\t');
  return { domain, path: cookiePath, secure: secure === 'TRUE', expires: Number(expires), name, value, httpOnly: l.startsWith('#HttpOnly_'), sameSite: 'Lax' };
}) : [];
const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
async function call(route, account, method = 'GET', body, status = 200, key = randomUUID()) {
  const r = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', 'x-sideseat-platform': 'ios', 'Idempotency-Key': key,
    ...(account ? { Authorization: `Bearer ${account.accessToken}` } : {}), ...(cookieHeader ? { Cookie: cookieHeader } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const payload = await r.json().catch(() => ({}));
  assert.equal(r.status, status, `${method} ${route}: ${r.status}; ${payload.error?.message || (typeof payload.error === "string" ? payload.error : payload.message) || ''}`);
  return payload.data;
}
const route = p => `/api/v1/time-polls/${p.token}`;
const check = text => { checks.push(text); console.log(`BUTTON_LAYOUT183 ${stage}: ${text}`); };
async function calendar(p, a) {
  const day = (p.chosenStart || p.slots[0].start).slice(0, 10);
  return (await call(`/api/v1/home/schedule?windowStart=${day}T00:00:00Z&windowEnd=${day}T23:59:59Z`, a)).studyEntries.filter(e => e.timePollToken === p.token);
}
let failure; const browserErrors = [];
try {
  persist();
  for (const role of ['owner', 'peer']) {
    const a = { role, identifier: `pqa_outline182_${role}_${randomBytes(4).toString('hex')}`, password: randomBytes(22).toString('base64url') };
    await call('/api/auth/signup', null, 'POST', { username: a.identifier, password: a.password, displayName: `QA ${role}`, school: 'TUM', studentStatus: 'CURRENT_STUDENT', degreeLevel: 'BACHELOR', semester: 3 }, 201);
    fixture.accounts.push(a); persist();
    const login = await call('/api/v1/auth/login', null, 'POST', { identifier: a.identifier, password: a.password, device: { id: randomUUID(), name: 'Fixed activity QA', appVersion: '1.0.0', platformVersion: '26.6.1' } });
    a.accessToken = login.tokens.accessToken; a.id = login.user.id; persist();
  }
  const [owner, peer] = fixture.accounts;
  const connection = (await call('/api/v1/contacts', owner, 'POST', { peerId: peer.id }, 201)).connectionId;
  await call(`/api/v1/connections/${connection}/friend-link`, owner, 'POST', { action: 'request' });
  await call(`/api/v1/connections/${connection}/friend-link`, peer, 'POST', { action: 'accept' });
  await call(`/api/v1/connections/${connection}/messages`, owner, 'POST', { type: 'TEXT', body: 'Ready to plan' }, 201);
  await call(`/api/v1/connections/${connection}/messages`, peer, 'POST', { type: 'TEXT', body: 'Ready' }, 201);
  const day = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  const fixedStart = day + 'T21:07:00.000Z'; // 23:07 Berlin, crosses midnight and falls outside collection hours.
  const input = { title: 'Saturday evening ideas', location: 'Campus', timeZone: 'Europe/Berlin', dates: [day], startMinute: 540, endMinute: 1260, planningMode: 'FIXED', fixedStart, durationMinutes: 120, expectedCount: 3 };
  let p = await call('/api/v1/time-polls', owner, 'POST', { ...input, chooseActivityTogether: true }, 201);
  fixture.tokens.push(p.token); persist();
  assert.equal(p.phase, 'COLLECTING'); assert.equal(p.planningMode, 'FIXED'); assert.equal(p.invitationVersion, 0);
  assert.equal(p.chosenStart, fixedStart); assert.equal(p.expiresAt, fixedStart); assert.equal(Date.parse(p.chosenEnd) - Date.parse(p.chosenStart), 7200000);
  assert(p.activitySelection.isOpen); assert.equal(p.participants.length, 0); assert.equal(p.invitations.length, 0); assert.equal(p.expectedCount, 3);
  await call(route(p) + '/response', peer, 'PUT', { displayName: 'Peer', slotIds: [0] }, 409);
  await call(route(p) + '/invitation-response', peer, 'PUT', { status: 'ACCEPTED', version: 1 }, 409);
  await call(route(p) + '/publish', owner, 'POST', { version: 1 }, 409);
  await call(route(p) + '/invitations', owner, 'POST', { version: 0, start: p.chosenStart, end: p.chosenEnd, attendeeIds: [], linkParticipantCount: 3 }, 409);
  check('fixed time and activity ideas coexist with zero responses, invitations or calendars; early attendance and invitations are blocked');
  p = (await call(route(p) + '/contacts', owner, 'POST', { connectionIds: [connection], version: 0 }, 201)).poll;
  assert((await call('/api/v1/time-polls', peer)).polls.some(row => row.token === p.token && row.activitySelection.isOpen));
  assert.equal(p.participants.length, 0); assert.equal(p.invitations.length, 0);
  check('App contact receives a card and list entry without fake availability or acceptance');
  const browser = await ({ chromium, webkit }[engineName]).launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: engineName === 'webkit' ? 'dark' : 'light' });
    if (cookies.length) await context.addCookies(cookies.map(c => ({ ...c, expires: c.expires || -1 })));
    const page = await context.newPage();
    page.on('pageerror', error => browserErrors.push(error.message));
    await page.goto(base + '/time-polls/' + p.token);
    await page.getByLabel('你的名字', { exact: true }).fill('Guest Lin');
    await page.getByRole('button', { name: '加入一起选活动', exact: true }).click();
    await expect(page.getByTestId('plan-invitation-timetable')).toBeVisible();
    await expect(page.getByTestId('activity-compose')).toBeVisible();
    await expect(page.getByTestId('time-poll-grid')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '提交我的空闲', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '确认参加', exact: true })).toHaveCount(0);
    let suggestionRequests = 0;
    page.on('request', request => { if (request.method() === 'POST' && /\/activities$/.test(new URL(request.url()).pathname)) suggestionRequests++; });
    await page.getByTestId('activity-compose').click();
    const quickInput = page.getByLabel('我想提议', { exact: true });
    await expect(page.getByTestId('activity-completions').getByRole('button')).toHaveCount(3);
    const audit = async () => page.locator('main').evaluate(root => {
      const elements = [...root.querySelectorAll('button:not([data-testid^="time-poll-cell-"]):not([data-testid^="time-poll-day-"]), a[href^="sideseat:"]')].filter(el => el.getBoundingClientRect().width && el.getBoundingClientRect().height);
      return elements.map(el => {
        const s = getComputedStyle(el), r = el.getBoundingClientRect();
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const content = []; let node;
        while ((node = walker.nextNode())) {
          if (!node.textContent.trim()) continue;
          const range = document.createRange(); range.selectNodeContents(node);
          for (const box of range.getClientRects()) content.push(box);
        }
        for (const svg of el.querySelectorAll('svg')) content.push(svg.getBoundingClientRect());
        return { id: el.getAttribute('data-testid') || el.textContent?.trim() || el.getAttribute('aria-label'), border: s.borderTopWidth, style: s.borderTopStyle, color: s.borderTopColor, radius: s.borderTopLeftRadius, height: r.height, left: r.left, right: r.right,
          contentHasInsets: content.every(box => box.left >= r.left + 3 && box.right <= r.right - 3 && box.top >= r.top + 3 && box.bottom <= r.bottom - 3) };
      });
    });
    let auditRows = await audit();
    assert(auditRows.length >= 5);
    assert(auditRows.every(r => r.contentHasInsets && parseFloat(r.border) >= 1 && r.style === 'solid' && r.color !== 'rgba(0, 0, 0, 0)' && r.height >= 44 && r.left >= -1 && r.right <= 391), JSON.stringify(auditRows));
    fs.writeFileSync(`${out}/${stage}-${engineName}-button-outline-audit.json`, JSON.stringify(auditRows, null, 2));
    await page.screenshot({ path: `${out}/${stage}-${engineName}-quick-fill-options.png`, fullPage: true });
    await page.getByTestId('activity-complete-火锅').click();
    await expect(quickInput).toHaveValue('火锅'); await expect(quickInput).toBeFocused();
    assert.equal((await call(route(p), owner)).activitySelection.ideaCount, 0);
    assert.equal(suggestionRequests, 0, 'Tap completion sends no mutation');
    await page.screenshot({ path: `${out}/${stage}-${engineName}-tap-completion.png`, fullPage: true });
    await page.getByTestId('activity-cancel').click();
    await page.getByTestId('activity-compose').click();
    await quickInput.fill('羽');
    await expect(page.getByTestId('activity-completions').getByRole('button')).toHaveCount(1);
    await quickInput.dispatchEvent('keydown', { key: 'Tab', code: 'Tab', isComposing: true });
    await expect(quickInput).toHaveValue('羽');
    await quickInput.press('Shift+Tab'); await expect(quickInput).toHaveValue('羽');
    await quickInput.focus(); await quickInput.press('Tab');
    await expect(quickInput).toHaveValue('羽毛球'); await expect(quickInput).toBeFocused();
    await expect(page.getByTestId('activity-completions')).toHaveCount(0);
    await page.screenshot({ path: `${out}/${stage}-${engineName}-tab-completion.png`, fullPage: true });
    await quickInput.press('Tab'); await expect(quickInput).not.toBeFocused();
    await quickInput.fill('我自己的活动'); await quickInput.press('Tab');
    await expect(quickInput).toHaveValue('我自己的活动'); await expect(quickInput).not.toBeFocused();
    await quickInput.fill(''); await quickInput.press('Tab'); await expect(quickInput).toHaveValue('逛展');
    assert.equal(suggestionRequests, 0); assert.equal((await call(route(p), owner)).activitySelection.ideaCount, 0);
    await page.getByTestId('activity-cancel').click();
    check('tap and Tab fill only local drafts; empty and partial input complete; IME composition, Shift+Tab and unmatched Tab keep normal behavior; no suggestions were submitted');
    for (const title of ['Evening walk', '一起逛展', '校园羽毛球', '周末火锅与散步']) {
      await page.getByTestId('activity-compose').click();
      const field = page.getByLabel('我想提议', { exact: true });
      await expect(field).toBeFocused(); await field.fill(title);
      const confirm = await page.getByTestId('activity-suggest').boundingBox();
      assert(confirm.x > 195, 'Confirm stays on the right');
      if (title !== 'Evening walk') {
        const input = await field.boundingBox(), board = await page.getByTestId('activity-board').boundingBox();
        assert(input.y < board.y, 'Composer stays above the board');
      }
      await page.getByTestId('activity-suggest').click();
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await expect(page.getByTestId('activity-composer')).toHaveCount(0);
    }
    const tiles = page.locator('[data-testid^="activity-idea-"]');
    await expect(tiles).toHaveCount(4);
    let a = await tiles.nth(0).boundingBox(), b = await tiles.nth(1).boundingBox();
    assert(Math.abs(a.y - b.y) < 2 && b.x > a.x + a.width, 'Two aligned columns');
    await page.getByTestId('activity-compose').click();
    await page.getByLabel('我想提议', { exact: true }).fill('取消草稿');
    await page.screenshot({ path: `${out}/${stage}-${engineName}-top-composer.png`, fullPage: true });
    await page.getByTestId('activity-cancel').click(); await expect(tiles).toHaveCount(4);
    await page.getByTestId('activity-toggle').click(); await expect(page.getByTestId('activity-ideas')).toBeHidden();
    await page.getByTestId('activity-compose').click(); await expect(page.getByTestId('activity-ideas')).toBeVisible();
    await page.getByTestId('activity-cancel').click();
    await page.setViewportSize({ width: 320, height: 740 });
    auditRows = await audit();
    assert(auditRows.every(r => r.contentHasInsets && r.left >= -1 && r.right <= 321), JSON.stringify(auditRows));

    a = await tiles.nth(0).boundingBox(); b = await tiles.nth(1).boundingBox();
    assert(Math.abs(a.x - b.x) < 2 && b.y > a.y, 'Narrow view uses one column');
    await page.screenshot({ path: `${out}/${stage}-${engineName}-narrow.png`, fullPage: true });
    const enlarged = await page.addStyleTag({ content: 'main button, main a[href^="sideseat:"] { font-size: 20px !important; }' });
    const largeRows = await audit();
    assert(largeRows.every(r => r.contentHasInsets && r.left >= -1 && r.right <= 321), JSON.stringify(largeRows));
    fs.writeFileSync(`${out}/${stage}-${engineName}-large-content-audit.json`, JSON.stringify(largeRows, null, 2));
    await page.screenshot({ path: `${out}/${stage}-${engineName}-narrow-large.png`, fullPage: true });
    await enlarged.evaluate(el => el.remove());
    await page.setViewportSize({ width: 390, height: 844 });
    check('four suggestions use two compact columns; add/confirm on header right; composer above board; cancel and collapsed add work; narrow view remains readable');
    p = await call(route(p) + '/activities', peer, 'POST', { title: 'Board games' });
    const idea = p.activitySelection.ideas.find(i => i.title === 'Board games');
    await page.reload();
    await page.getByTestId('activity-interest-' + idea.id).click();
    await expect(page.getByTestId('activity-interest-' + idea.id)).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: `${out}/${stage}-${engineName}-board.png`, fullPage: true });
    check('guest web shows a read-only fixed timetable, opens activity ideas directly and accepts suggestions/interests without an availability form or RSVP');
    p = await call(route(p) + '/activities/choose', owner, 'POST', { ideaId: idea.id });
    assert.equal(p.title, 'Board games'); assert.equal(p.location, 'Campus'); assert.equal(p.chosenStart, fixedStart); assert.equal(p.phase, 'COLLECTING');
    assert.equal(p.invitationVersion, 0); assert.equal(p.invitations.length, 0);
    await call(route(p) + '/invitations', owner, 'POST', { version: 0, start: new Date(Date.parse(p.chosenStart) + 900000).toISOString(), end: p.chosenEnd, attendeeIds: [], linkParticipantCount: 3 }, 422);
    p = await call(route(p) + '/invitations', owner, 'POST', { version: 0, start: p.chosenStart, end: p.chosenEnd, attendeeIds: p.invitees.map(i => i.id), linkParticipantCount: 3 });
    assert.equal(p.phase, 'INVITING'); assert.equal(p.invitationVersion, 1); assert.equal(p.chosenStart, fixedStart);
    assert.equal(p.invitations.filter(i => i.status === 'ACCEPTED').length, 1);
    for (const a of [owner, peer]) assert.equal((await calendar(p, a)).length, 0);
    check('activity selection preserves place and exact cross-midnight time; only an explicit send creates invitation version one');
    await page.reload();
    await expect(page.getByRole('button', { name: '确认参加', exact: true })).toBeVisible();
    await expect(page.getByTestId('plan-invitation-timetable')).toBeVisible();
    await expect(page.getByRole('heading', { name: '受邀时间表', exact: true })).toHaveCount(0);
    auditRows = await audit();
    assert(auditRows.every(r => parseFloat(r.border) >= 1 && r.style === 'solid' && r.height >= 44), JSON.stringify(auditRows));
    fs.writeFileSync(`${out}/${stage}-${engineName}-invitation-outline-audit.json`, JSON.stringify(auditRows, null, 2));
    await page.screenshot({ path: `${out}/${stage}-${engineName}-invitation-actions.png`, fullPage: true });
    await page.getByRole('button', { name: '确认参加', exact: true }).click();
    await expect(page.getByText('你已接受，等待发起人正式发出', { exact: true }).first()).toBeVisible();
    p = await call(route(p) + '/invitation-response', peer, 'PUT', { status: 'ACCEPTED', version: 1 });
    assert.equal(p.phase, 'INVITING'); assert.equal(p.invitations.filter(i => i.status === 'ACCEPTED').length, 3);
    for (const a of [owner, peer]) assert.equal((await calendar(p, a)).length, 0);
    p = await call(route(p) + '/publish', owner, 'POST', { version: 1 });
    for (let i = 0; i < 2; i++) {
      p = await call(route(p) + '/publish', owner, 'POST', { version: 1 });
      for (const a of [owner, peer]) { const rows = await calendar(p, a); assert.equal(rows.length, 1); assert.equal(Date.parse(rows[0].endISO) - Date.parse(rows[0].startISO), 7200000); }
    }
    await page.reload(); await expect(page.getByText('计划已确定', { exact: true }).first()).toBeVisible();
    check('App and guest explicitly accept, only organizer publication writes one exact two-hour calendar entry per account; retry never duplicates it');
    assert.deepEqual(browserErrors, []);
    await context.close();
  } finally { await browser.close(); }
  for (const [mode, ideas] of [['COLLECT', false], ['COLLECT', true], ['FIXED', false]]) {
    const q = await call('/api/v1/time-polls', owner, 'POST', { ...input, planningMode: mode, chooseActivityTogether: ideas }, 201);
    fixture.tokens.push(q.token); persist();
    assert.equal(q.phase, mode === 'FIXED' ? 'INVITING' : 'COLLECTING');
    assert.equal(q.activitySelection?.isOpen === true, ideas);
  }
  check('ordinary collection, flexible-time activity ideas and immediate fixed invitations retain their existing creation contracts');
} catch (cause) { failure = cause; }
finally {
  const cleanup = { accounts: 0, tokens401: 0, links404: 0, errors: [] };
  for (const a of fixture.accounts) {
    try { await call('/api/v1/me', a, 'DELETE', { confirmUsername: a.identifier }); cleanup.accounts++; await call('/api/v1/me', a, 'GET', undefined, 401); cleanup.tokens401++; }
    catch (cause) { cleanup.errors.push(cause.message); }
  }
  for (const token of fixture.tokens) { try { const r = await fetch(base + '/api/public/time-polls/' + token, { headers: cookieHeader ? { Cookie: cookieHeader } : {} }); assert.equal(r.status, 404); cleanup.links404++; } catch (cause) { cleanup.errors.push(cause.message); } }
  fs.writeFileSync(`${out}/${stage}-${engineName}-button-layout183-cleanup.json`, JSON.stringify(cleanup, null, 2));
  if (!cleanup.errors.length) fs.unlinkSync(privatePath);
  else failure ||= new Error(cleanup.errors.join('; '));
}
fs.writeFileSync(`${out}/${stage}-${engineName}-button-layout183.json`, JSON.stringify({ passed: !failure, checks, browserErrors, failure: failure?.message ?? null, at: new Date().toISOString() }, null, 2));
if (failure) throw failure;
