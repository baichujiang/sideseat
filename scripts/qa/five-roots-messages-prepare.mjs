// Explicit preconditions only. The native Messages flow and its GET observer never use these writes.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { baseURL, privateDir, fixturePath, readFixture, persist } from './five-roots-live.mjs';

assert.equal(process.argv[2], 'prepare', 'Only explicit prepare is supported.');
assert.equal(process.env.SIDESEAT_MESSAGES_EXECUTE, '1', 'Wait until Calendar acceptance authorizes the Messages stage.');
assert.equal(baseURL, 'https://api.sideseat.de');
assert(privateDir.startsWith('/tmp/sideseat-five-roots-messages-'), 'Use a fresh dedicated Messages factory directory.');
assert(fixturePath.startsWith('/tmp/sideseat-five-roots-') && !fixturePath.includes('/plan-tmp/'));
const f = await readFixture();
assert.equal(f.bundle, 'app.sideseat.mobile.preview');
assert(f.accounts.every(a => a.id && a.accessToken && a.created && !a.deleted));
assert.equal(new Set(f.accounts.map(a => a.id)).size, 2);
assert(!f.messages, 'Never replace an existing Messages preparation. Retain it for explicit cleanup.');
const owner = f.accounts.find(a => a.role === 'owner'), peer = f.accounts.find(a => a.role === 'peer');
const prefix = `Messages ${f.runID}`;
async function request(endpoint, account, method = 'GET', body, status = 200) {
  assert(f.accounts.includes(account)); assert(endpoint.startsWith('/api/'));
  const response = await fetch(baseURL + endpoint, { method, redirect: 'error', signal: AbortSignal.timeout(45_000),
    headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json',
      'x-sideseat-platform': 'ios', 'x-sideseat-flexible-timing': '1', 'x-sideseat-persistent-intent': '1',
      'x-sideseat-discovery-matching': '1', 'x-sideseat-app-version': '1.0.0', 'x-sideseat-build': '252',
      'x-sideseat-capabilities': 'action-coordination-v2', 'X-Request-Id': randomUUID(),
      ...(method !== 'GET' ? { 'Idempotency-Key': randomUUID() } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert.equal(response.status, status, 'Owned Messages precondition request failed; retain the private fixture.');
  return (await response.json()).data;
}
for (const account of [owner, peer]) {
  const profile = await request('/api/v1/me', account);
  assert.equal(profile.id, account.id); assert.equal(profile.username, account.identifier);
  const [contacts, inbox, polls, intents] = await Promise.all(['/api/v1/contacts', '/api/v1/inbox', '/api/v1/time-polls', '/api/v1/me/weekly-intents'].map(endpoint => request(endpoint, account)));
  assert.equal(contacts.contacts.length, 0); assert.equal(inbox.conversations.length, 0); assert.equal(inbox.messageRequests.length, 0);
  assert.equal(polls.polls.length, 0); assert.equal(intents.intents.length + intents.expiredIntents.length, 0);
}
f.messages = { schemaVersion: 1, runID: f.runID, startedAt: new Date().toISOString(),
  seedOwnerText: prefix + ' seed owner', seedPeerText: prefix + ' seed peer',
  notificationTitle: prefix + ' 通知前提', notificationLocation: prefix + ' QA' };
await persist(f);
const m = f.messages;
m.connectionID = (await request('/api/v1/contacts', owner, 'POST', { peerId: peer.id }, 201)).connectionId; await persist(f);
const chat = `/api/v1/connections/${m.connectionID}`;
await request(chat + '/friend-link', owner, 'POST', { action: 'request' });
await request(chat + '/friend-link', peer, 'POST', { action: 'accept' });
m.seedOwnerMessageID = (await request(chat + '/messages', owner, 'POST', { type: 'TEXT', body: m.seedOwnerText }, 201)).id; await persist(f);
m.seedPeerMessageID = (await request(chat + '/messages', peer, 'POST', { type: 'TEXT', body: m.seedPeerText }, 201)).id; await persist(f);
const date = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
let p = await request('/api/v1/time-polls', owner, 'POST', { title: m.notificationTitle, location: m.notificationLocation,
  dates: [date], timeZone: 'Europe/Berlin', startMinute: 540, endMinute: 660, planningMode: 'COLLECT' }, 201);
m.notificationToken = p.token; await persist(f);
const plan = '/api/v1/time-polls/' + p.token;
for (const account of [owner, peer]) await request(plan + '/response', account, 'PUT', { displayName: account.displayName, slotIds: [0, 1, 2, 3] });
p = await request(plan, owner);
p = await request(plan + '/invitations', owner, 'POST', { version: 0, start: p.slots[0].start, end: p.slots[3].end, attendeeIds: p.participants.map(person => person.id) });
p = await request(plan + '/cancel', owner, 'POST', { version: p.invitationVersion });
assert.equal(p.phase, 'CANCELLED'); assert.equal(p.invitations.length, 2);
for (const account of [owner, peer]) {
  const contacts = await request('/api/v1/contacts', account); assert.equal(contacts.contacts.length, 1);
  const view = await request(chat + '/messages?limit=100', account);
  assert.equal(view.connection.id, m.connectionID); assert.equal(view.connection.replyLimitUnlocked, true); assert.equal(view.messages.length, 2);
}
m.preparedAt = new Date().toISOString();
m.apiPreconditionsOnly = 'Accepted owned contact, two-way TEXT seed, one cancelled two-person shared plan for device-local notification read checks; not Messages UI acceptance.';
await persist(f);
console.log('Prepared only this fresh two-account Messages precondition. No Messages UI flow was executed; credentials and IDs remain private.');
