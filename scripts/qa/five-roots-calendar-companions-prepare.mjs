// Explicit authentication/relationship preconditions only. No Calendar event,
// message, invitation or time-poll is seeded, and this is never UI acceptance.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { baseURL, privateDir, readFixture, persist } from './five-roots-live.mjs';

assert.equal(process.argv[2], 'prepare', 'Only explicit prepare is supported; partial preparations are retained for cleanup.');
assert.equal(process.env.SIDESEAT_CALENDAR_COMPANIONS_EXECUTE, '1', 'Default is preparation disabled. Root must explicitly authorize this Calendar case.');
assert.equal(baseURL, 'https://api.sideseat.de');
assert(/^\/tmp\/sideseat-five-roots-calendar-companions-[A-Za-z0-9_-]+$/.test(privateDir), 'Use a fresh dedicated Companions factory directory.');
const f = await readFixture();
assert.equal(f.bundle, 'app.sideseat.mobile.preview');
assert(f.preparedAt && f.accounts.every(a => a.id && a.accessToken && a.created && !a.deleted));
assert.equal(new Set(f.accounts.map(a => a.id)).size, 2);
assert(!f.calendarCompanions && !f.messages && !f.me, 'Never replace another case or a previous/partial preparation.');
const [owner, peer] = ['owner', 'peer'].map(role => f.accounts.find(a => a.role === role));
const windowStart = new Date(Date.parse(f.createdAt) - 86_400_000).toISOString();
const windowEnd = new Date(Date.parse(f.createdAt) + 118 * 86_400_000).toISOString();
const schedulePath = `/api/v1/home/schedule?windowStart=${encodeURIComponent(windowStart)}&windowEnd=${encodeURIComponent(windowEnd)}`;
const getPaths = new Set(['/api/v1/me', '/api/v1/contacts', '/api/v1/inbox', '/api/v1/plans', '/api/v1/time-polls', '/api/v1/me/weekly-intents', schedulePath]);
async function request(account, endpoint, { body, key, status = 200 } = {}) {
  assert(f.accounts.includes(account));
  const method = body === undefined ? 'GET' : 'POST';
  if (method === 'GET') assert(getPaths.has(endpoint) || endpoint === `/api/v1/connections/${f.calendarCompanions?.connectionID}/messages?limit=100`);
  else {
    assert(key && f.calendarCompanions?.keys && Object.values(f.calendarCompanions.keys).includes(key), 'Persist the exact key before each owned precondition write.');
    assert((account === owner && endpoint === '/api/v1/contacts' && body.peerId === peer.id)
      || (endpoint === `/api/v1/connections/${f.calendarCompanions.connectionID}/friend-link`
        && ((account === owner && body.action === 'request') || (account === peer && body.action === 'accept'))));
  }
  const response = await fetch(baseURL + endpoint, {
    method, redirect: 'error', signal: AbortSignal.timeout(45_000),
    headers: { Authorization: `Bearer ${account.accessToken}`, Accept: 'application/json', 'Content-Type': 'application/json',
      'x-sideseat-platform': 'ios', 'x-sideseat-persistent-intent': '1', ...(key ? { 'Idempotency-Key': key } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  assert.equal(response.status, status, 'Owned relationship precondition failed. No refresh/retry/resume; retain the private fixture.');
  const result = (await response.json()).data;
  assert(result, 'Expected the current API envelope.');
  return result;
}
async function snapshot(account, includeMessages = false) {
  const [me, contacts, inbox, plans, polls, intents, schedule] = await Promise.all(
    ['/api/v1/me', '/api/v1/contacts', '/api/v1/inbox', '/api/v1/plans', '/api/v1/time-polls', '/api/v1/me/weekly-intents', schedulePath]
      .map(endpoint => request(account, endpoint)));
  assert.equal(me.id, account.id); assert.equal(me.username, account.identifier);
  assert(Array.isArray(contacts.contacts) && Array.isArray(inbox.conversations) && Array.isArray(inbox.messageRequests)
    && Array.isArray(plans.plans) && Array.isArray(polls.polls) && Array.isArray(intents.intents) && Array.isArray(intents.expiredIntents)
    && Array.isArray(schedule.studyEntries) && Array.isArray(schedule.classBlocks) && Array.isArray(schedule.companionOptions));
  const profileNotificationSource = { id: me.id, username: me.username, nickname: me.nickname ?? null,
    verifiedStudent: me.verifiedStudent, studentVerificationStatus: me.studentVerificationStatus, usernameUpdatedAt: me.usernameUpdatedAt ?? null };
  return { contacts, inbox, plans, polls, intents, profileNotificationSource, schedule,
    ...(includeMessages ? { messages: await request(account, `/api/v1/connections/${f.calendarCompanions.connectionID}/messages?limit=100`) } : {}) };
}
const initial = {};
for (const account of [owner, peer]) {
  assert(f.inventory?.[account.role] && ['calendar', 'polls', 'contacts', 'conversations', 'messageRequests', 'intentions']
    .every(key => Array.isArray(f.inventory[account.role][key]) && f.inventory[account.role][key].length === 0), 'Factory inventory must show a new empty owned cohort.');
  const s = await snapshot(account);
  assert([s.contacts.contacts, s.inbox.conversations, s.inbox.messageRequests, s.plans.plans, s.polls.polls,
    s.intents.intents, s.intents.expiredIntents, s.schedule.studyEntries, s.schedule.classBlocks, s.schedule.companionOptions]
    .every(rows => rows.length === 0), 'Fresh ownership and actual empty domain reads are required before any relationship write.');
  initial[account.role] = s;
}
f.calendarCompanions = { schemaVersion: 1, runID: f.runID, startedAt: new Date().toISOString(),
  title: `Companions ${f.runID}`, windowStart, windowEnd, initial,
  keys: { createConnection: randomUUID(), requestFriend: randomUUID(), acceptFriend: randomUUID() },
  boundaries: [], apiPreconditionsOnly: 'Exactly one owned ACTIVE direct connection and accepted contact; no Calendar/message/plan progress.' };
await persist(f);
const c = f.calendarCompanions;
c.connectionID = (await request(owner, '/api/v1/contacts', { body: { peerId: peer.id }, key: c.keys.createConnection, status: 201 })).connectionId;
assert(/^c[a-z0-9]{20,32}$/.test(c.connectionID)); c.boundaries.push('connection-created'); await persist(f);
const friendPath = `/api/v1/connections/${c.connectionID}/friend-link`;
await request(owner, friendPath, { body: { action: 'request' }, key: c.keys.requestFriend });
c.boundaries.push('friend-requested'); await persist(f);
await request(peer, friendPath, { body: { action: 'accept' }, key: c.keys.acceptFriend });
c.boundaries.push('friend-accepted'); await persist(f);
c.baseline = {};
for (const account of [owner, peer]) {
  const other = account === owner ? peer : owner, s = await snapshot(account, true);
  assert.equal(s.contacts.contacts.length, 1); assert.equal(s.contacts.contacts[0].connectionId, c.connectionID);
  assert.equal(s.contacts.contacts[0].peer.id, other.id);
  assert.equal(s.inbox.conversations.length, 1); assert.equal(s.inbox.conversations[0].id, c.connectionID);
  assert.equal(s.inbox.conversations[0].kind, 'DIRECT'); assert.equal(s.inbox.conversations[0].peer.id, other.id);
  assert.equal(s.inbox.messageRequests.length, 0);
  assert.equal(s.messages.connection.id, c.connectionID); assert.equal(s.messages.connection.peer.id, other.id);
  assert.equal(s.schedule.companionOptions.length, 1); assert.equal(s.schedule.companionOptions[0].id, other.id);
  assert.equal(s.schedule.companionOptions[0].name, other.displayName);
  assert([s.plans.plans, s.polls.polls, s.intents.intents, s.intents.expiredIntents, s.schedule.studyEntries, s.schedule.classBlocks]
    .every(rows => rows.length === 0), 'The relationship precondition must not seed Calendar, plans or intentions.');
  c.baseline[account.role] = s;
}
c.preparedAt = new Date().toISOString();
await persist(f);
console.log('Prepared the single owned relationship precondition only. No Calendar UI/business flow executed; private baseline retained.');
