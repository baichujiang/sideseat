// Dedicated real APNs experiment: explicit owner API setup/triggers; the participant and notification taps use real phone UI.
// This does not substitute for the complete native main/input/activity cases.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { base, privatePath, readFixture, call, route, calendars, assertCalendarRows, persist } from './plan-six-participant-phone.mjs';

const [mode, logPath] = process.argv.slice(2);
const root = '/tmp/sideseat-five-roots-private';
const out = process.env.SIDESEAT_QA_OUTPUT;
const appBuild = Number(process.env.SIDESEAT_QA_UI_BUILD || '238');
assert(['prepare', 'observe'].includes(mode), 'Use prepare or observe LOG.');
assert.equal(base, 'https://api.sideseat.de');
assert.equal(privatePath, root + '/plan-tmp/sideseat-plan-six-private.json');
assert(Number.isSafeInteger(appBuild) && appBuild > 0);
assert(typeof out === 'string' && path.dirname(out) === root && /^plan-localized-push-[a-zA-Z0-9_-]+$/.test(path.basename(out)), 'Use a private unique push experiment directory.');
assert((await fs.lstat(root)).isDirectory() && (await fs.lstat(privatePath)).isFile());
await fs.mkdir(out, { recursive: true, mode: 0o700 });
assert((await fs.lstat(out)).isDirectory()); await fs.chmod(out, 0o700);
if (mode === 'observe') assert(typeof logPath === 'string' && path.dirname(logPath) === root
  && /^plan-localized-push-[a-zA-Z0-9_-]+\.log$/.test(path.basename(logPath)), 'Observe only this private physical-run log.');
const f = await readFixture();
const roles = ['owner', 'peer1', 'peer2', 'peer3', 'peer4', 'peer5'];
assert.equal(f.kind, 'five-roots-plans-live'); assert.equal(f.schemaVersion, 1);
assert.equal(f.baseURL, base); assert.equal(f.bundle, 'app.sideseat.mobile.preview'); assert(/^[a-f0-9]{8}$/.test(f.runID));
assert.equal(f.accounts.length, 6); assert.deepEqual(f.accounts.map(a => a.role).sort(), [...roles].sort());
assert.equal(new Set(f.accounts.map(a => a.id)).size, 6); assert.equal(new Set(f.accounts.map(a => a.displayName)).size, 6);
assert(f.accounts.every(a => a.identifier === `pqa_six_${a.role}_${f.runID}` && a.accessToken));
assert(f.edgePrefix?.includes(f.runID) && f.tokens.includes(f.pollToken));
const accounts = roles.map(role => f.accounts.find(a => a.role === role)), [owner, peer] = accounts;
const title = f.edgePrefix + ' push-中文 %@ 100%', location = f.edgePrefix + ' 推送测试地点';
const phases = ['invitation-ready', 'invitation-opened', 'peer-accepted', 'publication-ready', 'publication-opened',
  'calendar-verified', 'cancellation-ready', 'cancellation-opened', 'calendar-cleared', 'complete'];
const sha = value => createHash('sha256').update(value).digest('hex');
const get = (endpoint, account) => call(endpoint, account, 'GET');
const privateJSON = (name, value) => fs.writeFile(path.join(out, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
const businessSHA = p => sha(JSON.stringify({ title: p.title, location: p.location, phase: p.phase, planningMode: p.planningMode,
  timeZone: p.timeZone, dates: p.dates, startMinute: p.startMinute, endMinute: p.endMinute, slots: p.slots, updatedAt: p.updatedAt,
  expectedCount: p.expectedCount, durationMinutes: p.durationMinutes, chosenStart: p.chosenStart, chosenEnd: p.chosenEnd,
  invitationVersion: p.invitationVersion, participants: p.participants, invitations: p.invitations, activitySelection: p.activitySelection,
  sharedWithUserIds: p.sharedWithUserIds, invitees: p.invitees, mySlotIds: p.mySlotIds, summary: p.summary }));
const calendarSHA = value => sha(JSON.stringify(value.rows.map(rows => rows.map(row => ({ id: row.id, title: row.title,
  location: row.location, startISO: row.startISO, endISO: row.endISO, timePollToken: row.timePollToken,
  eventParticipants: row.eventParticipants })).sort((a, b) => a.id.localeCompare(b.id)))));
const baselineFile = path.join(out, 'protected-plans.private.json');
let baseline = [], current = 'starting', failure, completed = false;
const checks = [];
async function protect() {
  for (const entry of baseline) {
    const p = await get(route(entry), owner);
    assert.equal(businessSHA(p), entry.businessSHA, 'Do not mutate the native main, input or activity plans.');
    assert.equal(calendarSHA(await calendars(p, accounts)), entry.calendarSHA, 'Do not change any preceding plan Calendar.');
  }
}
function ownedPush() {
  assert(f.localizedPush?.preparedAt && f.localizedPush.title === title && f.localizedPush.location === location);
  assert(f.tokens.includes(f.localizedPush.token) && f.localizedPush.token !== f.pollToken);
  assert(!baseline.some(p => p.token === f.localizedPush.token), 'The push plan must be independent of all completed native plans.');
  return f.localizedPush;
}
const report = async () => privateJSON('localized-push-real-flow.json', {
  passed: completed && !failure, appBuild, runSHA256: sha(f.runID), phases, checks,
  physicalUDID: '00008110-001A69110CC1401E', realAPNsRequired: true,
  setupAndTriggers: 'Explicit API creation/responses and owner invite/publish/cancel on one independent owned push plan only',
  participantAndNotificationSurface: 'Real form login, foreground Chinese notice pixels/AX, actual banner taps, acceptance and Calendar through phone UI',
  notAReplacementForNativeMainFlow: true, systemBackgroundLanguageNotClaimed: true,
  deliveryIsNotInferredFromHTTP: true, completedCases: completed && !failure ? 1 : 0,
  failure: failure ? { phase: current, message: 'Failed dedicated push acceptance; private diagnostics retained.' } : null,
  harnessSHA256: sha(await fs.readFile(new URL(import.meta.url))), at: new Date().toISOString(),
});

async function prepare() {
  assert(!f.localizedPush, 'Never replace an existing push experiment. Retain it for explicit cleanup.');
  assert(!(await fs.readdir(out)).includes('localized-push-prepared.json'), 'Use a fresh private preparation directory.');
  const own = (await get('/api/v1/time-polls', owner)).polls;
  assert(own.every(p => f.tokens.includes(p.token)), 'Every preceding owned plan must already be tracked.');
  assert(!own.some(p => p.title === title));
  for (const [name, phase] of [[f.title, 'CANCELLED'], [f.edgePrefix + ' 日期跨月', 'CONFIRMED'], [f.edgePrefix + ' 咖啡休息', 'CANCELLED']]) {
    const found = own.filter(p => p.isOwner && p.title === name);
    assert.equal(found.length, 1, 'Complete each native plan flow before the independent push experiment.');
    assert.equal(found[0].phase, phase);
  }
  for (const token of f.tokens) {
    const p = await get(route({ token }), owner); assert(p.isOwner);
    baseline.push({ token, businessSHA: businessSHA(p), calendarSHA: calendarSHA(await calendars(p, accounts)) });
  }
  await privateJSON('protected-plans.private.json', { runSHA256: sha(f.runID), entries: baseline });
  const date = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  let p = await call('/api/v1/time-polls', owner, 'POST', { title, location, dates: [date], timeZone: 'Europe/Berlin',
    startMinute: 540, endMinute: 660, planningMode: 'COLLECT' }, 201);
  f.tokens.push(p.token); f.localizedPush = { preparedAt: new Date().toISOString(), token: p.token, title, location };
  await persist(f); ownedPush();
  for (const a of [owner, peer]) await call(route(p) + '/response', a, 'PUT', { displayName: a.displayName, slotIds: [0, 1, 2, 3] });
  p = await get(route(p), owner);
  assert.equal(p.phase, 'COLLECTING'); assert.equal(p.invitationVersion, 0); assert.equal(p.participants.length, 2);
  assert.deepEqual(p.invitations, []); assert.deepEqual(p.sharedWithUserIds, []);
  assertCalendarRows(p, accounts, await calendars(p, accounts), []); await protect();
  await privateJSON('localized-push-prepared.json', { passed: true, runSHA256: sha(f.runID), independentPlans: 1,
    explicitAPIPreconditions: 'Two owned submitted responses [0..3]; no share/invite/publish or push before UI readiness',
    protectedNativePlans: baseline.length, at: new Date().toISOString() });
  console.log('Prepared one independent real APNs experiment; no notification triggered before phone readiness.');
}

async function act(phase) {
  const plan = ownedPush(), index = phases.indexOf(phase);
  let p = await get(route(plan), owner), action = 'GET-only state verification';
  if (phase === 'invitation-ready') {
    assert.equal(p.phase, 'COLLECTING'); assert.equal(p.invitationVersion, 0);
    p = await call(route(plan) + '/invitations', owner, 'POST', { version: 0, start: p.slots[0].start,
      end: p.slots[3].end, attendeeIds: p.participants.map(person => person.id) });
    action = 'Explicit independent owner API invitation triggers real APNs; delivery still requires the actual phone banner';
  } else if (phase === 'publication-ready') {
    assert.equal(p.phase, 'INVITING'); assert.equal(p.invitations.find(person => person.displayName === peer.displayName)?.status, 'ACCEPTED');
    p = await call(route(plan) + '/publish', owner, 'POST', { version: p.invitationVersion });
    action = 'Explicit independent owner API publication after real UI acceptance triggers real APNs';
  } else if (phase === 'cancellation-ready') {
    assert.equal(p.phase, 'CONFIRMED');
    p = await call(route(plan) + '/cancel', owner, 'POST', { version: p.invitationVersion });
    action = 'Explicit independent owner API cancellation triggers real APNs';
  }
  const cancelled = index >= phases.indexOf('cancellation-ready'), confirmed = index >= phases.indexOf('publication-ready') && !cancelled;
  const view = await get(route(plan), peer);
  assert.equal(p.phase, cancelled ? 'CANCELLED' : confirmed ? 'CONFIRMED' : 'INVITING');
  assert.equal(view.phase, p.phase); assert.equal(p.title, title); assert.equal(view.title, title); assert.equal(p.location, location);
  assert.equal(p.invitationVersion, 1); assert.equal(p.planningMode, 'COLLECT'); assert.equal(p.expectedCount, null);
  assert.equal(p.chosenStart, p.slots[0].start); assert.equal(p.chosenEnd, p.slots[3].end);
  assert.equal(Date.parse(p.chosenEnd) - Date.parse(p.chosenStart), 3_600_000);
  const clock = iso => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
  assert.equal(clock(p.chosenStart), '09:00'); assert.equal(clock(p.chosenEnd), '10:00');
  for (const [i, snapshot] of [p, view].entries()) {
    assert.equal(snapshot.participants.length, 2); assert.deepEqual(snapshot.mySlotIds, [0, 1, 2, 3]);
    for (const person of snapshot.participants) { assert.deepEqual(person.slotIds, [0, 1, 2, 3]); assert.equal(person.isGuest, false); }
    assert.equal(snapshot.invitations.length, 2);
    for (const account of [owner, peer]) {
      const person = snapshot.invitations.find(item => item.displayName === account.displayName);
      assert(person?.selected && !person.isGuest); assert.equal(person.isMe, account.id === accounts[i].id);
      const statuses = account.role === 'owner' || index >= phases.indexOf('peer-accepted') ? ['ACCEPTED']
        : phase === 'invitation-opened' ? ['INVITED', 'ACCEPTED'] : ['INVITED'];
      assert(statuses.includes(person.status), 'Only the physical peer UI may advance acceptance.');
    }
  }
  const included = confirmed ? ['owner', 'peer1'] : [], result = await calendars(p, accounts);
  assertCalendarRows(p, accounts, result, included);
  for (const [i, rows] of result.rows.entries()) for (const row of rows) {
    const other = i === 0 ? peer : owner;
    assert.deepEqual(row.eventParticipants, [{ userId: other.id, name: other.displayName }]);
  }
  if (['calendar-verified', 'calendar-cleared', 'complete'].includes(phase)) {
    const rows = await Promise.all(accounts.map(async a => (await get('/api/v1/calendar/search?q=' + encodeURIComponent(title), a)).results.filter(row => row.timePollToken === plan.token)));
    assertCalendarRows(p, accounts, { rows }, included);
  }
  await protect();
  return { phase, action, actualPhase: p.phase, acceptedCount: p.invitations.filter(person => person.status === 'ACCEPTED').length,
    calendarCounts: Object.fromEntries(accounts.map((a, i) => [a.role, result.rows[i].length])), protectedNativePlansUnchanged: true,
    literalPlanTitlePreserved: true, at: new Date().toISOString() };
}

try {
  if (mode === 'prepare') await prepare();
  else {
    assert(!(await fs.readdir(out)).includes('localized-push-real-flow.json'), 'Do not replay notifications or mix failed acceptance evidence.');
    assert((await fs.lstat(baselineFile)).isFile());
    const saved = JSON.parse(await fs.readFile(baselineFile, 'utf8')); assert.equal(saved.runSHA256, sha(f.runID));
    baseline = saved.entries; assert(baseline.length >= 3); ownedPush(); await protect(); await report();
    const deadline = Date.now() + 20 * 60_000;
    while (Date.now() < deadline) {
      const log = await (async () => { try { assert((await fs.lstat(logPath)).isFile()); return await fs.readFile(logPath, 'utf8'); }
        catch (error) { if (error.code === 'ENOENT') return ''; throw error; } })();
      for (const [, phase] of log.matchAll(/PLAN_LOCALIZED_PUSH_PHASE ([a-z-]+)/g)) {
        assert(phases.includes(phase)); if (checks.some(check => check.phase === phase)) continue;
        current = phase; assert.equal(phase, phases[checks.length], 'Physical push handshakes must remain ordered.');
        const check = await act(phase); checks.push(check);
        await privateJSON(`phase-${String(checks.length).padStart(2, '0')}-${phase}.json`, check); await report();
        console.log('PLAN_LOCALIZED_PUSH_API verified ' + phase);
      }
      assert(!log.includes('** TEST EXECUTE FAILED **') && !/Test Case .*FiveRootPlanLocalizedPushPhoneUITests.* (?:failed|skipped)/i.test(log)
        && !/xcodebuild: error:/.test(log), 'The real foreground push UI acceptance must not fail or skip.');
      if (log.includes('** TEST EXECUTE SUCCEEDED **')) {
        assert(/Executed 1 test, with 0 failures/.test(log)); assert.equal(checks.length, phases.length);
        await protect(); completed = true; break;
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert(completed, 'Real foreground APNs acceptance did not complete. HTTP success is insufficient.');
  }
} catch (error) {
  failure = error; await fs.writeFile(path.join(out, 'private-failure.txt'), String(error?.stack), { mode: 0o600 });
  console.error('Dedicated localized push experiment failed; private diagnostics retained.'); process.exitCode = 1;
}
if (mode === 'observe' || failure) await report();
