// Current COLLECT flow: six disposable accounts, real phone actions, read-only API observation.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const base = process.env.SIDESEAT_QA_BASE || 'https://api.sideseat.de';
export const privatePath = path.join(os.tmpdir(), 'sideseat-plan-six-private.json');
export const out = path.resolve(process.env.SIDESEAT_QA_OUTPUT || 'docs/qa/evidence/2026-10-25-plan-six-participants');
export const phases = [
  'created', 'owner-draft', 'owner-submitted', 'shared',
  ...[1, 2, 3, 4, 5].map(n => `peer${n}-submitted`), 'peer3-edited', 'peer3-restored',
  'final-review-cancelled', 'invited', 'peer1-accepted', 'peer2-accepted', 'peer3-accepted', 'peer4-ignored',
  'peer5-declined', 'published', 'calendar-verified',
  'peer4-late-accepted', 'peer2-withdrawn', 'final-calendar-verified',
];
const roles = ['owner', 'peer1', 'peer2', 'peer3', 'peer4', 'peer5'];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export const route = p => `/api/v1/time-polls/${p.token}`;
export const persist = async f => {
  await fs.writeFile(privatePath, JSON.stringify(f), { mode: 0o600 });
  await fs.chmod(privatePath, 0o600);
};
export async function evidence(name, value) {
  await fs.mkdir(out, { recursive: true });
  await fs.writeFile(path.join(out, name), JSON.stringify(value, null, 2) + '\n');
}
function safeRoute(value) {
  return value.replace(/(\/time-polls\/)[^/?]+/g, '$1[owned-plan]').replace(/(\/connections\/)[^/?]+/g, '$1[owned-connection]');
}
export async function call(endpoint, account, method = 'GET', body, expected = 200, idempotencyKey = randomUUID()) {
  let response;
  try {
    response = await fetch(base + endpoint, {
      method, signal: AbortSignal.timeout(45_000),
      headers: { 'Content-Type': 'application/json', 'x-sideseat-platform': 'ios',
        ...(method !== 'GET' ? { 'Idempotency-Key': idempotencyKey } : {}),
        ...(account?.accessToken ? { Authorization: `Bearer ${account.accessToken}` } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch { throw new Error(`${method} ${safeRoute(endpoint)}: transport failed; private fixture retained`); }
  // Never put a response body, bearer token, password or real link in assertions/output.
  assert.equal(response.status, expected, `${method} ${safeRoute(endpoint)}: HTTP ${response.status}, expected ${expected}`);
  const value = await response.json().catch(() => ({}));
  return value.data;
}
export async function login(account) {
  const value = await call('/api/v1/auth/login', null, 'POST', {
    identifier: account.identifier, password: account.password,
    device: { id: randomUUID(), name: 'Six participant physical QA', appVersion: '1.0.0', platformVersion: '26.6.1' },
  });
  account.accessToken = value.tokens.accessToken;
  account.id = value.user.id;
}
export async function readFixture() {
  const f = JSON.parse(await fs.readFile(privatePath, 'utf8'));
  assert(f.accounts.length > 0 && f.accounts.length <= 6);
  assert(f.accounts.every(a => /^pqa_six_(?:owner|peer[1-5])_[a-f0-9]{8}$/.test(a.identifier)), 'Only this helper’s disposable accounts are allowed.');
  assert.equal(new Set(f.accounts.map(a => a.identifier)).size, f.accounts.length);
  assert(f.accounts.every(a => roles.includes(a.role)));
  return f;
}
export async function calendars(p, accounts) {
  // Cover the complete interval, including both UTC dates of a local midnight crossing.
  const starts = [p.chosenStart, ...p.slots.map(s => s.start)].filter(Boolean).map(Date.parse);
  const ends = [p.chosenEnd, ...p.slots.map(s => s.end)].filter(Boolean).map(Date.parse);
  const windowStart = new Date(Math.min(...starts) - 86_400_000).toISOString();
  const windowEnd = new Date(Math.max(...ends) + 86_400_000).toISOString();
  const rows = await Promise.all(accounts.map(async a => {
    const value = await call(`/api/v1/home/schedule?windowStart=${encodeURIComponent(windowStart)}&windowEnd=${encodeURIComponent(windowEnd)}`, a);
    return value.studyEntries.filter(e => e.timePollToken === p.token);
  }));
  return { rows, windowStart, windowEnd };
}
export function assertCalendarRows(p, accounts, result, includedRoles) {
  const included = new Set(includedRoles);
  for (const [index, account] of accounts.entries()) {
    const rows = result.rows[index];
    assert.equal(rows.length, included.has(account.role) ? 1 : 0, `${account.role}: exact Calendar row count`);
    if (!rows.length) continue;
    assert.equal(rows[0].title, p.title);
    assert.equal(rows[0].location ?? '', p.location ?? '');
    assert.equal(Date.parse(rows[0].startISO), Date.parse(p.chosenStart));
    assert.equal(Date.parse(rows[0].endISO), Date.parse(p.chosenEnd));
    const actualNames = (rows[0].eventParticipants ?? []).map(person => person.name).sort();
    const expectedNames = accounts.filter(a => included.has(a.role) && a.role !== account.role).map(a => a.displayName).sort();
    assert.deepEqual(actualNames, expectedNames, `${account.role}: accepted companions only`);
  }
}
function localParts(instant, timeZone) {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant)).map(p => [p.type, p.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, clock: `${values.hour}:${values.minute}` };
}
async function findPhonePlan(f) {
  if (!f.pollToken) {
    const owner = f.accounts.find(a => a.role === 'owner');
    const found = (await call('/api/v1/time-polls', owner)).polls.filter(p => p.isOwner && p.title === f.title);
    assert.equal(found.length, 1, 'The phone must create exactly one main plan.');
    f.pollToken = found[0].token;
    if (!f.tokens.includes(f.pollToken)) f.tokens.push(f.pollToken);
    await persist(f);
  }
  return { token: f.pollToken };
}
export async function verifyPhase(f, phase) {
  const index = phases.indexOf(phase);
  assert(index >= 0, 'Unknown six participant phase.');
  assert.equal(f.accounts.length, 6);
  const owner = f.accounts.find(a => a.role === 'owner');
  const ordered = roles.map(role => f.accounts.find(a => a.role === role));
  assert(ordered.every(Boolean));
  const key = await findPhonePlan(f);
  const views = await Promise.all(ordered.map(a => call(route(key), a)));
  const p = views[0];
  const atLeast = name => index >= phases.indexOf(name);
  const formal = atLeast('invited'), published = atLeast('published');
  assert.equal(p.title, f.title);
  assert.equal(p.timeZone, 'Europe/Berlin');
  assert.equal(p.planningMode, 'COLLECT');
  assert.equal(p.phase, published ? 'CONFIRMED' : formal ? 'INVITING' : 'COLLECTING');
  assert.equal(p.invitationVersion, formal ? 1 : 0);
  assert.equal(new Set(p.dates).size, p.dates.length);
  const expectedSlots = roles.map((role, n) => {
    if (!n) return atLeast('owner-submitted') ? [0, 1, 2, 3] : [];
    if (!atLeast(`peer${n}-submitted`)) return [];
    return role === 'peer3' && phase === 'peer3-edited' ? [0, 1] : [0, 1, 2, 3];
  });
  const responses = expectedSlots.filter(ids => ids.length).length;
  assert.equal(p.summary.participantCount, responses);
  assert.equal(p.participants.length, responses);
  for (const [n, view] of views.entries()) {
    assert.equal(view.isOwner, n === 0);
    assert.equal(view.token, p.token);
    assert.equal(view.phase, p.phase);
    assert.equal(view.invitationVersion, p.invitationVersion);
    assert.deepEqual(view.slots, p.slots);
    assert.equal(view.summary.participantCount, responses);
    assert.deepEqual(view.mySlotIds, expectedSlots[n], `${roles[n]}: own response must remain isolated`);
    assert.equal(view.didRespond, expectedSlots[n].length > 0);
    assert.equal(view.participants.filter(person => person.isMe).length, expectedSlots[n].length ? 1 : 0);
    for (const [peer, account] of ordered.entries()) {
      const entry = view.participants.find(person => person.displayName === account.displayName);
      assert.equal(Boolean(entry), expectedSlots[peer].length > 0, `${roles[n]}: visible response membership ${account.role}`);
      if (entry) assert.deepEqual(entry.slotIds, expectedSlots[peer]);
    }
  }
  const counts = p.slots.map(slot => expectedSlots.filter(ids => ids.includes(slot.id)).length);
  assert.deepEqual(p.summary.counts, counts, 'Heatmap must count only submitted per-person snapshots.');
  if (!formal) {
    assert.equal(p.chosenStart, null); assert.equal(p.chosenEnd, null); assert.deepEqual(p.invitations, []);
  } else {
    const first = localParts(p.chosenStart, p.timeZone), last = localParts(p.chosenEnd, p.timeZone);
    assert.equal(first.date, p.dates[0]); assert.equal(last.date, p.dates[0]);
    assert.equal(first.clock, '09:00'); assert.equal(last.clock, '10:00');
    assert.equal(p.chosenStart, p.slots[0].start); assert.equal(p.chosenEnd, p.slots[3].end);
    assert.equal(Date.parse(p.chosenEnd) - Date.parse(p.chosenStart), 3_600_000);
    const expectedStatus = { owner: 'ACCEPTED', peer1: atLeast('peer1-accepted') ? 'ACCEPTED' : 'INVITED',
      peer2: atLeast('peer2-withdrawn') ? 'DECLINED' : atLeast('peer2-accepted') ? 'ACCEPTED' : 'INVITED',
      peer3: atLeast('peer3-accepted') ? 'ACCEPTED' : 'INVITED',
      peer4: atLeast('peer4-late-accepted') ? 'ACCEPTED' : 'INVITED',
      peer5: atLeast('peer5-declined') ? 'DECLINED' : 'INVITED' };
    assert.equal(p.invitations.length, 6);
    for (const account of ordered) {
      const invitation = p.invitations.find(person => person.displayName === account.displayName);
      assert(invitation, `${account.role}: selected invitation exists`);
      assert.equal(invitation.selected, true);
      assert.equal(invitation.status, expectedStatus[account.role]);
    }
    for (const [n, view] of views.entries()) {
      assert.equal(view.chosenStart, p.chosenStart); assert.equal(view.chosenEnd, p.chosenEnd);
      assert.equal(view.invitations.filter(person => person.isMe).length, 1);
      assert.equal(view.invitations.find(person => person.isMe).status, expectedStatus[roles[n]]);
    }
  }
  let delivery;
  if (phase === 'created' || phase === 'shared') {
    delivery = await Promise.all(f.connections.map(async connection => {
      const peer = f.accounts.find(a => a.role === connection.peerRole);
      const [list, messages] = await Promise.all([call('/api/v1/time-polls', peer), call(`/api/v1/connections/${connection.connectionID}/messages`, peer)]);
      const cards = messages.messages.filter(message => message.body?.includes('/time-polls/' + p.token));
      assert.equal(list.polls.filter(item => item.token === p.token).length, phase === 'shared' ? 1 : 0);
      assert.equal(cards.length, phase === 'shared' ? 1 : 0);
      return { role: peer.role, listed: phase === 'shared', cards: cards.length };
    }));
    assert.equal((p.sharedWithUserIds ?? []).length, phase === 'shared' ? 5 : 0);
  }
  let calendar;
  if (phase === 'created' || phase === 'owner-draft' || phase === 'peer3-restored' || phase === 'final-review-cancelled' || formal) {
    const result = await calendars(p, ordered);
    const included = published ? ['owner', 'peer1', 'peer3', ...(atLeast('peer2-withdrawn') ? [] : ['peer2']), ...(atLeast('peer4-late-accepted') ? ['peer4'] : [])] : [];
    assertCalendarRows(p, ordered, result, included);
    calendar = { counts: Object.fromEntries(ordered.map((a, n) => [a.role, result.rows[n].length])), windowStart: result.windowStart, windowEnd: result.windowEnd };
  }
  return { phase, actualPhase: p.phase, submitted: responses, ownSlots: Object.fromEntries(roles.map((role, n) => [role, views[n].mySlotIds])),
    invitationVersion: p.invitationVersion, invitationStatuses: p.invitations.map(i => ({ displayName: i.displayName, status: i.status, selected: i.selected })),
    chosenStart: p.chosenStart, chosenEnd: p.chosenEnd, timeZone: p.timeZone, candidateDates: p.dates,
    ...(delivery ? { delivery } : {}), ...(calendar ? { calendar } : {}), at: new Date().toISOString() };
}
async function prepare() {
  await assert.rejects(fs.access(privatePath), 'Clean the existing disposable fixture before preparing another.');
  const suffix = randomBytes(4).toString('hex');
  const f = { title: `六人闭环 ${suffix}`, edgePrefix: `Six edges ${suffix}`, bundle: 'app.sideseat.mobile.preview', accounts: [], connections: [], tokens: [], createdAt: new Date().toISOString() };
  await persist(f);
  for (const role of roles) {
    const account = { role, identifier: `pqa_six_${role}_${suffix}`, password: randomBytes(22).toString('base64url'), displayName: `${role === 'owner' ? '发起人' : '朋友' + role.slice(4)}${suffix.slice(0, 4)}`, signupStarted: true };
    f.accounts.push(account); await persist(f);
    await call('/api/auth/signup', null, 'POST', { username: account.identifier, password: account.password, displayName: account.displayName, school: 'TUM', studentStatus: 'CURRENT_STUDENT', degreeLevel: 'BACHELOR', semester: 3 }, 201);
    account.created = true; await persist(f); await login(account); await persist(f);
  }
  const owner = f.accounts[0];
  for (const peer of f.accounts.slice(1)) {
    const connectionID = (await call('/api/v1/contacts', owner, 'POST', { peerId: peer.id }, 201)).connectionId;
    peer.connectionID = connectionID; f.connections.push({ peerRole: peer.role, connectionID }); await persist(f);
    await call(`/api/v1/connections/${connectionID}/friend-link`, owner, 'POST', { action: 'request' });
    await call(`/api/v1/connections/${connectionID}/friend-link`, peer, 'POST', { action: 'accept' });
    await call(`/api/v1/connections/${connectionID}/messages`, owner, 'POST', { type: 'TEXT', body: '六人计划测试，仅限本次测试账号。' }, 201);
    await call(`/api/v1/connections/${connectionID}/messages`, peer, 'POST', { type: 'TEXT', body: '已准备好参与本次测试。' }, 201);
  }
  const contacts = (await call('/api/v1/contacts', owner)).contacts;
  assert.deepEqual(contacts.map(c => c.peer.id).sort(), f.accounts.slice(1).map(a => a.id).sort());
  f.readyAt = new Date().toISOString(); await persist(f);
  console.log('Prepared six disposable accounts and five accepted two-way test contacts. Credentials remain private.');
}
async function observe(f, logPath) {
  assert(logPath, 'observe requires the phone test log path');
  const checks = [], seen = new Set(); let failure;
  try {
    const deadline = Date.now() + 45 * 60_000;
    while (checks.length < phases.length && Date.now() < deadline) {
      const log = await fs.readFile(logPath, 'utf8').catch(() => '');
      for (const [, phase] of log.matchAll(/PLAN_SIX_PHASE ([a-z0-9-]+)/g)) {
        assert(phases.includes(phase), 'Phone logged an unknown six participant phase.');
        if (seen.has(phase)) continue;
        assert.equal(phase, phases[checks.length], 'Phone phases must run once in the defined order.');
        checks.push(await verifyPhase(f, phase)); seen.add(phase);
        await evidence('phone-api.json', { passed: false, source: 'real API; phone owns all main business mutations', checks });
        console.log(`PLAN_SIX_API verified ${phase}`);
      }
      if (/\*\* TEST (?:EXECUTE )?FAILED \*\*/.test(log)) throw new Error('Phone test failed; partial read-only checks retained.');
      await sleep(200);
    }
    assert.equal(checks.length, phases.length, 'All six participant phone phases must be observed.');
  } catch (cause) { failure = cause; }
  await evidence('phone-api.json', { passed: !failure, source: 'real API; phone owns all main business mutations', expectedPhases: phases, checks, failure: failure?.message ?? null });
  if (failure) throw failure;
}
async function cleanup(f) {
  const owner = f.accounts.find(a => a.role === 'owner');
  if (owner && !owner.deleted) {
    if (!owner.accessToken) { await login(owner); await persist(f); }
    const owned = (await call('/api/v1/time-polls', owner)).polls.filter(p => p.isOwner);
    assert(owned.every(p => p.title === f.title || p.title.startsWith(f.edgePrefix)), 'Refuse to remove an unrecognized plan.');
    for (const item of owned) if (!f.tokens.includes(item.token)) f.tokens.push(item.token);
    await persist(f);
    for (const token of f.tokens) {
      if ((f.deletedTokens ?? []).includes(token)) continue;
      const p = await call(route({ token }), owner);
      assert(p.isOwner && (p.title === f.title || p.title.startsWith(f.edgePrefix)));
      if (['INVITING', 'CONFIRMED'].includes(p.phase)) await call(route(p) + '/cancel', owner, 'POST', { version: p.invitationVersion });
      await call(route(p), owner, 'DELETE');
      await call(`/api/public/time-polls/${token}`, null, 'GET', undefined, 404);
      (f.deletedTokens ??= []).push(token); await persist(f);
    }
  }
  for (const account of f.accounts) {
    if (account.deleted) continue;
    if (!account.accessToken) { await login(account); await persist(f); }
    await call('/api/v1/me', account, 'DELETE', { confirmUsername: account.identifier });
    await call('/api/v1/me', account, 'GET', undefined, 401);
    account.deleted = true; await persist(f);
  }
  for (const token of f.tokens) await call(`/api/public/time-polls/${token}`, null, 'GET', undefined, 404);
  await evidence('cleanup.json', { accountsDeleted: f.accounts.length, staleBearer401: f.accounts.length, ownedPlansDeleted: f.tokens.length, publicLinks404: f.tokens.length, at: new Date().toISOString() });
  await fs.unlink(privatePath);
  console.log('Removed owned test plans and all six accounts; stale credentials 401 and public links 404 verified.');
}
async function main() {
  const [mode, argument] = process.argv.slice(2);
  if (mode === 'prepare') return prepare();
  const f = await readFixture();
  if (mode === 'observe') return observe(f, argument);
  if (mode === 'verify') { const result = await verifyPhase(f, argument || 'final-calendar-verified'); await evidence(`verify-${argument || 'final-calendar-verified'}.json`, { passed: true, check: result }); console.log('Six participant snapshot verified.'); return; }
  if (mode === 'cleanup') return cleanup(f);
  if (mode === 'edges' || mode === 'capacity') {
    const helpers = await import('./plan-six-participant-edges.mjs');
    return mode === 'edges' ? helpers.runEdges(f) : helpers.runCapacity(f);
  }
  throw new Error('Expected prepare, observe LOG, verify PHASE, edges, capacity, or cleanup.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
