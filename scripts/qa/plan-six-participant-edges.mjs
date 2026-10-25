// Independent current COLLECT cases. Main phone plan remains read-only here.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fromZonedTime } from 'date-fns-tz';
import { call, calendars, assertCalendarRows, evidence, persist, readFixture, route } from './plan-six-participant-phone.mjs';

export async function runEdges(f) {
  assert.equal(f.accounts.length, 6, 'Prepare the six owned accounts first.');
  assert(!f.edgesStartedAt, 'Edge plans run once per disposable fixture; inspect prior evidence before retrying.');
  f.edgesStartedAt = new Date().toISOString(); await persist(f);
  const accounts = ['owner', 'peer1', 'peer2', 'peer3', 'peer4', 'peer5'].map(role => f.accounts.find(a => a.role === role));
  assert(accounts.every(Boolean));
  const [owner, peer1, peer2, peer3, peer4, peer5] = accounts;
  const checks = []; let failure;
  const dates = [3, 4, 5].map(n => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10));
  const zoned = (date, clock) => fromZonedTime(`${date}T${clock}:00`, 'Europe/Berlin').toISOString();
  const record = async (name, values = {}) => {
    checks.push({ name, ...values, at: new Date().toISOString() });
    await evidence('edges-api.json', { passed: false, scope: 'Current COLLECT API cases on independent owned test plans', checks });
    console.log(`PLAN_SIX_EDGE verified ${name}`);
  };
  const create = async (name, overrides = {}) => {
    const p = await call('/api/v1/time-polls', owner, 'POST', {
      title: `${f.edgePrefix} ${name}`, location: '测试图书馆', dates: dates.slice(0, 2),
      timeZone: 'Europe/Berlin', startMinute: 540, endMinute: 660, planningMode: 'COLLECT', ...overrides,
    }, 201);
    f.tokens.push(p.token); await persist(f);
    assert.equal(p.planningMode, 'COLLECT'); assert.equal(p.phase, 'COLLECTING');
    return p;
  };
  const current = p => call(route(p), owner);
  const reply = (p, a, slots) => call(route(p) + '/response', a, 'PUT', { displayName: a.displayName, slotIds: slots });
  const respond = (p, a, status, version = p.invitationVersion, expected = 200) => call(route(p) + '/invitation-response', a, 'PUT', { version, status }, expected);
  const invite = (p, options = {}, expected = 200) => call(route(p) + '/invitations', owner, 'POST', {
    version: p.invitationVersion, start: p.slots[0].start, end: p.slots[3].end,
    attendeeIds: (p.invitees ?? p.participants).map(person => person.id), ...options,
  }, expected);
  const checkCalendars = async (p, included) => {
    const result = await calendars(p, accounts); assertCalendarRows(p, accounts, result, included);
    return { counts: Object.fromEntries(accounts.map((a, n) => [a.role, result.rows[n].length])), windowStart: result.windowStart, windowEnd: result.windowEnd };
  };
  const share = async p => {
    const value = await call(route(p) + '/contacts', owner, 'POST', { version: p.invitationVersion, connectionIds: f.connections.map(c => c.connectionID) }, 201);
    return value.poll;
  };
  try {
    let validation = await create('validation-sparse', { dates: [dates[0], dates[2]] });
    await call(route(validation) + '/publish', owner, 'POST', { version: 1 }, 409);
    await call(route(validation) + '/response', peer1, 'PUT', { displayName: peer1.displayName, slotIds: [validation.slots.length] }, 422);
    await call(route(validation) + '/response', peer1, 'PUT', { displayName: peer1.displayName, slotIds: [-1] }, 422);
    validation = await current(validation); assert.equal(validation.summary.participantCount, 0);
    validation = await reply(validation, owner, []);
    assert.equal(validation.didRespond, true); assert.deepEqual(validation.mySlotIds, []);
    assert.equal(validation.summary.participantCount, 1); assert(validation.summary.counts.every(n => n === 0));
    const empty = validation.updatedAt;
    validation = await reply(validation, owner, []); assert.equal(validation.updatedAt, empty);
    validation = await reply(validation, peer1, [2, 0, 1, 2]);
    let ownerView = await current(validation);
    assert.deepEqual(ownerView.mySlotIds, []);
    assert.deepEqual(validation.mySlotIds, [0, 1, 2]);
    const beforeRepeat = ownerView.updatedAt;
    await reply(validation, peer1, [0, 1, 2]);
    ownerView = await current(validation); assert.equal(ownerView.updatedAt, beforeRepeat);
    assert.equal(ownerView.participants.length, 2);
    const duplicate = ownerView.participants.find(p => p.displayName === peer1.displayName);
    assert.deepEqual(duplicate.slotIds, [0, 1, 2]);
    await record('empty response is explicit; invalid slots rejected; repeated response snapshot is stable and isolated', { submitted: 2, availabilityCounts: ownerView.summary.counts.slice(0, 4) });

    const minimal = { version: 0, start: validation.slots[0].start, end: validation.slots[3].end, attendeeIds: ownerView.participants.map(p => p.id) };
    for (const [suffix, method, body] of [
      ['/details', 'PATCH', { title: 'Forbidden edit', location: 'Forbidden' }],
      ['/invitations', 'POST', minimal], ['/publish', 'POST', { version: 1 }],
      ['/cancel', 'POST', { version: 1 }], ['', 'DELETE', undefined],
    ]) await call(route(validation) + suffix, peer2, method, body, 404);
    await invite(ownerView, { attendeeIds: ['not-a-participant'] }, 422);
    await invite(ownerView, { start: zoned(dates[0], '23:00'), end: zoned(dates[2], '01:00') }, 422);
    await invite(ownerView, { start: zoned(dates[0], '09:00'), end: new Date(Date.parse(zoned(dates[0], '10:00')) + 60_000).toISOString() }, 422);
    await invite(ownerView, { end: ownerView.slots[0].start }, 422);
    ownerView = await current(validation); assert.equal(ownerView.invitationVersion, 0); assert.equal(ownerView.chosenStart, null);
    validation = await invite(ownerView, { start: zoned(dates[2], '18:00'), end: zoned(dates[2], '19:00') });
    assert.equal(validation.planningMode, 'COLLECT');
    await record('owner permissions; unknown roster and gaps/misaligned/empty windows rejected; final hour outside surveyed hours allowed');
    await call(route(validation) + '/cancel', owner, 'POST', { version: 1 });
    assert.deepEqual((await current(validation)).mySlotIds, []);

    // No one submits availability. Durable App contact membership is still a valid roster.
    let noReplies = await create('no-responses');
    noReplies = await share(noReplies);
    assert.equal(noReplies.summary.participantCount, 0); assert.equal(noReplies.invitees.length, 5);
    const beforeShare = await Promise.all(f.connections.map(c => call(`/api/v1/connections/${c.connectionID}/messages`, owner)));
    const firstDeliveryCounts = beforeShare.map(value => value.messages.filter(m => m.body?.includes('/time-polls/' + noReplies.token)).length);
    assert.deepEqual(firstDeliveryCounts, [1, 1, 1, 1, 1]);
    await share(noReplies);
    const afterShare = await Promise.all(f.connections.map(c => call(`/api/v1/connections/${c.connectionID}/messages`, owner)));
    assert.deepEqual(afterShare.map(value => value.messages.filter(m => m.body?.includes('/time-polls/' + noReplies.token)).length), firstDeliveryCounts);
    noReplies = await invite(noReplies);
    assert.equal(noReplies.planningMode, 'COLLECT'); assert.equal(noReplies.invitations.length, 6);
    noReplies = await call(route(noReplies) + '/publish', owner, 'POST', { version: 1 });
    await checkCalendars(noReplies, ['owner']);
    noReplies = await respond(noReplies, peer1, 'ACCEPTED');
    const noResponseCalendars = await checkCalendars(noReplies, ['owner', 'peer1']);
    await record('zero availability replies may still invite and publish; re-sharing does not duplicate cards; pending replies do not block', { calendarsAfterLateAcceptance: noResponseCalendars });

    let mixed = await create('reschedule-mixed');
    for (const a of accounts) await reply(mixed, a, [0, 1, 2, 3]);
    mixed = await current(mixed); mixed = await invite(mixed);
    mixed = await respond(mixed, peer1, 'ACCEPTED');
    assert.equal(mixed.phase, 'INVITING'); await checkCalendars(mixed, []);
    const v1 = mixed.invitationVersion;
    mixed = await current(mixed);
    mixed = await invite(mixed, { start: mixed.slots[4].start, end: mixed.slots[7].end });
    assert.equal(mixed.invitationVersion, v1 + 1);
    assert(mixed.invitations.filter(i => !i.isMe).every(i => i.status === 'INVITED'));
    await respond(mixed, peer1, 'ACCEPTED', v1, 409);
    await invite(mixed, { version: v1 }, 409);
    await call(route(mixed) + '/publish', owner, 'POST', { version: v1 }, 409);
    await call(route(mixed) + '/response', peer1, 'PUT', { displayName: peer1.displayName, slotIds: [0] }, 409);
    await respond(mixed, owner, 'DECLINED', mixed.invitationVersion, 409);
    await record('rescheduling increments version and resets consent; old replies/invites/publish rejected; availability freezes after invitation');
    for (const a of [peer1, peer2, peer3]) mixed = await respond(mixed, a, 'ACCEPTED');
    mixed = await respond(mixed, peer5, 'DECLINED');
    mixed = await current(mixed); await checkCalendars(mixed, []);
    assert.equal(mixed.invitations.find(i => i.displayName === peer4.displayName).status, 'INVITED');
    mixed = await call(route(mixed) + '/publish', owner, 'POST', { version: mixed.invitationVersion });
    const initialCalendars = await checkCalendars(mixed, ['owner', 'peer1', 'peer2', 'peer3']);
    const key = randomUUID();
    for (let i = 0; i < 2; i++) await call(route(mixed) + '/publish', owner, 'POST', { version: mixed.invitationVersion }, 200, key);
    await call(route(mixed) + '/publish', owner, 'POST', { version: mixed.invitationVersion });
    await checkCalendars(mixed, ['owner', 'peer1', 'peer2', 'peer3']);
    mixed = await respond(mixed, peer4, 'ACCEPTED'); await checkCalendars(mixed, ['owner', 'peer1', 'peer2', 'peer3', 'peer4']);
    mixed = await respond(mixed, peer2, 'DECLINED'); await checkCalendars(mixed, ['owner', 'peer1', 'peer3', 'peer4']);
    mixed = await respond(mixed, peer2, 'ACCEPTED');
    mixed = await respond(mixed, peer2, 'ACCEPTED'); await checkCalendars(mixed, ['owner', 'peer1', 'peer2', 'peer3', 'peer4']);
    await record('mixed accepted/pending/declined publication; identical and fresh retry keys stay unique; late accept/withdraw/reaccept synchronize exact calendars', { firstPublication: initialCalendars });
    await call(route(mixed) + '/cancel', owner, 'POST', { version: v1 }, 409);
    await call(route(mixed) + '/cancel', peer1, 'POST', { version: mixed.invitationVersion }, 404);
    mixed = await call(route(mixed) + '/cancel', owner, 'POST', { version: mixed.invitationVersion });
    assert.equal(mixed.phase, 'CANCELLED');
    const cancelledCalendars = await checkCalendars(mixed, []);
    await respond(mixed, peer4, 'ACCEPTED', mixed.invitationVersion, 409);
    await call(route(mixed) + '/publish', owner, 'POST', { version: mixed.invitationVersion }, 409);
    await record('only current-version owner cancellation succeeds; every calendar removed; cancelled invitation cannot revive', { calendars: cancelledCalendars });

    let crossDay = await create('cross-day');
    await reply(crossDay, owner, [0, 1]); await reply(crossDay, peer1, [2, 3]);
    crossDay = await current(crossDay);
    const originalSlots = crossDay.slots;
    crossDay = await invite(crossDay, { start: zoned(dates[0], '23:00'), end: zoned(dates[1], '01:00') });
    assert.equal(crossDay.planningMode, 'COLLECT'); assert.deepEqual(crossDay.slots, originalSlots);
    assert.equal(Date.parse(crossDay.chosenEnd) - Date.parse(crossDay.chosenStart), 7_200_000);
    crossDay = await respond(crossDay, peer1, 'ACCEPTED'); await checkCalendars(crossDay, []);
    crossDay = await call(route(crossDay) + '/publish', owner, 'POST', { version: 1 });
    const crossCalendars = await checkCalendars(crossDay, ['owner', 'peer1']);
    await call(route(crossDay) + '/publish', owner, 'POST', { version: 1 }); await checkCalendars(crossDay, ['owner', 'peer1']);
    const crossOwner = await current(crossDay), crossPeer = await call(route(crossDay), peer1);
    assert.deepEqual(crossOwner.mySlotIds, [0, 1]); assert.deepEqual(crossPeer.mySlotIds, [2, 3]);
    assert.deepEqual(crossOwner.slots, originalSlots);
    await record('continuous midnight crossing publishes exact full-span calendars; independent surveyed availability preserved; publish retry unique', { chosenStart: crossDay.chosenStart, chosenEnd: crossDay.chosenEnd, calendars: crossCalendars });
  } catch (cause) { failure = cause; }
  await evidence('edges-api.json', { passed: !failure, scope: 'Current COLLECT API cases on independent owned test plans; no main phone-plan mutation', checks, failure: failure?.message ?? null, completedAt: new Date().toISOString() });
  if (failure) throw failure;
  f.edgesCompletedAt = new Date().toISOString(); await persist(f);
}
export async function runCapacity(f) {
  assert.equal(f.accounts.length, 6);
  assert(!f.capacityCases, 'Retain existing capacity cases until their UI verification and cleanup.');
  const owner = f.accounts.find(a => a.role === 'owner'), peer1 = f.accounts.find(a => a.role === 'peer1'), viewer = f.accounts.find(a => a.role === 'peer2');
  assert(owner && peer1 && viewer);
  const date = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  f.capacityCases = []; await persist(f);
  const checks = [];
  for (const kind of ['full', 'freed']) {
    let p = await call('/api/v1/time-polls', owner, 'POST', {
      title: `${f.edgePrefix} capacity-${kind}`, dates: [date], timeZone: 'Europe/Berlin', startMinute: 540, endMinute: 660, planningMode: 'COLLECT',
    }, 201);
    f.tokens.push(p.token);
    f.capacityCases.push({ kind, token: p.token, viewerRole: 'peer2' }); await persist(f);
    assert.equal(p.planningMode, 'COLLECT');
    await call(route(p) + '/response', peer1, 'PUT', { displayName: peer1.displayName, slotIds: [0, 1, 2, 3] });
    p = await call(route(p), owner);
    p = await call(route(p) + '/invitations', owner, 'POST', {
      version: 0, start: p.slots[0].start, end: p.slots[3].end,
      attendeeIds: p.participants.map(person => person.id), linkParticipantCount: 2,
    });
    assert.equal(p.planningMode, 'FIXED', 'Current COLLECT link-capacity invitation uses existing capacity contract.');
    assert.equal(p.expectedCount, 2);
    assert.equal(p.invitations.filter(person => person.selected).length, 2);
    assert.equal(p.invitations.find(person => person.displayName === peer1.displayName).status, 'INVITED');
    const outside = await call(route(p), viewer);
    assert.equal(outside.invitations.some(person => person.isMe), false);
    await call(route(p) + '/invitation-response', viewer, 'PUT', { version: 1, status: 'ACCEPTED' }, 409);
    if (kind === 'freed') {
      p = await call(route(p) + '/invitation-response', peer1, 'PUT', { version: 1, status: 'DECLINED' });
      assert.equal(p.invitations.filter(person => person.selected).length, 1);
      // Deliberately leave the free place unoccupied for native/browser acceptance.
    }
    const finalView = await call(route(p), viewer);
    assert.equal(finalView.invitations.some(person => person.isMe), false);
    checks.push({ kind, phase: finalView.phase, planningMode: finalView.planningMode, expectedCount: finalView.expectedCount,
      selected: finalView.invitations.filter(person => person.selected).length,
      accepted: finalView.invitations.filter(person => person.selected && person.status === 'ACCEPTED').length,
      viewerHasInvitation: false, unknownViewerInitiallyRejected409: true });
  }
  await evidence('capacity-fixtures-api.json', { passed: true, scope: 'Current COLLECT → capacity-link invitation; full and freed states retained for UI checks', checks, at: new Date().toISOString() });
  console.log('Prepared independent full and freed current-flow capacity links for peer2 UI verification.');
}
if (process.argv[1]?.endsWith('/plan-six-participant-edges.mjs')) {
  readFixture().then(runEdges).catch(error => { console.error(error.message); process.exitCode = 1; });
}
