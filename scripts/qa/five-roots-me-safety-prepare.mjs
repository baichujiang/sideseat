// Only explicit owned local prerequisites. Every subsequent unblock/post/vote/comment mutation uses App UI.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import { baseURL, privateDir, readFixture, persist } from './five-roots-live.mjs';
const P = process.env.SIDESEAT_ME_SAFETY_HARNESS_DIR;
assert(typeof P === 'string' && path.isAbsolute(P) && path.resolve(P) === P, 'Provide one explicit absolute MeSafety harness directory.');
for (const directory of [P, path.dirname(P)]) {
  const s = await fs.lstat(directory);
  assert(s.isDirectory() && !s.isSymbolicLink() && s.uid === process.getuid() && (s.mode & 0o077) === 0,
    'Use the existing owned private harness and output root.');
}
for (const name of ['db.mjs', 'local_preflight.py']) {
  const s = await fs.lstat(path.join(P, name));
  assert(s.isFile() && !s.isSymbolicLink() && s.uid === process.getuid() && (s.mode & 0o077) === 0,
    'Require the existing owned private DB and service preflight helpers.');
}
const expectedBuildRaw = process.env.SIDESEAT_QA_BUILD;
assert(typeof expectedBuildRaw === 'string' && /^[1-9][0-9]*$/.test(expectedBuildRaw), 'Provide an explicit expected build.');
const expectedBuild = Number(expectedBuildRaw);
assert(Number.isSafeInteger(expectedBuild), 'Expected build must be an exact positive integer.');
const textSizeVariant = process.env.SIDESEAT_ME_SAFETY_TEXT_SIZE;
assert(['standard', 'maximum'].includes(textSizeVariant));
const { database, empty, snapshot } = await import(pathToFileURL(P + '/db.mjs').href);
assert.equal(process.argv[2], 'prepare'); assert.equal(process.env.SIDESEAT_ME_SAFETY_EXECUTE, '1');
assert.equal(baseURL, 'http://127.0.0.1:3344'); assert(privateDir.startsWith('/tmp/sideseat-five-roots-me-safety-'));
const caseKind = process.env.SIDESEAT_ME_SAFETY_CASE; assert(['unblock', 'feedback'].includes(caseKind));
const f = await readFixture(); assert(!f.meSafety && f.accounts.every(a => a.id && a.accessToken && !a.deleted));
const db = database();
try {
  await empty(db, f);
  const owner = f.accounts.find(a => a.role === 'owner'), peer = f.accounts.find(a => a.role === 'peer');
  async function api(endpoint, account, method = 'GET', body, status = 200) {
    assert(f.accounts.includes(account) && endpoint.startsWith('/api/v1/'));
    const r = await fetch(baseURL + endpoint, { method, redirect: 'error', signal: AbortSignal.timeout(45_000),
      headers: { Authorization: `Bearer ${account.accessToken}`, Accept: 'application/json', 'Content-Type': 'application/json',
        'x-sideseat-platform': 'ios', 'x-sideseat-persistent-intent': '1', 'x-sideseat-flexible-timing': '1',
        'x-sideseat-discovery-matching': '1', 'x-sideseat-capabilities': 'action-coordination-v2',
        'x-sideseat-app-version': '1.0.0', 'x-sideseat-build': String(expectedBuild), 'X-Request-Id': randomUUID(),
        ...(method === 'GET' ? {} : { 'Idempotency-Key': randomUUID() }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert.equal(r.status, status, 'Owned local MeSafety prerequisite failed.'); return (await r.json()).data;
  }
  for (const a of f.accounts) {
    const me = await api('/api/v1/me', a); assert.equal(me.id, a.id); assert.equal(me.username, a.identifier);
    assert(!me.isGuest && me.onboardingComplete);
    const [contacts, inbox, polls, intents, feedback, blocks] = await Promise.all([
      '/api/v1/contacts', '/api/v1/inbox', '/api/v1/time-polls', '/api/v1/me/weekly-intents', '/api/v1/feedback', '/api/v1/me/blocks',
    ].map(e => api(e, a)));
    assert.equal(contacts.contacts.length + inbox.conversations.length + inbox.messageRequests.length + polls.polls.length
      + intents.intents.length + intents.expiredIntents.length + feedback.posts.length + blocks.blocks.length, 0);
  }
  f.meSafety = { schemaVersion: 1, runID: f.runID, caseKind, build: expectedBuild, textSizeVariant, startedAt: new Date().toISOString(),
    feedbackTitle: 'Owned feedback ' + f.runID, feedbackMessage: 'Owned feedback message ' + f.runID,
    commentBody: 'Owned feedback comment ' + f.runID };
  await persist(f); const m = f.meSafety;
  if (caseKind === 'unblock') {
    m.seedOwnerText = 'Unblock ' + f.runID + ' seed owner'; m.seedPeerText = 'Unblock ' + f.runID + ' seed peer';
    m.connectionID = (await api('/api/v1/contacts', owner, 'POST', { peerId: peer.id }, 201)).connectionId; await persist(f);
    const path = '/api/v1/connections/' + m.connectionID;
    await api(path + '/friend-link', owner, 'POST', { action: 'request' });
    await api(path + '/friend-link', peer, 'POST', { action: 'accept' });
    m.seedOwnerMessageID = (await api(path + '/messages', owner, 'POST', { type: 'TEXT', body: m.seedOwnerText }, 201)).id; await persist(f);
    m.seedPeerMessageID = (await api(path + '/messages', peer, 'POST', { type: 'TEXT', body: m.seedPeerText }, 201)).id; await persist(f);
    await api(path + '/block', owner, 'POST', { blockedId: peer.id, connectionId: m.connectionID }, 201);
    const state = await snapshot(db, f); assert.equal(state.connections.length, 1); assert.equal(state.connections[0].status, 'BLOCKED');
    assert.equal(state.messages.length, 2); assert.equal(state.links.length, 1); assert.equal(state.blocks.length, 1);
    assert.equal(state.posts.length + state.votes.length + state.comments.length, 0);
    m.blockedConnectionSnapshot = state.connections[0]; m.seedMessagesSnapshot = state.messages; m.friendLinkSnapshot = state.links;
    m.initialBlockSnapshot = state.blocks[0];
  } else { await empty(db, f); }
  const s = await snapshot(db, f); m.profileBaseline = s.users; m.preparedAt = new Date().toISOString();
  m.explicitPrerequisitesOnly = caseKind === 'unblock'
    ? 'Fresh local owned2, accepted contact/two TEXT, explicit blocked relationship before Me Unblock UI.'
    : 'Fresh local owned2 and globally empty Feedback; no synthetic production post or API-created feedback.';
  await persist(f); console.log('Prepared one owned local MeSafety case. No tested business UI was executed.');
} finally { await db.$disconnect(); }
