// Independent owned-account GET oracle for the actual Files export/import case.
// Factory auth/cleanup and native UI execution are separate authorized steps.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { baseURL, privateDir, readFixture } from './five-roots-live.mjs';
import { fetchQAGet, qaGETTransportPolicy } from './five-roots-get-transport.mjs';
import { createQAReadBarrier } from './five-roots-read-barrier.mjs';

const [logPath] = process.argv.slice(2), evidence = '/tmp/sideseat-five-roots-private';
assert.equal(process.env.SIDESEAT_CALENDAR_TRANSFER_EXECUTE, '1', 'Calendar transfer execution remains explicitly gated.');
assert.equal(baseURL, 'https://api.sideseat.de');
assert(/^\/tmp\/sideseat-five-roots-calendar-transfer-[A-Za-z0-9_-]+$/.test(privateDir));
assert(logPath?.startsWith(evidence + '/calendar-transfer-') && logPath.endsWith('.log'));
const output = process.env.SIDESEAT_QA_OUTPUT;
assert(output?.startsWith(evidence + '/calendar-transfer-'));
const appBuild = Number(process.env.SIDESEAT_QA_UI_BUILD);
assert([250, 251].includes(appBuild), 'Use the explicitly provided frozen and actually installed Preview250 or251 product.');
await fs.mkdir(output, { recursive: true, mode: 0o700 });
const barrier = await createQAReadBarrier({ expectedRunnerBundle: 'app.sideseat.fiverootscalendarqa.xctrunner', outputDir: output });
const f = await readFixture();
assert.equal(f.bundle, 'app.sideseat.mobile.preview');
assert(f.accounts.every(a => a.id && a.accessToken && !a.deleted), 'Prepare fresh owned auth first; this observer never refreshes credentials.');
const owner = f.accounts.find(a => a.role === 'owner'), peer = f.accounts.find(a => a.role === 'peer');
const title = `Transfer ${f.runID}`, location = '文件传输测试地点', note = '文件传输备注';
const fileRoot = process.env.SIDESEAT_CALENDAR_TRANSFER_FILE_ROOT;
const fileRootPattern = /^\/Users\/baichu\/Library\/Developer\/CoreSimulator\/Devices\/AEBD816E-53A7-4012-B76A-FEF82CF02A6B\/data\/Containers\/Shared\/AppGroup\/[A-Fa-f0-9-]{36}\/File Provider Storage$/;
assert(typeof fileRoot === 'string' && fileRootPattern.test(fileRoot));
assert.equal(await fs.realpath(fileRoot), fileRoot, 'The owned local provider root cannot redirect through a symlink.');
assert((await fs.lstat(fileRoot)).isDirectory() && !(await fs.lstat(fileRoot)).isSymbolicLink());
const providerContainer = path.dirname(fileRoot), execute = promisify(execFile);
const metadata = path.join(providerContainer, '.com.apple.mobile_container_manager.metadata.plist');
assert((await fs.lstat(metadata)).isFile() && !(await fs.lstat(metadata)).isSymbolicLink());
const identifier = await execute('/usr/bin/plutil', ['-extract', 'MCMMetadataIdentifier', 'raw', '-o', '-', metadata], { timeout: 5000, maxBuffer: 1024 });
assert.equal(identifier.stdout.trim(), 'group.com.apple.FileProvider.LocalStorage');
const ownedDirectory = path.join(fileRoot, `SideSeat-QA-Transfer-${f.runID}`), ownedFile = path.join(ownedDirectory, 'sideseat-schedule-2026.ics');
const phases = ['signed-in', 'source-created', 'export-saved', 'source-deleted', 'imported', 'import-relaunched', 'import-deleted', 'deleted-relaunched'];
const sha = value => createHash('sha256').update(value).digest('hex');
const helperSHA256 = sha(await fs.readFile(new URL('./five-roots-get-transport.mjs', import.meta.url)));
const checks = [], retries = [], acknowledgements = [];
let range, year, sourceID, importedID, baselinePeer, baselineCategories, savedFileSHA256, failure, complete = false;
let phaseName = 'starting', retryWrites = Promise.resolve();

async function get(account, endpoint) {
  assert(f.accounts.includes(account) && account.id && !account.deleted);
  assert(endpoint.startsWith('/api/v1/') && !endpoint.includes('://'));
  const response = await fetchQAGet(baseURL + endpoint, {
    role: account.role, phase: phaseName,
    headers: { Authorization: `Bearer ${account.accessToken}`, 'x-sideseat-platform': 'ios',
      'x-sideseat-app-version': process.env.SIDESEAT_QA_APP_VERSION || '1.0.0', 'x-sideseat-build': String(appBuild) },
    onRetry: record => {
      retries.push(record);
      retryWrites = retryWrites.then(() => fs.writeFile(path.join(output, 'read-retries.private.json'), JSON.stringify(retries, null, 2) + '\n', { mode: 0o600 }));
      return retryWrites;
    },
  });
  assert.equal(response.status, 200, 'Owned GET boundary failed; no auth or business fallback is allowed.');
  const envelope = await response.json(); assert(envelope.data); return envelope.data;
}

async function snapshot(account) {
  assert(range && year === 2026);
  const start = new Date(Date.parse(range.start) - 86_400_000).toISOString();
  const end = new Date(Date.parse(range.end) + 86_400_000).toISOString();
  const [me, schedule, categories, search] = await Promise.all([
    get(account, '/api/v1/me'),
    get(account, `/api/v1/home/schedule?windowStart=${encodeURIComponent(start)}&windowEnd=${encodeURIComponent(end)}`),
    get(account, '/api/v1/calendar/categories'),
    get(account, '/api/v1/calendar/search?q=' + encodeURIComponent(title)),
  ]);
  assert.equal(me.id, account.id); assert.equal(me.username, account.identifier);
  assert(Array.isArray(schedule.studyEntries) && Array.isArray(schedule.classBlocks)
    && Array.isArray(categories.categories) && Array.isArray(search.results));
  assert.equal(schedule.classBlocks.length, 0, 'Fresh transfer identities must have no course schedule.');
  assert(categories.categories.every(c => c.presetKey), 'No custom calendar is created or imported by this case.');
  return { rows: schedule.studyEntries, search: search.results,
    categories: categories.categories.sort((a, b) => a.id.localeCompare(b.id)) };
}

const normalized = row => ({ id: row.id, title: row.title, location: row.location, note: row.note,
  start: row.startISO, end: row.endISO, repeatRule: row.repeatRule, categoryId: row.categoryId ?? null });
function verifyRow(row, id) {
  assert.equal(row.id, id); assert.equal(row.title, title); assert.equal(row.location, location); assert.equal(row.note, note);
  assert.equal(Date.parse(row.startISO), Date.parse(range.start)); assert.equal(Date.parse(row.endISO), Date.parse(range.end));
  assert.equal(row.repeatRule, 'NONE'); assert.equal(row.categoryId ?? null, null);
}

async function verifyExport() {
  const exported = await get(owner, '/api/v1/calendar/export?year=2026');
  assert.equal(exported.filename, 'sideseat-schedule-2026.ics');
  assert.equal(exported.mediaType, 'text/calendar; charset=utf-8');
  assert(typeof exported.ics === 'string');
  const unfolded = exported.ics.replace(/\r?\n[ \t]/g, ''), lines = unfolded.split(/\r?\n/);
  assert.equal(lines[0], 'BEGIN:VCALENDAR'); assert(lines.includes('END:VCALENDAR'));
  assert.equal(lines.filter(line => line === 'BEGIN:VEVENT').length, 1, 'The real export must contain exactly the single owned source event.');
  assert.equal(lines.filter(line => line === 'END:VEVENT').length, 1);
  const event = lines.slice(lines.indexOf('BEGIN:VEVENT') + 1, lines.indexOf('END:VEVENT'));
  function property(name) {
    const matches = event.filter(line => line.startsWith(name + ':'));
    assert.equal(matches.length, 1, 'The owned export field must occur once.');
    return matches[0].slice(name.length + 1);
  }
  const decode = value => value.replace(/\\([nN,;\\])/g, (_, c) => /n/i.test(c) ? '\n' : c);
  const utc = value => new Date(value).toISOString().replace(/[-:]/g, '').replace('.000', '');
  assert(property('UID').length > 0); assert.equal(property('DTSTART'), utc(range.start)); assert.equal(property('DTEND'), utc(range.end));
  assert.equal(decode(property('SUMMARY')), title); assert.equal(decode(property('LOCATION')), location); assert.equal(decode(property('DESCRIPTION')), note);
  assert(!event.some(line => line.startsWith('RRULE')), 'This owned single event must not acquire recurrence on export.');
  assert((await fs.lstat(ownedDirectory)).isDirectory() && !(await fs.lstat(ownedDirectory)).isSymbolicLink());
  assert.equal(await fs.realpath(ownedDirectory), ownedDirectory);
  assert((await fs.lstat(ownedFile)).isFile() && !(await fs.lstat(ownedFile)).isSymbolicLink());
  assert.equal(await fs.realpath(ownedFile), ownedFile);
  const actualFile = await fs.readFile(ownedFile);
  assert(actualFile.length > 0 && actualFile.length <= 512 * 1024);
  assert.equal(actualFile.toString('utf8'), exported.ics, 'The actual owned Files-saved ICS must exactly match the independently read nonempty source export.');
  savedFileSHA256 = sha(actualFile);
  return { filename: exported.filename, bytes: Buffer.byteLength(exported.ics), sha256: sha(exported.ics), vevents: 1,
    exactTitleTimesLocationNote: true, actualSavedFileChecked: true, fileSHA256: savedFileSHA256 };
}

async function verifySameSavedFile() {
  assert(savedFileSHA256, 'The actual Files save must have passed its prior independent GET/file barrier.');
  assert((await fs.lstat(ownedDirectory)).isDirectory() && !(await fs.lstat(ownedDirectory)).isSymbolicLink());
  assert((await fs.lstat(ownedFile)).isFile() && !(await fs.lstat(ownedFile)).isSymbolicLink());
  assert.equal(await fs.realpath(ownedFile), ownedFile);
  assert.equal(sha(await fs.readFile(ownedFile)), savedFileSHA256, 'Import must use the unchanged actual owned export file.');
}

async function verify(phase) {
  phaseName = phase;
  const index = phases.indexOf(phase), [a, p] = await Promise.all([snapshot(owner), snapshot(peer)]);
  const peerState = JSON.stringify(p);
  if (!baselinePeer) { assert.equal(p.rows.length, 0); assert.equal(p.search.length, 0); baselinePeer = peerState; }
  assert.equal(peerState, baselinePeer, 'The second owned account must remain unchanged and see no transfer event.');
  const categories = JSON.stringify(a.categories); baselineCategories ??= categories;
  assert.equal(categories, baselineCategories, 'Preset calendars must remain unchanged and no custom calendar may appear.');
  const source = phase === 'source-created' || phase === 'export-saved';
  const imported = phase === 'imported' || phase === 'import-relaunched';
  const expectedCount = source || imported ? 1 : 0;
  assert.equal(a.rows.length, expectedCount); assert.equal(a.search.length, expectedCount);
  if (source || imported) {
    const id = source ? sourceID : importedID;
    assert(id, 'Native must publish the actual UI-visible event identity before its GET checkpoint.');
    if (imported) assert.notEqual(importedID, sourceID, 'Delete-before-import must produce a genuinely new server event identity.');
    verifyRow(a.rows[0], id); verifyRow(a.search[0], id);
    assert.deepEqual(normalized(a.rows[0]), normalized(a.search[0]), 'Bounded schedule and search must agree on actual identity and complete content.');
  }
  const exportEnvelope = phase === 'export-saved' ? await verifyExport() : undefined;
  if (imported) await verifySameSavedFile();
  return { phase, calendarRows: a.rows.length, searchRows: a.search.length, sourceIdentityChecked: source,
    newImportedIdentityChecked: imported, exactTimesAndFieldsChecked: source || imported,
    peerUnchanged: true, presetCalendarsUnchanged: true, customCalendarCount: 0,
    ...(exportEnvelope ? { exportEnvelope } : {}), finalDeletionChecked: index >= phases.indexOf('import-deleted') };
}

async function report() {
  await fs.writeFile(path.join(output, 'calendar-transfer-real-flow.json'), JSON.stringify({
    passed: complete && !failure, appBuild, surface: 'owned Simulator iPhone17Pro iOS26.5', simulator: true, physicalDevice: false,
    simulatorUDID: 'AEBD816E-53A7-4012-B76A-FEF82CF02A6B', phases, checks, acknowledgements,
    runSHA256: sha(f.runID), sourceIDSHA256: sourceID ? sha(sourceID) : null, importedIDSHA256: importedID ? sha(importedID) : null,
    businessWrites: 'Real App UI only. Observer performs owned-account GET requests and own-runner ACK file copies only.',
    scope: 'One owned nonrecurring event: actual Files export save, source deletion, same-file import, exact field/new-ID readback, fresh login, final deletion.',
    exclusions: 'No physical iPhone acceptance, ordinary Files access, repeated-import deduplication, recurring/category/participant backup restoration, or other Calendar functionality.',
    transportHelperSHA256: helperSHA256, transportPolicy: qaGETTransportPolicy, readRetryCount: retries.length, readRetries: retries,
    failure: failure ? { message: 'Calendar transfer boundary failed; inspect private diagnostics.' } : null,
  }, null, 2) + '\n', { mode: 0o600 });
}

try {
  const deadline = Date.now() + 30 * 60_000;
  while (Date.now() < deadline) {
    const log = await fs.readFile(logPath, 'utf8').catch(() => '');
    const expectedRange = [...log.matchAll(/CALENDAR_TRANSFER_EXPECTED_RANGE (\S+) (\S+)/g)];
    for (const [, start, end] of expectedRange) {
      const candidate = { start, end };
      assert(Number.isFinite(Date.parse(start)) && Date.parse(end) - Date.parse(start) === 3_600_000);
      const berlin = value => Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value)).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
      const a = berlin(start), b = berlin(end);
      assert.equal(a.year, '2026'); assert.equal(b.year, '2026');
      assert.equal(a.month + a.day, b.month + b.day); assert.equal(a.hour + a.minute + a.second, '090000'); assert.equal(b.hour + b.minute + b.second, '100000');
      if (range) assert.deepEqual(candidate, range); else range = candidate;
    }
    for (const [, value] of log.matchAll(/CALENDAR_TRANSFER_EXPECTED_YEAR ([0-9]{4})/g)) {
      assert.equal(Number(value), 2026); if (year) assert.equal(year, Number(value)); else year = Number(value);
    }
    for (const [marker, key] of [['SOURCE', 'source'], ['IMPORTED', 'imported']]) {
      for (const [, id] of log.matchAll(new RegExp(`CALENDAR_TRANSFER_${marker}_ID ([A-Za-z0-9_-]{1,128})`, 'g'))) {
        if (key === 'source') { if (sourceID) assert.equal(id, sourceID); else sourceID = id; }
        else { if (importedID) assert.equal(id, importedID); else importedID = id; }
      }
    }
    for (const [, phase] of log.matchAll(/CALENDAR_TRANSFER_PHASE ([a-z-]+)/g)) {
      assert(phases.includes(phase)); if (checks.some(check => check.phase === phase)) continue;
      assert.equal(phase, phases[checks.length]); checks.push(await verify(phase)); await report();
      await barrier.acknowledge(phase); console.log('CALENDAR_TRANSFER_GET verified ' + phase);
    }
    if (log.includes('** TEST EXECUTE FAILED **') || /Test Case .*FiveRootCalendarTransferUITests.* failed/.test(log)
      || /xcodebuild: error:/.test(log)) throw Error('Native Calendar transfer case failed.');
    if (log.includes('** TEST EXECUTE SUCCEEDED **')) {
      assert(/Executed 1 test, with 0 failures/.test(log)); assert(!/\b[1-9][0-9]* skipped\b/.test(log));
      assert(/Test Case .*FiveRootCalendarTransferUITests.* passed/.test(log)); assert.equal(checks.length, phases.length);
      acknowledgements.push(...Array.from(log.matchAll(/FIVE_ROOT_READ_ACK ([a-z][a-z0-9-]*)/g), match => match[1]));
      assert.deepEqual(acknowledgements, phases); complete = true; break;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert(complete, 'The complete independent Calendar transfer case must actually execute and pass.');
} catch (error) {
  failure = error; await fs.writeFile(path.join(output, 'private-failure.txt'), String(error?.stack), { mode: 0o600 });
}
await report();
if (failure) { console.error('Calendar transfer boundary failed; inspect private diagnostics.'); process.exitCode = 1; }
