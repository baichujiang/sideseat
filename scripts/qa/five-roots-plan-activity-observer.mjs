// Observe the current activity flow. Business writes belong exclusively to the physical App UI.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { base, privatePath, readFixture, call, route, assertCalendarRows, persist } from './plan-six-participant-phone.mjs';

const [logPath] = process.argv.slice(2);
const root = '/tmp/sideseat-five-roots-private';
const out = process.env.SIDESEAT_QA_OUTPUT;
const appBuild = Number(process.env.SIDESEAT_QA_UI_BUILD || '238');
assert(Number.isSafeInteger(appBuild) && appBuild > 0, 'Supply a positive actual App build.');
assert.equal(base, 'https://api.sideseat.de');
assert.equal(privatePath, root + '/plan-tmp/sideseat-plan-six-private.json');
assert(typeof logPath === 'string' && /^plan-activity-[a-zA-Z0-9_-]+\.log$/.test(path.basename(logPath)) && path.dirname(logPath) === root,
  'Use this stage\'s unique private physical-test log.');
assert(typeof out === 'string' && /^plan-activity-[a-zA-Z0-9_-]+$/.test(path.basename(out)) && path.dirname(out) === root,
  'Use a unique private activity evidence directory.');
assert((await fs.lstat(root)).isDirectory(), 'The private root must be a real directory.');
assert((await fs.lstat(path.dirname(privatePath))).isDirectory(), 'The private TMPDIR must be a real directory.');
assert((await fs.lstat(privatePath)).isFile(), 'The fixture must be a regular private file.');
await fs.chmod(root, 0o700);
await fs.mkdir(out, { recursive: true, mode: 0o700 });
assert((await fs.lstat(out)).isDirectory(), 'The output must be a real directory.');
await fs.chmod(out, 0o700);
assert(!(await fs.readdir(out)).includes('activity-real-flow.json'), 'Never mix this attempt with previous activity evidence.');

const f = await readFixture();
const roles = ['owner', 'peer1', 'peer2', 'peer3', 'peer4', 'peer5'];
assert.equal(f.kind, 'five-roots-plans-live');
assert.equal(f.schemaVersion, 1);
assert.equal(f.baseURL, base);
assert.equal(f.bundle, 'app.sideseat.mobile.preview');
assert(/^[a-f0-9]{8}$/.test(f.runID));
assert.equal(f.accounts.length, roles.length);
assert.deepEqual(f.accounts.map(a => a.role).sort(), [...roles].sort());
assert.equal(new Set(f.accounts.map(a => a.id)).size, roles.length);
assert.equal(new Set(f.accounts.map(a => a.displayName)).size, roles.length);
assert(f.accounts.every(a => a.identifier === `pqa_six_${a.role}_${f.runID}` && typeof a.accessToken === 'string' && a.accessToken.length > 0));
assert(typeof f.edgePrefix === 'string' && f.edgePrefix.includes(f.runID));
assert(Array.isArray(f.tokens) && new Set(f.tokens).size === f.tokens.length && f.tokens.includes(f.pollToken));
const accounts = roles.map(role => f.accounts.find(a => a.role === role));
const [owner, peer] = accounts;
const connection = f.connections.find(c => c.peerRole === 'peer1');
assert(connection?.connectionID, 'The owned App contact must already exist.');
const title = f.edgePrefix + ' 双人活动';
const ownerIdea = f.edgePrefix + ' 图书馆复习';
const peerIdea = f.edgePrefix + ' 咖啡休息';
const location = f.edgePrefix + ' 校园';
const inputTitle = f.edgePrefix + ' 日期跨月';
const targetNames = [title, ownerIdea, peerIdea];
const phases = ['created', 'owner-proposed', 'owner-submitted', 'app-shared', 'peer-proposed-and-voted', 'peer-submitted',
  'owner-voted-and-selected', 'invited', 'peer-accepted', 'published', 'owner-calendar-verified', 'peer-calendar-verified', 'cancelled', 'calendar-cleared'];
const sha = value => createHash('sha256').update(value).digest('hex');
async function get(endpoint, account, scope = { operation: 'owned-domain-get' }) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await call(endpoint, account, 'GET'); }
    catch (error) {
      // The shared helper emits this exact Error only when fetch rejects, not for HTTP assertions or JSON/business failures.
      if (attempt !== 0 || error?.name !== 'Error' || !/^GET [^\r\n]+: transport failed; private fixture retained$/.test(error.message)) throw error;
      const retry = { ...scope, role: account.role, phase: current, endpointSHA256: sha(endpoint),
        retry: 1, backoffMs: 750, reason: 'GET transport failure', at: new Date().toISOString() };
      readRetries.push(retry);
      await fs.appendFile(path.join(out, 'read-retries.private.jsonl'), JSON.stringify(retry) + '\n', { mode: 0o600 });
      console.log('PLAN_ACTIVITY_GET_RETRY ' + scope.operation + ' ' + account.role);
      await new Promise(resolve => setTimeout(resolve, 750));
    }
  }
}
async function readCalendars(p) {
  // Same complete bounded interval and token filter as the shared calendars helper; route each individual GET through transport-only retry.
  const starts = [p.chosenStart, ...p.slots.map(s => s.start)].filter(Boolean).map(Date.parse);
  const ends = [p.chosenEnd, ...p.slots.map(s => s.end)].filter(Boolean).map(Date.parse);
  const windowStart = new Date(Math.min(...starts) - 86_400_000).toISOString();
  const windowEnd = new Date(Math.max(...ends) + 86_400_000).toISOString();
  const rows = await Promise.all(accounts.map(async account => {
    const value = await get(`/api/v1/home/schedule?windowStart=${encodeURIComponent(windowStart)}&windowEnd=${encodeURIComponent(windowEnd)}`, account,
      { operation: 'bounded-calendar', planSHA256: sha(p.token), windowStart, windowEnd });
    return value.studyEntries.filter(entry => entry.timePollToken === p.token);
  }));
  return { rows, windowStart, windowEnd };
}
const business = p => JSON.stringify({ title: p.title, location: p.location, timeZone: p.timeZone, dates: p.dates,
  startMinute: p.startMinute, endMinute: p.endMinute, slots: p.slots, phase: p.phase, planningMode: p.planningMode,
  durationMinutes: p.durationMinutes, expectedCount: p.expectedCount, updatedAt: p.updatedAt,
  chosenStart: p.chosenStart, chosenEnd: p.chosenEnd, invitationVersion: p.invitationVersion,
  participants: p.participants, invitees: p.invitees, mySlotIds: p.mySlotIds, didRespond: p.didRespond,
  summary: p.summary, invitations: p.invitations, sharedWithUserIds: p.sharedWithUserIds, activitySelection: p.activitySelection });
const calendarFingerprint = result => JSON.stringify(result.rows.map(rows => rows.map(row => ({ id: row.id, title: row.title,
  location: row.location, startISO: row.startISO, endISO: row.endISO, timePollToken: row.timePollToken,
  eventParticipants: row.eventParticipants })).sort((a, b) => a.id.localeCompare(b.id))));
const checks = [];
const readRetries = [];
let token, failure, completed = false, baselineReady = false, current = 'starting', baseline = [];
const privateJSON = (name, value) => fs.writeFile(path.join(out, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
const report = async () => privateJSON('activity-real-flow.json', {
  passed: completed && !failure, appBuild, physicalUDID: '00008110-001A69110CC1401E', phases, checks,
  realNetwork: true, businessWrites: 'Physical App UI only; observer uses GET and local token bookkeeping',
  completedCases: completed && !failure ? 1 : 0, failedChecks: failure ? 1 : 0, skippedChecks: 0,
  baselineReady, readRetryCount: readRetries.length, readRetryScopes: readRetries, maxTransportRetriesPerGET: 1,
  protectedPlansUnchanged: checks.length > 0 && checks.every(check => check.protectedPlansUnchanged),
  runSHA256: sha(f.runID), harnessSHA256: sha(await fs.readFile(new URL(import.meta.url))),
  failure: failure ? { phase: current, message: 'Failed activity boundary; private diagnostics retained.' } : null,
  at: new Date().toISOString(),
});

async function protectExistingPlans() {
  for (const entry of baseline) {
    const p = await get(route(entry.poll), owner);
    assert.equal(business(p), entry.business, 'An earlier owned plan must retain its complete business state.');
    const calendar = await readCalendars(entry.poll);
    assert.equal(calendarFingerprint(calendar), entry.calendar, 'An earlier owned plan must retain its Calendar rows.');
  }
}

function verifyResponses(p, account, phase) {
  const index = phases.indexOf(phase);
  const submittedRoles = index >= phases.indexOf('peer-submitted') ? ['owner', 'peer1']
    : index >= phases.indexOf('owner-submitted') ? ['owner'] : [];
  assert.equal(p.summary.participantCount, submittedRoles.length);
  assert.equal(p.participants.length, submittedRoles.length);
  assert.equal(p.isOwner, account.role === 'owner');
  assert.deepEqual(p.mySlotIds, submittedRoles.includes(account.role) ? [0, 1, 2, 3] : []);
  assert.equal(p.didRespond, submittedRoles.includes(account.role));
  assert.equal(p.participants.filter(person => person.isMe).length, submittedRoles.includes(account.role) ? 1 : 0);
  assert.deepEqual(p.participants.map(person => person.displayName).sort(), submittedRoles.map(role => accounts.find(a => a.role === role).displayName).sort());
  for (const person of p.participants) {
    assert.deepEqual(person.slotIds, [0, 1, 2, 3]);
    assert.equal(person.didRespond, true); assert.equal(person.isGuest, false);
  }
  assert.deepEqual(p.summary.counts, p.slots.map(slot => [0, 1, 2, 3].includes(slot.id) ? submittedRoles.length : 0));
}

function verifyIdeas(p, account, phase) {
  const index = phases.indexOf(phase), activity = p.activitySelection;
  const hasOwner = index >= phases.indexOf('owner-proposed');
  const hasPeer = index >= phases.indexOf('peer-proposed-and-voted');
  const finalChoice = index >= phases.indexOf('invited');
  assert(activity, 'The normal timetable must retain the optional activity proposal capability.');
  assert.equal(activity.topic, title);
  assert.equal(activity.isOpen, !finalChoice);
  assert.equal(activity.ideaCount, hasPeer ? 2 : hasOwner ? 1 : 0);
  assert.equal(activity.ideas.length, activity.ideaCount);
  assert.equal(activity.hasParticipated, account.role === 'owner' ? hasOwner : hasPeer);
  for (const [ideaTitle, author] of [[ownerIdea, owner], [peerIdea, peer]]) {
    const idea = activity.ideas.find(item => item.title === ideaTitle);
    const present = author.role === 'owner' ? hasOwner : hasPeer;
    assert.equal(Boolean(idea), present);
    if (!idea) continue;
    assert.equal(idea.authorName, author.displayName); assert.equal(idea.isMine, account.id === author.id);
    assert.equal(idea.location, null, 'Empty idea locations must keep the original plan place.');
    const voters = author.role === 'owner' ? [owner, ...(hasPeer ? [peer] : [])]
      : [peer, ...(index >= phases.indexOf('owner-voted-and-selected') ? [owner] : [])];
    assert.deepEqual(idea.interestedBy.map(person => person.displayName).sort(), voters.map(person => person.displayName).sort());
    assert.equal(idea.interestedBy.filter(person => person.isMe).length, voters.some(person => person.id === account.id) ? 1 : 0);
  }
  assert.equal(activity.selectedIdeaId, finalChoice ? activity.ideas.find(idea => idea.title === peerIdea).id : null,
    'Picking an activity before Send must remain a private draft.');
}

async function verify(phase) {
  const index = phases.indexOf(phase), invited = index >= phases.indexOf('invited');
  const published = index >= phases.indexOf('published'), cancelled = index >= phases.indexOf('cancelled');
  const own = (await get('/api/v1/time-polls', owner)).polls;
  assert(own.every(p => f.tokens.includes(p.token) || targetNames.includes(p.title)), 'No unrelated plan may be created by this case.');
  const matching = own.filter(p => p.isOwner && targetNames.includes(p.title));
  assert.equal(matching.length, 1, 'The physical App must create exactly one uniquely named activity plan.');
  if (!token) {
    token = matching[0].token;
    assert(!f.tokens.includes(token), 'This activity case must create a fresh owned plan.');
    f.tokens.push(token); await persist(f);
  }
  assert.equal(matching[0].token, token);
  const [views] = await Promise.all([Promise.all([owner, peer].map(account => get(route({ token }), account))), protectExistingPlans()]);
  const p = views[0];
  assert.equal(p.title, invited ? peerIdea : title); assert.equal(p.location, location);
  assert.equal(p.timeZone, 'Europe/Berlin'); assert.equal(p.planningMode, 'COLLECT');
  assert.equal(p.expectedCount, null, 'An invitation to actual respondents must not become the open-link branch.');
  assert.equal(p.phase, cancelled ? 'CANCELLED' : published ? 'CONFIRMED' : invited ? 'INVITING' : 'COLLECTING');
  assert.equal(p.invitationVersion, invited ? 1 : 0);
  for (const [i, view] of views.entries()) {
    assert.equal(view.token, token); assert.equal(view.phase, p.phase); assert.equal(view.title, p.title);
    assert.deepEqual(view.slots, p.slots); assert.equal(view.location, location);
    verifyResponses(view, accounts[i], phase); verifyIdeas(view, accounts[i], phase);
  }
  if (invited) {
    assert.equal(p.chosenStart, p.slots.find(slot => slot.id === 0).start);
    assert.equal(p.chosenEnd, p.slots.find(slot => slot.id === 3).end);
    const clock = iso => new Intl.DateTimeFormat('en-GB', { timeZone: p.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
    assert.equal(clock(p.chosenStart), '09:00'); assert.equal(clock(p.chosenEnd), '10:00');
    assert.equal(Date.parse(p.chosenEnd) - Date.parse(p.chosenStart), 3_600_000);
    assert.equal(p.invitations.length, 2);
    for (const [i, view] of views.entries()) {
      assert.equal(view.chosenStart, p.chosenStart); assert.equal(view.chosenEnd, p.chosenEnd);
      assert.equal(view.invitations.length, 2);
      for (const account of [owner, peer]) {
        const person = view.invitations.find(item => item.displayName === account.displayName);
        assert(person); assert.equal(person.selected, true); assert.equal(person.isGuest, false);
        assert.equal(person.isMe, account.id === accounts[i].id);
        assert.equal(person.status, account.role === 'owner' || index >= phases.indexOf('peer-accepted') ? 'ACCEPTED' : 'INVITED');
      }
    }
  } else {
    assert.equal(p.chosenStart, null); assert.equal(p.chosenEnd, null); assert.deepEqual(p.invitations, []);
  }
  const isShared = index >= phases.indexOf('app-shared');
  assert.deepEqual(p.sharedWithUserIds, isShared ? [peer.id] : []);
  if (phase === 'created' || phase === 'app-shared') {
    const messages = (await get(`/api/v1/connections/${connection.connectionID}/messages`, peer)).messages;
    assert.equal(messages.filter(message => message.body?.includes('/time-polls/' + token)).length, isShared ? 1 : 0);
  }
  const included = published && !cancelled ? ['owner', 'peer1'] : [];
  const calendar = await readCalendars(p);
  assertCalendarRows(p, accounts, calendar, included);
  for (const [i, account] of accounts.entries()) {
    for (const row of calendar.rows[i]) {
      const other = account.role === 'owner' ? peer : owner;
      assert.deepEqual(row.eventParticipants, [{ userId: other.id, name: other.displayName }]);
    }
  }
  if (published || cancelled) {
    const rows = await Promise.all(accounts.map(async account => (await get('/api/v1/calendar/search?q=' + encodeURIComponent(peerIdea), account)).results.filter(row => row.timePollToken === token)));
    assertCalendarRows(p, accounts, { rows }, included);
  }
  return { phase, actualPhase: p.phase, submissions: p.summary.participantCount, ideaCount: p.activitySelection.ideaCount,
    interestCounts: p.activitySelection.ideas.map(idea => ({ authorRole: idea.isMine ? 'owner' : 'peer1', count: idea.interestedBy.length })),
    selectedActivityCommitted: invited, invitationVersion: p.invitationVersion,
    acceptedCount: p.invitations.filter(person => person.selected && person.status === 'ACCEPTED').length,
    calendarCounts: Object.fromEntries(accounts.map((account, i) => [account.role, calendar.rows[i].length])),
    exactAvailabilityAndCompanionsChecked: true, protectedPlansUnchanged: true, at: new Date().toISOString() };
}

try {
  const own = (await get('/api/v1/time-polls', owner)).polls;
  assert(!own.some(p => targetNames.includes(p.title)), 'Start a fresh activity run, not a replay of an earlier case.');
  assert(own.every(p => f.tokens.includes(p.token)), 'Bookkeeping must already include all earlier owned plans.');
  const input = own.filter(p => p.isOwner && p.title === inputTitle);
  assert.equal(input.length, 1, 'Complete the independent input case before this activity case.');
  assert(f.tokens.includes(input[0].token));
  for (const existingToken of f.tokens) {
    const poll = await get(route({ token: existingToken }), owner);
    assert(poll.isOwner);
    if (existingToken === f.pollToken) assert.equal(poll.phase, 'CANCELLED', 'The completed main plan must remain cancelled.');
    if (existingToken === input[0].token) assert.equal(poll.phase, 'CONFIRMED', 'The completed input plan must remain confirmed.');
    const calendar = await readCalendars(poll);
    if (existingToken === f.pollToken) assertCalendarRows(poll, accounts, calendar, []);
    if (existingToken === input[0].token) assertCalendarRows(poll, accounts, calendar, ['owner']);
    baseline.push({ poll, business: business(poll), calendar: calendarFingerprint(calendar) });
  }
  baselineReady = true;
  await report();
  console.log('PLAN_ACTIVITY_OBSERVER_READY');
  const deadline = Date.now() + 30 * 60_000;
  while (Date.now() < deadline) {
    const log = await (async () => {
      try {
        assert((await fs.lstat(logPath)).isFile(), 'Read only the real owned test log.');
        return await fs.readFile(logPath, 'utf8');
      } catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
    })();
    for (const [, phase] of log.matchAll(/PLAN_ACTIVITY_PHASE ([a-z-]+)/g)) {
      assert(phases.includes(phase), 'Unknown native activity phase.');
      if (checks.some(check => check.phase === phase)) continue;
      current = phase;
      assert.equal(phase, phases[checks.length], 'Physical activity phases must remain ordered.');
      const check = await verify(phase); checks.push(check);
      await privateJSON(`phase-${String(checks.length).padStart(2, '0')}-${phase}.json`, check);
      await report(); console.log('PLAN_ACTIVITY_API verified ' + phase);
    }
    if (log.includes('** TEST EXECUTE FAILED **') || /Test Case .*FiveRootPlanActivityPhoneUITests.* failed/.test(log) || /xcodebuild: error:/.test(log)) throw Error('The physical activity case failed.');
    assert(!/Test Case .*FiveRootPlanActivityPhoneUITests.* skipped/i.test(log), 'A skipped case cannot pass this acceptance.');
    if (log.includes('** TEST EXECUTE SUCCEEDED **')) {
      assert(/Executed 1 test, with 0 failures/.test(log), 'Require exactly one completed physical UI case with zero failures.');
      assert.equal(checks.length, phases.length, 'Every actual boundary must be observed.');
      await protectExistingPlans(); completed = true; break;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert(completed, 'The complete physical case must execute and pass.');
} catch (error) {
  failure = error;
  await fs.writeFile(path.join(out, 'private-failure.txt'), String(error?.stack), { mode: 0o600 });
}
await report();
if (failure) { console.error('Plan activity boundary failed; inspect private diagnostics.'); process.exitCode = 1; }
