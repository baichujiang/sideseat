// Passive GET + read-only local DB oracle. Every business mutation belongs to actual App UI.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { baseURL, privateDir, readFixture } from './five-roots-live.mjs';
import { fetchQAGet, qaGETTransportPolicy } from './five-roots-get-transport.mjs';
import { createQAReadBarrier } from './five-roots-read-barrier.mjs';
const helper = '/tmp/sideseat-five-roots-private/messages-terminal252-harness/db.mjs';
const { database, snapshot } = await import(pathToFileURL(helper).href);
const [logPath] = process.argv.slice(2), root = '/tmp/sideseat-five-roots-private';
const out = process.env.SIDESEAT_QA_OUTPUT, appBuild = Number(process.env.SIDESEAT_QA_UI_BUILD || '252');
assert.equal(process.env.SIDESEAT_MESSAGES_TERMINAL_EXECUTE, '1'); assert.equal(process.env.SIDESEAT_QA_SURFACE, 'simulator');
assert.equal(baseURL, 'http://127.0.0.1:3344'); assert.equal(appBuild, 252);
assert(privateDir.startsWith('/tmp/sideseat-five-roots-messages-terminal-'));
assert(typeof logPath === 'string' && path.dirname(logPath) === root && /^messages-terminal-[a-z0-9-]+\.log$/.test(path.basename(logPath)));
assert(typeof out === 'string' && path.dirname(out) === root && /^messages-terminal-[a-z0-9-]+$/.test(path.basename(out)));
await fs.mkdir(out, { mode: 0o700 });
const f = await readFixture(), m = f.terminal, caseKind = process.env.SIDESEAT_MESSAGES_TERMINAL_CASE;
assert(['safety', 'end'].includes(caseKind) && m?.caseKind === caseKind && m.runID === f.runID && m.preparedAt && m.schemaVersion === 1);
assert([m.connectionID, m.seedOwnerMessageID, m.seedPeerMessageID].every(id => /^c[a-z0-9]{20,32}$/.test(id)));
assert.equal(m.remark, 'QA friend ' + f.runID); assert.equal(m.reportDetails, 'Terminal report ' + f.runID);
const [owner, peer] = ['owner', 'peer'].map(role => f.accounts.find(a => a.role === role));
assert(owner?.id && peer?.id && owner.id !== peer.id && owner.accessToken && peer.accessToken);
const phaseSets = {
  safety: ['baseline', 'remark-cancelled', 'remark-saved', 'remark-owner-relaunched', 'remark-peer-isolated', 'remark-cleared',
    'report-cancelled', 'report-sent', 'block-cancelled', 'block-confirmed', 'block-owner-relaunched', 'block-peer-relaunched', 'complete'],
  end: ['baseline', 'end-cancelled', 'end-confirmed', 'end-owner-relaunched', 'end-peer-relaunched', 'complete'],
};
const phases = phaseSets[caseKind], sha = value => createHash('sha256').update(value).digest('hex');
const readBarrier = await createQAReadBarrier({ expectedRunnerBundle: 'app.sideseat.fiverootsmessagesqa.xctrunner', outputDir: out });
const db = database(), checks = [], readAcknowledgements = [], readRetries = [];
let current = 'starting', failed, completed = false;
const privateJSON = (name, value) => fs.writeFile(path.join(out, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
const provenance = { observerSHA256: sha(await fs.readFile(new URL(import.meta.url))), dbHelperSHA256: sha(await fs.readFile(helper)),
  readBarrierHelperSHA256: sha(await fs.readFile(new URL('./five-roots-read-barrier.mjs', import.meta.url))),
  transportHelperSHA256: sha(await fs.readFile(new URL('./five-roots-get-transport.mjs', import.meta.url))) };
async function get(endpoint, account, status = 200) {
  assert([owner, peer].includes(account) && endpoint.startsWith('/api/v1/'));
  const response = await fetchQAGet(baseURL + endpoint, { role: account.role, phase: current,
    headers: { Authorization: `Bearer ${account.accessToken}`, Accept: 'application/json', 'x-sideseat-platform': 'ios',
      'x-sideseat-flexible-timing': '1', 'x-sideseat-persistent-intent': '1', 'x-sideseat-discovery-matching': '1',
      'x-sideseat-app-version': '1.0.0', 'x-sideseat-build': String(appBuild), 'x-sideseat-capabilities': 'action-coordination-v2', 'x-request-id': randomUUID() },
    onRetry: async record => { readRetries.push(record); await privateJSON('read-retries.private.json', readRetries); } });
  assert.equal(response.status, status, 'Passive observation never logs in, retries business errors or advances the user flow.');
  const value = await response.json(); return value.data;
}
const report = () => privateJSON('messages-terminal-real-flow.json', { passed: completed && !failed, selectedCase: caseKind, appBuild, phases, checks,
  readAcknowledgements, runSHA256: sha(f.runID), simulatorUDID: 'AEBD816E-53A7-4012-B76A-FEF82CF02A6B', physicalDeviceTouched: false,
  scope: 'Independent local two-account App UI business flow; passive GET and read-only DB assertions; no production safety/report action or verification bypass.',
  explicitAPIPreconditions: 'One owned accepted contact and two TEXT seed messages only; factory deletion is separate final cleanup.',
  accountCleanupPending: true, completedCases: completed && !failed ? 1 : 0,
  failure: failed ? { phase: current, message: 'Terminal boundary failed; private diagnostics retained.' } : null,
  ...provenance, readRetryCount: readRetries.length, readRetries, transportPolicy: qaGETTransportPolicy, at: new Date().toISOString() });
async function verify(phase) {
  const index = phases.indexOf(phase), atLeast = name => phases.includes(name) && index >= phases.indexOf(name);
  const terminal = caseKind === 'safety' ? atLeast('block-confirmed') : atLeast('end-confirmed');
  const remark = caseKind === 'safety' && atLeast('remark-saved') && !atLeast('remark-cleared') ? m.remark : null;
  const reported = caseKind === 'safety' && atLeast('report-sent');
  const s = await snapshot(db, f);
  assert(s.users.every(u => u.verifiedStudent === false), 'No terminal flow needs a local or production verification bypass.');
  assert.equal(s.connections.length, 1); const c = s.connections[0];
  assert.equal(c.id, m.connectionID); assert.deepEqual([c.userAId, c.userBId].sort(), [owner.id, peer.id].sort());
  assert.equal(c.status, terminal ? (caseKind === 'safety' ? 'BLOCKED' : 'ENDED') : 'ACTIVE');
  assert.equal(c.endedById, terminal ? owner.id : null); assert.equal(Boolean(c.endedAt), terminal);
  assert.equal(c.userAId === owner.id ? c.contactRemarkByA : c.contactRemarkByB, remark);
  assert.equal(c.userAId === peer.id ? c.contactRemarkByA : c.contactRemarkByB, null);
  assert.equal(s.messages.length, 2, 'Reports and safety actions must preserve the exact original messages without creating new ones.');
  for (const [id, body, actor] of [[m.seedOwnerMessageID, m.seedOwnerText, owner], [m.seedPeerMessageID, m.seedPeerText, peer]]) {
    const message = s.messages.find(row => row.id === id); assert(message);
    assert.equal(message.connectionId, m.connectionID); assert.equal(message.senderId, actor.id); assert.equal(message.body, body);
    assert.equal(message.type, 'TEXT'); assert.equal(message.deletedAt, null);
  }
  assert.equal(s.links.length, 1); assert.equal(s.links[0].connectionId, m.connectionID); assert.equal(s.links[0].status, 'ACCEPTED');
  assert.equal(s.reports.length, reported ? 1 : 0, 'Cancellation must not send a report, and Submit must create exactly one.');
  if (reported) {
    const r = s.reports[0]; assert.equal(r.reporterId, owner.id); assert.equal(r.reportedUserId, peer.id);
    assert.equal(r.messageId, m.seedPeerMessageID); assert.equal(r.connectionId, null, 'Native message reports omit connectionId; the message establishes the owned connection.');
    assert.equal(r.reason, 'HARASSMENT'); assert.equal(r.details, m.reportDetails); assert.equal(r.status, 'OPEN');
  }
  assert.equal(s.blocks.length, terminal && caseKind === 'safety' ? 1 : 0);
  if (s.blocks.length) {
    const b = s.blocks[0]; assert.equal(b.blockerId, owner.id); assert.equal(b.blockedId, peer.id); assert.equal(b.connectionId, m.connectionID); assert.equal(b.reason, null);
  }
  for (const account of [owner, peer]) {
    const actions = await get(`/api/v1/connections/${m.connectionID}/actions`, account);
    assert.equal(actions.remark, account === owner ? remark : null); assert.equal(actions.peerId, account === owner ? peer.id : owner.id);
    const [inbox, contacts, blocks] = await Promise.all(['/api/v1/inbox', '/api/v1/contacts', '/api/v1/me/blocks'].map(e => get(e, account)));
    assert.equal(inbox.messageRequests.length, 0); assert.equal(inbox.conversations.length, terminal ? 0 : 1); assert.equal(contacts.contacts.length, terminal ? 0 : 1);
    assert.equal(blocks.blocks.length, terminal && caseKind === 'safety' && account === owner ? 1 : 0);
    if (blocks.blocks.length) assert.equal(blocks.blocks[0].blockedId, peer.id);
    if (!terminal) {
      assert.equal(inbox.conversations[0].id, m.connectionID); assert.equal(inbox.conversations[0].kind, 'DIRECT');
      assert.equal(inbox.conversations[0].displayName, account === owner && remark ? remark : (account === owner ? peer.displayName : owner.displayName));
      assert.equal(contacts.contacts[0].connectionId, m.connectionID); assert.equal(contacts.contacts[0].remark, account === owner ? remark : null);
      const page = await get(`/api/v1/connections/${m.connectionID}/messages?limit=100`, account);
      assert.equal(page.connection.id, m.connectionID); assert.equal(page.messages.length, 2);
      assert.equal(page.connection.displayName, account === owner && remark ? remark : (account === owner ? peer.displayName : owner.displayName));
    } else await get(`/api/v1/connections/${m.connectionID}/messages?limit=100`, account, 404);
  }
  await privateJSON(`phase-${String(index + 1).padStart(2, '0')}-${phase}-db.private.json`, s);
  return { phase, expectedStatus: c.status, activeConversationCountPerActor: terminal ? 0 : 1, exactMessagesRetained: 2,
    reportCount: s.reports.length, directedBlockCount: s.blocks.length, ownerRemarkSaved: Boolean(remark), peerRemarkEmpty: true,
    unrelatedBusinessRowsZero: true, readOnlyDB: true, at: new Date().toISOString() };
}
try {
  await report(); const deadline = Date.now() + 30 * 60_000;
  while (Date.now() < deadline) {
    const log = await fs.readFile(logPath, 'utf8').catch(e => { if (e.code === 'ENOENT') return ''; throw e; });
    for (const [, phase] of log.matchAll(/MESSAGES_TERMINAL_PHASE ([a-z-]+)/g)) {
      assert(phases.includes(phase)); if (checks.some(c => c.phase === phase)) continue;
      current = phase; assert.equal(phase, phases[checks.length]); checks.push(await verify(phase)); await report(); await readBarrier.acknowledge(phase);
      console.log('TERMINAL_GET_DB verified ' + phase);
    }
    assert(!log.includes('** TEST EXECUTE FAILED **') && !/Test Case .*FiveRootMessagesTerminalUITests.* (?:failed|skipped)/i.test(log)
      && !/xcodebuild: error:/.test(log), 'The exact selected native case cannot fail or skip.');
    if (log.includes('** TEST EXECUTE SUCCEEDED **')) {
      assert(/Executed 1 test, with 0 failures/.test(log)); assert.equal(checks.length, phases.length);
      const method = caseKind === 'safety' ? 'testRemarkMessageReportAndBlock' : 'testEndConversationCancelConfirmAndRelogin';
      assert(new RegExp('Test Case .*'+method+'.* passed').test(log));
      readAcknowledgements.push(...Array.from(log.matchAll(/FIVE_ROOT_READ_ACK ([a-z][a-z0-9-]*)/g), m => m[1]));
      assert.deepEqual(readAcknowledgements, phases); completed = true; break;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert(completed, 'Every terminal stage and one actual passing native case are required.');
} catch (error) {
  failed = error; await fs.writeFile(path.join(out, 'private-failure.txt'), String(error?.stack), { mode: 0o600 });
  console.error('Terminal GET/DB boundary failed; private diagnostics retained.'); process.exitCode = 1;
} finally { await db.$disconnect(); }
await report();
