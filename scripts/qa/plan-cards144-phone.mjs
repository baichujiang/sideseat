// Seed and verify real card states; account provisioning/cleanup uses plan-home134-phone.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
const file = path.join(os.tmpdir(), 'sideseat-native-participant-private.json');
const fixture = JSON.parse(await fs.readFile(file, 'utf8'));
assert(fixture.accounts.every(a => a.identifier.startsWith('planqa_native134_')));
const owner = fixture.accounts.find(a => a.role === 'owner'), peer = fixture.accounts.find(a => a.role === 'participant');
async function api(route, account, method = 'GET', body, expected = 200) {
  const r = await fetch('https://api.sideseat.de' + route, { method, headers: {
    Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID(),
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal(r.status, expected, `${method} ${route}: ${r.status}`);
  return (await r.json()).data;
}
if (process.argv[2] === 'seed') {
  assert.equal((await api('/api/v1/time-polls', owner)).polls.length, 0);
  fixture.cards = [];
  for (const [role, title] of [['task', '周末一起自习'], ['waiting', '下课一起喝咖啡'], ['waiting', '周末一起打羽毛球'], ['meetup', '周六一起吃火锅']]) {
    let p = await api('/api/v1/time-polls', owner, 'POST', { title, timeZone: 'Europe/Berlin',
      dates: [new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10)], startMinute: 840, endMinute: 960 }, 201);
    fixture.cards.push({ role, title, token: p.token });
    await fs.writeFile(file, JSON.stringify(fixture), { mode: 0o600 });
    const route = `/api/v1/time-polls/${p.token}`;
    if (role !== 'task') {
      await api(route + '/response', owner, 'PUT', { displayName: 'Ming', slotIds: [0, 1, 2, 3] });
      await api(route + '/response', peer, 'PUT', { displayName: 'Lin', slotIds: [0, 1, 2, 3] });
      p = await api(route, owner);
      p = await api(route + '/invitations', owner, 'POST', { start: p.slots[0].start, end: p.slots[3].end,
        version: p.invitationVersion, attendeeIds: p.participants.map(x => x.id) });
      if (role === 'meetup') await api(route + '/invitation-response', peer, 'PUT', { status: 'ACCEPTED', version: p.invitationVersion });
    }
  }
  console.log('Four real card states ready.');
} else if (process.argv[2] === 'verify') {
  const states = [];
  for (const card of fixture.cards) {
    const p = await api(`/api/v1/time-polls/${card.token}`, owner);
    assert.equal(p.phase, card.role === 'task' ? 'COLLECTING' : card.role === 'waiting' ? 'INVITING' : 'CONFIRMED');
    assert.equal(p.invitationVersion, card.role === 'task' ? 0 : 1);
    states.push({ role: card.role, phase: p.phase, invitationVersion: p.invitationVersion });
  }
  await fs.writeFile(process.argv[3], JSON.stringify({ checkedAt: new Date().toISOString(), states, passed: states.length, note: 'Opening cards and browsing the rail preserved all seeded phases and invitation versions.' }, null, 2));
  console.log('All four states preserved.');
} else throw new Error('Use seed or verify <evidence-path>.');
