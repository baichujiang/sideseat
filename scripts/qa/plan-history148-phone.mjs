// Run after the disposable native flow; preserve its cancelled plan for history UI verification.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const fixture = JSON.parse(await fs.readFile(path.join(os.tmpdir(), 'sideseat-direct135-private.json'), 'utf8'));
assert.equal(fixture.accounts.length, 2);
for (const account of fixture.accounts) assert.match(account.identifier, /^planqa_native135_(host|peer)_/);
const owner = fixture.accounts.find(account => account.role === 'owner');
assert(owner && fixture.pollToken);

async function call(route, account, method = 'GET', body) {
  const response = await fetch('https://api.sideseat.de' + route, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${account.accessToken}`, 'Idempotency-Key': randomUUID() },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal(response.status, 200, `${method} ${route}`);
  return (await response.json()).data;
}

const route = `/api/v1/time-polls/${fixture.pollToken}`;
const before = await call(route, owner);
assert(before.isOwner);
assert.equal(before.title, fixture.title);
assert.equal(before.phase, 'CONFIRMED', 'Finish the real native flow before testing history.');
await call(route + '/cancel', owner, 'POST', { version: before.invitationVersion });
const after = await call(route, owner);
assert.equal(after.phase, 'CANCELLED');
const list = await call('/api/v1/time-polls', owner);
assert(list.polls.some(item => item.token === fixture.pollToken && item.phase === 'CANCELLED'));
const date = before.chosenStart.slice(0, 10);
const calendars = [];
for (const account of fixture.accounts) {
  const schedule = await call(`/api/v1/home/schedule?windowStart=${date}T00:00:00Z&windowEnd=${date}T23:59:59Z`, account);
  const count = schedule.studyEntries.filter(entry => entry.timePollToken === fixture.pollToken).length;
  assert.equal(count, 0);
  calendars.push({ role: account.role, calendarEntries: count });
}
const receipt = { checkedAt: new Date().toISOString(), phase: after.phase, retainedInHistory: true, calendars };
await fs.writeFile(path.join(os.tmpdir(), 'sideseat-history148-api.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(receipt);
