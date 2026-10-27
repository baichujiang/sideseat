// Explicit local accepted-contact and TEXT prerequisites; no UI progress is patched by this module.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { baseURL, privateDir, readFixture, persist } from './five-roots-live.mjs';
assert.equal(process.argv[2], 'prepare');
assert.equal(process.env.SIDESEAT_MESSAGES_TERMINAL_EXECUTE, '1');
assert.equal(baseURL, 'http://127.0.0.1:3344');
assert(privateDir.startsWith('/tmp/sideseat-five-roots-messages-terminal-'));
const caseKind = process.env.SIDESEAT_MESSAGES_TERMINAL_CASE;
assert(['safety', 'end'].includes(caseKind));
const helper = '/tmp/sideseat-five-roots-private/messages-terminal252-harness/db.mjs';
const { database, empty, snapshot } = await import(pathToFileURL(helper).href);
const f = await readFixture(), db = database();
try {
  assert(!f.terminal && f.accounts.every(a => a.id && a.accessToken && !a.deleted));
  await empty(db, f);
  const [owner, peer] = ['owner', 'peer'].map(role => f.accounts.find(a => a.role === role));
  async function request(endpoint, account, method = 'GET', body, status = 200) {
    assert(f.accounts.includes(account) && endpoint.startsWith('/api/'));
    const response = await fetch(baseURL + endpoint, { method, redirect: 'error', signal: AbortSignal.timeout(45_000),
      headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json',
        'x-sideseat-platform': 'ios', 'x-sideseat-flexible-timing': '1', 'x-sideseat-persistent-intent': '1',
        'x-sideseat-discovery-matching': '1', 'x-sideseat-app-version': '1.0.0', 'x-sideseat-build': '252',
        'x-sideseat-capabilities': 'action-coordination-v2', 'X-Request-Id': randomUUID(),
        ...(method !== 'GET' ? { 'Idempotency-Key': randomUUID() } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert.equal(response.status, status, 'Owned terminal setup failed; retain the private fixture.');
    return (await response.json()).data;
  }
  for (const account of [owner, peer]) {
    const profile = await request('/api/v1/me', account);
    assert.equal(profile.id, account.id); assert.equal(profile.username, account.identifier);
    assert(!profile.isGuest && profile.onboardingComplete);
    const [contacts, inbox, polls, intents] = await Promise.all(['/api/v1/contacts', '/api/v1/inbox', '/api/v1/time-polls', '/api/v1/me/weekly-intents'].map(e => request(e, account)));
    assert.equal(contacts.contacts.length + inbox.conversations.length + inbox.messageRequests.length + polls.polls.length + intents.intents.length + intents.expiredIntents.length, 0);
  }
  const prefix = `Terminal ${f.runID}`;
  f.terminal = { schemaVersion: 1, runID: f.runID, caseKind, startedAt: new Date().toISOString(),
    seedOwnerText: prefix + ' seed owner', seedPeerText: prefix + ' seed peer', remark: 'QA friend ' + f.runID, reportDetails: 'Terminal report ' + f.runID };
  await persist(f); const m = f.terminal;
  m.connectionID = (await request('/api/v1/contacts', owner, 'POST', { peerId: peer.id }, 201)).connectionId; await persist(f);
  const chat = `/api/v1/connections/${m.connectionID}`;
  await request(chat + '/friend-link', owner, 'POST', { action: 'request' });
  await request(chat + '/friend-link', peer, 'POST', { action: 'accept' });
  m.seedOwnerMessageID = (await request(chat + '/messages', owner, 'POST', { type: 'TEXT', body: m.seedOwnerText }, 201)).id; await persist(f);
  m.seedPeerMessageID = (await request(chat + '/messages', peer, 'POST', { type: 'TEXT', body: m.seedPeerText }, 201)).id; await persist(f);
  for (const account of [owner, peer]) {
    const contacts = await request('/api/v1/contacts', account), view = await request(chat + '/messages?limit=100', account);
    assert.equal(contacts.contacts.length, 1); assert.equal(contacts.contacts[0].connectionId, m.connectionID);
    assert.equal(view.messages.length, 2); assert.equal(view.connection.id, m.connectionID); assert(view.connection.replyLimitUnlocked);
  }
  const s = await snapshot(db, f);
  assert.equal(s.connections.length, 1); assert.equal(s.connections[0].status, 'ACTIVE'); assert.equal(s.messages.length, 2);
  assert.equal(s.blocks.length + s.reports.length, 0); assert(s.users.every(u => u.verifiedStudent === false), 'Do not grant verification for terminal actions.');
  m.preparedAt = new Date().toISOString(); m.apiPreconditionsOnly = 'Local two owned fresh accepted contacts and two TEXT seeds; all subsequent remark/report/block/end changes use App UI.';
  await persist(f); console.log('Prepared one independent local terminal cohort; no terminal UI or business action executed.');
} finally { await db.$disconnect(); }
