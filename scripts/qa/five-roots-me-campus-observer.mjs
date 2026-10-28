// Passive local evidence only: GET network transport + read-only Prisma; native UI owns business writes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { baseURL, privateDir, readFixture } from './five-roots-live.mjs';
import { fetchQAGet, qaGETTransportPolicy } from './five-roots-get-transport.mjs';
import { createQAReadBarrier } from './five-roots-read-barrier.mjs';
import { specs, localDatabase, normalized, snapshot, hash } from './five-roots-me-campus-prepare.mjs';
const [logPath, selectedCase] = process.argv.slice(2), spec = specs[selectedCase];
assert(spec && process.env.SIDESEAT_ME_CAMPUS_EXECUTE === '1' && process.env.SIDESEAT_ME_CAMPUS_CASE === selectedCase);
assert.equal(baseURL, 'http://127.0.0.1:3344'); assert.equal(process.env.SIDESEAT_QA_SURFACE, 'simulator');
assert(new RegExp('^sideseat-five-roots-me-campus-' + selectedCase + '-[A-Za-z0-9_-]+$').test(path.basename(privateDir)));
const evidenceRoot = process.env.SIDESEAT_QA_EVIDENCE_ROOT;
assert(typeof evidenceRoot === 'string' && path.isAbsolute(evidenceRoot) && path.resolve(evidenceRoot) === evidenceRoot, 'Provide the external evidence root explicitly.');
assert(typeof logPath === 'string' && path.dirname(logPath) === evidenceRoot && path.basename(logPath).startsWith('me-campus-') && logPath.endsWith('.log'));
const output = process.env.SIDESEAT_QA_OUTPUT; assert(typeof output === 'string' && path.dirname(output) === evidenceRoot && path.basename(output).startsWith('me-campus-'));
await fs.mkdir(output, { recursive: true, mode: 0o700 });
const f = await readFixture(), m = f.meCampus, build = Number(process.env.SIDESEAT_QA_UI_BUILD);
assert(Number.isSafeInteger(build) && build > 0 && m?.selectedCase === selectedCase && m.runID === f.runID && m.preparedAt && m.build === build);
assert(Date.now() - Date.parse(m.preparedAt) < 14_400_000 && f.accounts.every(a => a.accessToken && !a.deleted));
const owner = f.accounts.find(a => a.role === 'owner'), peer = f.accounts.find(a => a.role === 'peer');
const db = localDatabase(true), checks = [], readAcknowledgements = [];
const localPreflight = process.env.SIDESEAT_QA_LOCAL_PREFLIGHT;
assert(typeof localPreflight === 'string' && path.isAbsolute(localPreflight), 'Provide the externally reviewed local preflight helper explicitly.');
const serviceProof = JSON.parse(execFileSync('python3', [localPreflight], { encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] }));
const barrier = await createQAReadBarrier({ expectedRunnerBundle: 'app.sideseat.fiverootsmeqa.xctrunner', outputDir: output });
let currentPhase = 'preflight', failure, nativeExecution, complete = false;
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function get(account, endpoint) {
  assert(f.accounts.includes(account) && endpoint.startsWith('/api/v1/') && !endpoint.includes('://'));
  const response = await fetchQAGet(baseURL + endpoint, { role: account.role, phase: currentPhase,
    headers: { Authorization: `Bearer ${account.accessToken}`, Accept: 'application/json', 'x-sideseat-platform': 'ios', 'x-sideseat-flexible-timing': '1',
      'x-sideseat-persistent-intent': '1', 'x-sideseat-discovery-matching': '1', 'x-sideseat-capabilities': 'action-coordination-v2',
      'x-request-id': randomUUID(), 'x-sideseat-app-version': '1.0.0', 'x-sideseat-build': String(build), 'accept-language': 'en' } });
  assert.equal(response.status, 200, 'Passive GET failed; there is no refresh POST or API progress fallback.');
  const envelope = await response.json(); assert(envelope.data); return envelope.data;
}
async function emptySocial(account, state) {
  const [contacts, inbox, polls, intents] = await Promise.all(['/api/v1/contacts', '/api/v1/inbox', '/api/v1/time-polls', '/api/v1/me/weekly-intents'].map(endpoint => get(account, endpoint)));
  // inbox-merge.ts includes every visible active membership, even while native course chat stays gated.
  // inbox-dto.ts maps its row ID directly to course.id; no direct/group chat or messages are created.
  const now = Date.now();
  const memberships = state.memberships.filter(row => row.userId === account.id && row.inboxHiddenAt === null
    && (row.activeUntil === null || row.activeUntil.getTime() >= now));
  if (selectedCase === 'profile') assert.equal(memberships.length, 0, 'Profile-only actors have no course-derived inbox rows.');
  const expected = memberships.map(membership => {
    const course = state.courses.find(row => row.id === membership.courseId);
    assert(course && course.submittedById === owner.id && account.id === owner.id,
      'Only this exact owned active course membership may derive an inbox row; peer has none.');
    assert.equal(membership.inboxPinnedAt, null, 'The campus flow never pins a course chat.');
    const code = course.code?.trim();
    return { kind: 'COURSE', id: course.id, displayName: code ? code + ' · ' + course.name : course.name,
      avatarUrl: null, participantAvatars: [], unreadCount: 0, pinned: false,
      lastActivityAt: membership.updatedAt.toISOString(), peer: null, isSelfNotes: false,
      course: { id: course.id, name: course.name, code: course.code, school: course.school, semesterLabel: course.semesterLabel },
      group: null, lastMessage: null };
  });
  assert(Array.isArray(inbox.conversations));
  assert.deepEqual([...inbox.conversations].sort((a, b) => a.id.localeCompare(b.id)), expected.sort((a, b) => a.id.localeCompare(b.id)),
    'Inbox must contain exactly the current owned COURSE projections, with no unknown IDs, direct/group chats, messages or unread state.');
  assert.equal(inbox.unreadTotal, 0, 'Derived course rows have no messages or unread count.');
  const rows = [contacts.contacts, inbox.messageRequests, polls.polls, intents.intents, intents.expiredIntents];
  assert(rows.every(value => Array.isArray(value) && value.length === 0), 'Campus tests must not silently create social or planning business.');
}
async function schedule(account) {
  const start = new Date(Date.parse(f.createdAt) - 86_400_000).toISOString(), end = new Date(Date.parse(f.createdAt) + 21 * 86_400_000).toISOString();
  const value = await get(account, `/api/v1/home/schedule?windowStart=${encodeURIComponent(start)}&windowEnd=${encodeURIComponent(end)}`);
  assert(Array.isArray(value.classBlocks) && Array.isArray(value.studyEntries) && value.studyEntries.length === 0); return value;
}
function expectedProfile(phase) {
  const expected = structuredClone(m.seededProfiles.owner), index = spec.phases.indexOf(phase), at = value => index >= spec.phases.indexOf(value);
  if (at('student-saved')) Object.assign(expected, { gender: 'FEMALE', school: 'LMU', studentStatus: 'EXCHANGE_STUDENT', degreeLevel: 'MASTER', major: 'QA Major ' + f.runID, semester: 3, graduationYear: null,
    contacts: Object.fromEntries(['wechat', 'whatsapp', 'telegram', 'instagram'].map(k => [k + 'Handle', 'qa_' + k + '_' + f.runID])) });
  if (at('alumni-saved')) Object.assign(expected, { studentStatus: 'ALUMNI', semester: null, graduationYear: m.alumniYear });
  if (at('fields-cleared')) Object.assign(expected, { gender: 'PRIVATE', school: 'TUM', studentStatus: 'CURRENT_STUDENT', degreeLevel: 'OTHER', major: null, semester: 1, graduationYear: null,
    contacts: { wechatHandle: null, whatsappHandle: null, telegramHandle: null, instagramHandle: null } });
  if (at('avatar-saved') && !at('avatar-restored')) expected.avatarUrl = 'p02';
  if (at('privacy-saved') && !at('privacy-restored')) Object.assign(expected.privacy, { hideFromDiscovery: true, hideFromCourseMembers: true });
  if (at('appearance-saved') && !at('appearance-restored')) Object.assign(expected.appearance, { theme: 'rose', icon: 'sun' });
  return expected;
}
async function verifyCourses(phase, state) {
  const index = spec.phases.indexOf(phase), at = value => index >= spec.phases.indexOf(value);
  const manual = state.courses.filter(c => c.name === m.manualName && c.submittedById === owner.id);
  assert.equal(manual.length, at('manual-created') ? 1 : 0, 'Manual cancel must create nothing; manual UI save creates exactly one owned catalog row.');
  const ids = [m.seedCourseID, m.archiveCourseID, ...manual.map(c => c.id)];
  assert(state.memberships.every(row => ids.includes(row.courseId)) && state.saved.every(row => ids.includes(row.courseId)));
  const seedActive = at('seed-restored') && !at('seed-left'), seedExpired = !at('seed-restored');
  const manualActive = at('manual-created') && !at('manual-left'), archiveExists = !at('archive-removed');
  const expectedMemberships = (seedActive || seedExpired ? 1 : 0) + (manualActive ? 1 : 0) + (archiveExists ? 1 : 0);
  assert.equal(state.memberships.length, expectedMemberships);
  const seedMembership = state.memberships.find(row => row.courseId === m.seedCourseID);
  if (seedActive || seedExpired) assert(seedMembership && (seedMembership.activeUntil > new Date()) === seedActive);
  const timetable = at('timetable-applied') && !at('seed-left');
  assert.equal(state.memberships.flatMap(row => row.sessions).length, timetable ? 1 : 0);
  if (timetable) {
    const session = seedMembership.sessions[0]; assert.equal(session.weekday, 'MON'); assert.equal(session.startMinute, 540); assert.equal(session.endMinute, 600); assert.equal(session.location, m.location);
  }
  const saved = at('bookmark-saved') && !at('bookmark-removed'); assert.equal(state.saved.length, saved ? 1 : 0);
  if (saved) assert.equal(state.saved[0].courseId, manual[0].id);
  const lists = {};
  for (const scope of ['enrolled', 'archived', 'saved']) lists[scope] = await get(owner, '/api/v1/courses?scope=' + scope + '&limit=30');
  const expectedEnrolled = [seedActive ? m.seedCourseID : null, manualActive ? manual[0].id : null].filter(Boolean).sort();
  const expectedArchived = [seedExpired ? m.seedCourseID : null, archiveExists ? m.archiveCourseID : null].filter(Boolean).sort();
  assert.deepEqual(lists.enrolled.courses.map(c => c.id).sort(), expectedEnrolled);
  assert.deepEqual(lists.archived.courses.map(c => c.id).sort(), expectedArchived);
  assert.deepEqual(lists.saved.courses.map(c => c.id).sort(), saved ? [manual[0].id] : []);
  for (const id of ids) {
    const detail = await get(owner, '/api/v1/courses/' + id), expectedActive = expectedEnrolled.includes(id);
    assert.equal(detail.course.id, id); assert.equal(detail.course.viewer.enrolled, expectedActive); assert.equal(Boolean(detail.membership), expectedActive);
    assert.equal(detail.course.viewer.saved, saved && id === manual[0].id);
    assert.equal(detail.membership?.sessions.length || 0, id === m.seedCourseID && timetable ? 1 : 0);
    if (id === m.seedCourseID) assert(detail.officialScheduleVariants.length === 1 && detail.officialScheduleVariants[0].fingerprint === m.variantFingerprint);
    else assert.equal(detail.officialScheduleVariants.length, 0, 'Manual creation cannot invent an official timetable.');
    assert.equal(detail.members.length, 0);
  }
  const [home, peerHome] = await Promise.all([schedule(owner), schedule(peer)]);
  assert.equal(home.classBlocks.length, timetable ? 1 : 0); assert.equal(peerHome.classBlocks.length, 0);
  if (timetable) {
    const block = home.classBlocks[0]; assert.equal(block.courseId, m.seedCourseID); assert.equal(block.weekday, 'MON'); assert.equal(block.startMinute, 540); assert.equal(block.endMinute, 600); assert.equal(block.location, m.location);
  }
  for (const scope of ['enrolled', 'archived', 'saved']) assert.equal((await get(peer, '/api/v1/courses?scope=' + scope + '&limit=30')).courses.length, 0);
  return { manualCreatedViaUI: at('manual-created'), activeCourses: expectedEnrolled.length, archivedCourses: expectedArchived.length,
    savedCourses: saved ? 1 : 0, actualHomeClassBlocks: home.classBlocks.length, peerClasses: 0, manualHasInventedSessions: false };
}
async function verify(phase) {
  currentPhase = phase;
  assert.deepEqual(JSON.parse(execFileSync('python3', [localPreflight, '--expected-pid', String(serviceProof.apiPID)], { encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] })), serviceProof, 'Root local service identity and actual mail-disabled proof must remain stable.');
  const state = await snapshot(db, f), profiles = {};
  for (const account of f.accounts) { profiles[account.role] = normalized(await get(account, '/api/v1/me'), account); await emptySocial(account, state); }
  assert.deepEqual(profiles.peer, m.seededProfiles.peer, 'The second owned actor must remain unchanged at every phase.');
  let detail;
  if (selectedCase === 'profile') {
    assert.deepEqual(profiles.owner, expectedProfile(phase), 'GET must match every expected edited/cleared/restored field, including avatarUrl.');
    assert.equal(state.memberships.length + state.saved.length, 0); assert.equal(hash(state.courses), m.catalogBaselineSHA256);
    for (const a of f.accounts) assert.equal((await schedule(a)).classBlocks.length, 0);
    detail = { expectedProfileSHA256: hash(expectedProfile(phase)), actualProfileSHA256: hash(profiles.owner), avatarUrlIncluded: true, peerUnchanged: true, businessRows: 0 };
  } else {
    assert.deepEqual(profiles.owner, m.seededProfiles.owner); detail = await verifyCourses(phase, state);
  }
  checks.push({ phase, passed: true, ...detail, readOnlyDatabase: true, at: new Date().toISOString() });
}
function nativeOutcome(text) {
  const summaries = [...text.matchAll(/Executed (\d+) tests?, with (?:(\d+) tests? skipped and )?(\d+) failures?/g)].map(m => ({ executed: +m[1], skipped: +(m[2] || 0), failures: +m[3] }));
  if (/\*\* TEST(?: EXECUTE)? FAILED \*\*|Test (?:Case|Suite)[^\r\n]*\b(?:failed|skipped)\b|xcodebuild: error:|\bXCTSkip\b/.test(text) || summaries.some(s => s.skipped || s.failures)) return { terminal: true, passed: false };
  if (!text.includes('** TEST EXECUTE SUCCEEDED **')) return { terminal: false, passed: false };
  const passed = [...text.matchAll(/Test Case '-\[[^\]\r\n]*\bFiveRootMeCampusUITests ([A-Za-z0-9_]+)\]' passed\b/g)].map(m => m[1]);
  return { terminal: true, passed: passed.length === 1 && passed[0] === spec.method && summaries.length > 0 && summaries.every(s => s.executed === 1 && !s.skipped && !s.failures), passedCases: passed, summaries };
}
async function persist(passed) {
  await fs.writeFile(output + '/me-campus-flow.json', JSON.stringify({ kind: 'me-campus-local-get-and-readonly-db', selectedCase, appBuild: build, passed,
    phases: spec.phases, checks, readAcknowledgements, nativeExecution, failure, transportPolicy: qaGETTransportPolicy,
    setupScope: m.prerequisiteScope, localServiceProof: serviceProof, simulatorOnly: true, physicalDeviceTouched: false,
    excludedClaims: ['ordinary photo access/upload', 'verification email/proof upload', 'AI screenshot import success', 'course group chat gate'], at: new Date().toISOString() }, null, 2) + '\n', { mode: 0o600 });
}
try {
  await snapshot(db, f); console.log('ME_CAMPUS_GET_OBSERVER_READY');
  const deadline = Date.now() + 3_000_000;
  while (Date.now() < deadline && !complete) {
    const text = await fs.readFile(logPath, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
    nativeExecution = nativeOutcome(text); assert(!(nativeExecution.terminal && !nativeExecution.passed), 'Native test failed or skipped; retain proof without fallback.');
    const all = [...text.matchAll(/ME_CAMPUS_PHASE (profile|courses) ([a-z0-9-]+)/g)];
    assert(all.every(match => match[1] === selectedCase)); const seen = all.map(match => match[2]);
    assert(seen.length <= spec.phases.length && seen.every((phase, i) => phase === spec.phases[i]), 'Nonce ACK phases must be strictly ordered and unique.');
    for (let i = checks.length; i < seen.length; i++) {
      await verify(seen[i]); await persist(false); await barrier.acknowledge(seen[i]);
      readAcknowledgements.push({ phase: seen[i], at: new Date().toISOString() }); await persist(false); console.log('ME_CAMPUS_GET_PHASE_OK ' + seen[i]);
    }
    complete = checks.length === spec.phases.length && nativeExecution.passed;
    if (!complete) await sleep(250);
  }
  assert(complete, 'The complete intended one-case flow must pass all native / GET / read-only DB / nonce ACK stages.');
  await persist(true); console.log('ME_CAMPUS_GET_OBSERVER_PASSED');
} catch (error) {
  failure = error instanceof Error ? error.message : 'Campus observation failed.'; await persist(false);
  console.error('ME_CAMPUS_GET_OBSERVER_FAILED: private evidence retained.'); process.exitCode = 1;
} finally { await db.$disconnect(); }
