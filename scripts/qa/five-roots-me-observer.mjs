// Owned Me acceptance observer. Every network request in this file is GET.
// Factory signup/login and cleanup are separate explicitly authorized commands.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { baseURL, privateDir, readFixture, persist as persistFixture } from './five-roots-live.mjs';
import { fetchQAGet, qaGETTransportPolicy } from './five-roots-get-transport.mjs';
import { createQAReadBarrier } from './five-roots-read-barrier.mjs';

function nativeRunOutcome(log, scenario) {
  const cases = {
    profile: 'test01ProfileAndLanguagesSaveCancelRelaunchAndRestore',
    settings: 'test02PrivacyPreferencesAndSettingsCancelBoundaries',
    account: 'test03LogoutReloginCancelDeletionAndDeleteOwnedAccount',
  };
  const expected = scenario === 'all' ? Object.values(cases) : [cases[scenario]];
  assert(expected.every(Boolean), 'Select the matching native Me scenario.');
  const summaries = [...log.matchAll(/Executed (\d+) tests?, with (?:(\d+) tests? skipped and )?(\d+) failures?/g)]
    .map(match => ({ executed: Number(match[1]), skipped: Number(match[2] ?? 0), failures: Number(match[3]) }));
  if (/\*\* TEST(?: EXECUTE)? FAILED \*\*|Test (?:Case|Suite)[^\r\n]*\b(?:failed|skipped)\b|xcodebuild: error:|\bXCTSkip\b/.test(log)
    || summaries.some(row => row.failures > 0 || row.skipped > 0)) {
    return { terminal: true, passed: false, reason: 'Native Me execution failed or skipped a case.', summaries };
  }
  if (!log.includes('** TEST EXECUTE SUCCEEDED **')) return { terminal: false, passed: false };
  const passed = [...log.matchAll(/Test Case '-\[[^\]\r\n]*\bFiveRootMePhoneUITests ([A-Za-z0-9_]+)\]' passed\b/g)]
    .map(match => match[1]);
  const valid = passed.length === expected.length && new Set(passed).size === expected.length
    && expected.every(name => passed.includes(name)) && summaries.length > 0
    && summaries.every(row => row.executed === expected.length && row.failures === 0 && row.skipped === 0);
  return { terminal: true, passed: valid, expectedCaseCount: expected.length, passedCases: passed, summaries,
    ...(!valid ? { reason: 'The successful Xcode tail must contain every expected case with zero failures and skips.' } : {}) };
}

const [logPath, scenario = 'all'] = process.argv.slice(2);
const evidenceRoot = '/tmp/sideseat-five-roots-private';
assert.equal(process.env.SIDESEAT_ME_EXECUTE, '1', 'Me execution waits for completed Messages acceptance.');
assert.equal(baseURL, 'https://api.sideseat.de');
assert(privateDir.startsWith('/tmp/sideseat-five-roots-me-'), 'Use a fresh dedicated Me factory directory.');
assert(logPath?.startsWith(evidenceRoot + '/me-') && logPath.endsWith('.log'));
const output = process.env.SIDESEAT_QA_OUTPUT;
assert(output?.startsWith(evidenceRoot + '/me-'));
await fs.mkdir(output, { recursive: true, mode: 0o700 });
await fs.chmod(output, 0o700);
const surface = process.env.SIDESEAT_QA_SURFACE;
assert(['simulator', 'physical'].includes(surface), 'Record the actual selected Me test surface.');
const readBarrier = await createQAReadBarrier({ expectedRunnerBundle: 'app.sideseat.fiverootsmeqa.xctrunner', outputDir: output });
const readAcknowledgements = [];
const fixture = await readFixture();
assert.equal(fixture.bundle, 'app.sideseat.mobile.preview');
assert(fixture.accounts.every(a => a.created && a.id && a.accessToken && !a.deleted),
  'Supply fresh pre-authenticated observer bearers; this observer has no login or token-refresh POST fallback.');
const owner = fixture.accounts.find(a => a.role === 'owner');
const peer = fixture.accounts.find(a => a.role === 'peer');
const build = Number(process.env.SIDESEAT_QA_UI_BUILD);
assert(Number.isSafeInteger(build) && build > 0, 'Record the actual frozen Preview build; match the completed preparation below.');
assert(fixture.me?.schemaVersion === 1 && fixture.me.runID === fixture.runID && fixture.me.build === build
  && Number.isFinite(Date.parse(fixture.me.preparedAt)), 'Use this exact completed Me preparation.');
const groups = {
  profile: ['signed-in', 'profile-saved', 'profile-cancelled', 'profile-restored', 'languages-saved', 'languages-cancelled', 'languages-restored'],
  settings: ['privacy-cancelled', 'privacy-saved', 'privacy-restored', 'preferences-restored', 'feedback-cancelled', 'settings-boundaries-returned'],
  account: ['logged-out', 'relogged-in', 'delete-cancelled', 'account-deleted'],
};
assert(scenario === 'all' || Object.hasOwn(groups, scenario), 'Select all, profile, settings or account.');
const phases = scenario === 'all' ? Object.values(groups).flat() : groups[scenario];
const languageTags = ['CHINESE', 'ENGLISH', 'GERMAN', 'FRENCH', 'HINDI', 'SPANISH', 'OTHER'];
const editedName = 'Me QA ' + fixture.runID.slice(0, 6);
const editedBio = '我的资料保存验收 ' + fixture.runID;
const sha = data => createHash('sha256').update(data).digest('hex');
const transportHelperSHA256 = sha(await fs.readFile(new URL('./five-roots-get-transport.mjs', import.meta.url)));
const stable = value => JSON.stringify(value);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [];
const readRetries = [];
let retryLogWrite = Promise.resolve();
let readPhase = 'preflight';
let baselineOwner, baselinePeer, baselineBusiness, addedLanguage, failure, nativeExecution, complete = false;
let ownerFactoryMarkedDeleted = false;

async function get(account, endpoint, expectedStatus = 200) {
  assert(fixture.accounts.includes(account) && account.id && account.accessToken);
  assert(endpoint.startsWith('/api/v1/') && !endpoint.includes('://'));
  const response = await fetchQAGet(baseURL + endpoint, {
    role: account.role, phase: readPhase,
    headers: { Authorization: `Bearer ${account.accessToken}`, 'x-sideseat-platform': 'ios', 'x-sideseat-flexible-timing': '1', 'x-sideseat-persistent-intent': '1',
      'x-sideseat-discovery-matching': '1', 'x-sideseat-capabilities': 'action-coordination-v2', 'x-request-id': randomUUID(), Accept: 'application/json',
      'x-sideseat-app-version': process.env.SIDESEAT_QA_APP_VERSION || '1.0.0',
      'x-sideseat-build': String(build), 'accept-language': 'en' },
    onRetry: record => {
      readRetries.push(record);
      retryLogWrite = retryLogWrite.then(() => fs.writeFile(path.join(output, 'read-retries.private.json'), JSON.stringify(readRetries, null, 2) + '\n', { mode: 0o600 }));
      return retryLogWrite;
    },
  });
  assert.equal(response.status, expectedStatus,
    `Owned GET ${endpoint}: unexpected status; retain the private fixture. No refresh POST is permitted.`);
  if (expectedStatus !== 200) return { status: response.status };
  const body = await response.json();
  assert(body.data, 'The current API GET envelope must contain data.');
  return body.data;
}
function normalize(profile, account) {
  assert.equal(profile.id, account.id); assert.equal(profile.username, account.identifier);
  assert.equal(profile.isGuest, false);
  assert(Array.isArray(profile.languages) && profile.privacy && profile.contacts);
  return {
    nickname: profile.nickname ?? null, tagline: profile.tagline ?? null,
    languages: [...profile.languages].sort((a, b) => a.tag.localeCompare(b.tag)),
    privacy: profile.privacy, contacts: profile.contacts, appearance: profile.appearance,
    school: profile.school, studentStatus: profile.studentStatus, degreeLevel: profile.degreeLevel,
    major: profile.major, semester: profile.semester, graduationYear: profile.graduationYear,
    gender: profile.gender, verifiedStudent: profile.verifiedStudent,
    studentVerificationStatus: profile.studentVerificationStatus, onboardingComplete: profile.onboardingComplete,
    counts: profile.counts,
  };
}
async function business(account) {
  const [contacts, inbox, polls, intents] = await Promise.all(
    ['/api/v1/contacts', '/api/v1/inbox', '/api/v1/time-polls', '/api/v1/me/weekly-intents']
      .map(endpoint => get(account, endpoint)));
  assert(Array.isArray(contacts.contacts) && Array.isArray(inbox.conversations) && Array.isArray(inbox.messageRequests)
    && Array.isArray(polls.polls) && Array.isArray(intents.intents) && Array.isArray(intents.expiredIntents));
  const counts = { contacts: contacts.contacts.length, chats: inbox.conversations.length,
    requests: inbox.messageRequests.length, polls: polls.polls.length,
    intents: intents.intents.length + intents.expiredIntents.length };
  assert(Object.values(counts).every(n => n === 0), 'The fresh Me cohort must contain no social or plan business records.');
  return counts;
}
async function preflight() {
  const [a, p] = await Promise.all([get(owner, '/api/v1/me'), get(peer, '/api/v1/me')]);
  baselineOwner = normalize(a, owner); baselinePeer = normalize(p, peer);
  assert(typeof a.nickname === 'string' && a.nickname.length >= 2 && a.nickname.length <= 32,
    'Prepare the restorable QA nickname before execution.');
  assert(a.languages.length > 0 && a.languages.length < languageTags.length,
    'Prepare at least one baseline language and leave one reversible addition.');
  assert(a.languages.every(row => languageTags.includes(row.tag)));
  addedLanguage = languageTags.find(tag => !a.languages.some(row => row.tag === tag));
  baselineBusiness = await Promise.all(fixture.accounts.map(business));
  await persist(false);
  console.log('ME_GET_OBSERVER_READY: owned baseline captured; no business writes or provider requests performed.');
}
async function verify(phase) {
  readPhase = phase;
  const peerProfile = normalize(await get(peer, '/api/v1/me'), peer);
  assert.equal(stable(peerProfile), stable(baselinePeer), 'The second owned profile must remain completely unchanged.');
  if (phase === 'account-deleted') {
    const oldSession = await get(owner, '/api/v1/me', 401);
    assert.equal(oldSession.status, 401, 'The pre-deletion observer bearer must stop authenticating after UI deletion.');
    await business(peer);
    checks.push({ phase, passed: true, ownerOldBearerStatus: 401, peerUnchanged: true, at: new Date().toISOString() });
    return;
  }
  const actual = normalize(await get(owner, '/api/v1/me'), owner);
  const expected = structuredClone(baselineOwner);
  if (phase === 'profile-saved' || phase === 'profile-cancelled') {
    expected.nickname = editedName; expected.tagline = editedBio;
  }
  if (phase === 'languages-saved' || phase === 'languages-cancelled') {
    expected.languages = [...expected.languages, { tag: addedLanguage, proficiency: 'CONVERSATIONAL' }]
      .sort((a, b) => a.tag.localeCompare(b.tag));
  }
  if (phase === 'privacy-saved') expected.privacy.contactInfoOptIn = !baselineOwner.privacy.contactInfoOptIn;
  assert.equal(stable(actual), stable(expected), `Only this phase's explicitly saved owned profile fields may change (${phase}).`);
  if (['signed-in', 'settings-boundaries-returned', 'delete-cancelled'].includes(phase)) {
    const currentBusiness = await Promise.all(fixture.accounts.map(business));
    assert.equal(stable(currentBusiness), stable(baselineBusiness), 'Me must not create contacts, chats, invitations, polls or intentions.');
  }
  checks.push({ phase, passed: true, ownerProfileSHA256: sha(stable(actual)), peerUnchanged: true, at: new Date().toISOString() });
}
async function persist(done) {
  const proof = {
    kind: 'five-roots-me-get-observer', schemaVersion: 1, scenario, runID: fixture.runID,
    build, complete: done, passed: done && !failure, method: 'GET-only; no login or token refresh fallback',
    phasesExpected: phases, checks, readAcknowledgements, surface, simulator: surface === 'simulator', physicalDevice: surface === 'physical', baselineSHA256: baselineOwner ? sha(stable(baselineOwner)) : null,
    nativeExecution: nativeExecution ?? { terminal: false, passed: false },
    ownerDeletedByUI: checks.some(row => row.phase === 'account-deleted'),
    ownerFactoryMarkedDeleted,
    transportHelperSHA256, readRetryCount: readRetries.length, readRetries, transportPolicy: qaGETTransportPolicy,
    privacy: 'Only owned QA profiles and own empty business collections were fetched. No bearer, password or ordinary identity is written here.',
    limits: [
      'Device-local theme and app-language preferences are verified by native UI and relaunch, not by these API reads.',
      'Feedback is cancelled in native UI; no public feedback listing or ordinary author data is fetched, and no server feedback-count claim is made.',
      'Help browser, membership and notification/provider purchase flows are outside execution beyond the native return/cancel boundary.',
      'No text-size settings entry exists in the current Me page. This test adds no product control.',
    ],
    ...(failure ? { failure } : {}),
  };
  const filename = path.join(output, 'me-get-observer.json');
  await fs.writeFile(filename, JSON.stringify(proof, null, 2) + '\n', { mode: 0o600 });
  await fs.chmod(filename, 0o600);
}
try {
  await preflight();
  const deadline = Date.now() + 30 * 60_000;
  while (!complete && Date.now() < deadline) {
    let text = '';
    try { text = await fs.readFile(logPath, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    nativeExecution = nativeRunOutcome(text, scenario);
    assert(!nativeExecution.terminal || nativeExecution.passed, nativeExecution.reason);
    const seen = [...text.matchAll(/FIVE_ROOT_ME_PHASE ([a-z-]+)/g)].map(match => match[1]);
    assert(seen.every(phase => phases.includes(phase)), 'Unexpected Me phase; use the matching observer scenario and a fresh log.');
    for (let index = checks.length; index < seen.length; index++) {
      assert.equal(seen[index], phases[index], 'Me phases must remain complete and in the intended order.');
      await verify(seen[index]); await persist(false);
      await readBarrier.acknowledge(seen[index]);
      readAcknowledgements.push({ phase: seen[index], acknowledgedAt: new Date().toISOString() }); await persist(false);
      console.log(`ME_GET_PHASE_OK ${seen[index]}`);
    }
    if (nativeExecution.passed) assert.equal(checks.length, phases.length, 'Successful native execution must include all expected Me phases.');
    complete = checks.length === phases.length && nativeExecution.passed;
    if (!complete) await sleep(250);
  }
  assert(complete, 'Timed out before the complete intended Me flow. Do not skip failed phases or patch business records.');
  if (checks.some(row => row.phase === 'account-deleted' && row.ownerOldBearerStatus === 401 && row.peerUnchanged)) {
    assert((scenario === 'all' || scenario === 'account') && nativeExecution.passed);
    // Filesystem bookkeeping only, after real UI success and the old owner's 401.
    // Keep any separately refreshed fixture fields and the entire peer record untouched.
    const latest = await readFixture();
    assert.equal(latest.runID, fixture.runID); assert.equal(latest.baseURL, fixture.baseURL);
    const latestOwner = latest.accounts.find(account => account.role === 'owner');
    const latestPeer = latest.accounts.find(account => account.role === 'peer');
    assert.equal(latestOwner.id, owner.id); assert.equal(latestOwner.identifier, owner.identifier);
    assert.equal(latestPeer.id, peer.id); assert.equal(latestPeer.identifier, peer.identifier);
    const untouchedPeer = stable(latestPeer);
    latestOwner.deleted = true; latestOwner.deletedByUI = true;
    latestOwner.deletedAt = new Date().toISOString(); latestOwner.staleBearer401 = true;
    assert.equal(stable(latestPeer), untouchedPeer);
    await persistFixture(latest);
    ownerFactoryMarkedDeleted = true;
  }
  await persist(true); console.log('ME_GET_OBSERVER_PASSED');
} catch (error) {
  failure = error instanceof Error ? error.message : 'Owned Me observation failed.';
  // Assertion messages above never include response bodies or authentication headers.
  await persist(false);
  console.error('ME_GET_OBSERVER_FAILED: private proof retained.'); process.exitCode = 1;
}
