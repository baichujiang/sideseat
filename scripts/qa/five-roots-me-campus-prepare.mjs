// Explicit local prerequisites / exact owned catalog teardown. Never advances a native UI phase.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { baseURL, privateDir, readFixture, persist } from './five-roots-live.mjs';
import { fetchQAGet } from './five-roots-get-transport.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const build = Number(process.env.SIDESEAT_QA_UI_BUILD);
assert(Number.isSafeInteger(build) && build > 0, 'Provide the exact expected Preview build explicitly.');
const { PrismaClient } = require('@prisma/client');
export const specs = {
  profile: { method: 'test01CampusProfilePrivacyAvatarAndAppearance', phases: ['baseline', 'profile-cancelled', 'student-saved', 'student-relogged', 'alumni-saved', 'alumni-relogged', 'fields-cleared', 'cleared-relogged', 'avatar-cancelled', 'avatar-saved', 'avatar-relogged', 'avatar-restored', 'privacy-cancelled', 'privacy-saved', 'privacy-relogged', 'privacy-restored', 'appearance-plus-cancelled', 'appearance-cancelled', 'appearance-saved', 'appearance-relogged', 'appearance-restored', 'photo-picker-cancelled', 'peer-isolated'] },
  courses: { method: 'test02OwnedCoursesCreateRestoreTimetableRelaunchAndRemove', phases: ['baseline', 'manual-cancelled', 'manual-created', 'manual-relogged', 'leave-cancelled', 'manual-left', 'bookmark-saved', 'bookmark-relogged', 'bookmark-removed', 'archive-remove-cancelled', 'archive-removed', 'seed-restored', 'timetable-applied', 'timetable-relogged', 'seed-left', 'peer-isolated'] },
};
export const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function localDatabase(readOnly = true) {
  assert.equal(baseURL, 'http://127.0.0.1:3344', 'Campus supplementation is strictly local.');
  const url = new URL(process.env.DATABASE_URL || 'http://invalid');
  assert(['postgres:', 'postgresql:'].includes(url.protocol) && url.hostname === '127.0.0.1' && url.port === '15434'
    && url.pathname === '/sideseat_five_roots_20261026', 'Never grant verification or inspect ordinary / production data.');
  if (process.env.DATABASE_URL_UNPOOLED) { const other = new URL(process.env.DATABASE_URL_UNPOOLED); assert.equal(other.host, url.host); assert.equal(other.pathname, url.pathname); }
  const client = new PrismaClient();
  if (!readOnly) return client;
  const reads = new Set(['findMany', 'findUnique', 'findFirst', 'count', 'aggregate', 'groupBy']);
  const guarded = client.$extends({ query: { $allModels: { async $allOperations({ operation, args, query }) {
    assert(reads.has(operation), 'The campus observer rejects every database mutation.'); return query(args);
  } } } });
  return new Proxy(guarded, { get(target, key) {
    assert(!['$executeRaw', '$executeRawUnsafe', '$queryRaw', '$queryRawUnsafe', '$transaction'].includes(key), 'Read-only observer rejects raw SQL and transactions.');
    const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
  } });
}
export function normalized(profile, account) {
  assert.equal(profile.id, account.id); assert.equal(profile.username, account.identifier); assert.equal(profile.isGuest, false);
  assert(profile.privacy && profile.contacts && profile.appearance);
  const keys = ['nickname', 'tagline', 'gender', 'school', 'studentStatus', 'degreeLevel', 'major', 'semester', 'graduationYear', 'avatarUrl', 'verifiedStudent', 'studentVerificationStatus', 'onboardingComplete'];
  return { ...Object.fromEntries(keys.map(k => [k, profile[k] ?? null])), contacts: profile.contacts, privacy: profile.privacy, appearance: profile.appearance,
    languages: [...(profile.languages || [])].sort((a, b) => a.tag.localeCompare(b.tag)) };
}
const catalogInclude = { officialScheduleVariants: { orderBy: { id: 'asc' }, include: { sessions: { orderBy: { id: 'asc' } } } } };
export async function snapshot(db, f, { empty = false, deleted = false } = {}) {
  const users = await db.user.findMany({ select: { id: true, username: true, verifiedStudent: true, studentVerificationStatus: true, email: true }, orderBy: { id: 'asc' } });
  assert(users.every(u => u.email == null), 'Owned local actors must have no deliverable email address.');
  assert.deepEqual(users.map(u => [u.id, u.username]).sort(), deleted ? [] : f.accounts.map(a => [a.id, a.identifier]).sort(), 'Unknown users are retained; fail instead of deleting them.');
  const models = ['weeklyIntent', 'mutualOpportunity', 'mutualOpportunityMessageRequest', 'connection', 'message', 'planRequest', 'timePoll', 'calendarEntry', 'invitation', 'courseRoomMessage', 'classmatePostCourse', 'planCommitment', 'report', 'friendLink', 'block', 'productFeedback', 'productFeedbackVote', 'productFeedbackComment', 'schoolEmailVerification'];
  const counts = Object.fromEntries(await Promise.all(models.map(async model => [model, await db[model].count()])));
  assert(Object.values(counts).every(n => n === 0), 'Campus flows must not create unrelated social, plan, chat or calendar records.');
  const [memberships, saved, courses] = await Promise.all([
    db.userCourse.findMany({ include: { sessions: true }, orderBy: { id: 'asc' } }),
    db.savedCourse.findMany({ orderBy: { id: 'asc' } }),
    db.course.findMany({ include: catalogInclude, orderBy: { id: 'asc' } }),
  ]);
  const ids = f.accounts.map(a => a.id), owner = f.accounts.find(a => a.role === 'owner').id;
  assert(memberships.every(m => ids.includes(m.userId)) && saved.every(s => ids.includes(s.userId)), 'Unknown course memberships/bookmarks must be retained and fail.');
  if (empty || deleted) assert.equal(memberships.length + saved.length, 0, 'Before local grants / after cleanup all business rows must be empty.');
  if (f.meCampus) {
    const m = f.meCampus, owned = courses.filter(c => c.submittedById === owner);
    const names = new Set([m.seedName, m.archiveName, m.manualName].filter(Boolean));
    assert(owned.every(c => names.has(c.name) && c.school === 'TUM' && c.semesterLabel === m.semesterLabel), 'An unexpected owned catalog row is retained and fails teardown.');
    const ownedIDs = new Set(owned.map(c => c.id));
    assert.equal(hash(courses.filter(c => !ownedIDs.has(c.id))), m.catalogBaselineSHA256, 'Preserve every original seeded / unrelated catalog row byte-for-byte.');
    assert(memberships.every(row => row.userId === owner && ownedIDs.has(row.courseId)) && saved.every(row => row.userId === owner && ownedIDs.has(row.courseId)), 'Peer course data must remain empty.');
  }
  return { users, counts, memberships, saved, courses };
}
export async function request(f, account, endpoint, { method = 'GET', body, phase = 'campus-preparation', status = 200, key } = {}) {
  assert.equal(baseURL, 'http://127.0.0.1:3344'); assert(f.accounts.includes(account) && account.accessToken && !account.deleted);
  assert(endpoint.startsWith('/api/') && !endpoint.includes('://'));
  if (method !== 'GET') assert.equal(process.env.SIDESEAT_ME_CAMPUS_EXECUTE, '1');
  const headers = { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json',
    'x-sideseat-platform': 'ios', 'x-sideseat-flexible-timing': '1', 'x-sideseat-persistent-intent': '1', 'x-sideseat-discovery-matching': '1',
    'x-sideseat-capabilities': 'action-coordination-v2', 'x-request-id': randomUUID(), 'x-sideseat-app-version': '1.0.0',
    'x-sideseat-build': String(build), 'accept-language': 'en', ...(key ? { 'Idempotency-Key': key } : {}) };
  const response = method === 'GET' ? await fetchQAGet(baseURL + endpoint, { headers, role: account.role, phase })
    : await fetch(baseURL + endpoint, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error', signal: AbortSignal.timeout(45_000) });
  assert.equal(response.status, status, 'Owned campus API contract failed. No authentication refresh or progress fallback is permitted.');
  if (status !== 200 && status !== 201) return { status: response.status };
  const envelope = await response.json(); assert(envelope.data); return envelope.data;
}
async function prepare(f, selectedCase, db) {
  assert(specs[selectedCase]); assert(!f.meCampus && !f.me && !f.messages && !f.calendar, 'Never overwrite, reuse or resume a business cohort.');
  assert(f.preparedAt && Date.now() - Date.parse(f.createdAt) < 3_600_000 && f.accounts.every(a => a.created && !a.deleted && a.accessToken));
  const before = await snapshot(db, f, { empty: true });
  const owner = f.accounts.find(a => a.role === 'owner');
  const originals = Object.fromEntries(await Promise.all(f.accounts.map(async a => [a.role, normalized(await request(f, a, '/api/v1/me'), a)])));
  assert(f.accounts.every(a => Object.values(originals[a.role].contacts).every(v => !v)), 'Fresh actors must not contain contact handles.');
  const list = await request(f, owner, '/api/v1/courses?scope=enrolled&limit=30');
  const m = f.meCampus = { schemaVersion: 1, runID: f.runID, selectedCase, build,
    startedAt: new Date().toISOString(), originalProfiles: originals, catalogBaselineSHA256: hash(before.courses), catalogBaselineIDs: before.courses.map(c => c.id),
    semesterLabel: list.semesterLabel, manualName: 'Campus manual ' + f.runID, manualCode: 'QAMC' + f.runID.toUpperCase(),
    keys: { profile: randomUUID(), avatar: randomUUID() } };
  assert.equal(m.build, build); assert(m.semesterLabel); await persist(f);
  const seed = { gender: 'PRIVATE', school: 'TUM', studentStatus: 'CURRENT_STUDENT', degreeLevel: 'BACHELOR', major: '', semester: 2,
    wechatHandle: '', whatsappHandle: '', telegramHandle: '', instagramHandle: '', hideFromDiscovery: false, hideFromCourseMembers: false,
    appearance: { theme: 'classic', icon: 'none', style: 'classic', showMembershipBadge: true } };
  await request(f, owner, '/api/v1/me/profile', { method: 'PATCH', body: seed, key: m.keys.profile });
  if (selectedCase === 'profile') {
    await request(f, owner, '/api/profile/avatar', { method: 'POST', body: { avatarId: 'p01' }, key: m.keys.avatar });
    m.prerequisiteScope = 'Owner restorable campus values, empty handles, classic appearance, visible privacy and preset p01 via explicit API setup only. No profile UI acceptance implied; peer is unchanged.';
  } else {
    // Allowed only after exact local users=2 and all business=0, before any UI business phase.
    await db.user.update({ where: { id: owner.id }, data: { verifiedStudent: true, studentVerificationStatus: 'VERIFIED' } });
    Object.assign(m, { seedName: 'Campus timetable ' + f.runID, seedCode: 'QATS' + f.runID.toUpperCase(),
      archiveName: 'Campus archive ' + f.runID, archiveCode: 'QAAR' + f.runID.toUpperCase(), variantFingerprint: 'qa-campus-' + f.runID,
      location: 'QA room ' + f.runID }); await persist(f);
    const created = await db.$transaction(async tx => {
      const timed = await tx.course.create({ data: { name: m.seedName, code: m.seedCode, identityCode: m.seedCode, school: 'TUM', semesterLabel: m.semesterLabel,
        submittedById: owner.id, officialScheduleVariants: { create: { label: 'Owned Monday timetable', fingerprint: m.variantFingerprint,
          syncedAt: new Date(), sessions: { create: { weekday: 'MON', startMinute: 540, endMinute: 600, location: m.location } } } } } });
      const archived = await tx.course.create({ data: { name: m.archiveName, code: m.archiveCode, identityCode: m.archiveCode, school: 'TUM', semesterLabel: m.semesterLabel, submittedById: owner.id } });
      for (const course of [timed, archived]) await tx.userCourse.create({ data: { userId: owner.id, courseId: course.id, intentions: ['STUDY_TOGETHER'], activeUntil: new Date(Date.now() - 86_400_000) } });
      return { seedCourseID: timed.id, archiveCourseID: archived.id };
    });
    Object.assign(m, created);
    m.prerequisiteScope = 'Owner local-only verified after exact users2/business0, two owner-only expired memberships; one has an explicitly seeded Monday09-10 official variant. Manual creation, restore, apply, bookmark and removal remain App UI-only. Manual course has no invented sessions.';
  }
  m.seededProfiles = Object.fromEntries(await Promise.all(f.accounts.map(async a => [a.role, normalized(await request(f, a, '/api/v1/me'), a)])));
  assert.deepEqual(m.seededProfiles.peer, originals.peer);
  const after = await snapshot(db, f); assert.equal(after.memberships.length, selectedCase === 'courses' ? 2 : 0); assert.equal(after.saved.length, 0);
  m.alumniYear = new Date().getFullYear() - 1; m.preparedAt = new Date().toISOString(); await persist(f);
  console.log('Prepared explicit owned local campus prerequisites only. Native user flow remains unexecuted.');
}
async function cleanupCatalog(f, db) {
  const m = f.meCampus; assert(m?.selectedCase === 'courses' && m.runID === f.runID);
  const s = await snapshot(db, f), owner = f.accounts.find(a => a.role === 'owner').id;
  const expected = new Map([[m.seedName, [m.seedCourseID, m.seedCode]], [m.archiveName, [m.archiveCourseID, m.archiveCode]], [m.manualName, [null, m.manualCode]]]);
  const owned = s.courses.filter(c => c.submittedById === owner);
  assert(owned.length <= 3);
  for (const course of owned) {
    const spec = expected.get(course.name); assert(spec && (!spec[0] || course.id === spec[0]) && course.code === spec[1]
      && course.identityCode === spec[1] && course.school === 'TUM' && course.semesterLabel === m.semesterLabel && !course.externalId && !course.externalSource);
    assert(course.officialScheduleVariants.length === (course.id === m.seedCourseID ? 1 : 0));
    if (course.id === m.seedCourseID) assert(course.officialScheduleVariants[0].fingerprint === m.variantFingerprint
      && course.officialScheduleVariants[0].sessions.length === 1 && course.officialScheduleVariants[0].sessions[0].location === m.location);
  }
  const ids = owned.map(c => c.id);
  await db.$transaction(async tx => {
    // Course.submitter uses SET NULL; remove only this positively identified run catalog before account deletion.
    for (const id of ids) assert.equal((await tx.course.deleteMany({ where: { id, submittedById: owner } })).count, 1);
  });
  const after = await snapshot(db, f, { empty: true }); assert.equal(hash(after.courses), m.catalogBaselineSHA256);
  m.ownedCatalogDeletedIDs = ids; m.ownedCatalogCleanupAt = new Date().toISOString(); await persist(f);
  await fs.writeFile(privateDir + '/campus-catalog-cleanup.json', JSON.stringify({ runID: f.runID, ownedCourseRowsDeleted: ids.length, baselineCatalogPreserved: true, unknownRowsDeleted: 0, ownedMembershipsAndBookmarks: 0 }, null, 2) + '\n', { mode: 0o600 });
  console.log('Exact owned course catalog cleaned; original catalog preserved. Now run factory two-account deletion and stale-bearer401 checks.');
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [mode, selectedCase] = process.argv.slice(2);
  assert(['prepare', 'cleanup-owned-courses', 'seal-cleanup', 'verify-after-cleanup'].includes(mode));
  assert.equal(process.env.SIDESEAT_ME_CAMPUS_EXECUTE, '1'); assert.equal(baseURL, 'http://127.0.0.1:3344');
  assert(/^sideseat-five-roots-me-campus-(profile|courses)-[A-Za-z0-9_-]+$/.test(path.basename(privateDir)));
  const f = mode === 'verify-after-cleanup' ? JSON.parse(await fs.readFile(privateDir + '/campus-cleanup-proof.json', 'utf8')) : await readFixture();
  const db = localDatabase(['seal-cleanup', 'verify-after-cleanup'].includes(mode));
  try {
    if (mode === 'prepare') await prepare(f, selectedCase, db);
    else if (mode === 'cleanup-owned-courses') await cleanupCatalog(f, db);
    else if (mode === 'seal-cleanup') {
      await snapshot(db, f, { empty: true });
      await fs.writeFile(privateDir + '/campus-cleanup-proof.json', JSON.stringify({ runID: f.runID, accounts: f.accounts.map(({ id, role, identifier }) => ({ id, role, identifier })), meCampus: { catalogBaselineSHA256: f.meCampus.catalogBaselineSHA256 } }) + '\n', { mode: 0o600 });
    } else {
      const receipt = JSON.parse(await fs.readFile(privateDir + '/cleanup-receipt.json', 'utf8'));
      assert(receipt.runID === f.runID && receipt.accountsDeleted === 2 && receipt.staleBearer401 === 2);
      assert.equal(await fs.stat(privateDir + '/fixture.json').then(() => true, () => false), false);
      const s = await snapshot(db, f, { deleted: true }); assert.equal(hash(s.courses), f.meCampus.catalogBaselineSHA256); console.log('Owned local users/business rows=0; original catalog preserved; no unknown rows deleted.'); }
  } finally { await db.$disconnect(); }
}
