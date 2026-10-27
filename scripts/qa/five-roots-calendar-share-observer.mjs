// Preparation only. All Calendar/share/import/edit/delete mutations belong to UI.
// The copied disposable public link remains private; only its hash enters reports.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { baseURL, privateDir, readFixture } from './five-roots-live.mjs';
import { fetchQAGet, qaGETTransportPolicy } from './five-roots-get-transport.mjs';
import { createQAReadBarrier } from './five-roots-read-barrier.mjs';

const [logPath] = process.argv.slice(2);
const evidence = '/tmp/sideseat-five-roots-private';
assert.equal(process.env.SIDESEAT_CALENDAR_SHARE_EXECUTE, '1', 'Only the root may authorize this separate Calendar case.');
assert.equal(baseURL, 'https://api.sideseat.de');
assert(/^\/tmp\/sideseat-five-roots-calendar-share-[A-Za-z0-9_-]+$/.test(privateDir));
assert(logPath?.startsWith(evidence + '/calendar-share-') && logPath.endsWith('.log'));
const output = process.env.SIDESEAT_QA_OUTPUT;
assert(output?.startsWith(evidence + '/calendar-share-'));
await fs.mkdir(output, { recursive: true, mode: 0o700 });
const readBarrier = await createQAReadBarrier({ expectedRunnerBundle: 'app.sideseat.fiverootscalendarshareqa.xctrunner', outputDir: output });
const f = await readFixture();
assert.equal(f.bundle, 'app.sideseat.mobile.preview');
assert(f.accounts.every(a => a.id && a.accessToken && !a.deleted), 'Fresh auth must be prepared before this read-only observer; no POST refresh fallback.');
const owner = f.accounts.find(a => a.role === 'owner'), peer = f.accounts.find(a => a.role === 'peer');
const title = `Calendar share ${f.runID}`, location = `共享地点 ${f.runID}`;
const note = `仅本人备注 ${f.runID}`, copyLocation = `收件人地点 ${f.runID}`;
const phases = ['signed-in', 'source-created', 'share-created', 'peer-preview', 'copy-added', 'copy-relaunched',
  'same-link-reopened', 'copy-edited', 'source-unchanged', 'owner-source-deleted', 'peer-copy-survives-source-delete',
  'peer-copy-deleted', 'deleted-relaunched'];
const appBuild = Number(process.env.SIDESEAT_QA_UI_BUILD);
assert(Number.isSafeInteger(appBuild) && appBuild > 0, 'Record the installed frozen Preview explicitly.');
const sha = value => createHash('sha256').update(value).digest('hex');
const helperSHA256 = sha(await fs.readFile(new URL('./five-roots-get-transport.mjs', import.meta.url)));
const checks = [], retries = [], readAcknowledgements = [];
let range, copiedURL, token, sourceID, copyID, linkID, sourceSnapshot, baselineCategories;
let phaseName = 'starting', failure, complete = false, retryWrites = Promise.resolve();
async function get(account, endpoint) {
  assert(endpoint.startsWith('/api/') && !endpoint.includes('://'));
  assert(!account || f.accounts.includes(account));
  const response = await fetchQAGet(baseURL + endpoint, {
    role: account?.role ?? 'public', phase: phaseName,
    headers: { Accept: 'application/json', 'x-sideseat-platform': 'ios', 'x-sideseat-app-version': '1.0.0',
      'x-sideseat-build': String(appBuild), ...(account ? { Authorization: `Bearer ${account.accessToken}` } : {}) },
    onRetry: record => {
      retries.push(record);
      retryWrites = retryWrites.then(() => fs.writeFile(path.join(output, 'read-retries.private.json'), JSON.stringify(retries, null, 2) + '\n', { mode: 0o600 }));
      return retryWrites;
    },
  });
  assert.equal(response.status, 200, 'Owned GET boundary failed; no authentication or business fallback.');
  const body = await response.json(); assert(body.data); return body.data;
}
async function snapshot(account) {
  assert(range);
  const start = new Date(Date.parse(range.start) - 86_400_000).toISOString();
  const end = new Date(Date.parse(range.end) + 86_400_000).toISOString();
  const [me, schedule, search, categories] = await Promise.all([
    get(account, '/api/v1/me'),
    get(account, `/api/v1/home/schedule?windowStart=${encodeURIComponent(start)}&windowEnd=${encodeURIComponent(end)}`),
    get(account, '/api/v1/calendar/search?q=' + encodeURIComponent(title)),
    get(account, '/api/v1/calendar/categories'),
  ]);
  assert.equal(me.id, account.id); assert.equal(me.username, account.identifier);
  assert(Array.isArray(schedule.studyEntries) && Array.isArray(search.results) && Array.isArray(categories.categories));
  assert.equal(schedule.classBlocks.length, 0, 'Fresh Calendar accounts must not acquire courses.');
  const rows = schedule.studyEntries;
  assert(rows.every(row => row.title === title), 'Only this owned personal share case may create events.');
  assert(search.results.every(row => row.title === title));
  assert(categories.categories.every(c => c.presetKey), 'This case never creates a custom calendar.');
  return { rows, search: search.results, displayLabel: me.nickname?.trim() || me.username, categories: categories.categories.sort((a, b) => a.id.localeCompare(b.id)) };
}
const projectionFields = ['planCommitmentId', 'planConnectionId', 'planRevisionId', 'timePollToken', 'discoverActivityId'];
const normalized = row => ({ id: row.id, title: row.title, start: row.startISO, end: row.endISO,
  location: row.location ?? null, note: row.note ?? null, repeat: row.repeatRule, categoryId: row.categoryId ?? null,
  ...Object.fromEntries(projectionFields.map(key => [key, row[key] ?? null])) });
function assertEvent(value, id, expectedLocation, expectedNote) {
  assert.equal(value.rows.length, 1); assert.equal(value.search.length, 1);
  const row = value.rows[0];
  assert.equal(row.id, id); assert.equal(row.title, title);
  assert.equal(Date.parse(row.startISO), Date.parse(range.start)); assert.equal(Date.parse(row.endISO), Date.parse(range.end));
  assert.equal(row.location, expectedLocation); assert.equal(row.note ?? null, expectedNote);
  assert.equal(row.repeatRule, 'NONE'); assert.equal(row.categoryId ?? null, null);
  for (const candidate of [row, value.search[0]]) {
    for (const key of projectionFields) assert.equal(candidate[key] ?? null, null, `Personal rows must not acquire ${key}.`);
  }
  assert.deepEqual(row.eventParticipants ?? [], [], 'A shared personal copy must not acquire participants.');
  assert.deepEqual(normalized(row), normalized(value.search[0]), 'Search and bounded Calendar must agree exactly.');
  return normalized(row);
}
async function assertNoOtherBusiness() {
  for (const account of f.accounts) {
    const [polls, contacts, inbox] = await Promise.all([
      get(account, '/api/v1/time-polls'), get(account, '/api/v1/contacts'), get(account, '/api/v1/inbox'),
    ]);
    assert.deepEqual(polls.polls, []); assert.deepEqual(contacts.contacts, []);
    assert.deepEqual(inbox.conversations, []); assert.deepEqual(inbox.messageRequests, []);
  }
}
async function verify(phase) {
  phaseName = phase;
  const index = phases.indexOf(phase);
  const [a, p] = await Promise.all([snapshot(owner), snapshot(peer)]);
  const cats = JSON.stringify([a.categories, p.categories]);
  baselineCategories ??= cats; assert.equal(cats, baselineCategories, 'Preset calendars must remain unchanged.');
  const hasSource = index >= phases.indexOf('source-created') && index < phases.indexOf('owner-source-deleted');
  const hasCopy = index >= phases.indexOf('copy-added') && index < phases.indexOf('peer-copy-deleted');
  if (hasSource) {
    sourceID ??= a.rows[0]?.id; assert(sourceID);
    const actual = assertEvent(a, sourceID, location, note);
    sourceSnapshot ??= JSON.stringify(actual); assert.equal(JSON.stringify(actual), sourceSnapshot, 'Recipient operations must not modify the source.');
  } else { assert.equal(a.rows.length, 0); assert.equal(a.search.length, 0); }
  if (hasCopy) {
    copyID ??= p.rows[0]?.id; assert(copyID && copyID !== sourceID);
    assertEvent(p, copyID, index >= phases.indexOf('copy-edited') ? copyLocation : location, null);
  } else { assert.equal(p.rows.length, 0); assert.equal(p.search.length, 0); }
  if (index >= phases.indexOf('share-created')) {
    assert(token && copiedURL, 'Use only the public URL actually copied by the owned UI.');
    const [publicView, ownerView, peerView] = await Promise.all([
      get(null, '/api/public/event-shares/' + encodeURIComponent(token)),
      get(owner, '/api/v1/event-shares/' + encodeURIComponent(token)),
      get(peer, '/api/v1/event-shares/' + encodeURIComponent(token)),
    ]);
    const s = publicView.snapshot; assert(s);
    assert.deepEqual(Object.keys(s).sort(), ['endAt', 'expiresAt', 'linkId', 'location', 'note', 'ownerDisplayLabel', 'startAt', 'title'].sort());
    linkID ??= s.linkId; assert.equal(s.linkId, linkID); assert.equal(s.title, title);
    assert.equal(Date.parse(s.startAt), Date.parse(range.start)); assert.equal(Date.parse(s.endAt), Date.parse(range.end));
    assert.equal(s.location, location); assert.equal(s.note, null, 'Excluded source notes must not leak into the public snapshot.');
    assert.equal(s.ownerDisplayLabel, a.displayLabel);
    assert(Number.isFinite(Date.parse(s.expiresAt)) && Date.parse(s.expiresAt) > Date.now());
    assert.deepEqual(ownerView.snapshot, s); assert.deepEqual(peerView.snapshot, s);
    assert.equal(ownerView.ownedByViewer, true); assert.equal(peerView.ownedByViewer, false);
    assert.equal(ownerView.addedCalendarEntryId, null); assert.equal(peerView.addedCalendarEntryId, hasCopy ? copyID : null);
  }
  if (phase === 'signed-in' || phase === 'deleted-relaunched') await assertNoOtherBusiness();
  return { phase, ownerCalendarRows: a.rows.length, peerCalendarRows: p.rows.length,
    sourceUnchanged: hasSource, independentIdentity: hasCopy, exactTimesAndFilteredNotesChecked: hasCopy || Boolean(token),
    noInvitationOrMessages: phase === 'signed-in' || phase === 'deleted-relaunched' };
}
async function report() {
  await fs.writeFile(path.join(output, 'calendar-share-real-flow.json'), JSON.stringify({
    passed: complete && !failure, appBuild, surface: 'default physical iPhone14Plus', phases, checks,
    runSHA256: sha(f.runID), readAcknowledgements, publicShareTokenSHA256: token ? sha(token) : null,
    businessWrites: 'Physical App UI only. Observer uses GET only; factory auth preparation is separate.',
    routeScope: 'Actual Copy link UI + UITest standard targeted app.open(copiedHTTPSURL) + existing onOpenURL. No ui-testing-deep-link or fake auth. Not Safari/UniversalLink association acceptance.',
    sourceDeletionScope: 'Deleting the source event leaves the filtered immutable snapshot and independent recipient event; owned account cleanup must separately confirm the share returns404.',
    transportHelperSHA256: helperSHA256, transportPolicy: qaGETTransportPolicy, readRetryCount: retries.length, readRetries: retries,
    failure: failure ? { message: 'Calendar share boundary failed; inspect private diagnostics.' } : null,
  }, null, 2) + '\n', { mode: 0o600 });
}
try {
  const deadline = Date.now() + 35 * 60_000;
  while (Date.now() < deadline) {
    const log = await fs.readFile(logPath, 'utf8').catch(() => '');
    const r = log.match(/CALENDAR_SHARE_EXPECTED_RANGE (\S+) (\S+)/);
    if (r && !range) {
      range = { start: r[1], end: r[2] };
      assert(Number.isFinite(Date.parse(range.start)) && Date.parse(range.end) - Date.parse(range.start) === 3_600_000);
    }
    const u = log.match(/CALENDAR_SHARE_OWNED_URL (https:\/\/\S+)/);
    if (u && !token) {
      const url = new URL(u[1]);
      assert(['www.sideseat.de', 'sideseat.de'].includes(url.hostname) && url.protocol === 'https:' && !url.search && !url.hash);
      const match = url.pathname.match(/^\/share\/event\/([A-Za-z0-9_-]{43})$/); assert(match);
      copiedURL = url.href; token = match[1];
      await fs.writeFile(path.join(output, 'owned-share-cleanup.private.json'), JSON.stringify({
        runID: f.runID, ownerID: owner.id, peerID: peer.id, shareURL: copiedURL, token,
        provenance: 'Only the fresh public URL generated and copied through this owned Calendar share UI.',
      }, null, 2) + '\n', { mode: 0o600 });
    }
    const s = log.match(/CALENDAR_SHARE_SOURCE_ID (\S+)/), c = log.match(/CALENDAR_SHARE_COPY_ID (\S+)/);
    if (s) { if (sourceID) assert.equal(s[1], sourceID); else sourceID = s[1]; }
    if (c) { if (copyID) assert.equal(c[1], copyID); else copyID = c[1]; }
    for (const [, phase] of log.matchAll(/CALENDAR_SHARE_PHASE ([a-z-]+)/g)) {
      assert(phases.includes(phase));
      if (checks.some(check => check.phase === phase)) continue;
      assert.equal(phase, phases[checks.length]); checks.push(await verify(phase)); await report();
      await readBarrier.acknowledge(phase);
      console.log('CALENDAR_SHARE_GET verified ' + phase);
    }
    if (log.includes('** TEST EXECUTE FAILED **') || /Test Case .*FiveRootCalendarSharePhoneUITests.* failed/.test(log) || /xcodebuild: error:/.test(log)) throw Error('Native Calendar share execution failed.');
    if (log.includes('** TEST EXECUTE SUCCEEDED **')) {
      assert(/Executed 1 test, with 0 failures/.test(log));
      assert(/Test Case .*testFilteredPersonalShareAddsOneIndependentRecipientCopy.* passed/.test(log));
      assert(!/\b[1-9][0-9]* skipped\b/.test(log)); assert.equal(checks.length, phases.length);
      readAcknowledgements.push(...Array.from(log.matchAll(/FIVE_ROOT_READ_ACK ([a-z][a-z0-9-]*)/g), match => match[1]));
      assert.deepEqual(readAcknowledgements, phases, 'The actual runner must wait for and consume every exact read acknowledgement in order.');
      complete = true; break;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert(complete, 'The complete separate physical Calendar share case must pass.');
} catch (error) {
  failure = error;
  await fs.writeFile(path.join(output, 'private-failure.txt'), String(error?.stack), { mode: 0o600 });
}
await report();
if (failure) { console.error('Calendar share boundary failed; inspect private diagnostics.'); process.exitCode = 1; }
