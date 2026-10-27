// Only GET observes business state. Real parse/batch-save/delete are native UI
// actions; ACK writes are limited to the explicitly owned XCTest runner sandbox.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { baseURL, privateDir, readFixture } from './five-roots-live.mjs';
import { fetchQAGet, qaGETTransportPolicy } from './five-roots-get-transport.mjs';
import { createQAReadBarrier } from './five-roots-read-barrier.mjs';

assert.equal(process.env.SIDESEAT_CALENDAR_SMART_EXECUTE, '1', 'Root must authorize the isolated Smart fill case.');
assert.equal(baseURL, 'https://api.sideseat.de');
assert(/^\/tmp\/sideseat-five-roots-calendar-smart-[A-Za-z0-9_-]+$/.test(privateDir));
const [logPath] = process.argv.slice(2), root = '/tmp/sideseat-five-roots-private', output = process.env.SIDESEAT_QA_OUTPUT;
assert(typeof logPath === 'string' && path.dirname(logPath) === root && /^calendar-smart-[A-Za-z0-9_-]+\.log$/.test(path.basename(logPath)));
assert(typeof output === 'string' && path.dirname(output) === root && /^calendar-smart-[A-Za-z0-9_-]+$/.test(path.basename(output)));
await fs.mkdir(output, { recursive: true, mode: 0o700 });
assert((await fs.lstat(output)).isDirectory()); await fs.chmod(output, 0o700);
assert(!(await fs.readdir(output)).includes('calendar-smart-real-flow.json'), 'Retain each continuous run separately.');
const f = await readFixture(), title = `Smart ${f.runID}`;
assert.equal(f.bundle, 'app.sideseat.mobile.preview');
assert(f.preparedAt && f.accounts.every(a => a.id && a.accessToken && a.created && !a.deleted));
assert(!f.calendarCompanions && !f.messages && !f.me, 'Use an auth-only fresh cohort without relationship or event preparation.');
for (const account of f.accounts) {
  const initial = f.inventory?.[account.role];
  assert(initial && ['calendar', 'polls', 'contacts', 'conversations', 'messageRequests', 'intentions'].every(key => initial[key]?.length === 0)
    && initial.classCount === 0, 'Both account factory inventories must start empty.');
}
const [owner, peer] = ['owner', 'peer'].map(role => f.accounts.find(a => a.role === role));
assert.notEqual(owner.id, peer.id);
const build = Number(process.env.SIDESEAT_QA_UI_BUILD);
assert(Number.isSafeInteger(build) && build > 0, 'Record the frozen installed Preview build.');
const barrier = await createQAReadBarrier({ expectedRunnerBundle: 'app.sideseat.fiverootscalendarqa.xctrunner', outputDir: output });
const phases = ['signed-in', 'input-ready', 'preview-ready', 'draft-applied', 'event-created', 'owner-relaunched', 'peer-isolated', 'event-deleted', 'cleaned'];
const method = 'testSingleTextParseReviewApplySaveRelaunchDeleteAndPeerIsolation';
const sha = value => createHash('sha256').update(value).digest('hex');
const observerSHA256 = sha(await fs.readFile(new URL(import.meta.url)));
const transportHelperSHA256 = sha(await fs.readFile(new URL('./five-roots-get-transport.mjs', import.meta.url)));
const checks = [], retries = [], baseline = new Map();
let expected, eventID, savedRow, current = 'starting', complete = false, nativeEnd = false, failure, retryWrite = Promise.resolve();
const privateJSON = (name, value) => fs.writeFile(path.join(output, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
const parts = value => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
  .formatToParts(new Date(value)).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
const dateKey = p => `${p.year}-${p.month}-${p.day}`;
const windowStart = new Date(Date.parse(f.createdAt) - 86_400_000).toISOString();
const windowEnd = new Date(Date.parse(f.createdAt) + 118 * 86_400_000).toISOString();
const schedulePath = `/api/v1/home/schedule?windowStart=${encodeURIComponent(windowStart)}&windowEnd=${encodeURIComponent(windowEnd)}`;
// The whole run-unique suffix search also detects duplicate/misnamed parsed rows.
const searchPath = '/api/v1/calendar/search?q=' + encodeURIComponent(f.runID);
const routes = ['/api/v1/me', '/api/v1/contacts', '/api/v1/inbox', '/api/v1/plans', '/api/v1/time-polls',
  '/api/v1/me/weekly-intents', schedulePath, searchPath];
async function get(account, endpoint) {
  assert(f.accounts.includes(account) && routes.includes(endpoint), 'Only the owned cohort and the closed GET route set are allowed.');
  const response = await fetchQAGet(baseURL + endpoint, { role: account.role, phase: current,
    headers: { Authorization: `Bearer ${account.accessToken}`, Accept: 'application/json', 'x-sideseat-platform': 'ios', 'x-sideseat-persistent-intent': '1',
      'x-sideseat-app-version': process.env.SIDESEAT_QA_APP_VERSION || '1.0.0', 'x-sideseat-build': String(build) },
    onRetry: record => {
      retries.push(record); retryWrite = retryWrite.then(() => privateJSON('read-retries.private.json', retries)); return retryWrite;
    } });
  assert.equal(response.status, 200, 'A failed GET cannot refresh auth, repeat HTTP/business errors or patch UI progress.');
  const data = (await response.json()).data; assert(data, 'Require the current API envelope.'); return data;
}
async function snapshot(account) {
  const [me, contacts, inbox, plans, polls, intents, schedule, search] = await Promise.all(routes.map(route => get(account, route)));
  assert.equal(me.id, account.id); assert.equal(me.username, account.identifier);
  assert(Array.isArray(contacts.contacts) && Array.isArray(inbox.conversations) && Array.isArray(inbox.messageRequests)
    && Array.isArray(plans.plans) && Array.isArray(polls.polls) && Array.isArray(intents.intents) && Array.isArray(intents.expiredIntents)
    && Array.isArray(schedule.studyEntries) && Array.isArray(schedule.classBlocks) && Array.isArray(schedule.companionOptions)
    && Array.isArray(schedule.initialCalendarCategories) && Array.isArray(search.results));
  return { contacts, inbox, plans, polls, intents, schedule, search,
    profileNotificationSource: { id: me.id, username: me.username, nickname: me.nickname ?? null,
      verifiedStudent: me.verifiedStudent, studentVerificationStatus: me.studentVerificationStatus, usernameUpdatedAt: me.usernameUpdatedAt ?? null } };
}
function preserve(account, actual) {
  assert.equal(actual.contacts.contacts.length, 0); assert.equal(actual.inbox.conversations.length, 0);
  assert.equal(actual.inbox.messageRequests.length, 0); assert.equal(actual.plans.plans.length, 0); assert.equal(actual.polls.polls.length, 0);
  assert.equal(actual.intents.intents.length, 0); assert.equal(actual.intents.expiredIntents.length, 0);
  assert.equal(actual.schedule.classBlocks.length, 0); assert.equal(actual.schedule.companionOptions.length, 0);
  assert(actual.schedule.initialCalendarCategories.every(row => row.presetKey), 'Smart fill must not seed custom calendars.');
  const stable = { contacts: actual.contacts, inbox: actual.inbox, plans: actual.plans, polls: actual.polls,
    intents: actual.intents, profileNotificationSource: actual.profileNotificationSource,
    calendarMetadata: { classBlocks: actual.schedule.classBlocks, companionOptions: actual.schedule.companionOptions,
      initialCalendarCategories: actual.schedule.initialCalendarCategories } };
  if (!baseline.has(account.role)) baseline.set(account.role, stable);
  assert.deepEqual(stable, baseline.get(account.role), 'Calendar Smart fill must preserve initial account, notification-domain, relationship and built-in metadata sources.');
}
const normalized = row => ({ id: row.id, title: row.title, location: row.location, note: row.note,
  startISO: row.startISO, endISO: row.endISO, repeatRule: row.repeatRule, repeatUntilISO: row.repeatUntilISO ?? null,
  categoryId: row.categoryId ?? null, categoryName: row.categoryName ?? null, categoryColor: row.categoryColor ?? null,
  eventParticipants: row.eventParticipants, withLabel: row.withLabel ?? null });
async function verify(phase) {
  current = phase;
  const [a, p] = await Promise.all([snapshot(owner), snapshot(peer)]);
  preserve(owner, a); preserve(peer, p);
  assert.equal(p.schedule.studyEntries.length, 0); assert.equal(p.search.results.length, 0, 'A personal event never creates a peer copy.');
  const index = phases.indexOf(phase), exists = index >= phases.indexOf('event-created') && index < phases.indexOf('event-deleted');
  assert.equal(a.schedule.studyEntries.length, exists ? 1 : 0); assert.equal(a.search.results.length, exists ? 1 : 0);
  if (exists) {
    assert(eventID, 'Capture the real UI-created identity before a saved boundary.');
    for (const row of [...a.schedule.studyEntries, ...a.search.results]) {
      assert.equal(row.id, eventID); assert.equal(row.title, title); assert.equal(row.location, 'QA图书馆'); assert.equal(row.note, '自动填写验证');
      assert.equal(Date.parse(row.startISO), Date.parse(expected.start)); assert.equal(Date.parse(row.endISO), Date.parse(expected.end));
      assert.equal(row.repeatRule, 'NONE'); assert.equal(row.repeatUntilISO ?? null, null);
      assert.deepEqual(row.eventParticipants, []); assert.equal(row.withLabel ?? null, null);
      for (const key of ['timePollToken', 'planCommitmentId', 'planConnectionId', 'planRevisionId', 'discoverActivityId']) assert.equal(row[key] ?? null, null);
      if (row.categoryId) {
        const category = a.schedule.initialCalendarCategories.find(c => c.id === row.categoryId);
        assert(category && category.presetKey, 'An optional parsed category must be an existing built-in, without a custom seeded calendar.');
        assert.equal(row.categoryName, category.name); assert.equal(row.categoryColor, category.color);
      }
      const value = normalized(row);
      savedRow ??= value;
      assert.deepEqual(value, savedRow, 'Calendar/search/relogin must retain the same precise identity, content, timing and original category.');
    }
  }
  return { phase, ownerCalendarRows: a.schedule.studyEntries.length, ownerSearchRows: a.search.results.length,
    sameOriginalIdentityAndExactSuppliedFields: exists, peerCalendarRows: 0, peerSearchRows: 0,
    draftOnlyBeforeAddEvents: index < phases.indexOf('event-created'), unchangedDomainSources: true,
    noPlanChatInvitationOrPeerCopy: true, at: new Date().toISOString() };
}
async function report() {
  await privateJSON('calendar-smart-real-flow.json', { passed: complete && !failure, appBuild: build, runSHA256: sha(f.runID),
    requiredNativeMethod: method, expectedActualTests: 1, phases, checks, observerSHA256, transportHelperSHA256,
    physicalUDID: '00008110-001A69110CC1401E', transportPolicy: qaGETTransportPolicy, readRetryCount: retries.length, readRetries: retries,
    scope: 'One continuous physical App text parse, exact parsed draft review, Apply without persistence, Add 1 events batch-save, timeline/search/relogin, UI delete and both-role zero readback. All business writes use UI; observer is GET-only.',
    parseScope: 'Exactly one real UI parse attempt. No stubs, retries, API parse call or field correction to pass. Native/server basic fallback cannot meet the supplied exact title/location/note assertions. This is user-visible parse-result acceptance, not a provider-telemetry audit.',
    notificationScope: 'Native empty notification UI and unchanged plan/time-poll/profile sources; no APNs or OS notification-center audit.',
    excluded: ['voice', 'image', 'media permissions', 'external calendars', 'payments', 'multiple parsed events', 'recurrence'],
    factoryAccountCleanupPending: true, failure: failure ? { phase: current, message: 'Inspect private diagnostics; no business/auth mutation fallback.' } : null });
}
try {
  const deadline = Date.now() + 30 * 60_000;
  let processedLines = 0;
  while (Date.now() < deadline) {
    const log = await fs.readFile(logPath, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
    const lines = log.split('\n');
    for (; processedLines < lines.length - 1; processedLines++) {
      const line = lines[processedLines], begin = line.match(/CALENDAR_SMART_BEGIN (\S+) (\S+) (\S+)/);
      if (begin) {
        assert(!expected && /^\d{4}-\d{2}-\d{2}$/.test(begin[1]));
        expected = { date: begin[1], start: begin[2], end: begin[3] };
        const start = parts(expected.start), end = parts(expected.end);
        assert.equal(dateKey(start), expected.date); assert.equal(dateKey(end), expected.date);
        assert.equal(start.hour + start.minute + start.second, '100000'); assert.equal(end.hour + end.minute + end.second, '110000');
        assert.equal(Date.parse(expected.end) - Date.parse(expected.start), 3_600_000);
        assert(Date.parse(expected.start) > Date.now() && Date.parse(expected.start) >= Date.parse(windowStart)
          && Date.parse(expected.end) < Date.parse(windowEnd), 'The declared explicit Berlin event must be future and inside the owned bounded schedule.');
      }
      const identity = line.match(/CALENDAR_SMART_ID (\S+)/);
      if (identity) { assert(!eventID && /^[A-Za-z0-9_-]{8,120}$/.test(identity[1])); eventID = identity[1]; }
      const phase = line.match(/CALENDAR_SMART_PHASE (\S+)/);
      if (phase) {
        assert(expected); assert.equal(phase[1], phases[checks.length], 'Every boundary must occur exactly once in order.');
        const check = await verify(phase[1]); checks.push(check);
        await privateJSON(`phase-${String(checks.length).padStart(2, '0')}-${phase[1]}.json`, check); await report();
        await barrier.acknowledge(phase[1]); console.log('CALENDAR_SMART_GET verified ' + phase[1]);
      }
      if (/CALENDAR_SMART_END(?:\s|$)/.test(line)) { assert(!nativeEnd); assert.equal(checks.length, phases.length); nativeEnd = true; }
    }
    assert(!log.includes('** TEST EXECUTE FAILED **') && !/Test Case .*FiveRootCalendarSmartPhoneUITests.* (?:failed|skipped)/.test(log)
      && !/xcodebuild: error:/.test(log), 'The one actual native case must not fail or skip.');
    if (log.includes('** TEST EXECUTE SUCCEEDED **')) {
      assert(nativeEnd && eventID); assert.equal(checks.length, phases.length);
      assert(/Executed 1 test, with 0 failures/.test(log));
      assert.equal((log.match(/Test Case '-\[.*FiveRootCalendarSmartPhoneUITests .*\]' passed/g) ?? []).length, 1);
      assert(log.includes(`FiveRootCalendarSmartPhoneUITests ${method}]' passed`));
      assert.deepEqual([...log.matchAll(/FIVE_ROOT_READ_ACK ([a-z][a-z0-9-]*)/g)].map(match => match[1]), phases,
        'Require every actual native ACK exactly once after its complete independent GET checks.');
      complete = true; break;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert(complete, 'The one native test and all nine GET/ACK boundaries must actually pass.');
} catch (error) {
  failure = error; await fs.writeFile(path.join(output, 'private-failure.txt'), String(error?.stack), { mode: 0o600 });
  console.error('Calendar Smart text verification failed; retain diagnostics and explicitly clean only the owned cohort.'); process.exitCode = 1;
}
await report();
