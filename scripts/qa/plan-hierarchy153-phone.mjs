// Disposable live fixture and API observation; every changed product action runs in the iPhone UI.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
const base = 'https://api.sideseat.de';
const [mode, logPath] = process.argv.slice(2);
const privatePath = path.join(os.tmpdir(), 'sideseat-plan-hierarchy153-private.json');
const out = path.resolve(process.env.SIDESEAT_QA_OUTPUT || 'docs/qa/evidence/2026-10-20-plans153');
const label = process.env.SIDESEAT_QA_STAGE || 'native';
await fs.mkdir(out, { recursive: true });
async function call(route, account, method = 'GET', body, status = 200) {
  const r = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', 'x-sideseat-platform': 'ios',
    'Idempotency-Key': randomUUID(), ...(account?.accessToken ? { Authorization: `Bearer ${account.accessToken}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const p = await r.json().catch(() => ({})); assert.equal(r.status, status, `${method} ${route}: ${r.status}; ${p.error?.message || ''}`); return p.data;
}
if (mode === 'prepare') {
  await assert.rejects(fs.access(privatePath), 'Clean earlier disposable fixture first.');
  const suffix = randomBytes(4).toString('hex');
  const f = { title: `图书馆复习 ${suffix}`, editedTitle: `图书馆一起复习 ${suffix}`, topic: `周末一起做点什么 ${suffix}`,
    bundle: 'app.sideseat.mobile.preview', accounts: [] };
  const persist = () => fs.writeFile(privatePath, JSON.stringify(f), { mode: 0o600 }); await persist();
  for (const role of ['owner', 'participant']) {
    const a = { role, identifier: `pqa_h153_${role[0]}_${suffix}`, password: randomBytes(22).toString('base64url') };
    await call('/api/auth/signup', null, 'POST', { username: a.identifier, password: a.password, displayName: role === 'owner' ? 'Ming' : 'Lin',
      school: 'TUM', studentStatus: 'CURRENT_STUDENT', degreeLevel: 'BACHELOR', semester: 3 }, 201);
    f.accounts.push(a); await persist();
    const login = await call('/api/v1/auth/login', null, 'POST', { identifier: a.identifier, password: a.password,
      device: { id: randomUUID(), name: 'Plan hierarchy physical QA', appVersion: '1.0.0', platformVersion: '26.6.1' } });
    a.accessToken = login.tokens.accessToken; a.id = login.user.id; await persist();
  }
  const [owner, peer] = f.accounts;
  f.peerID = peer.id;
  f.connectionID = (await call('/api/v1/contacts', owner, 'POST', { peerId: peer.id }, 201)).connectionId; await persist();
  await call(`/api/v1/connections/${f.connectionID}/friend-link`, owner, 'POST', { action: 'request' });
  await call(`/api/v1/connections/${f.connectionID}/friend-link`, peer, 'POST', { action: 'accept' });
  const dates = [1, 2, 3].map(days => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10));
  const input = { title: f.title, location: '学校图书馆', dates, timeZone: 'Europe/Berlin', startMinute: 540, endMinute: 660 };
  const plan = await call('/api/v1/time-polls', owner, 'POST', input, 201); f.pollToken = plan.token; await persist();
  const activity = await call('/api/v1/time-polls', owner, 'POST', { ...input, title: f.topic, chooseActivityTogether: true }, 201);
  f.activityToken = activity.token; await persist();
  await call(`/api/v1/time-polls/${activity.token}/activities`, owner, 'POST', { title: '图书馆复习' });
  await call(`/api/v1/time-polls/${activity.token}/activities`, peer, 'POST', { title: '一起喝咖啡' });
  console.log('Prepared two disposable accounts, an accepted contact, and two unsubmitted plans.');
} else {
  const f = JSON.parse(await fs.readFile(privatePath, 'utf8'));
  assert(f.accounts.every(a => a.identifier.startsWith('pqa_h153_')));
  const owner = f.accounts[0], peer = f.accounts[1];
  if (mode === 'cleanup') {
    let removed = 0;
    for (const a of f.accounts) { await call('/api/v1/me', a, 'DELETE', { confirmUsername: a.identifier }); await call('/api/v1/me', a, 'GET', undefined, 401); removed++; }
    for (const token of [f.pollToken, f.activityToken]) assert.equal((await fetch(base + '/api/public/time-polls/' + token)).status, 404);
    await fs.writeFile(`${out}/${label}-cleanup.json`, JSON.stringify({ accountsRemoved: removed, tokens401: removed, links404: 2, at: new Date().toISOString() }, null, 2));
    await fs.unlink(privatePath); console.log('Disposable hierarchy QA accounts/plans removed, 401/404 verified.');
  } else if (mode === 'observe') {
    assert(logPath);
    const stages = ['details-draft', 'contacts-delivered', 'owner-submitted', 'peer-submitted', 'invited', 'accepted', 'published', 'calendar'];
    const seen = new Set(), checks = []; let failure;
    async function verify(phase) {
      if (phase === 'inline-idea') {
        const p = await call(`/api/v1/time-polls/${f.activityToken}`, owner);
        assert.equal(p.activitySelection.ideas.length, 3); assert.equal(p.activitySelection.isOpen, true);
        assert.equal(p.summary.participantCount, 0); assert.equal(p.phase, 'COLLECTING');
        assert(p.activitySelection.ideas.some(idea => idea.title === '一起散步'));
        assert(p.activitySelection.ideas.some(idea => idea.interestedBy.some(person => person.isMe)));
        return { phase, ideas: p.activitySelection.ideas.length, responses: 0, at: new Date().toISOString() };
      }
      const index = stages.indexOf(phase), formal = index >= 4, published = index >= 6;
      const p = await call(`/api/v1/time-polls/${f.pollToken}`, owner);
      const theirs = await call(`/api/v1/time-polls/${f.pollToken}`, peer);
      assert.equal(p.title, f.editedTitle); assert.equal(p.location, '图书馆二楼');
      assert.equal(p.phase, published ? 'CONFIRMED' : formal ? 'INVITING' : 'COLLECTING');
      assert.equal(p.summary.participantCount, index >= 3 ? 2 : index >= 2 ? 1 : 0);
      assert.deepEqual(p.mySlotIds, index >= 2 ? [0, 1, 2, 3] : []);
      assert.deepEqual(theirs.mySlotIds, index >= 3 ? [0, 1, 2, 3] : []);
      assert.equal(p.myDisplayName, 'Ming');
      const messages = (await call(`/api/v1/connections/${f.connectionID}/messages`, peer)).messages.filter(m => m.body?.includes('/time-polls/' + f.pollToken));
      assert.equal(messages.length, index >= 1 ? 1 : 0);
      if (formal) { assert.equal(p.invitationVersion, 1); assert.equal(p.invitations.filter(i => i.status === 'ACCEPTED').length, index >= 5 ? 2 : 1); }
      const date = (p.chosenStart || p.slots[0].start).slice(0, 10);
      const calendars = await Promise.all([owner, peer].map(async a => (await call(`/api/v1/home/schedule?windowStart=${date}T00:00:00Z&windowEnd=${date}T23:59:59Z`, a)).studyEntries.filter(e => e.timePollToken === f.pollToken)));
      assert(calendars.every(items => items.length === (published ? 1 : 0)));
      if (published) assert(calendars.every(items => items[0].title === f.editedTitle));
      return { phase, actualPhase: p.phase, responses: p.summary.participantCount, cardCount: messages.length,
        ownerSlots: p.mySlotIds, peerSlots: theirs.mySlotIds, calendars: calendars.map(items => items.length), at: new Date().toISOString() };
    }
    try {
      const deadline = Date.now() + 15 * 60_000;
      while (checks.length < stages.length + 1 && Date.now() < deadline) {
        const log = await fs.readFile(logPath, 'utf8').catch(() => '');
        for (const match of log.matchAll(/PLAN_HIERARCHY_PHASE ([a-z-]+)/g)) {
          const phase = match[1]; if (seen.has(phase) || ![...stages, 'inline-idea'].includes(phase)) continue;
          checks.push(await verify(phase)); seen.add(phase);
          await fs.writeFile(`${out}/${label}-api.json`, JSON.stringify({ passed: false, checks }, null, 2));
          console.log('HIERARCHY153 verified ' + phase);
        }
        if (log.includes('** TEST EXECUTE FAILED **') || log.includes('** TEST FAILED **')) throw Error('Phone UI test failed; partial API observations preserved.');
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      assert.equal(checks.length, stages.length + 1, 'All nine live phone/API stages must complete.');
    } catch (cause) { failure = cause; }
    await fs.writeFile(`${out}/${label}-api.json`, JSON.stringify({ passed: !failure, checks, failure: failure?.message ?? null }, null, 2));
    if (failure) throw failure;
  } else throw Error('Expected prepare, observe <log>, or cleanup.');
}
