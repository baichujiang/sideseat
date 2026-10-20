// Real native participant flow. The phone owns UI actions; the Mac only checks data and cleans disposable accounts.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const base = 'https://api.sideseat.de';
const privatePath = path.join(os.tmpdir(), 'sideseat-direct135-private.json');
const evidencePath = path.join(os.tmpdir(), 'sideseat-direct135-api.json');
const mode = process.argv[2];
async function call(route, token, method = 'GET', body, expected = 200) {
  const response = await fetch(base + route, {
    method, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID(), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal(response.status, expected, `${method} ${route}: ${response.status}`);
  return [200, 201].includes(response.status) ? (await response.json()).data : null;
}
async function login(account) {
  const result = await call('/api/v1/auth/login', null, 'POST', {
    identifier: account.identifier, password: account.password,
    device: { id: randomUUID(), name: 'Native participant physical verification', appVersion: '1.0.0', platformVersion: '26.6.1' },
  });
  account.accessToken = result.tokens.accessToken;
}
if (mode === 'prepare') {
  await assert.rejects(fs.access(privatePath), 'Clean up the previous disposable fixture first.');
  const suffix = randomBytes(4).toString('hex');
  const fixture = { title: `Hotpot ${suffix}`, bundle: 'app.sideseat.mobile.preview', accounts: [] };
  await fs.writeFile(privatePath, JSON.stringify(fixture), { mode: 0o600 });
  for (const [role, displayName] of [['owner', 'Host Ming'], ['participant', 'Peer Lin']]) {
    const account = { role, identifier: `planqa_native135_${role === 'owner' ? 'host' : 'peer'}_${suffix}`, password: randomBytes(22).toString('base64url') };
    const response = await fetch(base + '/api/auth/signup', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-sideseat-platform': 'ios' },
      body: JSON.stringify({ username: account.identifier, password: account.password, displayName, school: 'TUM', studentStatus: 'CURRENT_STUDENT', degreeLevel: 'BACHELOR', semester: 3 }),
    });
    assert.equal(response.status, 201);
    fixture.accounts.push(account);
    await fs.writeFile(privatePath, JSON.stringify(fixture), { mode: 0o600 });
    await login(account);
    await fs.writeFile(privatePath, JSON.stringify(fixture), { mode: 0o600 });
    assert.equal((await call('/api/v1/time-polls', account.accessToken)).polls.length, 0);
  }
  console.log('Two fresh disposable accounts ready; no plans exist.');
} else {
  const fixture = JSON.parse(await fs.readFile(privatePath, 'utf8'));
  for (const account of fixture.accounts) {
    assert(account.identifier.startsWith('planqa_native135_'));
    if (!account.accessToken) await login(account);
  }
  const owner = fixture.accounts.find(a => a.role === 'owner');
  const participant = fixture.accounts.find(a => a.role === 'participant');
  async function poll() {
    const list = await call('/api/v1/time-polls', owner.accessToken);
    const item = list.polls.find(p => p.title === fixture.title);
    assert(item?.isOwner, 'The native UI must create this plan.');
    fixture.pollToken = item.token;
    await fs.writeFile(privatePath, JSON.stringify(fixture), { mode: 0o600 });
    return call(`/api/v1/time-polls/${item.token}`, owner.accessToken);
  }
  async function calendar(detail, account) {
    const date = (detail.chosenStart ?? detail.slots[0].start).slice(0, 10);
    const data = await call(`/api/v1/home/schedule?windowStart=${date}T00:00:00Z&windowEnd=${date}T23:59:59Z`, account.accessToken);
    return data.studyEntries.filter(entry => entry.timePollToken === fixture.pollToken);
  }
  async function verify(phase) {
    if (!fixture.pollToken) await poll();
    const [detail, peer] = await Promise.all([
      call(`/api/v1/time-polls/${fixture.pollToken}`, owner.accessToken),
      call(`/api/v1/time-polls/${fixture.pollToken}`, participant.accessToken),
    ]);
    const [ownerCalendar, participantCalendar] = await Promise.all([calendar(detail, owner), calendar(detail, participant)]);
    assert.equal(peer.isOwner, false);
    if (phase.startsWith('solo-')) {
      const zero = phase === 'solo-zero-ready';
      assert.equal(detail.participants.length, zero ? 0 : 1);
      assert.deepEqual(detail.mySlotIds, zero ? [] : [0, 1, 2, 3]);
      assert.deepEqual(peer.mySlotIds, []); assert.equal(peer.didRespond, false);
      const sent = ['solo-link-ready', 'solo-published', 'solo-participant-opened', 'solo-confirmed', 'solo-calendar-verified'].includes(phase);
      assert.equal(detail.planningMode, sent ? 'FIXED' : 'COLLECT');
      assert.equal(detail.phase, ['solo-published', 'solo-participant-opened', 'solo-confirmed', 'solo-calendar-verified'].includes(phase) ? 'CONFIRMED' : sent ? 'INVITING' : 'COLLECTING');
      if (sent) { assert.equal(detail.expectedCount, 2); assert.equal(detail.invitationVersion, 1); }
      assert.equal(ownerCalendar.length, detail.phase === 'CONFIRMED' ? 1 : 0);
      assert.equal(participantCalendar.length, ['solo-confirmed', 'solo-calendar-verified'].includes(phase) ? 1 : 0);
      if (sent) assert.equal(new Date(detail.chosenEnd) - new Date(detail.chosenStart), 3600000);
      return { phase, checkedAt: new Date().toISOString(), actualPhase: detail.phase, planningMode: detail.planningMode, availabilityRespondents: detail.participants.length, peerDidRespond: peer.didRespond, expectedCount: detail.expectedCount, ownerCalendarEntries: ownerCalendar.length, participantCalendarEntries: participantCalendar.length };
    }
    assert.deepEqual(detail.mySlotIds, [0, 1, 2, 3], 'Participant edits must preserve the organizer response.');
    const beforeResponse = ['owner-ready', 'participant-opened'].includes(phase);
    const expected = beforeResponse ? [] : phase === 'participant-edited' ? [2, 3] : [0, 1, 2, 3];
    assert.deepEqual(peer.mySlotIds, expected);
    assert.equal(peer.didRespond, !beforeResponse);
    assert.equal(detail.participants.length, beforeResponse ? 1 : 2);
    const accepted = detail.invitations.filter(i => i.selected && i.status === 'ACCEPTED').length;
    if (['confirmed', 'calendar-verified'].includes(phase)) {
      assert.equal(detail.phase, 'CONFIRMED'); assert.equal(accepted, 2);
      assert.equal(ownerCalendar.length, 1); assert.equal(participantCalendar.length, 1);
      assert.equal(new Date(detail.chosenEnd) - new Date(detail.chosenStart), 3600000);
    } else {
      assert.equal(detail.phase, ['awaiting-confirmation', 'reschedule-cancelled', 'invitation-reviewed', 'accepted-awaiting-publish'].includes(phase) ? 'INVITING' : 'COLLECTING');
      assert.equal(ownerCalendar.length, 0); assert.equal(participantCalendar.length, 0);
      if (['awaiting-confirmation', 'reschedule-cancelled', 'invitation-reviewed'].includes(phase)) { assert.equal(accepted, 1); assert.equal(detail.invitationVersion, 1); }
      if (phase === 'accepted-awaiting-publish') assert.equal(accepted, 2);
      if (['owner-final-picked', 'roster-reviewed'].includes(phase)) assert.equal(detail.chosenStart ?? null, null, 'A local time/roster draft must not send an invitation.');
    }
    return { phase, checkedAt: new Date().toISOString(), actualPhase: detail.phase, participantCount: detail.participants.length,
      ownSlotIds: peer.mySlotIds, organizerSlotIds: detail.mySlotIds, acceptedCount: accepted, ownerCalendarEntries: ownerCalendar.length, participantCalendarEntries: participantCalendar.length };
  }
  if (mode === 'observe') {
    const logPath = process.argv[3]; assert(logPath);
    const checks = [], seen = new Set(), deadline = Date.now() + 15 * 60 * 1000;
    try {
      while (Date.now() < deadline) {
        const log = await fs.readFile(logPath, 'utf8').catch(() => '');
        for (const [, phase] of log.matchAll(/NATIVE_PARTICIPANT_PHASE ([a-z-]+)/g)) {
          if (!seen.has(phase)) { checks.push(await verify(phase)); seen.add(phase); console.log(`Verified native participant boundary: ${phase}`); }
        }
        if (/\*\* TEST (?:EXECUTE )?(?:SUCCEEDED|FAILED) \*\*/.test(log)) break;
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      assert(seen.has('calendar-verified') || seen.has('solo-calendar-verified'), 'The complete native participant flow must reach Calendar.');
    } finally { await fs.writeFile(evidencePath, JSON.stringify({ checks }, null, 2) + '\n'); }
  } else if (mode === 'cleanup') {
    const known = new Set(fixture.pollToken ? [fixture.pollToken] : []);
    if (owner) {
      for (const item of (await call('/api/v1/time-polls', owner.accessToken)).polls) {
        const detail = await call(`/api/v1/time-polls/${item.token}`, owner.accessToken);
        assert(detail.isOwner); known.add(item.token);
        if (['INVITING', 'CONFIRMED'].includes(detail.phase)) await call(`/api/v1/time-polls/${item.token}/cancel`, owner.accessToken, 'POST', { version: detail.invitationVersion });
        await call(`/api/v1/time-polls/${item.token}`, owner.accessToken, 'DELETE');
      }
    }
    for (const account of fixture.accounts) {
      assert.equal((await call('/api/v1/time-polls', account.accessToken)).polls.length, 0);
      await call('/api/v1/me', account.accessToken, 'DELETE', { confirmUsername: account.identifier });
      await call('/api/v1/me', account.accessToken, 'GET', undefined, 401);
    }
    for (const token of known) await call(`/api/public/time-polls/${token}`, null, 'GET', undefined, 404);
    const receipt = { cleanedAt: new Date().toISOString(), temporaryAccountsDeleted: fixture.accounts.length, remainingPlans: 0,
      oldTokensRejected401: fixture.accounts.length, shareLinksRejected404: known.size };
    await fs.writeFile(path.join(os.tmpdir(), 'sideseat-direct135-cleanup.json'), JSON.stringify(receipt, null, 2) + '\n');
    await fs.unlink(privatePath); console.log(receipt);
  } else { throw Error('Use prepare, observe <xcode-log> or cleanup.'); }
}
