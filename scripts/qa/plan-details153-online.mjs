// Real disposable-account checks for editing plan information without changing consent or availability.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';

const [base, stage = 'local'] = process.argv.slice(2); assert(base);
const out = path.resolve(process.env.SIDESEAT_QA_OUTPUT || 'docs/qa/evidence/2026-10-20-plans153');
fs.mkdirSync(out, { recursive: true });
const privatePath = path.join(os.tmpdir(), `sideseat-details153-${stage}-private.json`);
assert(!fs.existsSync(privatePath), 'Clean the previous disposable fixture first.');
const fixture = { accounts: [], tokens: [] }, checks = [];
const persist = () => fs.writeFileSync(privatePath, JSON.stringify(fixture), { mode: 0o600 });
const cookie = process.env.SIDESEAT_CANDIDATE_COOKIE_FILE
  ? fs.readFileSync(process.env.SIDESEAT_CANDIDATE_COOKIE_FILE, 'utf8').split('\n')
    .filter(line => line.startsWith('#HttpOnly_') || line && !line.startsWith('#'))
    .map(line => { const parts = line.replace(/^#HttpOnly_/, '').split('\t'); return `${parts[5]}=${parts[6]}`; }).join('; ')
  : '';
async function call(route, account, method = 'GET', body, status = 200) {
  const response = await fetch(base + route, { method, headers: {
    'Content-Type': 'application/json', 'x-sideseat-platform': 'ios', 'Idempotency-Key': randomUUID(),
    ...(account ? { Authorization: `Bearer ${account.accessToken}` } : {}), ...(cookie ? { Cookie: cookie } : {}),
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const payload = await response.json().catch(() => ({}));
  assert.equal(response.status, status, `${method} ${route}: ${response.status}; ${payload.error?.message || ''}`);
  return payload.data;
}
const route = poll => `/api/v1/time-polls/${poll.token}`;
const check = label => { checks.push(label); console.log(`DETAILS153 ${stage}: ${label}`); };
let failure;
try {
  persist();
  for (const role of ['owner', 'peer']) {
    const account = { identifier: `pqa_d153_${role[0]}_${randomBytes(4).toString('hex')}`, password: randomBytes(22).toString('base64url') };
    await call('/api/auth/signup', null, 'POST', { username: account.identifier, password: account.password,
      displayName: role === 'owner' ? 'Ming' : 'Lin', school: 'TUM', studentStatus: 'CURRENT_STUDENT', degreeLevel: 'BACHELOR', semester: 3 }, 201);
    fixture.accounts.push(account); persist();
    const login = await call('/api/v1/auth/login', null, 'POST', { identifier: account.identifier, password: account.password,
      device: { id: randomUUID(), name: 'Plan detail hierarchy QA', appVersion: '1.0.0', platformVersion: '26.6.1' } });
    account.accessToken = login.tokens.accessToken; account.id = login.user.id; persist();
  }
  const [owner, peer] = fixture.accounts;
  const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  async function create(extra = {}) {
    const poll = await call('/api/v1/time-polls', owner, 'POST', { title: 'Library revision', location: 'Library', timeZone: 'Europe/Berlin',
      dates: [date], startMinute: 540, endMinute: 720, ...extra }, 201);
    fixture.tokens.push(poll.token); persist(); return poll;
  }
  let poll = await create();
  await call(route(poll) + '/response', owner, 'PUT', { displayName: 'Host Ming', slotIds: [0, 1, 2, 3] });
  poll = await call(route(poll) + '/response', peer, 'PUT', { displayName: 'Lin', slotIds: [0, 1] });
  const before = structuredClone(poll);
  poll = await call(route(poll) + '/details', owner, 'PATCH', { title: '  Library revision together  ', location: '  Second floor  ' });
  assert.equal(poll.title, 'Library revision together'); assert.equal(poll.location, 'Second floor');
  const submitted = value => value.participants.map(({ id, displayName, slotIds }) => ({ id, displayName, slotIds }));
  assert.deepEqual(poll.slots, before.slots); assert.deepEqual(submitted(poll), submitted(before));
  assert.deepEqual(poll.summary, before.summary); assert.equal(poll.phase, 'COLLECTING');
  const listed = (await call('/api/v1/time-polls', peer)).polls.find(item => item.token === poll.token);
  assert.equal(listed.title, poll.title);
  check('owner edits title and location; shared list updates and every submitted response stays intact');
  await call(route(poll) + '/details', peer, 'PATCH', { title: 'Not the organizer' }, 404);
  await call(route(poll) + '/details', owner, 'PATCH', { title: 'Unexpected time edit', dates: [date] }, 422);
  assert.equal((await call(route(poll), owner)).title, poll.title);
  check('only the organizer can edit information; time changes cannot enter the information form API');
  poll = await call(route(poll) + '/details', owner, 'PATCH', { title: poll.title, location: '' });
  assert.equal(poll.location, null);
  poll = await call(route(poll) + '/invitations', owner, 'POST', { version: 0, start: poll.slots[0].start,
    end: poll.slots[3].end, attendeeIds: poll.participants.map(person => person.id) });
  await call(route(poll) + '/details', owner, 'PATCH', { title: 'Changed after invitation' }, 409);
  assert.equal((await call(route(poll), peer)).title, 'Library revision together');
  check('clearing an optional location works; sending an invitation freezes the activity details');
  poll = await call(route(poll) + '/invitation-response', peer, 'PUT', { version: poll.invitationVersion, status: 'ACCEPTED' });
  assert.equal(poll.phase, 'INVITING');
  poll = await call(route(poll) + '/publish', owner, 'POST', { version: poll.invitationVersion });
  await call(route(poll) + '/details', owner, 'PATCH', { title: 'Changed published plan' }, 409);
  for (const account of [owner, peer]) {
    const entries = (await call(`/api/v1/home/schedule?windowStart=${date}T00:00:00Z&windowEnd=${date}T23:59:59Z`, account)).studyEntries.filter(item => item.timePollToken === poll.token);
    assert.equal(entries.length, 1); assert.equal(entries[0].title, 'Library revision together');
  }
  check('individual acceptance remains separate from publication; final calendars use the edited plan once');
  let ideas = await create({ title: 'Weekend plans', chooseActivityTogether: true });
  await call(route(ideas) + '/activities', peer, 'POST', { title: 'Badminton', location: 'Campus court' });
  ideas = await call(route(ideas) + '/details', owner, 'PATCH', { title: 'What shall we do together?', location: '' });
  assert.equal(ideas.activitySelection.topic, ideas.title); assert.equal(ideas.activitySelection.isOpen, true);
  assert.equal(ideas.activitySelection.ideas.length, 1); assert.equal(ideas.activitySelection.ideas[0].title, 'Badminton');
  assert.equal(ideas.summary.participantCount, 0);
  check('editing an undecided activity updates its topic without creating attendance or losing suggestions');
  ideas = await call(route(ideas) + '/activities/choose', owner, 'POST', { ideaId: ideas.activitySelection.ideas[0].id });
  await call(route(ideas) + '/details', owner, 'PATCH', { title: 'Overwrite someone else\'s suggestion' }, 409);
  assert.equal(ideas.title, 'Badminton');
  check('a chosen activity is preserved and cannot be silently overwritten by the information editor');
} catch (cause) { failure = cause; }
finally {
  let removed = 0;
  for (const account of fixture.accounts) {
    try {
      assert(account.identifier.startsWith('pqa_d153_'));
      await call('/api/v1/me', account, 'DELETE', { confirmUsername: account.identifier });
      await call('/api/v1/me', account, 'GET', undefined, 401); removed++;
    } catch (cause) { failure ||= cause; }
  }
  let deadLinks = 0;
  for (const token of fixture.tokens) {
    try { await call('/api/public/time-polls/' + token, null, 'GET', undefined, 404); deadLinks++; }
    catch (cause) { failure ||= cause; }
  }
  fs.writeFileSync(`${out}/${stage}-details153.json`, JSON.stringify({ passed: !failure, checks, cleanup: { accountsRemoved: removed, deadLinks },
    failure: failure?.message ?? null, at: new Date().toISOString() }, null, 2));
  if (removed === fixture.accounts.length && deadLinks === fixture.tokens.length) fs.unlinkSync(privatePath);
}
if (failure) throw failure;
