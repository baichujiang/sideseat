// Run while the native flow's disposable peer is the phone's last signed-in account.
// No device token is read or printed; APNs acceptance is checked in deployment logs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const fixture = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'sideseat-direct135-private.json'), 'utf8'));
assert(fixture.accounts.every(a => a.identifier.startsWith('planqa_native135_')));
const owner = fixture.accounts.find(a => a.role === 'owner'), peer = fixture.accounts.find(a => a.role === 'participant');
const base = 'https://api.sideseat.de', checks = [];
async function call(route, a, method = 'GET', body, expected = 200) {
  const r = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${a.accessToken}`, 'Idempotency-Key': randomUUID() }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal(r.status, expected); return (await r.json()).data;
}
for (const order of ['accept-before-publish', 'publish-before-accept']) {
  let p = await call('/api/v1/time-polls', owner, 'POST', { title: `Preview alert ${order}`, timeZone: 'Europe/Berlin', dates: [new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10)], startMinute: 540, endMinute: 660 }, 201);
  const route = `/api/v1/time-polls/${p.token}`;
  p = await call(route + '/invitations', owner, 'POST', { version: 0, start: p.slots[0].start, end: p.slots[3].end, attendeeIds: [], linkParticipantCount: 4 });
  if (order === 'accept-before-publish') await call(route + '/invitation-response', peer, 'PUT', { version: 1, status: 'ACCEPTED' });
  p = await call(route + '/publish', owner, 'POST', { version: 1 }); assert.equal(p.phase, 'CONFIRMED');
  if (order === 'publish-before-accept') p = await call(route + '/invitation-response', peer, 'PUT', { version: 1, status: 'ACCEPTED' });
  assert.equal(p.invitations.filter(i => i.selected && i.status === 'ACCEPTED').length, 2);
  await call(route + '/publish', owner, 'POST', { version: 1 });
  await call(route + '/invitation-response', peer, 'PUT', { version: 1, status: 'ACCEPTED' });
  checks.push({ order, token: p.token, confirmed: true, accepted: 2, capacity: 4, checkedAt: new Date().toISOString() });
}
fs.writeFileSync('docs/qa/evidence/2026-10-20-plans145/real-push-probes.json', JSON.stringify({ checks, note: 'Disposable owner cleanup gathers both probe plans. APNs HTTP acceptance is recorded separately; this script does not assert banner presentation.' }, null, 2));
console.log('Two actual accepted-audience push probes triggered; repeated actions included.');
