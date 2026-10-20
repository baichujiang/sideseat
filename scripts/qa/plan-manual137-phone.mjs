// The phone performs all interactions; the Mac only provisions and checks disposable data.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const base = 'https://api.sideseat.de', mode = process.argv[2];
const privatePath = path.join(os.tmpdir(), 'sideseat-manual-phone-private.json');
async function call(route, account, method = 'GET', body, expected = 200) {
  const r = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', 'x-sideseat-platform': 'ios', 'Idempotency-Key': randomUUID(), ...(account ? { Authorization: `Bearer ${account.accessToken}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal(r.status, expected, `${method} ${route}: ${r.status}`);
  return [200, 201].includes(expected) ? (await r.json()).data : null;
}
const persist = f => fs.writeFile(privatePath, JSON.stringify(f), { mode: 0o600 });
if (mode === 'prepare') {
  await assert.rejects(fs.access(privatePath));
  const stage = process.env.SIDESEAT_MANUAL_PHONE_STAGE ?? '1';
  const f = { stage, title: `Manual ${randomBytes(4).toString('hex')}`, bundle: 'app.sideseat.mobile.preview', accounts: [] }; await persist(f);
  for (const role of (['3', '5'].includes(stage) ? ['owner', 'participant'] : ['owner'])) {
    const a = { role, identifier: `planqa_manualphone_${randomBytes(5).toString('hex')}`, password: randomBytes(22).toString('base64url') };
    await call('/api/auth/signup', null, 'POST', { username: a.identifier, password: a.password, displayName: role === 'owner' ? 'Host Ming' : 'Peer Lin', school: 'TUM', studentStatus: 'CURRENT_STUDENT', degreeLevel: 'BACHELOR', semester: 3 }, 201);
    f.accounts.push(a); await persist(f);
    a.accessToken = (await call('/api/v1/auth/login', null, 'POST', { identifier: a.identifier, password: a.password, device: { id: randomUUID(), name: 'Manual submission physical QA', appVersion: '1.0.0', platformVersion: '26.6.1' } })).tokens.accessToken;
    await persist(f);
  }
  if (stage === '3') {
    const p = await call('/api/v1/time-polls', f.accounts[0], 'POST', { title: f.title, timeZone: 'Europe/Berlin', dates: [new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10)], startMinute: 540, endMinute: 660 }, 201);
    f.pollToken = p.token; await persist(f);
  }
  console.log('Fresh disposable phone fixture ready.');
} else {
  const f = JSON.parse(await fs.readFile(privatePath, 'utf8')), owner = f.accounts[0];
  assert(owner.identifier.startsWith('planqa_manualphone_'));
  const list = (await call('/api/v1/time-polls', owner)).polls.filter(p => p.title === f.title);
  if (mode === 'cleanup') {
    for (const item of list) { const p = await call(`/api/v1/time-polls/${item.token}`, owner); if (['INVITING', 'CONFIRMED'].includes(p.phase)) await call(`/api/v1/time-polls/${p.token}/cancel`, owner, 'POST', { version: p.invitationVersion }); await call(`/api/v1/time-polls/${p.token}`, owner, 'DELETE'); await call(`/api/public/time-polls/${p.token}`, null, 'GET', undefined, 404); }
    for (const a of f.accounts) { assert(a.identifier.startsWith('planqa_manualphone_')); await call('/api/v1/me', a, 'DELETE', { confirmUsername: a.identifier }); await call('/api/v1/me', a, 'GET', undefined, 401); }
    const result = { accountsDeleted: f.accounts.length, plansDeleted: list.length, links404: list.length, oldTokens401: f.accounts.length };
    await fs.writeFile(process.argv[3], JSON.stringify(result, null, 2)); await fs.unlink(privatePath); console.log('Phone fixture cleaned.');
  } else if (mode === 'observe') {
    const log = process.argv[3], evidence = process.argv[4], checks = [], seen = new Set();
    const expected = { 'manual-draft': [], 'manual-submitted': [0, 1, 2, 3], 'manual-edited': [0, 1, 2, 3], 'manual-resubmitted': [2, 3] };
    for (let tick = 0; tick < 240; tick++) {
      const text = await fs.readFile(log, 'utf8').catch(() => '');
      for (const [, phase] of text.matchAll(/NATIVE_PARTICIPANT_PHASE ((?:manual|refresh|invite|draft)-[a-z-]+)/g)) {
        if (seen.has(phase)) continue;
        const p = (await call('/api/v1/time-polls', owner)).polls.find(p => p.title === f.title); assert(p);
        const detail = await call(`/api/v1/time-polls/${p.token}`, owner);
        if (phase.startsWith('draft-')) {
          const submitted = phase === 'draft-submitted';
          assert.equal(detail.didRespond, submitted); assert.deepEqual(detail.mySlotIds, submitted ? [0, 1, 2, 3] : []);
          assert.equal(detail.summary.participantCount, submitted ? 1 : 0);
          const peer = await call(`/api/v1/time-polls/${p.token}`, f.accounts.find(a => a.role === 'participant'));
          assert.equal(peer.didRespond, false); assert.deepEqual(peer.mySlotIds, []);
        } else if (phase.startsWith('invite-')) {
          assert.equal(detail.didRespond, false); assert.deepEqual(detail.mySlotIds, []); assert.equal(detail.summary.participantCount, 0);
          assert.equal(detail.phase, phase === 'invite-sent' ? 'INVITING' : 'COLLECTING');
          if (phase === 'invite-sent') { assert.equal(detail.chosenStart, detail.slots[4].start); assert.equal(detail.chosenEnd, detail.slots[7].end); assert.equal(detail.expectedCount, 2); }
        } else if (phase.startsWith('refresh-')) {
          const participant = f.accounts.find(a => a.role === 'participant');
          const peer = await call(`/api/v1/time-polls/${p.token}`, participant);
          assert.equal(peer.didRespond, false); assert.deepEqual(peer.mySlotIds, []);
          assert.equal(detail.summary.participantCount, phase === 'refresh-draft' ? 0 : 1);
          assert.equal(detail.phase, phase === 'refresh-confirmed' ? 'CONFIRMED' : phase === 'refresh-invitation' ? 'INVITING' : 'COLLECTING');
          if (phase === 'refresh-draft') await call(`/api/v1/time-polls/${p.token}/response`, owner, 'PUT', { displayName: 'Host Ming', slotIds: [0, 1] });
          if (phase === 'refresh-peers') await call(`/api/v1/time-polls/${p.token}/invitations`, owner, 'POST', { start: detail.slots[0].start, end: detail.slots[3].end, version: 0, attendeeIds: detail.participants.map(x => x.id), linkParticipantCount: 2 });
          if (phase === 'refresh-confirmed') {
            for (const a of f.accounts) {
              const day = detail.chosenStart.slice(0, 10), schedule = await call(`/api/v1/home/schedule?windowStart=${day}T00:00:00Z&windowEnd=${day}T23:59:59Z`, a);
              assert.equal(schedule.studyEntries.filter(x => x.timePollToken === p.token).length, 1);
            }
          }
        } else { assert.deepEqual(detail.mySlotIds, expected[phase]); assert.equal(detail.summary.participantCount, phase === 'manual-draft' ? 0 : 1); }
        checks.push({ phase, slots: detail.mySlotIds, respondents: detail.summary.participantCount, checkedAt: new Date().toISOString() }); seen.add(phase);
        await fs.writeFile(evidence, JSON.stringify({ checks, passed: checks.length }, null, 2)); console.log(`Verified ${phase}`);
      }
      if (/\*\* TEST (?:EXECUTE )?(SUCCEEDED|FAILED) \*\*/.test(text)) { assert(/\*\* TEST (?:EXECUTE )?SUCCEEDED \*\*/.test(text)); assert.equal(seen.size, 4); break; }
      await new Promise(r => setTimeout(r, 1000));
    }
    assert.equal(seen.size, 4);
  } else throw new Error('Unknown mode');
}
