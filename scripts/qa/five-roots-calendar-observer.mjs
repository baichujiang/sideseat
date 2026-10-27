// Preparation-only companion to FiveRootCalendarPhoneUITests.
// Factory preparation/cleanup are separate authorized steps. Every request here is GET.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { baseURL, privateDir, readFixture } from './five-roots-live.mjs';
import { fetchQAGet, qaGETTransportPolicy } from './five-roots-get-transport.mjs';
import { createQAReadBarrier } from './five-roots-read-barrier.mjs';

const [logPath] = process.argv.slice(2);
const evidenceRoot = '/tmp/sideseat-five-roots-private';
assert.equal(process.env.SIDESEAT_CALENDAR_EXECUTE, '1', 'Calendar execution remains gated until Plans acceptance completes.');
assert.equal(baseURL, 'https://api.sideseat.de');
assert(privateDir.startsWith('/tmp/sideseat-five-roots-calendar-'), 'Use a dedicated fresh Calendar factory directory, never the earlier Together or Plans fixture.');
assert(logPath?.startsWith(evidenceRoot + '/calendar-') && logPath.endsWith('.log'));
const output = process.env.SIDESEAT_QA_OUTPUT;
assert(output?.startsWith(evidenceRoot + '/calendar-'));
await fs.mkdir(output, { recursive: true, mode: 0o700 });
const readBarrier = await createQAReadBarrier({ expectedRunnerBundle: 'app.sideseat.fiverootscalendarqa.xctrunner', outputDir: output });
const f = await readFixture();
assert.equal(f.bundle, 'app.sideseat.mobile.preview');
assert(f.accounts.every(a => a.id && a.accessToken && !a.deleted), 'Prepare the fresh owned factory before this GET-only observer; no login fallback is performed.');
const owner = f.accounts.find(a => a.role === 'owner');
const peer = f.accounts.find(a => a.role === 'peer');
const prefix = `Calendar ${f.runID}`;
const initialTitle = prefix + ' 新建', editedTitle = prefix + ' 已更新';
const initialCategory = prefix + ' 分类', editedCategory = prefix + ' 绿色';
const phases = ['signed-in', 'navigation-cancelled', 'category-created', 'event-created', 'event-edited',
  'event-relaunched', 'category-edited', 'category-visible', 'category-deleted', 'event-uncategorized',
  'event-deleted', 'deleted-relaunched'];
const appBuild = Number(process.env.SIDESEAT_QA_UI_BUILD);
assert(Number.isSafeInteger(appBuild) && appBuild > 0, 'Record the actual frozen Preview build explicitly.');
const checks = [];
const readRetries = [];
let readPhase = 'starting', retryLogWrite = Promise.resolve();
let range, baselinePeer, baselinePresets, eventID, categoryID, failure, complete = false;
const sha = value => createHash('sha256').update(value).digest('hex');
const transportHelperSHA256 = sha(await fs.readFile(new URL('./five-roots-get-transport.mjs', import.meta.url)));
const stable = value => JSON.stringify(value);
async function get(account, endpoint) {
  assert(f.accounts.includes(account) && account.id && !account.deleted);
  assert(endpoint.startsWith('/api/v1/') && !endpoint.includes('://'));
  const response = await fetchQAGet(baseURL + endpoint, {
    role: account.role, phase: readPhase,
    headers: { Authorization: `Bearer ${account.accessToken}`, 'x-sideseat-platform': 'ios',
      'x-sideseat-app-version': process.env.SIDESEAT_QA_APP_VERSION || '1.0.0',
      'x-sideseat-build': String(appBuild) },
    onRetry: record => {
      readRetries.push(record);
      retryLogWrite = retryLogWrite.then(() => fs.writeFile(path.join(output, 'read-retries.private.json'), JSON.stringify(readRetries, null, 2) + '\n', { mode: 0o600 }));
      return retryLogWrite;
    },
  });
  assert.equal(response.status, 200, 'Owned GET boundary failed; private details retained. No auth-refresh POST is allowed.');
  const body = await response.json();
  assert(body.data, 'GET envelope data is required.');
  return body.data;
}
async function identity(account) {
  const me = await get(account, '/api/v1/me');
  assert.equal(me.id, account.id); assert.equal(me.username, account.identifier);
}
async function snapshot(account) {
  assert(range, 'Native expected timestamps must be present before reading bounded schedules.');
  const start = new Date(Date.parse(range.start) - 86_400_000).toISOString();
  const end = new Date(Date.parse(range.end) + 86_400_000).toISOString();
  const [schedule, categories, search] = await Promise.all([
    get(account, `/api/v1/home/schedule?windowStart=${encodeURIComponent(start)}&windowEnd=${encodeURIComponent(end)}`),
    get(account, '/api/v1/calendar/categories'),
    get(account, '/api/v1/calendar/search?q=' + encodeURIComponent(prefix)),
  ]);
  assert(Array.isArray(schedule.studyEntries) && Array.isArray(categories.categories) && Array.isArray(search.results));
  return { rows: schedule.studyEntries, categories: categories.categories, search: search.results };
}
const normalizedRow = row => ({ id: row.id, title: row.title, location: row.location, note: row.note,
  start: row.startISO, end: row.endISO, categoryId: row.categoryId,
  categoryName: row.categoryName, categoryColor: row.categoryColor });
async function verify(phase) {
  readPhase = phase;
  const index = phases.indexOf(phase);
  await Promise.all(f.accounts.map(identity));
  const [a, p] = await Promise.all([snapshot(owner), snapshot(peer)]);
  const peerState = stable(p);
  if (!baselinePeer) { assert.equal(p.rows.length, 0); assert.equal(p.search.length, 0); baselinePeer = peerState; }
  assert.equal(peerState, baselinePeer, 'The second owned account must remain unchanged and must not see the owner event.');
  assert(a.rows.every(row => row.title === initialTitle || row.title === editedTitle), 'Fresh account must contain only this UI-owned event.');
  assert(a.search.every(row => row.title === initialTitle || row.title === editedTitle));
  const presets = a.categories.filter(c => c.presetKey).sort((x, y) => x.id.localeCompare(y.id));
  if (!baselinePresets) baselinePresets = stable(presets);
  assert.equal(stable(presets), baselinePresets, 'Built-in calendars must remain unchanged.');
  const custom = a.categories.filter(c => !c.presetKey);
  const hasCategory = index >= phases.indexOf('category-created') && index < phases.indexOf('category-deleted');
  assert.equal(custom.length, hasCategory ? 1 : 0, 'Only the one owned custom calendar is permitted.');
  const changedCategory = index >= phases.indexOf('category-edited');
  if (hasCategory) {
    const c = custom[0];
    categoryID ??= c.id;
    assert.equal(c.id, categoryID);
    assert.equal(c.name, changedCategory ? editedCategory : initialCategory);
    assert.equal(c.color.toUpperCase(), changedCategory ? '#16A34A' : '#DC2626');
    assert.equal(c.icsSubscriptionUrl ?? null, null, 'No subscription or external Apple Calendar action is permitted.');
  }
  const hasEvent = index >= phases.indexOf('event-created') && index < phases.indexOf('event-deleted');
  assert.equal(a.rows.length, hasEvent ? 1 : 0);
  assert.equal(a.search.length, hasEvent ? 1 : 0);
  if (hasEvent) {
    const row = a.rows[0], searchRow = a.search[0];
    eventID ??= row.id;
    assert.equal(row.id, eventID); assert.equal(searchRow.id, eventID);
    const edited = index >= phases.indexOf('event-edited');
    assert.equal(row.title, edited ? editedTitle : initialTitle);
    assert.equal(row.location, edited ? '日历更新地点' : '日历自有测试地点');
    assert.equal(row.note, edited ? '重启后保留的备注' : '首次备注');
    assert.equal(Date.parse(row.startISO), Date.parse(range.start));
    assert.equal(Date.parse(row.endISO), Date.parse(range.end));
    assert.equal(row.repeatRule, 'NONE');
    assert.equal(row.categoryId ?? null, hasCategory ? categoryID : null);
    if (hasCategory) {
      assert.equal(row.categoryName, changedCategory ? editedCategory : initialCategory);
      assert.equal(row.categoryColor.toUpperCase(), changedCategory ? '#16A34A' : '#DC2626');
    }
    assert.deepEqual(normalizedRow(row), normalizedRow(searchRow), 'Bounded Calendar and search must agree on identity, content, exact times and category.');
    if (edited) {
      const old = await get(owner, '/api/v1/calendar/search?q=' + encodeURIComponent(initialTitle));
      assert.equal(old.results.filter(r => r.id === eventID).length, 0, 'Old title must no longer find the edited event.');
    }
  }
  return { phase, calendarRows: a.rows.length, searchRows: a.search.length, customCalendarCount: custom.length,
    sameEventIdentity: hasEvent, exactTimesChecked: hasEvent, peerUnchanged: true, presetCalendarsUnchanged: true };
}
async function report() {
  await fs.writeFile(path.join(output, 'calendar-real-flow.json'), JSON.stringify({
    passed: complete && !failure, appBuild, physicalDevice: 'default iPhone14Plus', phases, checks,
    runSHA256: sha(f.runID), businessWrites: 'Physical App UI only; observer request method is GET only, no login refresh or business mutation.',
    coverage: 'Event create/search/timeline/detail/edit/relaunch/delete; custom category create/rename/color/readback/delete and event detachment; view/cancel markers.',
    visibilityScope: 'Current product has no category visibility toggle; category-name/color visibility and deletion detachment only.',
    transportHelperSHA256, readRetryCount: readRetries.length, readRetries, transportPolicy: qaGETTransportPolicy,
    failure: failure ? { message: 'Calendar boundary failed; inspect private diagnostics.' } : null,
  }, null, 2) + '\n', { mode: 0o600 });
}
try {
  const deadline = Date.now() + 30 * 60_000;
  while (Date.now() < deadline) {
    const log = await fs.readFile(logPath, 'utf8').catch(() => '');
    const marker = log.match(/CALENDAR_EXPECTED_RANGE (\S+) (\S+)/);
    if (marker && !range) {
      range = { start: marker[1], end: marker[2] };
      assert(Number.isFinite(Date.parse(range.start)) && Date.parse(range.end) - Date.parse(range.start) === 3_600_000);
    }
    for (const [, phase] of log.matchAll(/CALENDAR_PHASE ([a-z-]+)/g)) {
      assert(phases.includes(phase));
      if (checks.some(c => c.phase === phase)) continue;
      assert.equal(phase, phases[checks.length]);
      checks.push(await verify(phase)); await report(); await readBarrier.acknowledge(phase);
      console.log('CALENDAR_GET verified ' + phase);
    }
    if (log.includes('** TEST EXECUTE FAILED **') || /Test Case .*FiveRootCalendarPhoneUITests.* failed/.test(log) || /xcodebuild: error:/.test(log)) throw Error('Native Calendar execution failed.');
    if (log.includes('** TEST EXECUTE SUCCEEDED **')) {
      assert(/Executed 1 test, with 0 failures/.test(log)); assert.equal(checks.length, phases.length);
      assert.deepEqual([...log.matchAll(/FIVE_ROOT_READ_ACK ([a-z0-9-]+)/g)].map(match => match[1]), phases);
      complete = true; break;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert(complete, 'The complete physical Calendar case must execute and pass.');
} catch (error) {
  failure = error;
  await fs.writeFile(path.join(output, 'private-failure.txt'), String(error?.stack), { mode: 0o600 });
}
await report();
if (failure) { console.error('Calendar boundary failed; inspect private diagnostics.'); process.exitCode = 1; }
