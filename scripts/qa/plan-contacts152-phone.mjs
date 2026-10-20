// The phone performs every product action; this helper creates contacts and checks API boundaries.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
const base = 'https://api.sideseat.de';
const privatePath = path.join(os.tmpdir(), 'sideseat-plan-contacts152-phone-private.json');
const [mode, logPath] = process.argv.slice(2);
const out = path.resolve(process.env.SIDESEAT_QA_OUTPUT || 'docs/qa/evidence/2026-10-20-plans152'); await fs.mkdir(out, { recursive: true });
const label = process.env.SIDESEAT_QA_STAGE || 'native';
async function call(route, a, method = 'GET', body, status = 200) {
  const r = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', 'x-sideseat-platform': 'ios', 'Idempotency-Key': randomUUID(), ...(a?.accessToken ? { Authorization: `Bearer ${a.accessToken}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const p = await r.json().catch(() => ({})); assert.equal(r.status, status, `${method} ${route}: ${r.status}; ${p.error?.message || ''}`); return p.data;
}
async function login(a) {
  const p = await call('/api/v1/auth/login', null, 'POST', { identifier: a.identifier, password: a.password, device: { id: randomUUID(), name: 'Native contacts physical QA', appVersion: '1.0.0', platformVersion: '26.6.1' } });
  a.accessToken = p.tokens.accessToken; a.id = p.user.id;
}
if (mode === 'prepare') {
  await assert.rejects(fs.access(privatePath), 'Clean the earlier disposable fixture before preparing another.');
  const suffix = randomBytes(4).toString('hex');
  const f = { title: `Contact plan ${suffix}`, bundle: 'app.sideseat.mobile.preview', accounts: [] };
  const persist = () => fs.writeFile(privatePath, JSON.stringify(f), { mode: 0o600 }); await persist();
  for (const [role, name] of [['owner', 'Ming'], ['participant', 'Lin']]) {
    const a = { role, identifier: `pqa_p152_${role === 'owner' ? 'o' : 'p'}_${suffix}`, password: randomBytes(22).toString('base64url') };
    await call('/api/auth/signup', null, 'POST', { username: a.identifier, password: a.password, displayName: name + suffix.slice(0, 4), school: 'TUM', studentStatus: 'CURRENT_STUDENT', degreeLevel: 'BACHELOR', semester: 3 }, 201);
    f.accounts.push(a); await persist(); await login(a); await persist();
  }
  const [owner, peer] = f.accounts;
  f.connectionID = (await call('/api/v1/contacts', owner, 'POST', { peerId: peer.id }, 201)).connectionId; f.peerID = peer.id; await persist();
  await call(`/api/v1/connections/${f.connectionID}/friend-link`, owner, 'POST', { action: 'request' });
  await call(`/api/v1/connections/${f.connectionID}/friend-link`, peer, 'POST', { action: 'accept' });
  await call(`/api/v1/connections/${f.connectionID}/messages`, owner, 'POST', { type: 'TEXT', body: 'Let us plan something' }, 201);
  await call(`/api/v1/connections/${f.connectionID}/messages`, peer, 'POST', { type: 'TEXT', body: 'Ready' }, 201);
  assert.equal((await call('/api/v1/contacts', owner)).contacts[0].peer.id, peer.id);
  console.log('Prepared two disposable accounts with an accepted contact and normal two-way chat.');
} else {
  const f = JSON.parse(await fs.readFile(privatePath, 'utf8'));
  assert(f.accounts.every(a => a.identifier.startsWith('pqa_p152_')));
  const owner = f.accounts.find(a => a.role === 'owner'), peer = f.accounts.find(a => a.role === 'participant');
  if (mode === 'cleanup') {
    const tokens = owner?.accessToken ? (await call('/api/v1/time-polls', owner)).polls.filter(p => p.title === f.title && p.isOwner).map(p => p.token) : [];
    if (f.pollToken && !tokens.includes(f.pollToken)) tokens.push(f.pollToken);
    let removed = 0;
    for (const a of f.accounts) { if (!a.accessToken) await login(a); await call('/api/v1/me', a, 'DELETE', { confirmUsername: a.identifier }); await call('/api/v1/me', a, 'GET', undefined, 401); removed++; }
    for (const token of tokens) assert.equal((await fetch(base + '/api/public/time-polls/' + token)).status, 404);
    await fs.writeFile(`${out}/${label}-cleanup.json`, JSON.stringify({ accountsRemoved: removed, tokens401: removed, links404: tokens.length, at: new Date().toISOString() }, null, 2));
    await fs.unlink(privatePath); console.log('Disposable phone accounts, plan and link removed; 401/404 checked.');
  } else if (mode === 'observe') {
    assert(logPath);
    const phases = ['contacts-created', 'contacts-delivered', 'contacts-owner-submitted', 'contacts-peer-submitted', 'contacts-formal-invitation', 'contacts-peer-accepted', 'contacts-published', 'contacts-calendar-verified'];
    const checks = [], seen = new Set(); let failure;
    async function verify(phase) {
      if (!f.pollToken) {
        const item = (await call('/api/v1/time-polls', owner)).polls.find(p => p.title === f.title && p.isOwner);
        assert(item, 'The phone must create the plan.'); f.pollToken = item.token; await fs.writeFile(privatePath, JSON.stringify(f), { mode: 0o600 });
      }
      const route = `/api/v1/time-polls/${f.pollToken}`;
      const [p, theirs, list, history] = await Promise.all([call(route, owner), call(route, peer), call('/api/v1/time-polls', peer), call(`/api/v1/connections/${f.connectionID}/messages`, peer)]);
      const index = phases.indexOf(phase), formal = index >= 4, published = index >= 6;
      assert.equal(p.phase, published ? 'CONFIRMED' : formal ? 'INVITING' : 'COLLECTING');
      assert.equal(p.summary.participantCount, index >= 3 ? 2 : index >= 2 ? 1 : 0);
      assert.deepEqual(p.mySlotIds, index >= 2 ? [0, 1, 2, 3] : []);
      assert.deepEqual(theirs.mySlotIds, index >= 3 ? [0, 1, 2, 3] : []);
      const item = list.polls.find(x => x.token === f.pollToken);
      if (index === 0) assert.equal(item, undefined);
      else { assert(item); assert.equal(item.didRespond, index >= 3); }
      const messages = history.messages.filter(m => m.body?.includes('/time-polls/' + f.pollToken));
      assert.equal(messages.length, index === 0 ? 0 : 1);
      if (index >= 1 && index < 3) assert.equal(theirs.didRespond, false);
      if (formal) {
        assert.equal(p.invitationVersion, 1); assert.equal(p.invitations.filter(i => i.status === 'ACCEPTED').length, index >= 5 ? 2 : 1);
        assert.equal(new Date(p.chosenEnd) - new Date(p.chosenStart), 3600000);
      }
      const day = (p.chosenStart || p.slots[0].start).slice(0, 10);
      const calendars = await Promise.all([owner, peer].map(async a => (await call(`/api/v1/home/schedule?windowStart=${day}T00:00:00Z&windowEnd=${day}T23:59:59Z`, a)).studyEntries.filter(e => e.timePollToken === f.pollToken)));
      assert(calendars.every(items => items.length === (published ? 1 : 0)));
      return { phase, actualPhase: p.phase, responses: p.summary.participantCount, ownerSlots: p.mySlotIds, peerSlots: theirs.mySlotIds,
        cardCount: messages.length, accepted: p.invitations.filter(i => i.status === 'ACCEPTED').length, calendars: calendars.map(items => items.length), at: new Date().toISOString() };
    }
    try {
      const deadline = Date.now() + 12 * 60_000;
      while (checks.length < phases.length && Date.now() < deadline) {
        const log = await fs.readFile(logPath, 'utf8').catch(() => '');
        for (const match of log.matchAll(/NATIVE_PARTICIPANT_PHASE (contacts-[a-z-]+)/g)) {
          const phase = match[1]; if (!phases.includes(phase) || seen.has(phase)) continue;
          checks.push(await verify(phase)); seen.add(phase);
          await fs.writeFile(`${out}/${label}-api.json`, JSON.stringify({ passed: false, checks }, null, 2));
          console.log('PHONE_CONTACTS152 verified ' + phase);
        }
        if (log.includes('** TEST EXECUTE FAILED **') || log.includes('** TEST FAILED **')) throw new Error('Phone test failed; partial API checks retained.');
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      assert.equal(checks.length, phases.length, 'All eight phone stages must be observed.');
    } catch (cause) { failure = cause; }
    await fs.writeFile(`${out}/${label}-api.json`, JSON.stringify({ passed: !failure, checks, failure: failure?.message ?? null }, null, 2));
    if (failure) throw failure;
  } else throw new Error('Expected prepare, observe <log>, or cleanup.');
}
