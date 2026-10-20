// Disposable account integration: actual contact delivery, consent boundaries and guest compatibility.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { chromium, expect } from '@playwright/test';

const [base, stage = 'local'] = process.argv.slice(2); assert(base);
const out = path.resolve(process.env.SIDESEAT_QA_OUTPUT || 'docs/qa/evidence/2026-10-20-plans152'); fs.mkdirSync(out, { recursive: true });
const privatePath = path.join(os.tmpdir(), `sideseat-contacts152-${stage}-private.json`); assert(!fs.existsSync(privatePath));
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
const check = text => { checks.push(text); console.log(`CONTACTS152 ${stage}: ${text}`); };
async function calendar(p, a) {
  const day = (p.chosenStart || p.slots[0].start).slice(0, 10);
  return (await call(`/api/v1/home/schedule?windowStart=${day}T00:00:00Z&windowEnd=${day}T23:59:59Z`, a)).studyEntries.filter(e => e.timePollToken === p.token);
}
let failure;
try {
  persist();
  for (const role of ['owner', 'peer', 'late', 'excluded', 'quiet']) {
    const a = { role, identifier: `pqa_c152_${role}_${randomBytes(4).toString('hex')}`, password: randomBytes(22).toString('base64url') };
    await call('/api/auth/signup', null, 'POST', { username: a.identifier, password: a.password, displayName: `QA ${role}`, school: 'TUM', studentStatus: 'CURRENT_STUDENT', degreeLevel: 'BACHELOR', semester: 3 }, 201);
    fixture.accounts.push(a); persist();
    const login = await call('/api/v1/auth/login', null, 'POST', { identifier: a.identifier, password: a.password,
      device: { id: randomUUID(), name: 'Plan contact QA', appVersion: '1.0.0', platformVersion: '26.6.1' } });
    a.accessToken = login.tokens.accessToken; a.id = login.user.id; persist();
  }
  const [owner, peer, late, excluded, quiet] = fixture.accounts;
  for (const a of [peer, late, excluded, quiet]) {
    a.connectionId = (await call('/api/v1/contacts', owner, 'POST', { peerId: a.id }, 201)).connectionId;
    await call(`/api/v1/connections/${a.connectionId}/friend-link`, owner, 'POST', { action: 'request' });
    await call(`/api/v1/connections/${a.connectionId}/friend-link`, a, 'POST', { action: 'accept' });
    if (a !== quiet) {
      await call(`/api/v1/connections/${a.connectionId}/messages`, owner, 'POST', { type: 'TEXT', body: 'Ready to plan' }, 201);
      await call(`/api/v1/connections/${a.connectionId}/messages`, a, 'POST', { type: 'TEXT', body: 'Ready' }, 201);
    }
    persist();
  }
  assert.equal((await call('/api/v1/contacts', owner)).contacts.length, 4);
  const day = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  async function create(title, extra = {}) {
    const p = await call('/api/v1/time-polls', owner, 'POST', { title, timeZone: 'Europe/Berlin', dates: [day], startMinute: 540, endMinute: 660, ...extra }, 201);
    fixture.tokens.push(p.token); persist(); return p;
  }
  const messages = async (p, a) => (await call(`/api/v1/connections/${a.connectionId}/messages`, a)).messages.filter(m => m.body?.includes(`/time-polls/${p.token}`));
  const share = (p, accounts, status = 201, actor = owner, key) => call(route(p) + '/contacts', actor, 'POST', { connectionIds: accounts.map(a => a.connectionId), version: p.invitationVersion }, status, key);

  let p = await create('App contacts without fake responses', { expectedCount: 5 });
  const key = randomUUID(); let delivery = await share(p, [peer, late, excluded], 201, owner, key);
  p = delivery.poll; assert.equal(delivery.deliveries.length, 3);
  assert.equal(p.participants.length, 0); assert.equal(p.summary.participantCount, 0); assert.equal(p.invitations.length, 0);
  assert.equal(p.invitees.length, 3); assert(p.invitees.every(i => i.didRespond === false));
  for (const a of [peer, late, excluded]) {
    const item = (await call('/api/v1/time-polls', a)).polls.find(i => i.token === p.token);
    assert.equal(item?.didRespond, false); assert.equal(item?.phase, 'COLLECTING');
    assert.equal((await calendar(p, a)).length, 0);
    const msg = (await messages(p, a)); assert.equal(msg.length, 1); assert.equal(msg[0].type, 'TEXT'); assert(msg[0].body.startsWith('📅 '));
    const recipientView = await call(route(p), a);
    assert.equal(recipientView.sharedWithUserIds, undefined); assert.equal(recipientView.invitees, undefined);
  }
  check('contact delivery creates one readable card and a native list entry, with zero submitted responses or attendance');
  await share(p, [peer, late, excluded], 201, owner, key);
  assert.equal((await share(p, [peer, late, excluded])).deliveries.length, 0);
  for (const a of [peer, late, excluded]) assert.equal((await messages(p, a)).length, 1);
  await share(p, [late], 404, peer);
  await call(route(p) + '/contacts', owner, 'POST', { connectionIds: [peer.connectionId], version: 99 }, 409);
  check('idempotent replay and fresh-key retry do not resend cards; owner and version boundaries hold');

  p = await call(route(p) + '/response', peer, 'PUT', { displayName: 'App friend', slotIds: [0, 1, 2, 3] });
  assert.equal(p.summary.participantCount, 1);
  p = await call(route(p), owner);
  const chosen = p.invitees.filter(i => i.displayName === 'App friend' || i.displayName === 'QA late');
  assert.equal(chosen.length, 2); assert.equal(chosen.filter(i => !i.didRespond).length, 1);
  p = await call(route(p) + '/invitations', owner, 'POST', { version: 0, start: p.slots[0].start, end: p.slots[3].end, attendeeIds: chosen.map(i => i.id) });
  assert.equal(p.invitations.length, 3); assert.equal(p.summary.participantCount, 1);
  await call(route(p) + '/invitation-response', excluded, 'PUT', { version: 1, status: 'ACCEPTED' }, 403);
  assert.equal((await call('/api/v1/time-polls', excluded)).polls.find(i => i.token === p.token).isIncluded, false);
  p = await call(route(p) + '/invitation-response', peer, 'PUT', { version: 1, status: 'ACCEPTED' });
  assert.equal(p.phase, 'INVITING'); assert.equal((await calendar(p, peer)).length, 0);
  p = await call(route(p) + '/publish', owner, 'POST', { version: 1 });
  assert.equal((await calendar(p, owner)).length, 1); assert.equal((await calendar(p, peer)).length, 1);
  assert.equal((await calendar(p, late)).length, 0); assert.equal((await calendar(p, excluded)).length, 0);
  p = await call(route(p) + '/invitation-response', late, 'PUT', { version: 1, status: 'ACCEPTED' });
  assert.equal((await calendar(p, late)).length, 1); assert.equal(p.summary.participantCount, 1);
  check('unanswered contact can be explicitly selected; excluded delivery member cannot accept; publish and late acceptance preserve unique calendars');

  delivery = await share(p, [quiet]); p = delivery.poll;
  assert.equal(p.invitations.find(i => i.displayName === 'QA quiet').status, 'INVITED');
  assert.equal((await calendar(p, quiet)).length, 0); assert.equal((await messages(p, quiet)).length, 1);
  check('a published future plan can invite another contact without accepting for them');

  let fixed = await create('Fixed native contact and web guest', { planningMode: 'FIXED', fixedStart: p.slots[0].start, durationMinutes: 60, expectedCount: 3 });
  fixed = (await share(fixed, [peer])).poll;
  assert.equal(fixed.participants.length, 0); assert.equal(fixed.invitations.find(i => i.displayName === 'QA peer').status, 'INVITED');
  fixed = await call(route(fixed) + '/invitation-response', peer, 'PUT', { version: 1, status: 'ACCEPTED' });
  assert.equal((await calendar(fixed, peer)).length, 0);
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ storageState: { cookies, origins: [] }, viewport: { width: 390, height: 844 }, locale: 'zh-CN' });
    const page = await context.newPage(); await page.goto(base + '/time-polls/' + fixed.token);
    await page.getByLabel('你的名字', { exact: true }).fill('网页朋友');
    await page.getByRole('button', { name: '继续查看邀请', exact: true }).click();
    await expect(page.getByTestId('plan-invitation-timetable')).toBeVisible();
    await page.getByRole('button', { name: '确认参加', exact: true }).click();
    await expect.poll(async () => (await call(route(fixed), owner)).invitations.filter(i => i.isGuest && i.status === 'ACCEPTED').length).toBe(1);
    await page.screenshot({ path: `${out}/${stage}-guest-invitation.png`, fullPage: true });
    fixed = await call(route(fixed) + '/publish', owner, 'POST', { version: 1 });
    assert.equal((await calendar(fixed, owner)).length, 1); assert.equal((await calendar(fixed, peer)).length, 1);
    await page.reload(); await expect(page.getByText('已接受参加 · 安排已正式发出', { exact: true })).toBeVisible();
  } finally { await browser.close(); }
  check('already fixed plan opens directly to explicit RSVP; public guest timetable and confirmation still work beside App contacts');

  let guard = await create('Atomic contact validation', { expectedCount: 2 });
  await share(guard, [peer, late], 409); assert.equal((await call(route(guard), owner)).invitees.length, 0);
  await call(route(guard) + '/contacts', owner, 'POST', { connectionIds: [peer.connectionId, 'cmissingcontact152000000001'], version: 0 }, 404);
  assert.equal((await messages(guard, peer)).length, 0);
  await call(route(guard) + '/cancel', owner, 'POST', { version: 1 }, 409);
  check('capacity and unavailable contacts fail atomically, without partial membership or card delivery');

  let second = await create('Quiet contact second card'); await share(second, [quiet]);
  let blocked = await create('Quiet gate rolls back the whole batch');
  await share(blocked, [late, quiet], 409);
  assert.equal((await call(route(blocked), owner)).invitees.length, 0);
  assert.equal((await messages(blocked, late)).length, 0);
  check('normal unreplied-message gate applies to plan cards and rolls back the complete batch');

  let blockedContact = await create('Blocked contacts cannot receive cards');
  await call(`/api/v1/connections/${excluded.connectionId}/block`, excluded, 'POST', {}, 201);
  await share(blockedContact, [excluded], 404);
  assert.equal((await call(route(blockedContact), owner)).invitees.length, 0);
  check('blocked contacts cannot receive plan membership or cards');
} catch (cause) { failure = cause; }
finally {
  const cleanup = { accounts: fixture.accounts.length, tokens401: 0, links404: 0, errors: [] };
  for (const a of fixture.accounts) {
    try {
      assert(a.identifier.startsWith('pqa_c152_'));
      if (!a.accessToken) { const login = await call('/api/v1/auth/login', null, 'POST', { identifier: a.identifier, password: a.password, device: { id: randomUUID(), name: 'Cleanup', appVersion: '1.0.0', platformVersion: '26.6.1' } }); a.accessToken = login.tokens.accessToken; }
      await call('/api/v1/me', a, 'DELETE', { confirmUsername: a.identifier });
      await call('/api/v1/me', a, 'GET', undefined, 401); cleanup.tokens401++;
    } catch (e) { cleanup.errors.push(`${a.role}: ${e.message}`); }
  }
  for (const token of fixture.tokens) { const r = await fetch(base + '/api/public/time-polls/' + token, { headers: cookieHeader ? { Cookie: cookieHeader } : {} }); if (r.status === 404) cleanup.links404++; else cleanup.errors.push(`link returned ${r.status}`); }
  fs.writeFileSync(`${out}/${stage}-contacts152-cleanup.json`, JSON.stringify(cleanup, null, 2));
  fs.writeFileSync(`${out}/${stage}-contacts152.json`, JSON.stringify({ passed: !failure, checks, failure: failure?.message ?? null, at: new Date().toISOString() }, null, 2));
  if (!cleanup.errors.length) fs.unlinkSync(privatePath);
  assert.equal(cleanup.errors.length, 0, 'Disposable cleanup must finish; private fixture retained on failure.');
}
if (failure) throw failure;
