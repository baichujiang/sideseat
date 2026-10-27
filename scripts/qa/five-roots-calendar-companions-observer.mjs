// All business observation uses GET. Authentication/relationship preparation and
// cleanup are separate; ACK writes go only to the owned test runner's sandbox.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { baseURL, privateDir, readFixture } from './five-roots-live.mjs';
import { fetchQAGet, qaGETTransportPolicy } from './five-roots-get-transport.mjs';
import { createQAReadBarrier } from './five-roots-read-barrier.mjs';

assert.equal(process.env.SIDESEAT_CALENDAR_COMPANIONS_EXECUTE, '1', 'Only root-authorized isolated Calendar execution is observed.');
assert.equal(baseURL, 'https://api.sideseat.de');
assert(/^\/tmp\/sideseat-five-roots-calendar-companions-[A-Za-z0-9_-]+$/.test(privateDir));
const [logPath] = process.argv.slice(2), root = '/tmp/sideseat-five-roots-private', output = process.env.SIDESEAT_QA_OUTPUT;
assert(typeof logPath === 'string' && path.dirname(logPath) === root && /^calendar-companions-[A-Za-z0-9_-]+\.log$/.test(path.basename(logPath)));
assert(typeof output === 'string' && path.dirname(output) === root && /^calendar-companions-[A-Za-z0-9_-]+$/.test(path.basename(output)));
await fs.mkdir(output, { recursive: true, mode: 0o700 });
assert((await fs.lstat(output)).isDirectory()); await fs.chmod(output, 0o700);
assert(!(await fs.readdir(output)).includes('calendar-companions-real-flow.json'), 'Do not combine earlier evidence with this continuous case.');
const f = await readFixture(), c = f.calendarCompanions;
assert.equal(f.bundle, 'app.sideseat.mobile.preview');
assert(f.accounts.every(a => a.id && a.accessToken && a.created && !a.deleted));
assert(c?.schemaVersion === 1 && c.runID === f.runID && c.preparedAt && c.baseline && c.initial);
assert(/^c[a-z0-9]{20,32}$/.test(c.connectionID));
assert.equal(c.title, `Companions ${f.runID}`);
assert.deepEqual(c.boundaries, ['connection-created', 'friend-requested', 'friend-accepted']);
assert.equal(c.windowStart, new Date(Date.parse(f.createdAt) - 86_400_000).toISOString());
assert.equal(c.windowEnd, new Date(Date.parse(f.createdAt) + 118 * 86_400_000).toISOString());
const [owner, peer] = ['owner', 'peer'].map(role => f.accounts.find(a => a.role === role));
assert.notEqual(owner.id, peer.id);
const build = Number(process.env.SIDESEAT_QA_UI_BUILD);
assert(Number.isSafeInteger(build) && build > 0, 'Record the actual frozen installed Preview build.');
const readBarrier = await createQAReadBarrier({ expectedRunnerBundle: 'app.sideseat.fiverootscalendaradvancedqa.xctrunner', outputDir: output });
const phases = ['signed-in', 'draft-selected', 'event-created', 'owner-relaunched', 'peer-isolated', 'remove-cancelled',
  'companion-removed', 'removed-relaunched', 'event-deleted', 'cleaned'];
const method = 'testPersonalCompanionsPersistCancelRemoveAndRemainOwnerOnly';
const sha = value => createHash('sha256').update(value).digest('hex');
const transportHelperSHA256 = sha(await fs.readFile(new URL('./five-roots-get-transport.mjs', import.meta.url)));
const observerSHA256 = sha(await fs.readFile(new URL(import.meta.url)));
const checks = [], retries = [];
let anchor, eventID, current = 'starting', complete = false, nativeEnd = false, failure, retryWrite = Promise.resolve();
const privateJSON = (name, value) => fs.writeFile(path.join(output, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
const endpoints = {
  schedule: `/api/v1/home/schedule?windowStart=${encodeURIComponent(c.windowStart)}&windowEnd=${encodeURIComponent(c.windowEnd)}`,
  search: '/api/v1/calendar/search?q=' + encodeURIComponent(c.title),
  messages: `/api/v1/connections/${c.connectionID}/messages?limit=100`,
};
const getPaths = new Set(['/api/v1/me', '/api/v1/contacts', '/api/v1/inbox', '/api/v1/plans', '/api/v1/time-polls',
  '/api/v1/me/weekly-intents', ...Object.values(endpoints)]);
const berlinParts = value => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
  .formatToParts(new Date(value)).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
function atHour(hour) {
  const day = berlinParts(anchor), civil = Date.UTC(day.year, day.month - 1, day.day, hour);
  let instant = civil;
  for (let i = 0; i < 3; i++) {
    const p = berlinParts(instant);
    instant = civil - (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - instant);
  }
  return instant;
}
async function get(account, endpoint) {
  assert(f.accounts.includes(account) && getPaths.has(endpoint), 'Read only this owned cohort and this case\'s closed GET route set.');
  const response = await fetchQAGet(baseURL + endpoint, { role: account.role, phase: current,
    headers: { Authorization: `Bearer ${account.accessToken}`, Accept: 'application/json', 'x-sideseat-platform': 'ios', 'x-sideseat-persistent-intent': '1',
      'x-sideseat-app-version': process.env.SIDESEAT_QA_APP_VERSION || '1.0.0', 'x-sideseat-build': String(build) },
    onRetry: record => {
      retries.push(record); retryWrite = retryWrite.then(() => privateJSON('read-retries.private.json', retries)); return retryWrite;
    } });
  assert.equal(response.status, 200, 'GET verification cannot refresh tokens, repeat HTTP/business failures or patch UI progress.');
  const data = (await response.json()).data; assert(data, 'Expected the current API envelope.'); return data;
}
async function snapshot(account) {
  const [me, contacts, inbox, plans, polls, intents, schedule, search, messages] = await Promise.all(
    ['/api/v1/me', '/api/v1/contacts', '/api/v1/inbox', '/api/v1/plans', '/api/v1/time-polls', '/api/v1/me/weekly-intents',
      endpoints.schedule, endpoints.search, endpoints.messages].map(endpoint => get(account, endpoint)));
  assert.equal(me.id, account.id); assert.equal(me.username, account.identifier);
  assert(Array.isArray(contacts.contacts) && Array.isArray(inbox.conversations) && Array.isArray(inbox.messageRequests)
    && Array.isArray(plans.plans) && Array.isArray(polls.polls) && Array.isArray(intents.intents) && Array.isArray(intents.expiredIntents)
    && Array.isArray(schedule.studyEntries) && Array.isArray(schedule.classBlocks) && Array.isArray(schedule.companionOptions)
    && Array.isArray(schedule.initialCalendarCategories) && Array.isArray(search.results) && Array.isArray(messages.messages));
  return { contacts, inbox, plans, polls, intents, schedule, search, messages,
    profileNotificationSource: { id: me.id, username: me.username, nickname: me.nickname ?? null,
      verifiedStudent: me.verifiedStudent, studentVerificationStatus: me.studentVerificationStatus, usernameUpdatedAt: me.usernameUpdatedAt ?? null } };
}
function verifyBaseline(account, actual) {
  const baseline = c.baseline[account.role], other = account === owner ? peer : owner;
  assert(baseline && c.initial[account.role], 'The actual fresh ownership and post-relationship baselines must be recorded.');
  assert.equal(actual.contacts.contacts.length, 1); assert.equal(actual.contacts.contacts[0].connectionId, c.connectionID);
  assert.equal(actual.contacts.contacts[0].peer.id, other.id);
  assert.equal(actual.inbox.conversations.length, 1); assert.equal(actual.inbox.conversations[0].id, c.connectionID);
  assert.equal(actual.inbox.conversations[0].kind, 'DIRECT'); assert.equal(actual.inbox.conversations[0].peer.id, other.id);
  assert.equal(actual.messages.connection.id, c.connectionID); assert.equal(actual.messages.connection.peer.id, other.id);
  for (const key of ['contacts', 'inbox', 'plans', 'polls', 'intents', 'messages', 'profileNotificationSource']) {
    assert.deepEqual(actual[key], baseline[key], 'Personal companion edits must preserve the actual post-relationship ' + key + ' baseline.');
  }
  assert.equal(actual.plans.plans.length, 0); assert.equal(actual.polls.polls.length, 0);
  assert.equal(actual.inbox.messageRequests.length, 0);
  assert.equal(actual.schedule.companionOptions.length, 1);
  assert.equal(actual.schedule.companionOptions[0].id, other.id); assert.equal(actual.schedule.companionOptions[0].name, other.displayName);
  for (const key of ['classBlocks', 'companionOptions', 'initialCalendarCategories']) {
    assert.deepEqual(actual.schedule[key], baseline.schedule[key], 'The active relationship and built-in Calendar metadata must stay unchanged.');
  }
  assert.equal(actual.schedule.classBlocks.length, 0);
  assert(actual.schedule.initialCalendarCategories.every(row => row.presetKey), 'No custom category is seeded by this case.');
}
async function verify(phase) {
  current = phase;
  const [a, p] = await Promise.all([snapshot(owner), snapshot(peer)]);
  verifyBaseline(owner, a); verifyBaseline(peer, p);
  assert.equal(p.schedule.studyEntries.length, 0); assert.equal(p.search.results.length, 0, 'Companion selection must not create a peer Calendar copy.');
  const index = phases.indexOf(phase);
  const exists = index >= phases.indexOf('event-created') && index < phases.indexOf('event-deleted');
  const selected = exists && index < phases.indexOf('companion-removed');
  assert.equal(a.schedule.studyEntries.length, exists ? 1 : 0); assert.equal(a.search.results.length, exists ? 1 : 0);
  const participants = selected ? [{ userId: peer.id, name: peer.displayName }] : [];
  for (const row of [...a.schedule.studyEntries, ...a.search.results]) {
    assert(eventID, 'Capture the actual UI-created identity before observing the saved row.');
    assert.equal(row.id, eventID); assert.equal(row.title, c.title); assert.equal(row.repeatRule, 'NONE');
    assert.equal(Date.parse(row.startISO), atHour(10));
    assert.equal(Date.parse(row.endISO), atHour(11));
    assert.deepEqual(row.eventParticipants, participants, 'Retain the exact peer ID/name; cancelled changes must not remove it.');
    assert.equal(row.withLabel ?? null, selected ? `With ${peer.displayName}` : null);
    for (const key of ['categoryId', 'location', 'note', 'timePollToken', 'planCommitmentId', 'planConnectionId', 'planRevisionId', 'discoverActivityId']) {
      assert.equal(row[key] ?? null, null, 'This event remains personal without an unrelated category, note, Plan or discovery identity.');
    }
  }
  return { phase, ownerRows: a.schedule.studyEntries.length, ownerSearchRows: a.search.results.length,
    exactOriginalIdentity: exists, exactCompanionCount: participants.length, peerRows: 0, peerSearchRows: 0,
    acceptedContactAndActiveCompanionOptionUnchanged: true, messageAndInboxBaselineUnchanged: true,
    notificationDomainSourcesUnchanged: true, noNewPlansOrInvitations: true, at: new Date().toISOString() };
}
async function report() {
  await privateJSON('calendar-companions-real-flow.json', { passed: complete && !failure, appBuild: build,
    requiredNativeMethod: method, expectedActualTests: 1, phases, checks, runSHA256: sha(f.runID),
    physicalUDID: '00008110-001A69110CC1401E', observerSHA256, transportHelperSHA256,
    transportPolicy: qaGETTransportPolicy, readRetryCount: retries.length, readRetries: retries,
    scope: 'One continuous default14Plus case. All Calendar business writes use physical App UI. GET observer preserves the explicit owned relationship baseline; ACK files write only the owned runner sandbox.',
    notificationScope: 'Native empty notification UI and unchanged plan/time-poll/profile domain sources, not an APNs delivery or OS notification-center audit.',
    smartFillScope: 'Current new-event Smart fill opens empty with parse disabled, then Cancel preserves the10:00–11:00/title draft before draft-selected. No text parsing, AI response, media, voice, permission or Smart fill saving acceptance.',
    prerequisiteScope: 'Fresh two-account factory and one explicit accepted owned ACTIVE direct connection; no seeded Calendar event/message/plan progress.',
    factoryAccountCleanupPending: true, failure: failure ? { phase: current, message: 'Inspect retained private diagnostics; no auth/business mutation fallback.' } : null });
}
try {
  const deadline = Date.now() + 30 * 60_000;
  let processedLines = 0;
  while (Date.now() < deadline) {
    const log = await fs.readFile(logPath, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
    const lines = log.split('\n');
    for (; processedLines < lines.length - 1; processedLines++) {
      const line = lines[processedLines];
      const begin = line.match(/CALENDAR_COMPANIONS_BEGIN (\S+)/);
      if (begin) {
        assert(!anchor && Number.isFinite(Date.parse(begin[1])), 'Exactly one actual UI case may begin.'); anchor = begin[1];
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
          .formatToParts(new Date(anchor)).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
        assert.equal(parts.hour + parts.minute + parts.second, '000000', 'Use the actual Berlin start-of-day anchor.');
        assert(Date.parse(anchor) >= Date.parse(c.windowStart) && Date.parse(anchor) + 86_400_000 < Date.parse(c.windowEnd));
      }
      const identity = line.match(/CALENDAR_COMPANIONS_ID (\S+)/);
      if (identity) { assert(!eventID && /^[A-Za-z0-9_-]{8,120}$/.test(identity[1])); eventID = identity[1]; }
      const phase = line.match(/CALENDAR_COMPANIONS_PHASE (\S+)/);
      if (phase) {
        assert(anchor); assert.equal(phase[1], phases[checks.length], 'Every phase must occur once in strict order.');
        const check = await verify(phase[1]); checks.push(check);
        await privateJSON(`phase-${String(checks.length).padStart(2, '0')}-${phase[1]}.json`, check); await report();
        await readBarrier.acknowledge(phase[1]);
        console.log('CALENDAR_COMPANIONS_GET verified ' + phase[1]);
      }
      if (/CALENDAR_COMPANIONS_END(?:\s|$)/.test(line)) { assert(!nativeEnd); assert.equal(checks.length, phases.length); nativeEnd = true; }
    }
    assert(!log.includes('** TEST EXECUTE FAILED **') && !/Test Case .*FiveRootCalendarCompanionsPhoneUITests.* (?:failed|skipped)/.test(log)
      && !/xcodebuild: error:/.test(log), 'The actual physical case must not fail or skip.');
    if (log.includes('** TEST EXECUTE SUCCEEDED **')) {
      assert(nativeEnd && eventID); assert.equal(checks.length, phases.length);
      assert(/Executed 1 test, with 0 failures/.test(log));
      assert.equal((log.match(/Test Case '-\[.*FiveRootCalendarCompanionsPhoneUITests .*\]' passed/g) ?? []).length, 1);
      assert(log.includes(`FiveRootCalendarCompanionsPhoneUITests ${method}]' passed`));
      assert.deepEqual([...log.matchAll(/FIVE_ROOT_READ_ACK ([a-z][a-z0-9-]*)/g)].map(match => match[1]), phases,
        'Require every actual native ACK exactly once, in the same order as the independent successful GET checks.');
      complete = true; break;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert(complete, 'The one native case and every GET/ACK boundary must actually pass.');
} catch (error) {
  failure = error; await fs.writeFile(path.join(output, 'private-failure.txt'), String(error?.stack), { mode: 0o600 });
  console.error('Calendar Companions verification failed; retain private diagnostics and perform explicit owned cleanup.'); process.exitCode = 1;
}
await report();
