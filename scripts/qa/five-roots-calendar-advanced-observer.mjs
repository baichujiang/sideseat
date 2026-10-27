// A single explicit Calendar-advanced case, using only GET requests. Account
// preparation/cleanup and genuine App UI business writes are separate steps.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { baseURL, privateDir, readFixture } from './five-roots-live.mjs';
import { fetchQAGet, qaGETTransportPolicy } from './five-roots-get-transport.mjs';
import { createQAReadBarrier } from './five-roots-read-barrier.mjs';

const specs = {
  timing: {
    method: 'testNavigationValidationAndRealDateTimeEdit',
    phases: ['signed-in', 'navigation-cancelled', 'validation-recovered', 'event-created', 'event-retimed', 'search-recovered', 'retimed-relaunched', 'cleaned'],
  },
  weekly: {
    method: 'testWeekMoveResizeCopyPasteAndDuplicate',
    phases: ['signed-in', 'event-created', 'move-cancelled', 'moved', 'resize-cancelled', 'resized', 'copied', 'pasted', 'duplicated', 'copies-relaunched', 'deleted-duplicate', 'deleted-paste', 'cleaned'],
  },
  recurrence: {
    method: 'testRecurringScopeCancelThisFutureAllAndDelete',
    phases: ['signed-in', 'series-created', 'scope-cancelled', 'single-edited', 'single-relaunched', 'future-edited', 'all-edited', 'new-series-deleted', 'single-deleted', 'cleaned'],
  },
};
const caseName = process.env.SIDESEAT_CALENDAR_ADVANCED_CASE;
assert(Object.hasOwn(specs, caseName ?? ''), 'Explicitly select timing, weekly, or recurrence; no all-case or resume mode exists.');
assert.equal(process.env.SIDESEAT_CALENDAR_ADVANCED_EXECUTE, '1');
assert.equal(baseURL, 'https://api.sideseat.de');
assert(privateDir.startsWith('/tmp/sideseat-five-roots-calendar-advanced-'), 'Use a fresh dedicated two-account cohort for this one case.');
const [logPath] = process.argv.slice(2);
const root = '/tmp/sideseat-five-roots-private';
const output = process.env.SIDESEAT_QA_OUTPUT;
assert(logPath?.startsWith(root + '/calendar-advanced-') && logPath.endsWith('.log'));
assert(output?.startsWith(root + '/calendar-advanced-'));
await fs.mkdir(output, { recursive: true, mode: 0o700 });
const readBarrier = await createQAReadBarrier({
  expectedRunnerBundle: 'app.sideseat.fiverootscalendaradvancedqa.xctrunner', outputDir: output,
});
const fixture = await readFixture();
assert.equal(fixture.bundle, 'app.sideseat.mobile.preview');
assert(fixture.accounts.every(a => a.id && a.accessToken && !a.deleted), 'Prepare and refresh the owned credentials before starting; GET verification never refreshes authentication.');
const build = Number(process.env.SIDESEAT_QA_UI_BUILD);
assert(Number.isSafeInteger(build) && build > 0, 'Record the actual frozen installed Preview build.');
const spec = specs[caseName], owner = fixture.accounts.find(a => a.role === 'owner'), peer = fixture.accounts.find(a => a.role === 'peer');
const title = `Advanced ${fixture.runID} ${caseName}`;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const helperSHA256 = hash(await fs.readFile(new URL('./five-roots-get-transport.mjs', import.meta.url)));
const identities = new Map(), checks = [], retries = [];
let anchor, baselinePeer, baselinePresets, readPhase = 'starting', nativeEnd = false, complete = false, failure;
let retryWrite = Promise.resolve();
const format = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const parts = value => Object.fromEntries(format.formatToParts(new Date(value)).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
function at(dayOffset, hour, minute = 0) {
  assert(anchor, 'The genuine native case anchor must be recorded before reading the bounded Calendar.');
  const p = parts(anchor), utc = Date.UTC(p.year, p.month - 1, p.day + dayOffset, hour, minute);
  let guess = utc;
  for (let i = 0; i < 3; i++) {
    const q = parts(guess);
    const offset = Date.UTC(q.year, q.month - 1, q.day, q.hour, q.minute, q.second) - guess;
    guess = utc - offset;
  }
  return new Date(guess).toISOString();
}
async function get(account, endpoint) {
  assert(fixture.accounts.includes(account) && !account.deleted && endpoint.startsWith('/api/v1/') && !endpoint.includes('://'));
  const response = await fetchQAGet(baseURL + endpoint, {
    role: account.role, phase: readPhase,
    headers: { Authorization: `Bearer ${account.accessToken}`, 'x-sideseat-platform': 'ios',
      'x-sideseat-app-version': process.env.SIDESEAT_QA_APP_VERSION || '1.0.0', 'x-sideseat-build': String(build) },
    onRetry: entry => {
      retries.push(entry);
      retryWrite = retryWrite.then(() => fs.writeFile(path.join(output, 'read-retries.private.json'), JSON.stringify(retries, null, 2) + '\n', { mode: 0o600 }));
      return retryWrite;
    },
  });
  assert.equal(response.status, 200, 'Owned GET failed. No HTTP retry or POST authentication refresh is allowed.');
  const body = await response.json();
  assert(body.data, 'Expected the current API envelope.');
  return body.data;
}
async function snapshot(account) {
  const [me, schedule, categories, search, polls] = await Promise.all([
    get(account, '/api/v1/me'),
    get(account, `/api/v1/home/schedule?windowStart=${encodeURIComponent(at(0, 0))}&windowEnd=${encodeURIComponent(at(4, 0))}`),
    get(account, '/api/v1/calendar/categories'),
    get(account, '/api/v1/calendar/search?q=' + encodeURIComponent(`Advanced ${fixture.runID}`)),
    get(account, '/api/v1/time-polls'),
  ]);
  assert.equal(me.id, account.id); assert.equal(me.username, account.identifier);
  assert(Array.isArray(schedule.studyEntries) && Array.isArray(schedule.classBlocks)
    && Array.isArray(categories.categories) && Array.isArray(search.results) && Array.isArray(polls.polls));
  assert.equal(schedule.classBlocks.length, 0); assert.equal(polls.polls.length, 0, 'Calendar must not create an unrelated Plan.');
  return { rows: schedule.studyEntries, categories: categories.categories, search: search.results };
}
const stable = value => JSON.stringify(value);
const has = (phase, stage) => spec.phases.indexOf(phase) >= spec.phases.indexOf(stage);
function id(name) { assert(identities.has(name), 'A real UI-owned identity marker is missing: ' + name); return identities.get(name); }
function row(identity, label, day, startHour, startMinute, endHour, endMinute = 0, repeatRule = 'NONE') {
  return { id: identity, title: label, start: at(day, startHour, startMinute), end: at(day, endHour, endMinute), repeatRule };
}
function expected(phase) {
  if (phase === 'cleaned' || phase === 'signed-in') return [];
  if (caseName === 'timing') {
    if (!has(phase, 'event-created')) return [];
    return [has(phase, 'event-retimed') ? row(id('original'), title, 1, 11, 15, 12, 45) : row(id('original'), title, 0, 9, 0, 10)];
  }
  if (caseName === 'weekly') {
    if (!has(phase, 'event-created')) return [];
    const moved = has(phase, 'moved'), resized = has(phase, 'resized');
    const rows = [row(id('original'), title, 0, 9, moved ? 30 : 0, resized ? 11 : 10, resized ? 0 : moved ? 30 : 0)];
    if (has(phase, 'pasted') && !has(phase, 'deleted-paste')) rows.push(row(id('paste'), title, 0, 14, 0, 15, 30));
    if (has(phase, 'duplicated') && !has(phase, 'deleted-duplicate')) rows.push(row(id('duplicate'), title, 0, 11, 0, 12, 30));
    assert.equal(new Set(rows.map(r => r.id)).size, rows.length, 'Copies must remain independent identities.');
    return rows;
  }
  if (!has(phase, 'series-created')) return [];
  const first = id('first'), split = first.lastIndexOf('_occ_');
  assert(split > 0);
  const master = first.slice(0, split), occurrence = (series, day) => `${series}_occ_${Date.parse(at(day, 9))}`;
  assert.equal(first, occurrence(master, 0));
  if (has(phase, 'scope-cancelled')) assert.equal(id('second'), occurrence(master, 1));
  const changedThis = has(phase, 'single-edited'), changedFuture = has(phase, 'future-edited');
  let newMaster;
  if (changedFuture) {
    assert.equal(id('old-third'), occurrence(master, 2));
    const future = id('future-first'), marker = future.lastIndexOf('_occ_');
    assert(marker > 0); newMaster = future.slice(0, marker); assert.notEqual(newMaster, master);
    assert.equal(future, occurrence(newMaster, 2));
  }
  const rows = [];
  for (let day = 0; day < 4; day++) {
    if (day === 1 && has(phase, 'single-deleted')) continue;
    if (day >= 2 && has(phase, 'new-series-deleted')) continue;
    const suffix = day === 1 && changedThis ? ' this' : day >= 2 && changedFuture ? has(phase, 'all-edited') ? ' all' : ' future' : '';
    rows.push(row(occurrence(day >= 2 && changedFuture ? newMaster : master, day), title + suffix, day, 9, 0, 10, 0, 'DAILY'));
  }
  return rows;
}
async function verify(phase) {
  readPhase = phase;
  const [a, p] = await Promise.all([snapshot(owner), snapshot(peer)]);
  assert.equal(p.rows.length, 0); assert.equal(p.search.length, 0);
  baselinePeer ??= stable(p);
  assert.equal(stable(p), baselinePeer, 'The second owned account must remain completely unchanged.');
  assert(a.categories.every(c => c.presetKey), 'No custom category belongs to these advanced cases.');
  const presets = stable([...a.categories].sort((a, b) => a.id.localeCompare(b.id)));
  baselinePresets ??= presets; assert.equal(presets, baselinePresets, 'Built-in categories must remain unchanged.');
  const wanted = expected(phase);
  for (const actual of [...a.rows, ...a.search]) {
    for (const key of ['timePollToken', 'planCommitmentId', 'planConnectionId', 'planRevisionId', 'discoverActivityId']) {
      assert.equal(actual[key] ?? null, null, 'Calendar advanced must remain a personal event without an unrelated Plan identity.');
    }
  }
  assert.equal(a.rows.length, wanted.length, 'The finite Calendar window must contain exactly the UI-owned events/occurrences.');
  assert.equal(new Set(a.rows.map(r => r.id)).size, a.rows.length);
  for (const target of wanted) {
    const actual = a.rows.find(r => r.id === target.id);
    assert(actual, 'The exact owned identity/occurrence is missing.');
    assert.equal(actual.title, target.title);
    assert.equal(Date.parse(actual.startISO), Date.parse(target.start));
    assert.equal(Date.parse(actual.endISO), Date.parse(target.end));
    assert.equal(actual.repeatRule, target.repeatRule);
    assert.equal(actual.categoryId ?? null, null);
    assert.equal(actual.location ?? null, null); assert.equal(actual.note ?? null, null);
    assert.equal(actual.eventParticipants?.length ?? 0, 0);
  }
  const allowedTitles = new Set(wanted.map(r => r.title));
  assert(a.search.every(r => allowedTitles.has(r.title)), 'Search may only show the current owned title variants.');
  if (wanted.length === 0) assert.equal(a.search.length, 0);
  else {
    if (caseName === 'recurrence') {
      // Broad search deliberately returns one representative per series. Query
      // each exact title separately so a better-ranked master cannot hide its
      // independently edited occurrence from this searchability check.
      for (const label of allowedTitles) {
        const exact = await get(owner, '/api/v1/calendar/search?q=' + encodeURIComponent(label));
        assert(Array.isArray(exact.results));
        assert(exact.results.every(r => allowedTitles.has(r.title)));
        const matches = exact.results.filter(r => r.title === label);
        assert(matches.length > 0, 'The independently queried owned title must be searchable.');
        for (const actual of matches) {
          const target = wanted.find(r => r.id === actual.id && r.title === label);
          assert(target, 'Exact-title search must return an owned occurrence from the verified finite window.');
          assert.equal(Date.parse(actual.startISO), Date.parse(target.start));
          assert.equal(Date.parse(actual.endISO), Date.parse(target.end));
          assert.equal(actual.repeatRule, target.repeatRule);
        }
        for (const actual of exact.results) {
          for (const key of ['timePollToken', 'planCommitmentId', 'planConnectionId', 'planRevisionId', 'discoverActivityId']) {
            assert.equal(actual[key] ?? null, null, 'Exact-title search must remain personal without a Plan or Discover identity.');
          }
        }
      }
    } else {
      for (const label of allowedTitles) assert(a.search.some(r => r.title === label), 'Each remaining owned title variant must be searchable.');
      assert.equal(a.search.length, wanted.length);
      assert.deepEqual(a.search.map(r => r.id).sort(), wanted.map(r => r.id).sort());
      for (const r of a.search) {
        const match = wanted.find(e => e.id === r.id);
        assert.equal(Date.parse(r.startISO), Date.parse(match.start)); assert.equal(Date.parse(r.endISO), Date.parse(match.end));
      }
    }
  }
  return { phase, boundedRows: a.rows.length, searchRows: a.search.length, exactOwnedIdentitiesAndTimes: true,
    repeatedOccurrenceScopeChecked: caseName === 'recurrence' && wanted.length > 0, peerUnchanged: true, presetsUnchanged: true, unrelatedPlans: 0 };
}
async function report() {
  await fs.writeFile(path.join(output, 'calendar-advanced-real-flow.json'), JSON.stringify({
    passed: complete && !failure, appBuild: build, selectedCase: caseName, requiredNativeMethod: spec.method,
    expectedActualTests: 1, phases: spec.phases, checks, runSHA256: hash(fixture.runID),
    scope: 'One separate default14Plus continuous UI case. Fresh two-account cohort; all business progress by physical App UI, observer GET only. This result does not claim the other two advanced cases passed.',
    recurrenceWindowScope: caseName === 'recurrence' ? 'Four consecutive Berlin days; daily series this/future/current-series-all and deletes, not every occurrence of an unbounded recurrence.' : null,
    allAdvancedCasesAccepted: false, transportHelperSHA256: helperSHA256, transportPolicy: qaGETTransportPolicy, readRetryCount: retries.length, readRetries: retries,
    failure: failure ? 'Inspect the retained private diagnostics; no HTTP/auth/business mutation fallback was performed.' : null,
  }, null, 2) + '\n', { mode: 0o600 });
}
try {
  const deadline = Date.now() + 20 * 60_000;
  let processedLines = 0;
  while (Date.now() < deadline) {
    const log = await fs.readFile(logPath, 'utf8').catch(() => '');
    const lines = log.split('\n');
    for (; processedLines < lines.length - 1; processedLines++) {
      const line = lines[processedLines];
      const begin = line.match(/CALENDAR_ADVANCED_BEGIN (\S+) (\S+)/);
      if (begin) {
        assert.equal(begin[1], caseName); assert(!anchor, 'One explicit case may only begin once.');
        assert(Number.isFinite(Date.parse(begin[2]))); anchor = begin[2];
        const p = parts(anchor); assert.equal(p.day, 15); assert.equal(p.hour, 0); assert.equal(p.minute, 0);
      }
      const identity = line.match(/CALENDAR_ADVANCED_ID (\S+) (\S+) (\S+)/);
      if (identity) {
        assert.equal(identity[1], caseName); assert(!identities.has(identity[2]), 'An owned logical identity cannot silently change.');
        assert(/^[A-Za-z0-9_-]{8,120}$/.test(identity[3])); identities.set(identity[2], identity[3]);
      }
      const phase = line.match(/CALENDAR_ADVANCED_PHASE (\S+) (\S+)/);
      if (phase) {
        assert.equal(phase[1], caseName); assert.equal(phase[2], spec.phases[checks.length], 'Every case phase must occur once in order.');
        checks.push(await verify(phase[2])); await report();
        await readBarrier.acknowledge(phase[2]);
        console.log(`CALENDAR_ADVANCED_GET verified ${caseName} ${phase[2]}`);
      }
      const end = line.match(/CALENDAR_ADVANCED_END (\S+)/);
      if (end) { assert.equal(end[1], caseName); assert.equal(checks.length, spec.phases.length); nativeEnd = true; }
    }
    if (log.includes('** TEST EXECUTE FAILED **') || /Test Case .*FiveRootCalendarAdvancedPhoneUITests.* failed/.test(log) || /xcodebuild: error:/.test(log)) throw Error('Actual Calendar advanced native case failed.');
    if (log.includes('** TEST EXECUTE SUCCEEDED **')) {
      assert(nativeEnd); assert.equal(checks.length, spec.phases.length);
      assert(/Executed 1 test, with 0 failures/.test(log));
      assert.equal((log.match(/Test Case '-\[.*FiveRootCalendarAdvancedPhoneUITests .*\]' passed/g) ?? []).length, 1);
      assert(log.includes(`FiveRootCalendarAdvancedPhoneUITests ${spec.method}]' passed`));
      assert(!/Test Case .*FiveRootCalendarAdvancedPhoneUITests.* skipped/.test(log));
      assert.deepEqual([...log.matchAll(/FIVE_ROOT_READ_ACK ([a-z][a-z0-9-]*)/g)].map(match => match[1]), spec.phases,
        'The actual runner must acknowledge every verified phase exactly once in order.');
      complete = true; break;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert(complete, 'The selected case must actually finish and pass every UI and GET checkpoint.');
} catch (error) {
  failure = error;
  await fs.writeFile(path.join(output, 'private-failure.txt'), String(error?.stack), { mode: 0o600 });
}
await report();
if (failure) { console.error('Calendar advanced verification failed; inspect private diagnostics.'); process.exitCode = 1; }
