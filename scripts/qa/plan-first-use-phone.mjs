// Mac-side production assertions for PlanFirstUsePhoneUITests. No customer account is used.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const base = 'https://api.sideseat.de';
const privatePath = path.join(os.tmpdir(), 'sideseat-first-plan-phone-private.json');
const evidencePath = path.join(os.tmpdir(), 'sideseat-first-plan-phone-api.json');
const mode = process.argv[2];
async function call(route, token, method = 'GET', body, expected = 200) {
  const response = await fetch(base + route, {
    method, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID(), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal(response.status, expected, `${method} ${route}: ${response.status}`);
  return response.status === 200 || response.status === 201 ? (await response.json()).data : null;
}
if (mode === 'prepare') {
  await assert.rejects(fs.access(privatePath), 'Clean up the previous disposable fixture before creating another.');
  const suffix = randomBytes(4).toString('hex');
  const identifier = `planqa_phone122_${suffix}`, password = randomBytes(22).toString('base64url');
  const signup = await fetch(base + '/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-sideseat-platform': 'ios' }, body: JSON.stringify({ username: identifier, password, displayName: 'Host Ming', school: 'TUM', studentStatus: 'CURRENT_STUDENT', degreeLevel: 'BACHELOR', semester: 3 }) });
  assert.equal(signup.status, 201);
  // Save recovery credentials immediately, even if a subsequent login fails.
  const fixture = { identifier, password, title: `Phone first plan ${suffix}`, bundle: 'app.sideseat.mobile.preview' };
  await fs.writeFile(privatePath, JSON.stringify(fixture), { mode: 0o600 });
  const login = await call('/api/v1/auth/login', null, 'POST', { identifier, password, device: { id: randomUUID(), name: 'First plan physical verification', appVersion: '1.0.0', platformVersion: '26.6.1' } });
  fixture.accessToken = login.tokens.accessToken;
  assert.equal((await call('/api/v1/time-polls', fixture.accessToken)).polls.length, 0);
  await fs.writeFile(privatePath, JSON.stringify(fixture), { mode: 0o600 });
  console.log('One fresh disposable account ready; initial plans list is empty.');
} else {
  const fixture = JSON.parse(await fs.readFile(privatePath, 'utf8'));
  assert(fixture.identifier.startsWith('planqa_phone122_'));
  if (!fixture.accessToken) {
    const login = await call('/api/v1/auth/login', null, 'POST', { identifier: fixture.identifier, password: fixture.password, device: { id: randomUUID(), name: 'First plan cleanup', appVersion: '1.0.0', platformVersion: '26.6.1' } });
    fixture.accessToken = login.tokens.accessToken;
  }
  const token = fixture.accessToken;
  async function poll() {
    const list = await call('/api/v1/time-polls', token);
    const item = list.polls.find(item => item.title === fixture.title);
    assert(item, 'The native UI must create the plan.');
    assert.equal(item.isOwner, true);
    fixture.pollToken = item.token;
    await fs.writeFile(privatePath, JSON.stringify(fixture), { mode: 0o600 });
    return call(`/api/v1/time-polls/${item.token}`, token);
  }
  async function calendar(poll) {
    const date = (poll.chosenStart ?? poll.slots[0].start).slice(0, 10);
    const data = await call(`/api/v1/home/schedule?windowStart=${date}T00:00:00Z&windowEnd=${date}T23:59:59Z`, token);
    return data.studyEntries.filter(entry => entry.timePollToken === fixture.pollToken);
  }
  async function verify(phase) {
    const detail = await poll(), entries = await calendar(detail);
    const acceptedCount = detail.invitations.filter(invitation => invitation.selected && invitation.status === 'ACCEPTED').length;
    const host = detail.participants.find(person => person.displayName === 'Host Ming');
    if (phase !== 'created-empty') { assert(host); assert.deepEqual(host.slotIds, phase === 'owner-edited' ? [2, 3] : [0, 1, 2, 3]); }
    if (phase === 'created-empty') {
      assert.equal(detail.phase, 'COLLECTING'); assert.equal(detail.participants.length, 0); assert.equal(entries.length, 0);
    } else if (phase === 'created-and-saved') {
      assert.equal(detail.phase, 'COLLECTING'); assert.equal(detail.participants.length, 1); assert.equal(entries.length, 0);
    } else {
      const guest = detail.participants.find(person => person.displayName === 'Guest Lin');
      assert(guest?.isGuest); assert.deepEqual(guest.slotIds, [0, 1, 2, 3]);
      if (['guest-saved', 'owner-edited', 'owner-restored'].includes(phase)) { assert.equal(detail.phase, 'COLLECTING'); assert.equal(entries.length, 0); }
      else if (phase === 'awaiting-confirmation') {
        assert.equal(detail.phase, 'INVITING'); assert.equal(acceptedCount, 1); assert.equal(entries.length, 0);
      } else {
        assert.equal(detail.phase, 'CONFIRMED'); assert.equal(acceptedCount, 2); assert.equal(entries.length, 1);
        assert.equal(new Date(detail.chosenEnd) - new Date(detail.chosenStart), 60 * 60 * 1000);
        assert.equal(entries[0].title, fixture.title);
      }
    }
    return { phase, checkedAt: new Date().toISOString(), actualPhase: detail.phase, participantCount: detail.participants.length, acceptedCount, calendarEntries: entries.length };
  }
  if (mode === 'observe') {
    const logPath = process.argv[3]; assert(logPath);
    const checks = [], seen = new Set(); const deadline = Date.now() + 12 * 60 * 1000;
    try {
      while (Date.now() < deadline) {
        const log = await fs.readFile(logPath, 'utf8').catch(() => '');
        for (const [, phase] of log.matchAll(/FIRST_PLAN_PHONE_PHASE ([a-z-]+)/g)) {
          if (!seen.has(phase)) { checks.push(await verify(phase)); seen.add(phase); console.log(`Verified API boundary: ${phase}`); }
        }
        if (/\*\* TEST (?:EXECUTE )?(?:SUCCEEDED|FAILED) \*\*/.test(log)) break;
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      assert(seen.has('calendar-verified'), 'The complete phone flow must reach Calendar.');
    } finally { await fs.writeFile(evidencePath, JSON.stringify({ checks }, null, 2) + '\n'); }
  } else if (mode === 'verify') {
    const result = await verify('calendar-verified'); await fs.writeFile(evidencePath, JSON.stringify(result, null, 2) + '\n'); console.log(result);
  } else if (mode === 'cleanup') {
    const list = await call('/api/v1/time-polls', token); const known = new Set(fixture.pollToken ? [fixture.pollToken] : []);
    for (const item of list.polls) {
      const detail = await call(`/api/v1/time-polls/${item.token}`, token); assert(detail.isOwner); known.add(item.token);
      if (['INVITING', 'CONFIRMED'].includes(detail.phase)) await call(`/api/v1/time-polls/${item.token}/cancel`, token, 'POST', { version: detail.invitationVersion });
      await call(`/api/v1/time-polls/${item.token}`, token, 'DELETE');
    }
    assert.equal((await call('/api/v1/time-polls', token)).polls.length, 0);
    await call('/api/v1/me', token, 'DELETE', { confirmUsername: fixture.identifier });
    await call('/api/v1/me', token, 'GET', undefined, 401);
    for (const shared of known) await call(`/api/public/time-polls/${shared}`, null, 'GET', undefined, 404);
    const receipt = { cleanedAt: new Date().toISOString(), temporaryAccountsDeleted: 1, remainingPlans: 0, oldTokenRejected401: true, shareLinksRejected404: known.size };
    await fs.writeFile(path.join(os.tmpdir(), 'sideseat-first-plan-phone-cleanup.json'), JSON.stringify(receipt, null, 2) + '\n');
    await fs.unlink(privatePath); console.log(receipt);
  } else { throw Error('Use prepare, observe <xcode-log>, verify or cleanup.'); }
}
