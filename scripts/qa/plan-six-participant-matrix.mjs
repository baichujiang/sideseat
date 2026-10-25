// Independent current COLLECT matrix; reuse only the six owned disposable accounts.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, readFixture, persist, evidence, route, calendars, assertCalendarRows } from './plan-six-participant-phone.mjs';

const roles = ['owner', 'peer1', 'peer2', 'peer3', 'peer4', 'peer5'];
export async function runMatrix(f) {
  assert.equal(f.accounts.length, 6, 'Prepare the six owned accounts first.');
  assert(!f.matrixCases, 'Retain prior matrix cases for inspection and cleanup before preparing another fixture.');
  const accounts = roles.map(role => f.accounts.find(account => account.role === role));
  assert(accounts.every(Boolean));
  const owner = accounts[0], peer5 = accounts[5];
  const date = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const checks = []; let failure;
  f.matrixCases = []; await persist(f);
  const record = async (name, value) => {
    checks.push({ name, ...value, at: new Date().toISOString() });
    await evidence('matrix-api.json', { passed: false, scope: 'Independent current COLLECT availability and invitation matrix; main phone plan unchanged', checks });
    console.log(`PLAN_SIX_MATRIX verified ${name}`);
  };
  const create = async kind => {
    const p = await call('/api/v1/time-polls', owner, 'POST', {
      title: `${f.edgePrefix} matrix-${kind}`, dates: [date], timeZone: 'Europe/Berlin',
      startMinute: 540, endMinute: 720, planningMode: 'COLLECT', location: '六人矩阵测试',
    }, 201);
    f.tokens.push(p.token); f.matrixCases.push({ kind, token: p.token }); await persist(f);
    assert.equal(p.planningMode, 'COLLECT'); assert.equal(p.phase, 'COLLECTING');
    assert.equal(p.slots.length, 12);
    return p;
  };
  const reply = (p, account, slotIds) => call(route(p) + '/response', account, 'PUT', { displayName: account.displayName, slotIds });
  const noCalendar = async p => {
    const result = await calendars(p, accounts); assertCalendarRows(p, accounts, result, []);
    return { counts: Object.fromEntries(accounts.map((account, n) => [account.role, result.rows[n].length])), windowStart: result.windowStart, windowEnd: result.windowEnd };
  };
  const share = async p => (await call(route(p) + '/contacts', owner, 'POST', {
    version: p.invitationVersion, connectionIds: f.connections.map(connection => connection.connectionID),
  }, 201)).poll;
  const matrix = async (p, expected, submittedRoles, maximum, common) => {
    const views = await Promise.all(accounts.map(account => call(route(p), account)));
    const submitted = new Set(submittedRoles);
    for (const [n, view] of views.entries()) {
      assert.equal(view.planningMode, 'COLLECT');
      assert.equal(view.isOwner, n === 0);
      assert.equal(view.didRespond, submitted.has(roles[n]), `${roles[n]}: submitted and unfilled are separate states`);
      assert.deepEqual(view.mySlotIds, expected[roles[n]], `${roles[n]}: own availability remains isolated`);
      assert.equal(view.summary.participantCount, submitted.size);
      assert.equal(view.participants.length, submitted.size);
      assert.equal(view.summary.maximum, maximum);
      assert.equal(view.summary.common, common);
      const counts = view.slots.map(slot => submittedRoles.filter(role => expected[role].includes(slot.id)).length);
      assert.deepEqual(view.summary.counts, counts, `${roles[n]}: heatmap counts match submitted snapshots`);
      for (const account of accounts) {
        const person = view.participants.find(item => item.displayName === account.displayName);
        assert.equal(Boolean(person), submitted.has(account.role));
        if (person) {
          assert.deepEqual(person.slotIds, expected[account.role]);
          assert.equal(person.isMe, account.role === roles[n]);
        }
      }
    }
    return { owner: views[0], views, summary: {
      respondents: views[0].summary.participantCount, maximum: views[0].summary.maximum,
      common: views[0].summary.common, counts: views[0].summary.counts,
      ownSlots: Object.fromEntries(accounts.map((account, n) => [account.role, views[n].mySlotIds])),
    } };
  };
  try {
    let p = await create('concurrent');
    const expected = Object.fromEntries(roles.map((role, n) => [role, n ? [0, 1, 2, 3, n + 3] : [0, 1, 2, 3]]));
    await reply(p, owner, expected.owner);
    // The server must serialize these five independent writers without losing a response.
    await Promise.all(accounts.slice(1).map(account => reply(p, account, expected[account.role])));
    let state = await matrix(p, expected, roles, 6, true); p = state.owner;
    assert.equal(p.summary.windows.length, 1);
    assert.equal(p.summary.windows[0].start, p.slots[0].start);
    assert.equal(p.summary.windows[0].end, p.slots[3].end);
    assert.equal(p.summary.windows[0].count, 6);
    assert.equal(new Set(p.summary.windows[0].attendeeIds).size, 6);
    await record('five concurrent submissions retain six distinct snapshots and one all-six common hour', { ...state.summary, calendars: await noCalendar(p) });

    expected.peer5 = [4, 5, 6, 7];
    await reply(p, peer5, expected.peer5);
    state = await matrix(p, expected, roles, 5, false); p = state.owner;
    await record('one participant moves to an exclusive hour; six respondents remain and common becomes false', state.summary);

    expected.peer5 = [];
    await reply(p, peer5, []);
    state = await matrix(p, expected, roles, 5, false); p = state.owner;
    assert.equal(state.views[5].didRespond, true, 'Explicitly submitting no availability remains a response.');
    const durableAt = p.updatedAt;
    await reply(p, peer5, []);
    state = await matrix(p, expected, roles, 5, false); p = state.owner;
    assert.equal(p.updatedAt, durableAt, 'An identical submitted snapshot avoids an extra write.');
    await record('empty availability retains the sixth respondent; identical snapshot adds no response and no timestamp write', state.summary);

    p = await share(p);
    assert.equal(p.sharedWithUserIds.length, 5);
    const selected = p.invitees.filter(person => person.displayName !== peer5.displayName);
    assert.equal(selected.length, 5);
    p = await call(route(p) + '/invitations', owner, 'POST', {
      version: 0, start: p.slots[0].start, end: p.slots[3].end, attendeeIds: selected.map(person => person.id),
    });
    assert.equal(p.phase, 'INVITING'); assert.equal(p.planningMode, 'COLLECT');
    assert.equal(p.invitations.length, 5); assert(p.invitations.every(person => person.selected));
    assert.equal(p.invitations.some(person => person.displayName === peer5.displayName), false);
    assert.equal(p.sharedWithUserIds.length, 5, 'The excluded shared person retains delivery membership.');
    await call(route(p) + '/invitation-response', peer5, 'PUT', { version: 1, status: 'ACCEPTED' }, 403);
    state = await matrix(p, expected, roles, 5, false); p = state.owner;
    assert.equal(state.views[5].invitations.some(person => person.isMe), false);
    assert.equal(p.invitationVersion, 1);
    await record('excluded shared participant cannot accept; 403 preserves every submitted availability snapshot', {
      ...state.summary, selectedInvitees: p.invitations.length, sharedAccounts: p.sharedWithUserIds.length,
      excludedReply403: true, calendars: await noCalendar(p),
    });

    // An empty submission above is not an unfilled person. Use a second plan with no response rows.
    let unfilled = await create('unfilled-invitee');
    unfilled = await share(unfilled);
    assert.equal(unfilled.summary.participantCount, 0); assert.equal(unfilled.invitees.length, 5);
    unfilled = await call(route(unfilled) + '/invitations', owner, 'POST', {
      version: 0, start: unfilled.slots[0].start, end: unfilled.slots[3].end,
      attendeeIds: unfilled.invitees.map(person => person.id),
    });
    const none = Object.fromEntries(roles.map(role => [role, []]));
    state = await matrix(unfilled, none, [], 0, false); unfilled = state.owner;
    assert.equal(unfilled.invitations.length, 6);
    assert.equal(state.views[5].didRespond, false);
    assert.equal(state.views[5].invitations.find(person => person.isMe).status, 'INVITED');
    const beforeConsent = await noCalendar(unfilled);
    await call(route(unfilled) + '/invitation-response', peer5, 'PUT', { version: 1, status: 'ACCEPTED' });
    state = await matrix(unfilled, none, [], 0, false); unfilled = state.owner;
    assert.equal(unfilled.phase, 'INVITING'); assert.equal(unfilled.summary.participantCount, 0);
    assert.equal(state.views[5].invitations.find(person => person.isMe).status, 'ACCEPTED');
    await record('unfilled shared person may be invited and explicitly accept without inventing availability or a published calendar', {
      ...state.summary, selectedInvitees: unfilled.invitations.length,
      beforeConsentCalendars: beforeConsent, acceptedBeforePublicationCalendars: await noCalendar(unfilled),
    });
  } catch (cause) { failure = cause; }
  await evidence('matrix-api.json', { passed: !failure, scope: 'Independent current COLLECT availability and invitation matrix; main phone plan unchanged',
    independentPlans: f.matrixCases.length, checks, failure: failure?.message ?? null, completedAt: new Date().toISOString() });
  if (failure) throw failure;
  f.matrixCompletedAt = new Date().toISOString(); await persist(f);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  readFixture().then(runMatrix).catch(error => { console.error(error.message); process.exitCode = 1; });
}
