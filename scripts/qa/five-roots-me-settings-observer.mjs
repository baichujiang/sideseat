// Owned Me Settings oracle. All network calls are GET; tutorial writes belong to actual UI.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { baseURL, privateDir, readFixture } from './five-roots-live.mjs';
import { fetchQAGet, qaGETTransportPolicy } from './five-roots-get-transport.mjs';
import { createQAReadBarrier } from './five-roots-read-barrier.mjs';
const [logPath, scenario] = process.argv.slice(2), root = process.env.SIDESEAT_QA_EVIDENCE_ROOT;
assert(typeof root === 'string' && path.isAbsolute(root) && path.resolve(root) === root, 'Provide the external evidence root explicitly.');
assert.equal(scenario, 'extended'); assert.equal(process.env.SIDESEAT_ME_EXECUTE, '1'); assert.equal(baseURL, 'https://api.sideseat.de');
const build = Number(process.env.SIDESEAT_QA_UI_BUILD), surface = process.env.SIDESEAT_QA_SURFACE, output = process.env.SIDESEAT_QA_OUTPUT;
assert(Number.isSafeInteger(build) && build > 0, 'Provide the exact expected Preview build explicitly.'); assert(['simulator', 'physical'].includes(surface));
assert(path.basename(privateDir).startsWith('sideseat-five-roots-me-') && path.dirname(logPath) === root && path.basename(logPath).startsWith('me-'));
assert(path.dirname(output) === root && path.basename(output).startsWith('me-'));
await fs.mkdir(output, { recursive: true, mode: 0o700 });
const f = await readFixture(), [owner, peer] = ['owner', 'peer'].map(r => f.accounts.find(a => a.role === r));
assert(f.me?.kind === 'me-settings-read-only-preparation' && f.me.build === build && f.me.runID === f.runID);
assert(owner.id !== peer.id && owner.accessToken && peer.accessToken && owner.created && peer.created && !owner.deleted && !peer.deleted);
const barrier = await createQAReadBarrier({ expectedRunnerBundle: 'app.sideseat.fiverootsmeqa.xctrunner', outputDir: output });
const phases = ['baseline', 'about-and-preview', 'system-share-cancelled', 'privacy-returned', 'city-restored', 'notifications-checked',
  'tutorial-closed', 'tutorial-completed', 'membership-cancelled', 'verification-cancelled', 'entries-returned', 'complete'];
const deepStable = x => JSON.stringify(sort(x));
function sort(x) { return Array.isArray(x) ? x.map(sort) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, sort(x[k])])) : x; }
const sha = x => createHash('sha256').update(x).digest('hex'), checks = [], readAcknowledgements = [], retries = [], readAttempts = [];
let phase = 'preflight', failure, finished = false, firstDismissedAt, lastDismissedAt, nativeExecution;
const pause = ms => new Promise(r => setTimeout(r, ms));
async function get(a, route) {
  const response = await fetchQAGet(baseURL + route, { role: a.role, phase, headers: {
    Authorization: `Bearer ${a.accessToken}`, Accept: 'application/json', 'accept-language': 'en',
    'x-sideseat-platform': 'ios', 'x-sideseat-persistent-intent': '1', 'x-sideseat-flexible-timing': '1',
    'x-sideseat-discovery-matching': '1', 'x-sideseat-capabilities': 'action-coordination-v2',
    'x-sideseat-app-version': '1.0.0', 'x-sideseat-build': String(build), 'x-request-id': randomUUID(),
  }, onRetry: async r => { retries.push(r); await save(); } });
  assert.equal(response.status, 200, 'Read-only owned Settings GET must succeed; no auth or progress fallback.');
  const data = (await response.json()).data; assert(data); return data;
}
const withoutTutorial = profile => { const copy = structuredClone(profile); delete copy.productTutorialDismissedAt; return copy; };
async function emptyBusiness(a) {
  const start = new Date(Date.parse(f.createdAt) - 86_400_000).toISOString(), end = new Date(Date.parse(f.createdAt) + 118 * 86_400_000).toISOString();
  const [contacts, inbox, intents, polls, calendar] = await Promise.all(['/api/v1/contacts', '/api/v1/inbox', '/api/v1/me/weekly-intents', '/api/v1/time-polls',
    `/api/v1/home/schedule?windowStart=${encodeURIComponent(start)}&windowEnd=${encodeURIComponent(end)}`].map(x => get(a, x)));
  const arrays = [contacts.contacts, inbox.conversations, inbox.messageRequests, intents.intents, intents.expiredIntents, polls.polls, calendar.studyEntries, calendar.classBlocks];
  assert(arrays.every(x => Array.isArray(x) && x.length === 0), 'Settings cannot create social, plan or calendar business.');
}
async function verify(name) {
  phase = name; const index = phases.indexOf(name);
  const peerProfile = await get(peer, '/api/v1/me'); assert.equal(deepStable(peerProfile), deepStable(f.me.originalProfiles.peer), 'The owned peer profile is unchanged.');
  let current = await get(owner, '/api/v1/me'), attempts = 1;
  if (name === 'tutorial-closed' || name === 'tutorial-completed') {
    const deadline = Date.now() + 15_000;
    const ready = p => Number.isFinite(Date.parse(p.productTutorialDismissedAt))
      && Date.parse(p.productTutorialDismissedAt) >= Date.parse(f.me.preparedAt)
      && (name !== 'tutorial-completed' || Date.parse(p.productTutorialDismissedAt) > Date.parse(firstDismissedAt));
    // The product closes locally before its own POST finishes. Bounded GET polling
    // observes only that existing UI mutation; HTTP failures never receive a retry.
    while (!ready(current) && Date.now() < deadline) { await pause(250); current = await get(owner, '/api/v1/me'); attempts++; }
    assert(ready(current), 'Actual tutorial Close/Done must synchronize its own timestamp.');
    assert(Date.parse(current.productTutorialDismissedAt) <= Date.now() + 5_000);
    if (name === 'tutorial-closed') firstDismissedAt = current.productTutorialDismissedAt;
    lastDismissedAt = current.productTutorialDismissedAt;
  }
  assert.equal(deepStable(withoutTutorial(current)), deepStable(withoutTutorial(f.me.originalProfiles.owner)), 'Only the actual tutorial-dismiss timestamp may change.');
  if (index < phases.indexOf('tutorial-closed')) assert.equal(current.productTutorialDismissedAt, null);
  else assert.equal(current.productTutorialDismissedAt, lastDismissedAt, 'The saved dismissal timestamp must persist across UI boundaries/relogin.');
  if (['baseline', 'entries-returned', 'complete'].includes(name)) await Promise.all([owner, peer].map(emptyBusiness));
  readAttempts.push({ phase: name, ownerProfileGETAttempts: attempts });
  checks.push({ phase: name, passed: true, ownerProfileSHA256: sha(deepStable(current)), peerUnchanged: true,
    tutorialDismissedAt: current.productTutorialDismissedAt, at: new Date().toISOString() });
}
async function save() {
  await fs.writeFile(path.join(output, 'me-get-observer.json'), JSON.stringify({ kind: 'MeSettings-GET-only-oracle', build, scenario, runID: f.runID,
    surface, simulator: surface === 'simulator', physicalDevice: surface === 'physical', phasesExpected: phases, checks, readAcknowledgements,
    passed: finished && !failure, complete: finished, nativeExecution, firstDismissedAt, lastDismissedAt, readAttempts, retries, transportPolicy: qaGETTransportPolicy,
    scope: 'Fresh owned Settings only. No browser/system-provider content read; setup-status Notifications remains untouched. No redemption, email, proof upload, share sending, feedback or course-content mutation.',
    limits: 'City switch only if configured multiple; Notifications OS return only if UI already On/Off. Actual native scope lines retain which branch ran.',
    ...(failure ? { failure } : {}), at: new Date().toISOString(),
  }, null, 2) + '\n', { mode: 0o600 });
}
try {
  assert.equal(deepStable(await get(owner, '/api/v1/me')), deepStable(f.me.originalProfiles.owner));
  assert.equal(deepStable(await get(peer, '/api/v1/me')), deepStable(f.me.originalProfiles.peer));
  const deadline = Date.now() + 30 * 60_000;
  while (!finished && Date.now() < deadline) {
    const text = await fs.readFile(logPath, 'utf8').catch(e => e.code === 'ENOENT' ? '' : Promise.reject(e));
    assert(!/Test Case[^\r\n]*\b(?:failed|skipped)\b|\*\* TEST(?: EXECUTE)? FAILED \*\*|xcodebuild: error:/.test(text), 'The actual native test failed/skipped.');
    const seen = [...text.matchAll(/ME_SETTINGS_PHASE ([a-z-]+)/g)].map(x => x[1]); assert(seen.length <= phases.length);
    for (let i = checks.length; i < seen.length; i++) {
      assert.equal(seen[i], phases[i]); await verify(seen[i]); await save(); await barrier.acknowledge(seen[i]);
      readAcknowledgements.push({ phase: seen[i], at: new Date().toISOString() }); await save();
    }
    if (text.includes('** TEST EXECUTE SUCCEEDED **')) {
      const method = 'testSettingsProviderBoundariesAndTutorialPersistence';
      const passed = [...text.matchAll(/Test Case '-\[[^\]\r\n]*FiveRootMeSettingsUITests ([A-Za-z0-9_]+)\]' passed/g)].map(x => x[1]);
      const summaries = [...text.matchAll(/Executed (\d+) tests?, with (?:(\d+) tests? skipped and )?(\d+) failures?/g)];
      assert.deepEqual(passed, [method]); assert(summaries.length && summaries.every(x => Number(x[1]) === 1 && Number(x[2] ?? 0) === 0 && Number(x[3]) === 0));
      assert.equal(checks.length, phases.length); assert.equal(readAcknowledgements.length, phases.length);
      nativeExecution = { passed: true, executed: 1, skipped: 0, failures: 0 }; finished = true;
    } else await pause(250);
  }
  assert(finished, 'Timed out before every strict Settings boundary and native terminal success.'); await save();
} catch (error) { failure = error instanceof Error ? error.message : 'Settings observation failed'; await save(); process.exitCode = 1; }
