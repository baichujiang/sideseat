// Passive GET plus read-only local DB. Every tested business write belongs to actual native UI.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { baseURL, privateDir, readFixture } from './five-roots-live.mjs';
import { fetchQAGet, qaGETTransportPolicy } from './five-roots-get-transport.mjs';
import { createQAReadBarrier } from './five-roots-read-barrier.mjs';
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
const execute = promisify(execFile);
const { database, snapshot } = await import(pathToFileURL(P + '/db.mjs').href);
const [logPath] = process.argv.slice(2), root = path.dirname(P);
const out = process.env.SIDESEAT_QA_OUTPUT, appBuild = Number(process.env.SIDESEAT_QA_UI_BUILD);
assert.equal(process.env.SIDESEAT_ME_SAFETY_EXECUTE, '1'); assert.equal(process.env.SIDESEAT_QA_SURFACE, 'simulator');
assert.equal(baseURL, 'http://127.0.0.1:3344');
assert.equal(String(appBuild), process.env.SIDESEAT_QA_UI_BUILD); assert.equal(appBuild, expectedBuild);
assert(privateDir.startsWith('/tmp/sideseat-five-roots-me-safety-'));
assert(typeof logPath === 'string' && path.dirname(logPath) === root && /^me-safety-[a-z0-9-]+\.log$/.test(path.basename(logPath)));
assert(typeof out === 'string' && path.dirname(out) === root && /^me-safety-[a-z0-9-]+$/.test(path.basename(out)));
await fs.mkdir(out, { mode: 0o700 });
const f = await readFixture(), m = f.meSafety, caseKind = process.env.SIDESEAT_ME_SAFETY_CASE;
assert(['unblock', 'feedback'].includes(caseKind) && m?.caseKind === caseKind && m.runID === f.runID && m.preparedAt && m.schemaVersion === 1);
assert.equal(m.build, expectedBuild); assert.equal(m.textSizeVariant, textSizeVariant);
const [owner, peer] = ['owner', 'peer'].map(role => f.accounts.find(a => a.role === role));
assert(owner?.id && peer?.id && owner.id !== peer.id && owner.accessToken && peer.accessToken);
const serviceProof = JSON.parse(await fs.readFile(path.join(privateDir, 'local-service-proof.json'), 'utf8'));
assert(Number.isSafeInteger(serviceProof.apiPID) && serviceProof.mailDeliveryConfigured === false && serviceProof.feedbackInboxConfigured === false);
const phaseSets = {
  unblock: ['baseline', 'unblock-cancelled', 'unblock-confirmed', 'owner-relaunched', 'peer-relaunched', 'complete'],
  feedback: ['empty', 'draft-cancelled', 'created', 'creator-reloaded', 'upvoted', 'upvote-removed', 'downvoted',
    'downvote-removed', 'comment-sent', 'peer-reloaded', 'owner-read-comment', 'complete'],
};
const phases = phaseSets[caseKind], sha = b => createHash('sha256').update(b).digest('hex');
const readBarrier = await createQAReadBarrier({ expectedRunnerBundle: 'app.sideseat.fiverootsmeqa.xctrunner', outputDir: out });
const db = database(), checks = [], readAcknowledgements = [], readRetries = [];
let current = 'starting', failed, completed = false;
const privateJSON = (name, value) => fs.writeFile(path.join(out, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
const provenance = { observerSHA256: sha(await fs.readFile(new URL(import.meta.url))), dbHelperSHA256: sha(await fs.readFile(P + '/db.mjs')),
  readBarrierHelperSHA256: sha(await fs.readFile(new URL('./five-roots-read-barrier.mjs', import.meta.url))),
  transportHelperSHA256: sha(await fs.readFile(new URL('./five-roots-get-transport.mjs', import.meta.url))) };
async function get(endpoint, account, status = 200) {
  assert([owner, peer].includes(account) && endpoint.startsWith('/api/v1/'));
  const response = await fetchQAGet(baseURL + endpoint, { role: account.role, phase: current,
    headers: { Authorization: `Bearer ${account.accessToken}`, Accept: 'application/json', 'x-sideseat-platform': 'ios',
      'x-sideseat-flexible-timing': '1', 'x-sideseat-persistent-intent': '1', 'x-sideseat-discovery-matching': '1',
      'x-sideseat-app-version': '1.0.0', 'x-sideseat-build': String(appBuild), 'x-sideseat-capabilities': 'action-coordination-v2', 'x-request-id': randomUUID() },
    onRetry: async record => { readRetries.push(record); await privateJSON('read-retries.private.json', readRetries); } });
  assert.equal(response.status, status, 'Passive reads never refresh auth, retry HTTP failures or advance business state.');
  return (await response.json()).data;
}
const report = () => privateJSON('me-safety-real-flow.json', { passed: completed && !failed, selectedCase: caseKind, textSizeVariant, expectedBuild, appBuild, phases, checks,
  readAcknowledgements, runSHA256: sha(f.runID), simulatorUDID: 'AEBD816E-53A7-4012-B76A-FEF82CF02A6B', physicalDeviceTouched: false,
  scope: 'Independent local owned2 native UI. Feedback mail disabled in the actual listener environment and all persisted email fields remain null.',
  explicitAPIPreconditions: caseKind === 'unblock' ? 'Accepted contact, two TEXT messages and one directed block only.' : 'Fresh owned2 and empty board; no API-created feedback.',
  accountCleanupPending: true, completedCases: completed && !failed ? 1 : 0,
  failure: failed ? { phase: current, message: 'Local MeSafety boundary failed; private diagnostics retained.' } : null,
  ...provenance, readRetryCount: readRetries.length, readRetries, transportPolicy: qaGETTransportPolicy, at: new Date().toISOString() });
const canon = v => JSON.parse(JSON.stringify(v)), byID = xs => canon(xs).sort((a, b) => a.id.localeCompare(b.id));
async function verify(phase) {
  const i = phases.indexOf(phase), atLeast = p => i >= phases.indexOf(p);
  const { stdout } = await execute('python3', [P + '/local_preflight.py', '--expected-pid', String(serviceProof.apiPID)], { timeout: 30_000, maxBuffer: 64 * 1024 });
  const live = JSON.parse(stdout); assert.deepEqual(live, serviceProof, 'Mail-disabled service identity must remain unchanged at every UI barrier.');
  const s = await snapshot(db, f); assert.deepEqual(byID(s.users), byID(m.profileBaseline), 'Me safety actions cannot mutate either profile.');
  const created = caseKind === 'feedback' && atLeast('created'), commented = caseKind === 'feedback' && atLeast('comment-sent');
  const vote = phase === 'upvoted' ? 'UP' : phase === 'downvoted' ? 'DOWN' : null;
  if (caseKind === 'unblock') {
    assert.deepEqual(canon(s.connections), [m.blockedConnectionSnapshot]); assert.equal(s.connections[0].status, 'BLOCKED');
    assert.deepEqual(byID(s.messages), byID(m.seedMessagesSnapshot), 'Original TEXT bytes and IDs must survive unblock and both relogins.');
    assert.deepEqual(canon(s.links), m.friendLinkSnapshot); assert.equal(s.links[0].status, 'ACCEPTED');
    assert.deepEqual(canon(s.blocks), atLeast('unblock-confirmed') ? [] : [m.initialBlockSnapshot]);
    assert.equal(s.posts.length + s.votes.length + s.comments.length, 0);
  } else {
    assert.equal(s.connections.length + s.messages.length + s.links.length + s.blocks.length, 0);
    assert.equal(s.posts.length, created ? 1 : 0); assert.equal(s.votes.length, vote ? 1 : 0); assert.equal(s.comments.length, commented ? 1 : 0);
    if (created) {
      const p = s.posts[0]; assert.equal(p.userId, owner.id); assert.equal(p.topic, 'IDEA'); assert.equal(p.title, m.feedbackTitle); assert.equal(p.message, m.feedbackMessage);
      assert.equal(p.emailSentAt, null); assert.equal(p.emailProviderId, null);
      if (vote) { assert.equal(s.votes[0].feedbackId, p.id); assert.equal(s.votes[0].userId, peer.id); assert.equal(s.votes[0].value, vote); }
      if (commented) { const c = s.comments[0]; assert.equal(c.feedbackId, p.id); assert.equal(c.userId, peer.id); assert.equal(c.body, m.commentBody); assert.equal(c.isOfficial, false); }
    }
  }
  const since = new Date(new Date(m.preparedAt).valueOf() - 86_400_000).toISOString(), until = new Date(new Date(m.preparedAt).valueOf() + 31 * 86_400_000).toISOString();
  for (const account of [owner, peer]) {
    const [me, inbox, contacts, blocks, polls, intents, schedule, board] = await Promise.all([
      '/api/v1/me', '/api/v1/inbox', '/api/v1/contacts', '/api/v1/me/blocks', '/api/v1/time-polls', '/api/v1/me/weekly-intents',
      '/api/v1/home/schedule?windowStart=' + encodeURIComponent(since) + '&windowEnd=' + encodeURIComponent(until), '/api/v1/feedback',
    ].map(e => get(e, account)));
    assert.equal(me.id, account.id); assert.equal(me.username, account.identifier); assert(!me.isGuest && me.onboardingComplete && !me.verifiedStudent);
    assert.equal(inbox.conversations.length + inbox.messageRequests.length + contacts.contacts.length + polls.polls.length
      + intents.intents.length + intents.expiredIntents.length + schedule.studyEntries.length + schedule.classBlocks.length, 0);
    assert.equal(blocks.blocks.length, caseKind === 'unblock' && !atLeast('unblock-confirmed') && account === owner ? 1 : 0);
    if (blocks.blocks.length) { assert.equal(blocks.blocks[0].blockedId, peer.id); assert.equal(blocks.blocks[0].username, peer.identifier);
      assert.equal(blocks.blocks[0].id, m.initialBlockSnapshot.id); assert.equal(blocks.blocks[0].createdAt, m.initialBlockSnapshot.createdAt); }
    if (caseKind === 'unblock') await get('/api/v1/connections/' + m.connectionID + '/messages?limit=100', account, 404);
    assert.equal(board.viewer.isAdmin, false); assert.equal(board.posts.length, created ? 1 : 0);
    if (created) {
      const p = s.posts[0], detail = (await get('/api/v1/feedback/' + p.id, account)).post;
      for (const item of [board.posts[0], detail]) {
        assert.equal(item.id, p.id); assert.equal(item.topic, 'idea'); assert.equal(item.title, m.feedbackTitle); assert.equal(item.message, m.feedbackMessage);
        assert.equal(item.author.id, owner.id); assert.equal(item.author.username, owner.identifier);
        assert.equal(item.up, vote === 'UP' ? 1 : 0); assert.equal(item.down, vote === 'DOWN' ? 1 : 0); assert.equal(item.score, vote === 'UP' ? 1 : vote === 'DOWN' ? -1 : 0);
        assert.equal(item.myVote, account === peer ? vote : null); assert.equal(item.commentCount, commented ? 1 : 0);
      }
      assert.equal(detail.comments.length, commented ? 1 : 0);
      if (commented) { const c = detail.comments[0]; assert.equal(c.id, s.comments[0].id); assert.equal(c.body, m.commentBody); assert.equal(c.isOfficial, false);
        assert.equal(c.author.id, peer.id); assert.equal(c.author.username, peer.identifier); }
    }
  }
  await privateJSON(`phase-${String(i + 1).padStart(2, '0')}-${phase}-db.private.json`, s);
  return { phase, directedBlockCount: s.blocks.length, feedbackPostCount: s.posts.length, voteCount: s.votes.length, commentCount: s.comments.length,
    expectedVote: vote, bothActorsChecked: true, exactOwnedBodiesAndAuthors: true, originalMessagesRetained: caseKind === 'unblock' ? 2 : 0,
    unrelatedRowsZero: true, emailSentAtAndProviderNull: true, actualListenerMailDisabled: true, readOnlyDB: true, at: new Date().toISOString() };
}
try {
  await report(); const deadline = Date.now() + 30 * 60_000;
  while (Date.now() < deadline) {
    const log = await fs.readFile(logPath, 'utf8').catch(e => { if (e.code === 'ENOENT') return ''; throw e; });
    for (const [, phase] of log.matchAll(/ME_SAFETY_PHASE ([a-z-]+)/g)) {
      assert(phases.includes(phase)); if (checks.some(c => c.phase === phase)) continue;
      current = phase; assert.equal(phase, phases[checks.length]); checks.push(await verify(phase)); await report(); await readBarrier.acknowledge(phase);
      console.log('ME_SAFETY_GET_DB verified ' + phase);
    }
    assert(!log.includes('** TEST EXECUTE FAILED **') && !/Test Case .*FiveRootMeSafetyUITests.* (?:failed|skipped)/i.test(log)
      && !/xcodebuild: error:/.test(log), 'The single selected native test cannot fail or skip.');
    if (log.includes('** TEST EXECUTE SUCCEEDED **')) {
      assert(/Executed 1 test, with 0 failures/.test(log)); assert.equal(checks.length, phases.length);
      const method = caseKind === 'unblock' ? 'testUnblockCancelConfirmAndBothAccountsRelaunchWithoutRestoringChat' : 'testOwnedFeedbackCreateVoteUndoCommentAndRelaunchWithMailDisabled';
      assert(new RegExp('Test Case .*' + method + '.* passed').test(log));
      readAcknowledgements.push(...Array.from(log.matchAll(/FIVE_ROOT_READ_ACK ([a-z][a-z0-9-]*)/g), m => m[1]));
      assert.deepEqual(readAcknowledgements, phases); completed = true; break;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert(completed, 'All ordered UI phases, independent reads, nonce ACKs and actual native terminal success are required.');
} catch (error) {
  failed = error; await fs.writeFile(path.join(out, 'private-failure.txt'), String(error?.stack), { mode: 0o600 });
  console.error('MeSafety GET/DB boundary failed; private diagnostics retained.'); process.exitCode = 1;
} finally { await db.$disconnect(); }
await report();
