// Only owned-account GETs and own-runner ACK files. The copied private feed URL
// stays in private evidence. Normal feed GETs may touch its lastAccessedAt.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { baseURL, privateDir, readFixture } from './five-roots-live.mjs';
import { fetchQAGet, qaGETTransportPolicy } from './five-roots-get-transport.mjs';
import { createQAReadBarrier } from './five-roots-read-barrier.mjs';

const [logPath] = process.argv.slice(2), evidence = '/tmp/sideseat-five-roots-private';
assert.equal(process.env.SIDESEAT_CALENDAR_CONNECTIONS_EXECUTE, '1');
assert.equal(baseURL, 'https://api.sideseat.de');
assert(/^\/tmp\/sideseat-five-roots-calendar-connections-[A-Za-z0-9_-]+$/.test(privateDir));
assert(logPath?.startsWith(evidence + '/calendar-connections-') && logPath.endsWith('.log'));
const output = process.env.SIDESEAT_QA_OUTPUT;
assert(output?.startsWith(evidence + '/calendar-connections-'));
await fs.mkdir(output, { recursive: true, mode: 0o700 });
const barrier = await createQAReadBarrier({ expectedRunnerBundle: 'app.sideseat.fiverootscalendarconnectionsqa.xctrunner', outputDir: output });
const f = await readFixture();
assert.equal(f.bundle, 'app.sideseat.mobile.preview');
assert(f.accounts.every(a => a.id && a.accessToken && !a.deleted), 'Prepare fresh owned authentication before this GET-only observer; no refresh POST is allowed.');
const owner = f.accounts.find(a => a.role === 'owner'), peer = f.accounts.find(a => a.role === 'peer');
const appBuild = Number(process.env.SIDESEAT_QA_UI_BUILD);
assert(Number.isSafeInteger(appBuild) && appBuild > 0);
const phases = ['signed-in', 'connections-opened', 'import-cancelled', 'export-year-cancelled', 'export-save-cancelled',
  'connection-created', 'connection-relaunched', 'revoke-cancelled', 'connection-revoked', 'revoked-relaunched'];
const sha = value => createHash('sha256').update(value).digest('hex');
const helperSHA256 = sha(await fs.readFile(new URL('./five-roots-get-transport.mjs', import.meta.url)));
const checks = [], retries = [], acknowledgements = [];
let range, year, connectionID, feedURL, token, externalOutcome, ownerConnection, baselineCategories, baselinePeer;
let phaseName = 'starting', failure, complete = false, retryWrites = Promise.resolve();
async function response(account, endpoint, statuses = [200]) {
  assert(!account || f.accounts.includes(account));
  const url = endpoint.startsWith('https:') ? new URL(endpoint) : new URL(endpoint, baseURL);
  assert(['api.sideseat.de', 'www.sideseat.de', 'sideseat.de'].includes(url.hostname)
    && url.protocol === 'https:' && !url.username && !url.password && !url.hash);
  if (endpoint.startsWith('https:')) assert(!account && feedURL && url.href === feedURL);
  else assert(endpoint.startsWith('/api/v1/') && !endpoint.includes('://'));
  const result = await fetchQAGet(url.href, {
    role: account?.role ?? 'owned-feed', phase: phaseName,
    headers: { 'x-sideseat-platform': 'ios', 'x-sideseat-app-version': '1.0.0', 'x-sideseat-build': String(appBuild),
      ...(account ? { Authorization: `Bearer ${account.accessToken}` } : {}) },
    onRetry: record => {
      retries.push(record);
      retryWrites = retryWrites.then(() => fs.writeFile(path.join(output, 'read-retries.private.json'), JSON.stringify(retries, null, 2) + '\n', { mode: 0o600 }));
      return retryWrites;
    },
  });
  assert(statuses.includes(result.status), 'Owned GET boundary failed; no auth or business fallback.');
  return result;
}
async function get(account, endpoint) {
  const result = await response(account, endpoint), envelope = await result.json(); assert(envelope.data); return envelope.data;
}
async function snapshot(account) {
  assert(range);
  const [me, subscriptions, schedule, categories, search] = await Promise.all([
    get(account, '/api/v1/me'), get(account, '/api/v1/calendar/subscriptions'),
    get(account, `/api/v1/home/schedule?windowStart=${encodeURIComponent(range.start)}&windowEnd=${encodeURIComponent(range.end)}`),
    get(account, '/api/v1/calendar/categories'), get(account, '/api/v1/calendar/search?q=' + encodeURIComponent('Connections ' + f.runID)),
  ]);
  assert.equal(me.id, account.id); assert.equal(me.username, account.identifier);
  assert(Array.isArray(subscriptions.connections) && Array.isArray(schedule.studyEntries) && Array.isArray(schedule.classBlocks)
    && Array.isArray(categories.categories) && Array.isArray(search.results));
  assert.equal(schedule.studyEntries.length, 0, 'This boundary case never creates or imports a Calendar event.');
  assert.equal(schedule.classBlocks.length, 0); assert.equal(search.results.length, 0);
  assert(categories.categories.every(c => c.presetKey));
  return { connections: subscriptions.connections,
    categories: categories.categories.sort((a, b) => a.id.localeCompare(b.id)) };
}
async function noOtherBusiness() {
  await Promise.all(f.accounts.map(async account => {
    const [polls, contacts, inbox] = await Promise.all([
      get(account, '/api/v1/time-polls'), get(account, '/api/v1/contacts'), get(account, '/api/v1/inbox'),
    ]);
    assert.deepEqual(polls.polls, []); assert.deepEqual(contacts.contacts, []);
    assert.deepEqual(inbox.conversations, []); assert.deepEqual(inbox.messageRequests, []);
  }));
}
async function checkExport() {
  const exported = await get(owner, '/api/v1/calendar/export?year=' + year);
  assert.equal(exported.filename, `sideseat-schedule-${year}.ics`);
  assert.equal(exported.mediaType, 'text/calendar; charset=utf-8');
  assert(typeof exported.ics === 'string' && exported.ics.includes('BEGIN:VCALENDAR') && exported.ics.includes('END:VCALENDAR'));
  assert(!exported.ics.includes('BEGIN:VEVENT'), 'The owned empty account must export no personal or foreign events.');
}
async function verify(phase) {
  phaseName = phase;
  const index = phases.indexOf(phase), [a, p] = await Promise.all([snapshot(owner), snapshot(peer)]);
  assert.equal(p.connections.length, 0);
  const peerState = JSON.stringify(p); baselinePeer ??= peerState; assert.equal(peerState, baselinePeer, 'The second owned account must remain unchanged.');
  const categories = JSON.stringify(a.categories); baselineCategories ??= categories; assert.equal(categories, baselineCategories);
  const active = index >= phases.indexOf('connection-created') && index < phases.indexOf('connection-revoked');
  assert.equal(a.connections.length, active ? 1 : 0, 'Only the single owned active connection is allowed.');
  if (active) {
    assert(connectionID && feedURL && token && externalOutcome);
    const link = a.connections[0]; assert.equal(link.id, connectionID); assert.equal(link.label, 'Apple Calendar');
    assert(Number.isFinite(Date.parse(link.createdAt)) && Date.parse(link.createdAt) >= Date.parse(f.createdAt) - 10_000);
    const stable = JSON.stringify({ id: link.id, label: link.label, createdAt: link.createdAt });
    ownerConnection ??= stable; assert.equal(stable, ownerConnection, 'Relaunch/cancel must not recreate the connection or token.');
    const feed = await response(null, feedURL);
    assert(feed.headers.get('content-type')?.startsWith('text/calendar'));
    const ics = await feed.text(); assert(ics.includes('BEGIN:VCALENDAR') && ics.includes('END:VCALENDAR') && !ics.includes('BEGIN:VEVENT'));
  } else if (index >= phases.indexOf('connection-revoked')) {
    assert(feedURL);
    const feed = await response(null, feedURL, [404]);
    assert.equal(feed.headers.get('cache-control'), 'no-store');
  }
  if (phase === 'export-save-cancelled' || phase === 'revoked-relaunched') await checkExport();
  if (phase === 'signed-in' || phase === 'revoked-relaunched') await noOtherBusiness();
  return { phase, activeOwnedConnections: a.connections.length, peerUnchanged: true, categoriesUnchanged: true,
    boundedCalendarRows: 0, privateFeedChecked: active, revokedFeed404Checked: index >= phases.indexOf('connection-revoked'),
    exportEnvelopeChecked: phase === 'export-save-cancelled' || phase === 'revoked-relaunched' };
}
async function report() {
  await fs.writeFile(path.join(output, 'calendar-connections-real-flow.json'), JSON.stringify({
    passed: complete && !failure, appBuild, surface: 'default physical iPhone14Plus', phases, checks,
    runSHA256: sha(f.runID), subscriptionTokenSHA256: token ? sha(token) : null, acknowledgements, externalOutcome,
    externalCancellationVerified: ['system-open-cancelled', 'calendar-subscription-cancelled'].includes(externalOutcome),
    businessWrites: 'App UI only. Observer GET only plus own-runner ACK. Public feed GET normally touches owned lastAccessedAt.',
    scope: 'Own private connection create/relogin/cancel-revoke/revoke404; import/export system pickers cancelled without choosing or saving files.',
    exclusions: 'No Apple Calendar subscription confirmation, ordinary system calendar access, actual ICS file import or file save. External unrecognized-return outcome is not a successful cancellation claim.',
    transportHelperSHA256: helperSHA256, transportPolicy: qaGETTransportPolicy, readRetryCount: retries.length, readRetries: retries,
    failure: failure ? { message: 'Calendar connections boundary failed; inspect private diagnostics.' } : null,
  }, null, 2) + '\n', { mode: 0o600 });
}
try {
  const deadline = Date.now() + 30 * 60_000;
  while (Date.now() < deadline) {
    const log = await fs.readFile(logPath, 'utf8').catch(() => '');
    const rangeMarker = log.match(/CALENDAR_CONNECTIONS_EXPECTED_WINDOW (\S+) (\S+) ([0-9]{4})/);
    if (rangeMarker && !range) {
      range = { start: rangeMarker[1], end: rangeMarker[2] }; year = Number(rangeMarker[3]);
      assert(Number.isFinite(Date.parse(range.start)) && Date.parse(range.end) > Date.parse(range.start));
      assert(year >= 2000 && year <= 2100);
    }
    const id = log.match(/CALENDAR_CONNECTIONS_OWNED_ID ([A-Za-z0-9_-]+)/);
    if (id) { if (connectionID) assert.equal(id[1], connectionID); else connectionID = id[1]; }
    const copied = log.match(/CALENDAR_CONNECTIONS_OWNED_URL (https:\/\/\S+)/);
    if (copied && !feedURL) {
      const url = new URL(copied[1]);
      assert(['api.sideseat.de', 'www.sideseat.de', 'sideseat.de'].includes(url.hostname)
        && url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash);
      const match = url.pathname.match(/^\/api\/public\/calendar-subscriptions\/([A-Za-z0-9_-]{43})\.ics$/); assert(match);
      feedURL = url.href; token = match[1];
      await fs.writeFile(path.join(output, 'owned-subscription-cleanup.private.json'), JSON.stringify({ runID: f.runID,
        ownerID: owner.id, connectionID, feedURL, token, provenance: 'Actual owned App create + Copy private link UI.' }, null, 2) + '\n', { mode: 0o600 });
    }
    const external = log.match(/CALENDAR_CONNECTIONS_EXTERNAL_OUTCOME ([a-z-]+)/);
    if (external) {
      assert(['system-open-cancelled', 'calendar-subscription-cancelled', 'preview-callback-notice-no-subscription',
        'external-return-only-unverified-cancel'].includes(external[1])); externalOutcome = external[1];
    }
    for (const [, phase] of log.matchAll(/CALENDAR_CONNECTIONS_PHASE ([a-z-]+)/g)) {
      assert(phases.includes(phase)); if (checks.some(check => check.phase === phase)) continue;
      assert.equal(phase, phases[checks.length]); checks.push(await verify(phase)); await report();
      await barrier.acknowledge(phase); console.log('CALENDAR_CONNECTIONS_GET verified ' + phase);
    }
    if (log.includes('** TEST EXECUTE FAILED **') || /Test Case .*FiveRootCalendarConnectionsPhoneUITests.* failed/.test(log)
      || /xcodebuild: error:/.test(log)) throw Error('Native Calendar connections case failed.');
    if (log.includes('** TEST EXECUTE SUCCEEDED **')) {
      assert(/Executed 1 test, with 0 failures/.test(log));
      assert(/Test Case .*testOwnedSubscriptionLifecycleAndTransferCancellationBoundaries.* passed/.test(log));
      assert(!/\b[1-9][0-9]* skipped\b/.test(log)); assert.equal(checks.length, phases.length);
      acknowledgements.push(...Array.from(log.matchAll(/FIVE_ROOT_READ_ACK ([a-z][a-z0-9-]*)/g), match => match[1]));
      assert.deepEqual(acknowledgements, phases); complete = true; break;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert(complete, 'The complete separate connections boundary case must actually pass.');
} catch (error) {
  failure = error; await fs.writeFile(path.join(output, 'private-failure.txt'), String(error?.stack), { mode: 0o600 });
}
await report();
if (failure) { console.error('Calendar connections boundary failed; inspect private diagnostics.'); process.exitCode = 1; }
