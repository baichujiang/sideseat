// Explicit Me prerequisites only. Never call this from the native test or GET-only observer.
// Create the two disposable accounts with five-roots-live.mjs first, after Messages acceptance.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { fetchQAGet } from './five-roots-get-transport.mjs';
import { baseURL, privateDir, fixturePath, readFixture, persist } from './five-roots-live.mjs';

assert(process.argv.length === 3 && process.argv[2] === 'prepare', 'Only explicit mode prepare is supported.');
assert.equal(process.env.SIDESEAT_ME_EXECUTE, '1', 'Me preparation waits for completed Messages acceptance.');
assert.equal(baseURL, 'https://api.sideseat.de');
assert(/^\/tmp\/sideseat-five-roots-me-[A-Za-z0-9_-]+$/.test(privateDir), 'Use a fresh dedicated Me factory directory.');
assert.equal(fixturePath, privateDir + '/fixture.json');
const f = await readFixture(); // The factory validates kind, schema, runID, exact owned usernames and distinct IDs.
assert.equal(f.bundle, 'app.sideseat.mobile.preview');
assert(f.preparedAt && Number.isFinite(Date.parse(f.preparedAt)) && Number.isFinite(Date.parse(f.createdAt)),
  'Finish the separate fresh factory before preparing Me.');
assert(f.accounts.every(a => a.created && !a.deleted && /^c[a-z0-9]{24}$/.test(a.id ?? '') && a.accessToken),
  'Only this factory run’s two active registered CUID identities and existing observer bearers are permitted.');
assert.equal(new Set(f.accounts.map(a => a.id)).size, 2);
assert(!f.me && !f.messages && !f.calendar, 'Never overwrite or resume an existing preparation. Retain failed cohorts for explicit cleanup.');
const owner = f.accounts.find(a => a.role === 'owner'), peer = f.accounts.find(a => a.role === 'peer');
const build = Number(process.env.SIDESEAT_QA_UI_BUILD);
assert(Number.isSafeInteger(build) && build > 0, 'Record the actual frozen Preview build explicitly.');
const seed = { nickname: 'Me baseline ' + f.runID, bio: '可还原的自有 QA 简介 ' + f.runID,
  languages: [{ tag: 'ENGLISH', proficiency: 'CONVERSATIONAL' }] };
const stable = value => JSON.stringify(value);
const hash = value => createHash('sha256').update(stable(value)).digest('hex');
const now = () => new Date().toISOString();

async function request(account, endpoint, method = 'GET', body, idempotencyKey) {
  assert(f.accounts.includes(account) && !account.deleted);
  assert(endpoint.startsWith('/api/v1/') && !endpoint.includes('://'));
  if (method !== 'GET') {
    assert.equal(account, owner, 'Only the owned owner may receive the two explicit preparation writes.');
    assert((method === 'PATCH' && endpoint === '/api/v1/me/profile')
      || (method === 'PUT' && endpoint === '/api/v1/me/languages'));
    assert(idempotencyKey, 'Persist each preparation idempotency key before writing.');
  }
  const options = {
    method, redirect: 'error', signal: AbortSignal.timeout(45_000),
    headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json',
      'x-sideseat-platform': 'ios', 'x-sideseat-flexible-timing': '1', 'x-sideseat-persistent-intent': '1',
      'x-sideseat-discovery-matching': '1', 'x-sideseat-capabilities': 'action-coordination-v2', 'x-request-id': randomUUID(), Accept: 'application/json', 'x-sideseat-app-version': process.env.SIDESEAT_QA_APP_VERSION || '1.0.0',
      'x-sideseat-build': String(build), 'accept-language': 'en',
      ...(method === 'GET' ? {} : { 'Idempotency-Key': idempotencyKey }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
  const response = method === 'GET' ? await fetchQAGet(baseURL + endpoint, { headers: options.headers, role: account.role, phase: 'me-explicit-preparation' })
    : await fetch(baseURL + endpoint, options);
  assert.equal(response.status, 200, `Owned Me preparation ${method} ${endpoint} failed; retain the private fixture. No auth refresh is performed.`);
  const envelope = await response.json(); assert(envelope.data, 'The current native API envelope must contain data.');
  return envelope.data;
}
function profileSnapshot(profile, account) {
  assert.equal(profile.id, account.id); assert.equal(profile.username, account.identifier); assert.equal(profile.isGuest, false);
  assert(Array.isArray(profile.languages) && profile.privacy && profile.contacts && profile.counts?.blocked === 0);
  return {
    nickname: profile.nickname ?? null, tagline: profile.tagline ?? null,
    languages: [...profile.languages].sort((a, b) => a.tag.localeCompare(b.tag)),
    privacy: profile.privacy, contacts: profile.contacts, appearance: profile.appearance,
    school: profile.school, studentStatus: profile.studentStatus, degreeLevel: profile.degreeLevel,
    major: profile.major, semester: profile.semester, graduationYear: profile.graduationYear,
    gender: profile.gender, verifiedStudent: profile.verifiedStudent,
    studentVerificationStatus: profile.studentVerificationStatus, onboardingComplete: profile.onboardingComplete,
    counts: profile.counts,
  };
}
async function emptyBusiness(account) {
  const windowStart = new Date(Date.parse(f.createdAt) - 86_400_000).toISOString();
  const windowEnd = new Date(Date.parse(f.createdAt) + 118 * 86_400_000).toISOString();
  const [contacts, inbox, polls, intents, schedule] = await Promise.all([
    '/api/v1/contacts', '/api/v1/inbox', '/api/v1/time-polls', '/api/v1/me/weekly-intents',
    `/api/v1/home/schedule?windowStart=${encodeURIComponent(windowStart)}&windowEnd=${encodeURIComponent(windowEnd)}`,
  ].map(endpoint => request(account, endpoint)));
  const collections = [contacts.contacts, inbox.conversations, inbox.messageRequests, polls.polls,
    intents.intents, intents.expiredIntents, schedule.studyEntries, schedule.classBlocks];
  assert(collections.every(rows => Array.isArray(rows) && rows.length === 0),
    'This newly created Me cohort must have zero contacts, chats, requests, plans, intentions, calendar entries and classes.');
  return { contacts: 0, chats: 0, requests: 0, polls: 0, intents: 0, calendarInWindow: 0, classesInWindow: 0 };
}

const original = {};
for (const account of [owner, peer]) {
  const profile = await request(account, '/api/v1/me');
  original[account.role] = profileSnapshot(profile, account);
  assert.equal(profile.nickname, account.displayName, 'A fresh factory profile must still have its generated original nickname.');
  assert(!profile.tagline && profile.languages.length === 0, 'Do not overwrite existing biography or language input.');
  assert(Object.values(profile.contacts).every(value => value == null || value === ''), 'The fresh account must not contain contact handles.');
  await emptyBusiness(account);
}
f.me = {
  kind: 'five-roots-me-preparation', schemaVersion: 1, runID: f.runID, startedAt: now(), build,
  preparationOnly: 'Owner nickname, biography and one coordination language; not Me UI acceptance.',
  originalProfiles: original,
  originalProfileSHA256: { owner: hash(original.owner), peer: hash(original.peer) },
  seed, profileIdempotencyKey: randomUUID(), languagesIdempotencyKey: randomUUID(),
};
await persist(f); // Preserve original state and the exact two keys before any server write.
try {
  await request(owner, '/api/v1/me/profile', 'PATCH', { nickname: seed.nickname, bio: seed.bio }, f.me.profileIdempotencyKey);
  f.me.profileSeededAt = now(); await persist(f);
  await request(owner, '/api/v1/me/languages', 'PUT', { languages: seed.languages }, f.me.languagesIdempotencyKey);
  f.me.languagesSeededAt = now(); await persist(f);
  const seeded = {};
  for (const account of [owner, peer]) {
    const profile = await request(account, '/api/v1/me');
    seeded[account.role] = profileSnapshot(profile, account);
    await emptyBusiness(account);
  }
  const expectedOwner = structuredClone(original.owner);
  expectedOwner.nickname = seed.nickname; expectedOwner.tagline = seed.bio; expectedOwner.languages = seed.languages;
  assert.equal(stable(seeded.owner), stable(expectedOwner), 'Only the explicit nickname, biography and one language may change.');
  assert.equal(stable(seeded.peer), stable(original.peer), 'The owned peer must remain unchanged.');
  f.me.seededProfileSHA256 = { owner: hash(seeded.owner), peer: hash(seeded.peer) };
  f.me.seededProfiles = seeded;
  f.me.preparedAt = now(); await persist(f);
  console.log('Prepared only the fresh owned Me owner profile and one language. Peer and empty business collections are unchanged; credentials remain private.');
} catch (error) {
  f.me.preparationFailed = true; await persist(f);
  throw error;
}
