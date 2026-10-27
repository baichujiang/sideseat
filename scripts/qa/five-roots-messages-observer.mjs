// GET-only oracle. Never imports factory.get: that helper may POST login on 401.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { baseURL, privateDir, fixturePath, readFixture } from './five-roots-live.mjs';
import { fetchQAGet, qaGETTransportPolicy } from './five-roots-get-transport.mjs';
import { createQAReadBarrier } from './five-roots-read-barrier.mjs';

const [logPath] = process.argv.slice(2), root = '/tmp/sideseat-five-roots-private';
const out = process.env.SIDESEAT_QA_OUTPUT, appBuild = Number(process.env.SIDESEAT_QA_UI_BUILD || '252');
const surface = process.env.SIDESEAT_QA_SURFACE;
assert(['simulator', 'physical'].includes(surface), 'Record the actual explicitly selected Messages test surface.');
assert.equal(process.env.SIDESEAT_MESSAGES_EXECUTE, '1', 'Wait for Calendar acceptance before observing Messages execution.');
assert.equal(baseURL, 'https://api.sideseat.de'); assert.equal(appBuild, 252, 'Use the frozen Preview252 Messages preparation.');
assert(privateDir.startsWith('/tmp/sideseat-five-roots-messages-'), 'Never reuse another root page\'s cohort.');
assert(typeof logPath === 'string' && path.dirname(logPath) === root && /^messages-[a-zA-Z0-9_-]+\.log$/.test(path.basename(logPath)));
assert(typeof out === 'string' && path.dirname(out) === root && /^messages-[a-zA-Z0-9_-]+$/.test(path.basename(out)));
assert((await fs.lstat(fixturePath)).isFile()); await fs.mkdir(out, { recursive: true, mode: 0o700 });
assert((await fs.lstat(out)).isDirectory()); await fs.chmod(out, 0o700);
assert(!(await fs.readdir(out)).includes('messages-real-flow.json'), 'Do not mix this Messages run with earlier evidence.');
const readBarrier = await createQAReadBarrier({ expectedRunnerBundle: 'app.sideseat.fiverootsmessagesqa.xctrunner', outputDir: out });
const f = await readFixture(), [owner, peer] = ['owner', 'peer'].map(role => f.accounts.find(a => a.role === role));
assert.equal(f.bundle, 'app.sideseat.mobile.preview'); assert.equal(f.baseURL, baseURL);
assert(owner?.id && peer?.id && owner.id !== peer.id && owner.accessToken && peer.accessToken);
const m = f.messages, prefix = `Messages ${f.runID}`;
assert(m?.schemaVersion === 1 && m.runID === f.runID && m.preparedAt && m.connectionID && m.notificationToken);
assert(Number.isFinite(Date.parse(m.preparedAt)) && [m.connectionID, m.seedOwnerMessageID, m.seedPeerMessageID].every(id => /^c[a-z0-9]{20,32}$/.test(id)));
assert(/^[A-Za-z0-9_-]{32}$/.test(m.notificationToken));
assert.equal(m.seedOwnerText, prefix + ' seed owner'); assert.equal(m.seedPeerText, prefix + ' seed peer');
assert(m.seedOwnerMessageID && m.seedPeerMessageID && m.seedOwnerMessageID !== m.seedPeerMessageID);
assert.equal(m.notificationTitle, prefix + ' 通知前提');
assert.equal(m.notificationLocation, prefix + ' QA');
const phases = ['owner-shortcuts-and-notice-read', 'owner-sent', 'peer-replied', 'history-search-and-participant', 'draft-cancelled',
  'quote-sent', 'delete-cancelled', 'owner-quote-deleted', 'owner-pinned', 'owner-local-unread', 'owner-relaunched-local-state',
  'peer-account-isolated', 'peer-reply-deleted', 'owner-reminder-cleared', 'messages-cleaned', 'complete'];
const text = { owner: prefix + ' 你好', peer: prefix + ' 收到回复', quote: prefix + ' 引用回复', unsent: prefix + ' 取消草稿' };
const sha = value => createHash('sha256').update(value).digest('hex');
const harnessSHA256 = sha(await fs.readFile(new URL(import.meta.url)));
const transportHelperSHA256 = sha(await fs.readFile(new URL('./five-roots-get-transport.mjs', import.meta.url)));
const readBarrierHelperSHA256 = sha(await fs.readFile(new URL('./five-roots-read-barrier.mjs', import.meta.url)));
const readRetries = [];
let retryLogWrite = Promise.resolve();
const checks = [], readAcknowledgements = []; let current = 'starting', failed, completed = false, planBefore;
const messages = `/api/v1/connections/${m.connectionID}/messages?limit=100`;
async function get(endpoint, account) {
  assert([owner, peer].includes(account)); assert(endpoint.startsWith('/api/v1/'));
  const response = await fetchQAGet(baseURL + endpoint, { role: account.role, phase: current,
    headers: { Authorization: `Bearer ${account.accessToken}`, Accept: 'application/json', 'x-sideseat-platform': 'ios',
      'x-sideseat-flexible-timing': '1', 'x-sideseat-persistent-intent': '1', 'x-sideseat-discovery-matching': '1',
      'x-sideseat-app-version': '1.0.0', 'x-sideseat-build': String(appBuild),
      'x-sideseat-capabilities': 'action-coordination-v2', 'x-request-id': randomUUID() },
    onRetry: record => {
      readRetries.push(record);
      retryLogWrite = retryLogWrite.then(() => privateJSON('read-retries.private.json', readRetries));
      return retryLogWrite;
    } });
  assert.equal(response.status, 200, 'GET-only observation cannot refresh tokens or advance the Messages flow.');
  return (await response.json()).data;
}
const privateJSON = (name, value) => fs.writeFile(path.join(out, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
const planBusiness = p => sha(JSON.stringify({ title: p.title, location: p.location, phase: p.phase, updatedAt: p.updatedAt,
  dates: p.dates, slots: p.slots, chosenStart: p.chosenStart, chosenEnd: p.chosenEnd, invitationVersion: p.invitationVersion,
  participants: p.participants, invitations: p.invitations, activitySelection: p.activitySelection, expectedCount: p.expectedCount }));
const report = () => privateJSON('messages-real-flow.json', {
  passed: completed && !failed, appBuild, phases, checks, readAcknowledgements, runSHA256: sha(f.runID),
  surface: surface === 'simulator' ? 'owned Simulator iPhone17Pro iOS26.5' : 'default physical iPhone14Plus',
  simulator: surface === 'simulator', physicalDevice: surface === 'physical',
  ...(surface === 'physical' ? { physicalUDID: '00008110-001A69110CC1401E' }
    : { simulatorUDID: 'AEBD816E-53A7-4012-B76A-FEF82CF02A6B' }),
  messageBusinessWrites: 'Actual selected-surface App UI only; this observer uses GET without token-refresh POST',
  explicitAPIPreconditions: 'Fresh two-account accepted contact, two-way seed TEXT, one cancelled shared plan for notification read checks; not UI acceptance',
  localStateScope: 'Notification read history and manual unread are per-account on this device, asserted by actual UI; no server/cross-device synchronization claimed',
  unavailableCurrentBranches: ['Direct-chat Hide is not exposed', 'Public profile is disabled by current MVP policy; participant summary is tested',
    'The fresh contact has no intention context', 'Composer draft has no persistent recovery; quote/text cancellation is tested'],
  factoryAccountCleanupPending: true, completedCases: completed && !failed ? 1 : 0,
  failure: failed ? { phase: current, message: 'Failed Messages boundary; private diagnostics retained.' } : null,
  harnessSHA256, transportHelperSHA256, readBarrierHelperSHA256, readRetryCount: readRetries.length, readRetries, transportPolicy: qaGETTransportPolicy,
  at: new Date().toISOString(),
});

async function verify(phase) {
  const index = phases.indexOf(phase), atLeast = name => index >= phases.indexOf(name);
  const pages = await Promise.all([owner, peer].map(a => get(messages, a)));
  const all = pages[0].messages;
  assert.equal(pages[0].connection.id, m.connectionID); assert.equal(pages[1].connection.id, m.connectionID);
  assert.equal(pages[0].connection.peer.id, peer.id); assert.equal(pages[1].connection.peer.id, owner.id);
  assert(pages.every(p => p.connection.replyLimitUnlocked));
  assert.deepEqual(pages[1].messages, all, 'Both owned accounts must read identical server-backed history.');
  assert(all.every(message => message.connectionId === m.connectionID && [owner.id, peer.id].includes(message.sender.id) && message.type === 'TEXT'));
  for (const [id, body, account] of [[m.seedOwnerMessageID, m.seedOwnerText, owner], [m.seedPeerMessageID, m.seedPeerText, peer]]) {
    const message = all.find(row => row.id === id); assert(message);
    assert.equal(message.body, body); assert.equal(message.sender.id, account.id); assert.equal(message.deletedAt, null);
    assert.equal(message.replyTo, null);
  }
  const extra = all.filter(message => ![m.seedOwnerMessageID, m.seedPeerMessageID].includes(message.id));
  const expected = atLeast('quote-sent') ? 3 : atLeast('peer-replied') ? 2 : atLeast('owner-sent') ? 1 : 0;
  assert.equal(extra.length, expected, 'Drafts, cancelled deletion and local reminders must never create extra messages.');
  const actual = {};
  for (const [key, account, present, deleted] of [
    ['owner', owner, atLeast('owner-sent'), atLeast('messages-cleaned')],
    ['peer', peer, atLeast('peer-replied'), atLeast('peer-reply-deleted')],
    ['quote', owner, atLeast('quote-sent'), atLeast('owner-quote-deleted')],
  ]) {
    if (!present) continue;
    const candidates = extra.filter(message => deleted ? Boolean(message.deletedAt) && message.sender.id === account.id
      && (key === 'quote' ? message.replyTo !== null : message.replyTo === null) : message.body === text[key]);
    assert.equal(candidates.length, 1, 'Each actual message or tombstone must retain a unique owned identity.');
    const message = candidates[0]; actual[key] = message;
    assert.equal(message.sender.id, account.id); assert.equal(Boolean(message.deletedAt), deleted);
    assert.equal(message.body, deleted ? null : text[key]);
    if (key !== 'quote') assert.equal(message.replyTo, null);
  }
  if (actual.quote) assert.equal(actual.quote.replyTo.id, actual.peer.id, 'A real quote must reference the actual peer reply.');
  assert(!all.some(message => message.body === text.unsent), 'The explicitly cancelled private draft must never reach the server.');
  const inboxes = await Promise.all([owner, peer].map(a => get('/api/v1/inbox', a)));
  for (const [i, inbox] of inboxes.entries()) {
    assert.equal(inbox.messageRequests.length, 0); assert.equal(inbox.conversations.length, 1);
    const row = inbox.conversations[0]; assert.equal(row.id, m.connectionID); assert.equal(row.kind, 'DIRECT');
    assert.equal(row.peer.id, i === 0 ? peer.id : owner.id);
    assert.equal(row.pinned, i === 0 && atLeast('owner-pinned') && !atLeast('messages-cleaned'));
    if ((i === 0 && atLeast('history-search-and-participant')) || (i === 1 && atLeast('peer-replied'))) {
      const expectedUnread = i === 1 && ['quote-sent', 'delete-cancelled'].includes(phase) ? 1 : 0;
      assert.equal(row.unreadCount, expectedUnread,
        'Server unread counts track unread non-deleted incoming messages independently of a local reminder.');
    }
  }
  const p = await get('/api/v1/time-polls/' + m.notificationToken, owner);
  assert.equal(planBusiness(p), planBefore, 'Opening or reading a notification must not mutate its cancelled plan.');
  for (const account of [owner, peer]) {
    const [contacts, polls, schedule] = await Promise.all([get('/api/v1/contacts', account), get('/api/v1/time-polls', account),
      get(`/api/v1/home/schedule?windowStart=${encodeURIComponent(new Date(Date.parse(f.createdAt) - 86_400_000).toISOString())}&windowEnd=${encodeURIComponent(new Date(Date.parse(f.createdAt) + 118 * 86_400_000).toISOString())}`, account)]);
    assert.equal(contacts.contacts.length, 1); assert.equal(contacts.contacts[0].connectionId, m.connectionID);
    assert.equal(contacts.contacts[0].peer.id, account.id === owner.id ? peer.id : owner.id);
    assert.equal(polls.polls.length, 1); assert.equal(polls.polls[0].token, m.notificationToken); assert.equal(polls.polls[0].phase, 'CANCELLED');
    assert.equal(schedule.studyEntries.length, 0); assert.equal(schedule.classBlocks.length, 0);
  }
  return { phase, serverMessageCount: all.length, nativeMessages: extra.length, deletedNativeMessages: extra.filter(row => row.deletedAt).length,
    serverPinned: { owner: inboxes[0].conversations[0].pinned, peer: inboxes[1].conversations[0].pinned },
    seedMessagesUnchanged: true, notificationPlanUnchanged: true, noDraftPublished: true,
    localStateVerifiedOnlyByNativeUI: true, at: new Date().toISOString() };
}

try {
  const p = await get('/api/v1/time-polls/' + m.notificationToken, owner);
  assert.equal(p.title, m.notificationTitle); assert.equal(p.location, m.notificationLocation); assert.equal(p.phase, 'CANCELLED'); planBefore = planBusiness(p);
  await report(); const deadline = Date.now() + 30 * 60_000;
  while (Date.now() < deadline) {
    const log = await (async () => { try { assert((await fs.lstat(logPath)).isFile()); return await fs.readFile(logPath, 'utf8'); }
      catch (error) { if (error.code === 'ENOENT') return ''; throw error; } })();
    for (const [, phase] of log.matchAll(/MESSAGES_PHASE ([a-z-]+)/g)) {
      assert(phases.includes(phase)); if (checks.some(check => check.phase === phase)) continue;
      current = phase; assert.equal(phase, phases[checks.length]); const check = await verify(phase); checks.push(check);
      await privateJSON(`phase-${String(checks.length).padStart(2, '0')}-${phase}.json`, check); await report();
      await readBarrier.acknowledge(phase);
      console.log('MESSAGES_GET verified ' + phase);
    }
    assert(!log.includes('** TEST EXECUTE FAILED **') && !/Test Case .*FiveRootMessagesPhoneUITests.* (?:failed|skipped)/i.test(log)
      && !/xcodebuild: error:/.test(log), 'The selected-surface Messages case must not fail or skip.');
    if (log.includes('** TEST EXECUTE SUCCEEDED **')) {
      assert(/Executed 1 test, with 0 failures/.test(log));
      assert(/Test Case .*testOwnedConversationMessagesLocalStateAndCleanup.* passed/.test(log));
      assert(!/\b[1-9][0-9]* skipped\b/.test(log)); assert.equal(checks.length, phases.length);
      readAcknowledgements.push(...Array.from(log.matchAll(/FIVE_ROOT_READ_ACK ([a-z][a-z0-9-]*)/g), match => match[1]));
      assert.deepEqual(readAcknowledgements, phases, 'The actual runner must consume all16 GET acknowledgements exactly in order.');
      completed = true; break;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert(completed, 'Every real Messages stage and one passing selected-surface UI case are required.');
} catch (error) {
  failed = error; await fs.writeFile(path.join(out, 'private-failure.txt'), String(error?.stack), { mode: 0o600 });
  console.error('Messages GET boundary failed; private diagnostics retained.'); process.exitCode = 1;
}
await report();
