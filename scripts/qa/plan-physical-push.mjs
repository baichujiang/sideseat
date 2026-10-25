// Real APNs acceptance companion. Only independent owned push plans are mutated here.
// The six-person main plan remains exclusively controlled by its native UI test.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, calendars, assertCalendarRows, evidence, persist, readFixture, route, out } from './plan-six-participant-phone.mjs';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const warm = [
  'foreground-ready', 'foreground-share-opened', 'background-invitation-ready',
  'background-invitation-opened', 'peer-accepted', 'background-publication-ready',
  'background-publication-opened', 'published-calendar-verified',
  'foreground-cancellation-ready', 'foreground-cancellation-opened',
  'cancelled-calendar-verified', 'warm-case-complete',
];
const cold = [
  'cold-invitation-ready', 'cold-invitation-opened', 'cold-cancellation-ready',
  'cold-cancellation-opened', 'cold-case-complete',
];
const allPhases = [...warm, ...cold];
const caseKey = phase => phase.startsWith('cold-') ? 'cold' : 'warm';
const reportName = scope => `push-${scope}-api.json`;

function owned(f) {
  assert.equal(f.accounts.length, 6);
  assert(f.physicalPush?.preparedAt, 'Prepare independent push plans first.');
  assert.equal(f.physicalPush.cases.length, 2);
  assert.deepEqual(f.physicalPush.cases.map(p => p.key).sort(), ['cold', 'warm']);
  for (const p of f.physicalPush.cases) {
    assert(p.title.startsWith(f.edgePrefix + ' push-'));
    assert(f.tokens.includes(p.token));
    assert.notEqual(p.token, f.pollToken, 'Never mutate the six-person main plan.');
  }
  const ordered = ['owner', 'peer1', 'peer2', 'peer3', 'peer4', 'peer5'].map(role => f.accounts.find(a => a.role === role));
  assert(ordered.every(Boolean));
  return { ordered, owner: ordered[0], peer: ordered[1] };
}

async function prepare(f) {
  assert.equal(f.accounts.length, 6);
  assert(!f.physicalPush, 'Existing push fixtures must be retained until verified and cleaned; do not silently replace them.');
  const owner = f.accounts.find(a => a.role === 'owner'), peer = f.accounts.find(a => a.role === 'peer1');
  assert(owner && peer);
  f.physicalPush = { preparedAt: new Date().toISOString(), cases: [] };
  await persist(f);
  const date = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  for (const key of ['warm', 'cold']) {
    let p = await call('/api/v1/time-polls', owner, 'POST', {
      title: `${f.edgePrefix} push-${key}`, location: 'APNs QA library', dates: [date],
      timeZone: 'Europe/Berlin', startMinute: 540, endMinute: 660, planningMode: 'COLLECT',
    }, 201);
    f.tokens.push(p.token);
    f.physicalPush.cases.push({ key, token: p.token, title: p.title });
    await persist(f);
    // Availability does not send a notification. No contact share/invite/publish occurs before UI readiness.
    for (const a of [owner, peer]) await call(route(p) + '/response', a, 'PUT', { displayName: a.displayName, slotIds: [0, 1, 2, 3] });
    p = await call(route(p), owner);
    assert.equal(p.phase, 'COLLECTING'); assert.equal(p.invitationVersion, 0);
    assert.equal(p.summary.participantCount, 2); assert.equal(p.invitations.length, 0);
  }
  owned(f);
  await evidence('push-fixtures.json', { passed: true, independentPlans: 2, prefilledOwnedAccountsPerPlan: 2,
    noMainPlanMutation: true, noShareOrInvitationBeforeUIReady: true, at: new Date().toISOString() });
  console.log('Prepared two independent owned push plans. Credentials and links remain private.');
}

async function snapshot(f, key, expectedPhase, peerStatuses) {
  const { owner, peer, ordered } = owned(f);
  const plan = f.physicalPush.cases.find(p => p.key === key);
  const [p, peerView] = await Promise.all([call(route(plan), owner), call(route(plan), peer)]);
  assert.equal(p.title, plan.title); assert.equal(peerView.title, plan.title);
  assert.equal(p.phase, expectedPhase); assert.equal(peerView.phase, expectedPhase);
  const current = peerView.invitations.find(i => i.isMe);
  if (expectedPhase === 'INVITING' || expectedPhase === 'CONFIRMED') {
    assert.equal(p.invitationVersion, 1);
    assert.equal(p.chosenStart, p.slots[0].start); assert.equal(p.chosenEnd, p.slots[3].end);
    assert.equal(p.invitations.filter(i => i.selected).length, 2);
    assert(peerStatuses.includes(current?.status), 'The peer reply must match the UI-permitted state at this handshake.');
  }
  const result = await calendars(p, ordered);
  const included = expectedPhase === 'CONFIRMED' ? ['owner', 'peer1'] : [];
  assertCalendarRows(p, ordered, result, included);
  return { actualPhase: p.phase, invitationVersion: p.invitationVersion, peerStatus: current?.status ?? null,
    chosenStart: p.chosenStart, chosenEnd: p.chosenEnd,
    calendarCounts: Object.fromEntries(ordered.map((a, i) => [a.role, result.rows[i].length])) };
}

async function act(f, phase) {
  const { owner, peer, ordered } = owned(f);
  const key = caseKey(phase), plan = f.physicalPush.cases.find(p => p.key === key);
  let p = await call(route(plan), owner);
  let action = 'read-only verification';
  if (phase === 'foreground-ready') {
    assert.equal(p.phase, 'COLLECTING');
    const connection = f.connections.find(c => c.peerRole === 'peer1'); assert(connection);
    const result = await call(route(plan) + '/contacts', owner, 'POST', { version: 0, connectionIds: [connection.connectionID] }, 201);
    assert.equal(result.deliveries.length, 1);
    action = 'owner shared one new contact card; real plan_invite dispatch scheduled';
  } else if (phase === 'background-invitation-ready' || phase === 'cold-invitation-ready') {
    assert.equal(p.phase, 'COLLECTING'); assert.equal(p.invitationVersion, 0);
    p = await call(route(plan) + '/invitations', owner, 'POST', {
      version: 0, start: p.slots[0].start, end: p.slots[3].end,
      attendeeIds: p.participants.map(person => person.id),
    });
    assert.equal(p.phase, 'INVITING');
    action = 'owner chose final time and invited only the prepared peer; real time_poll_invitation dispatch scheduled';
  } else if (phase === 'background-publication-ready') {
    assert.equal(p.phase, 'INVITING');
    assert.equal(p.invitations.find(i => i.displayName === peer.displayName)?.status, 'ACCEPTED', 'Acceptance must come from the native UI.');
    p = await call(route(plan) + '/publish', owner, 'POST', { version: p.invitationVersion });
    assert.equal(p.phase, 'CONFIRMED');
    action = 'owner explicitly published accepted roster; real time_poll_confirmed dispatch scheduled';
  } else if (phase === 'published-calendar-verified') {
    assert.equal(p.phase, 'CONFIRMED');
    const updated = p.updatedAt;
    for (let i = 0; i < 2; i++) {
      p = await call(route(plan) + '/publish', owner, 'POST', { version: p.invitationVersion });
      assert.equal(p.updatedAt, updated);
    }
    action = 'duplicate publish requests preserve exact Calendar rows and unchanged business state; notification dedup requires server dispatch-log review';
  } else if (phase === 'foreground-cancellation-ready' || phase === 'cold-cancellation-ready') {
    assert.equal(p.phase, key === 'warm' ? 'CONFIRMED' : 'INVITING');
    p = await call(route(plan) + '/cancel', owner, 'POST', { version: p.invitationVersion });
    assert.equal(p.phase, 'CANCELLED');
    action = 'owner cancelled current-version plan; real plan_canceled dispatch scheduled';
  } else if (phase === 'foreground-cancellation-opened' || phase === 'cold-cancellation-opened') {
    assert.equal(p.phase, 'CANCELLED'); const updated = p.updatedAt;
    for (let i = 0; i < 2; i++) {
      p = await call(route(plan) + '/cancel', owner, 'POST', { version: p.invitationVersion });
      assert.equal(p.updatedAt, updated);
    }
    action = 'duplicate cancel requests preserve cancellation and zero Calendar rows; notification dedup requires server dispatch-log review';
  }
  const invited = ['background-invitation-ready', 'background-invitation-opened', 'peer-accepted', 'cold-invitation-ready', 'cold-invitation-opened'].includes(phase);
  const confirmed = ['background-publication-ready', 'background-publication-opened', 'published-calendar-verified'].includes(phase);
  const cancelled = phase.includes('cancellation') || phase === 'cancelled-calendar-verified' || phase.endsWith('case-complete');
  const expected = cancelled ? 'CANCELLED' : confirmed ? 'CONFIRMED' : invited ? 'INVITING' : 'COLLECTING';
  const peerStatuses = phase === 'background-invitation-opened' ? ['INVITED', 'ACCEPTED']
    : key === 'warm' && (phase === 'peer-accepted' || confirmed || cancelled) ? ['ACCEPTED'] : ['INVITED'];
  const state = await snapshot(f, key, expected, peerStatuses);
  if (phase === 'foreground-share-opened') {
    const connection = f.connections.find(c => c.peerRole === 'peer1');
    const messages = await call(`/api/v1/connections/${connection.connectionID}/messages`, peer);
    assert.equal(messages.messages.filter(m => m.body?.includes('/time-polls/' + plan.token)).length, 1);
  }
  if (phase === 'cancelled-calendar-verified') {
    for (const a of ordered) {
      const search = await call('/api/v1/calendar/search?q=' + encodeURIComponent(plan.title), a);
      assert.equal(search.results.filter(row => row.timePollToken === plan.token).length, 0);
    }
  }
  return { phase, case: key, action, ...state, at: new Date().toISOString() };
}

async function observe(f, logPath, scope = 'all', resumeAfter) {
  assert(logPath, 'observe requires the actual native xcodebuild log path.');
  assert(['warm', 'cold', 'all'].includes(scope)); owned(f);
  const expected = scope === 'warm' ? warm : scope === 'cold' ? cold : allPhases;
  const checks = []; const segments = []; let failure, completed = false;
  if (resumeAfter) {
    assert(expected.includes(resumeAfter));
    const previous = JSON.parse(await fs.readFile(path.join(out, reportName(scope)), 'utf8'));
    assert.deepEqual(previous.checks.map(c => c.phase), expected.slice(0, expected.indexOf(resumeAfter) + 1));
    checks.push(...previous.checks); segments.push(...(previous.segments || []));
    const state = checks.at(-1);
    const peerStatuses = state.phase === 'background-invitation-opened' ? ['INVITED', 'ACCEPTED'] : [state.peerStatus];
    await snapshot(f, state.case, state.actualPhase, peerStatuses);
  }
  const startIndex = checks.length, seen = new Set(checks.map(c => c.phase));
  const report = () => ({ passed: !failure && completed && checks.length === expected.length,
    scope, executionSurface: 'Explicitly selected physical iPhone 14 Plus; real APNs only',
    nativeBuild: process.env.SIDESEAT_QA_UI_BUILD || 'unspecified', mainPlanWasNotMutated: true,
    notificationsAreNotInferredFromHTTPResponses: true, checks,
    duplicateNotificationScope: 'Business state/unique Calendars checked; dispatch exactly-once needs server logs. A short period without another banner is insufficient.',
    segments: [...segments, { log: path.basename(logPath), phases: checks.slice(startIndex).map(c => c.phase), completed }],
    failure: failure?.message ?? null, at: new Date().toISOString() });
  try {
    const deadline = Date.now() + 30 * 60_000;
    while (Date.now() < deadline) {
      const log = await fs.readFile(logPath, 'utf8').catch(() => '');
      for (const [, phase] of log.matchAll(/PLAN_PUSH_PHASE ([a-z0-9-]+)/g)) {
        assert(allPhases.includes(phase), 'Unknown physical push handshake.');
        if (!expected.includes(phase) || seen.has(phase)) continue;
        assert.equal(phase, expected[checks.length], 'Physical push phases must remain ordered.');
        const check = await act(f, phase); checks.push(check); seen.add(phase);
        await evidence(reportName(scope), report());
        console.log(`PLAN_PUSH_API verified ${phase}`);
      }
      assert(!log.includes('** TEST EXECUTE FAILED **') && !/Test Case .*PlanPhysicalPushPhoneUITests.* failed/.test(log), 'Native physical push UI test failed; retain actual prefix and inspect private xcresult.');
      if (log.includes('** TEST EXECUTE SUCCEEDED **') || log.includes('** TEST SUCCEEDED **')) {
        assert(/Executed [1-9]\d* tests?, with 0 failures/.test(log), 'A nonzero native test count is required.');
        assert.equal(checks.length, expected.length, 'Successful XCTest must include every expected push handshake.');
        completed = true; break;
      }
      await pause(250);
    }
    assert(completed, 'Physical push observer timed out; no delivery inferred.');
  } catch (cause) { failure = cause; }
  await evidence(reportName(scope), report());
  if (failure) throw failure;
}

async function main() {
  const [mode, argument, scope, resumeAfter] = process.argv.slice(2);
  const f = await readFixture();
  if (mode === 'prepare') return prepare(f);
  if (mode === 'observe') return observe(f, argument, scope || 'all', resumeAfter);
  throw new Error('Expected prepare or observe LOG [warm|cold|all] [resumeAfter].');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
