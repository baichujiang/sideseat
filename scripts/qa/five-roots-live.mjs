// Disposable five-root UI accounts. Business actions belong to the App UI.
// Never use ordinary credentials, database access, or opportunity GETs that generate matches.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const baseURL = process.env.SIDESEAT_FIVE_ROOT_BASE_URL || 'https://api.sideseat.de';
assert(['https://api.sideseat.de', 'http://127.0.0.1:3344'].includes(baseURL), 'Only production or the owned port-3344 local QA API is allowed.');
export const privateDir = path.resolve(process.env.SIDESEAT_FIVE_ROOT_PRIVATE_DIR || '/tmp/sideseat-five-roots-private');
assert(/^\/tmp\/sideseat-five-roots-[a-zA-Z0-9_-]+$/.test(privateDir), 'Use a dedicated /tmp/sideseat-five-roots-* private directory.');
export const fixturePath = path.join(privateDir, 'fixture.json');
const backupPath = path.join(privateDir, 'fixture.backup.json');
const receiptPath = path.join(privateDir, 'cleanup-receipt.json');
const roles = ['owner', 'peer'];
const now = () => new Date().toISOString();

function parsePrivateJSON(value) {
  try { return JSON.parse(value); }
  catch {
    const error = new Error('Private JSON is unreadable; credentials were retained. Use restore-backup only after checking the private files.');
    error.code = 'PRIVATE_JSON_INVALID';
    throw error;
  }
}

export function validateFixture(f) {
  assert(f?.kind === 'five-roots-live' && f.schemaVersion === 1, 'Unrecognized fixture.');
  assert(f.baseURL === baseURL, 'Fixture API origin differs from this invocation.');
  assert(/^[a-f0-9]{12}$/.test(f.runID), 'Invalid fixture run identity.');
  assert(Array.isArray(f.accounts) && f.accounts.length === 2, 'Expected exactly two owned roles.');
  assert(roles.every(role => f.accounts.filter(a => a.role === role).length === 1), 'Expected owner and peer once each.');
  assert(f.accounts.every(a => a.identifier === `e2e_roots_${a.role}_${f.runID}` && typeof a.password === 'string' && a.password.length >= 24), 'Only this run’s internal QA accounts are allowed.');
  assert(new Set(f.accounts.flatMap(a => a.id ? [a.id] : [])).size === f.accounts.filter(a => a.id).length, 'Account identities must be distinct.');
  return f;
}

async function ensurePrivateDirectory() {
  await fs.mkdir(privateDir, { recursive: true, mode: 0o700 });
  assert((await fs.lstat(privateDir)).isDirectory(), 'The private path must be a directory, not a symlink.');
  await fs.chmod(privateDir, 0o700);
}

export async function persist(f) {
  validateFixture(f);
  await ensurePrivateDirectory();
  try {
    assert((await fs.lstat(fixturePath)).isFile(), 'The private fixture must be a regular file.');
    const previous = await fs.readFile(fixturePath, 'utf8');
    validateFixture(parsePrivateJSON(previous));
    const backupTemporary = path.join(privateDir, `fixture-${randomUUID()}.tmp`);
    await fs.writeFile(backupTemporary, previous, { mode: 0o600, flag: 'wx' });
    await fs.rename(backupTemporary, backupPath);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = path.join(privateDir, `fixture-${randomUUID()}.tmp`);
  await fs.writeFile(temporary, JSON.stringify(f, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  await fs.rename(temporary, fixturePath);
  await fs.chmod(fixturePath, 0o600);
}

export async function readFixture() {
  await ensurePrivateDirectory();
  assert((await fs.lstat(fixturePath)).isFile(), 'The private fixture must be a regular file.');
  const f = validateFixture(parsePrivateJSON(await fs.readFile(fixturePath, 'utf8')));
  await fs.chmod(fixturePath, 0o600);
  return f;
}

function safeEndpoint(endpoint) {
  return endpoint.split('?')[0].replace(/(\/(?:time-polls|users|connections)\/)[^/]+/g, '$1[owned-resource]');
}

async function request(endpoint, account, method = 'GET', body, statuses = [200], key = randomUUID()) {
  assert(endpoint.startsWith('/api/') && !endpoint.includes('://'), 'Only relative API routes are allowed.');
  let response;
  try {
    response = await fetch(baseURL + endpoint, {
      method, signal: AbortSignal.timeout(45_000), redirect: 'error',
      headers: {
        'Content-Type': 'application/json', Accept: 'application/json',
        'x-sideseat-platform': 'ios', 'x-sideseat-persistent-intent': '1',
        'x-sideseat-flexible-timing': '1', 'x-sideseat-discovery-matching': '1',
        'x-sideseat-app-version': process.env.SIDESEAT_QA_APP_VERSION || '1.0.0',
        'x-sideseat-build': process.env.SIDESEAT_QA_BUILD || '238',
        'x-sideseat-capabilities': 'action-coordination-v2',
        ...(account?.accessToken ? { Authorization: `Bearer ${account.accessToken}` } : {}),
        ...(method !== 'GET' ? { 'Idempotency-Key': key } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch { throw new Error(`${method} ${safeEndpoint(endpoint)}: transport failed; private fixture retained.`); }
  assert(statuses.includes(response.status), `${method} ${safeEndpoint(endpoint)}: HTTP ${response.status}. Private fixture retained.`);
  const value = await response.json().catch(() => ({}));
  return { status: response.status, data: value.data };
}

export async function login(f, account) {
  validateFixture(f);
  assert(f.accounts.includes(account) && !account.deleted, 'Login is limited to this run’s active owned accounts.');
  const { data } = await request('/api/v1/auth/login', null, 'POST', {
    identifier: account.identifier, password: account.password,
    device: { id: randomUUID(), name: 'Five roots isolated QA', appVersion: process.env.SIDESEAT_QA_APP_VERSION || '1.0.0', platformVersion: '26.6.1' },
  });
  assert(typeof data?.tokens?.accessToken === 'string' && typeof data?.user?.id === 'string', `${account.role}: login contract unavailable.`);
  assert(data.user.username === account.identifier && (!account.id || account.id === data.user.id), `${account.role}: authenticated identity differs from the owned fixture.`);
  account.id = data.user.id;
  account.accessToken = data.tokens.accessToken;
  account.created = true;
  await persist(f);
}

export async function get(f, account, endpoint) {
  assert(f.accounts.includes(account) && !account.deleted, 'GET requires an active owned fixture account.');
  if (!account.accessToken) await login(f, account);
  let result = await request(endpoint, account, 'GET', undefined, [200, 401, 403, 404, 426]);
  if (result.status === 401) {
    await login(f, account);
    result = await request(endpoint, account, 'GET', undefined, [200, 403, 404, 426]);
  }
  return result;
}

function rows(value, key) {
  assert(Array.isArray(value?.[key]), `The ${key} collection contract is unavailable.`);
  return value[key];
}

export async function inventory(f, account) {
  const profile = await get(f, account, '/api/v1/me');
  assert(profile.status === 200 && profile.data?.id === account.id && profile.data?.username === account.identifier, `${account.role}: profile ownership check failed.`);
  const experiments = await get(f, account, '/api/v1/me/experiments');
  const contacts = await get(f, account, '/api/v1/contacts');
  const inbox = await get(f, account, '/api/v1/inbox');
  const intentions = await get(f, account, '/api/v1/me/weekly-intents');
  const polls = await get(f, account, '/api/v1/time-polls');
  // The bounded schedule is useful for this run, not an all-history database audit.
  const windowStart = new Date(Date.parse(f.createdAt) - 86_400_000).toISOString();
  const windowEnd = new Date(Date.parse(f.createdAt) + 118 * 86_400_000).toISOString();
  const schedule = await get(f, account, `/api/v1/home/schedule?windowStart=${encodeURIComponent(windowStart)}&windowEnd=${encodeURIComponent(windowEnd)}`);
  assert([contacts, inbox, intentions, polls, schedule].every(result => result.status === 200), `${account.role}: an inventory route is unavailable.`);
  const related = {
    contacts: rows(contacts.data, 'contacts').map(row => ({ id: row.connectionId, peerID: row.peer?.id })),
    conversations: rows(inbox.data, 'conversations').map(row => ({ id: row.id, kind: row.kind, peerID: row.peer?.id ?? null })),
    messageRequests: rows(inbox.data, 'messageRequests').map(row => ({ id: row.id, peerID: row.peer?.userId })),
    intentions: [...rows(intentions.data, 'intents'), ...rows(intentions.data, 'expiredIntents')].map(row => ({ id: row.id, status: row.status })),
    polls: rows(polls.data, 'polls').map(row => ({ token: row.token, isOwner: row.isOwner, phase: row.phase })),
    calendar: rows(schedule.data, 'studyEntries').map(row => ({ id: row.id, timePollToken: row.timePollToken ?? null })),
    classCount: rows(schedule.data, 'classBlocks').length,
  };
  const user = profile.data;
  const gates = {
    isGuest: user.isGuest === true, onboardingComplete: user.onboardingComplete === true,
    campusIdentityComplete: user.readiness?.campusIdentityComplete === true,
    languageCount: rows(user, 'languages').length,
    languagesComplete: user.readiness?.languagesComplete === true,
    verifiedStudent: user.verifiedStudent === true,
    verificationState: /^[A-Z_]+$/.test(user.studentVerificationStatus ?? '') ? user.studentVerificationStatus : 'UNAVAILABLE',
    ready: user.readiness?.ready === true,
    assignmentHTTP: experiments.status,
    experiments: experiments.status === 200 ? rows(experiments.data, 'experiments').map(row => ({
      key: row.key, eligible: row.eligible === true, variant: row.variant,
      features: Object.fromEntries(Object.entries(row.features ?? {}).filter(([, value]) => typeof value === 'boolean')),
    })) : [],
  };
  return { related, summary: { role: account.role, gates, counts: {
    contacts: related.contacts.length, conversations: related.conversations.length,
    messageRequests: related.messageRequests.length, intentions: related.intentions.length,
    polls: related.polls.length, calendarInWindow: related.calendar.length, classBlocksInWindow: related.classCount,
  } } };
}

export async function inspect(f) {
  const summaries = [];
  for (const account of f.accounts) {
    if (account.deleted) { summaries.push({ role: account.role, deleted: true }); continue; }
    const snapshot = await inventory(f, account);
    (f.inventory ??= {})[account.role] = { ...snapshot.related, inspectedAt: now() };
    await persist(f);
    summaries.push(snapshot.summary);
  }
  const result = { inspectedAt: now(), accounts: summaries,
    scope: 'Owned QA profiles and GET collections only. Experiments may persist normal assignments; weekly-intent/inbox GETs apply normal expiry. No matching/opportunity generation request is made.' };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

export async function prepare() {
  await ensurePrivateDirectory();
  assert(!await fs.stat(fixturePath).then(() => true, () => false), 'An owned fixture already exists. Inspect or clean it before preparing another.');
  assert(!await fs.stat(backupPath).then(() => true, () => false), 'A private backup remains. Restore and inspect that run before preparing another.');
  const runID = randomBytes(6).toString('hex');
  const f = {
    kind: 'five-roots-live', schemaVersion: 1, runID, baseURL,
    bundle: 'app.sideseat.mobile.preview', createdAt: now(),
    accounts: roles.map(role => ({ role, identifier: `e2e_roots_${role}_${runID}`,
      password: randomBytes(24).toString('base64url'), displayName: `Roots ${role} ${runID.slice(0, 4)}` })),
  };
  // Both identifiers and passwords are durable before the first signup request.
  await persist(f);
  for (const account of f.accounts) {
    account.signupStartedAt = now();
    await persist(f);
    const { data } = await request('/api/auth/signup', null, 'POST', {
      username: account.identifier, password: account.password, displayName: account.displayName,
      school: 'TUM', studentStatus: 'CURRENT_STUDENT', degreeLevel: 'BACHELOR', semester: 3,
    }, [201]);
    assert(typeof data?.userId === 'string', `${account.role}: signup identity unavailable.`);
    account.id = data.userId;
    account.created = true;
    await persist(f);
    await login(f, account);
  }
  for (const account of f.accounts) {
    const snapshot = await inventory(f, account);
    assert(Object.values(snapshot.summary.counts).every(count => count === 0), `${account.role}: new account is not empty; fixture retained for inspection.`);
    (f.inventory ??= {})[account.role] = { ...snapshot.related, inspectedAt: now() };
  }
  f.preparedAt = now();
  await persist(f);
  console.log('Prepared two isolated internal QA accounts; no contacts, intentions or plans were created. Credentials remain in the private fixture.');
}

function assertOwnedRelations(f, account, related) {
  const ownedIDs = new Set(f.accounts.map(row => row.id));
  assert(related.contacts.every(row => ownedIDs.has(row.peerID)), `${account.role}: a contact is outside this run. Cleanup stopped.`);
  assert(related.conversations.every(row => row.kind === 'DIRECT' && ownedIDs.has(row.peerID)), `${account.role}: a conversation is outside this run. Cleanup stopped.`);
  assert(related.messageRequests.every(row => ownedIDs.has(row.peerID)), `${account.role}: a message request is outside this run. Cleanup stopped.`);
}

export async function cleanup(f) {
  // Inventory every active account before deleting either side of the QA relationship.
  for (const account of f.accounts.filter(row => !row.deleted)) {
    const snapshot = await inventory(f, account);
    assertOwnedRelations(f, account, snapshot.related);
    (f.inventory ??= {})[account.role] = { ...snapshot.related, inspectedAt: now() };
    await persist(f);
  }
  const listedTokens = new Set(f.accounts.flatMap(account => (f.inventory?.[account.role]?.polls ?? []).map(row => row.token)));
  const ownedTokens = new Set(f.accounts.flatMap(account => (f.inventory?.[account.role]?.polls ?? []).filter(row => row.isOwner).map(row => row.token)));
  assert([...listedTokens].every(token => ownedTokens.has(token)), 'A plan is not owned by this run. Cleanup stopped.');
  for (const account of f.accounts) {
    if (!account.deleted) {
      account.deleteKey ??= randomUUID();
      await persist(f);
      const result = await request('/api/v1/me', account, 'DELETE', { confirmUsername: account.identifier }, [200], account.deleteKey);
      assert(result.data?.deleted === true, `${account.role}: account deletion was not confirmed.`);
      account.deleted = true;
      account.deletedAt = now();
      await persist(f);
    }
    await request('/api/v1/me', account, 'GET', undefined, [401]);
    account.staleBearer401 = true;
    await persist(f);
  }
  for (const token of ownedTokens) await request(`/api/public/time-polls/${encodeURIComponent(token)}`, null, 'GET', undefined, [404]);
  const receipt = { kind: f.kind, runID: f.runID, cleanedAt: now(), accountsDeleted: 2,
    staleBearer401: 2, ownedPlanPublic404: ownedTokens.size,
    scope: 'Owned-account deletion and stale bearer/public plan checks. No ordinary users or database were accessed.' };
  await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
  await fs.chmod(receiptPath, 0o600);
  await fs.unlink(fixturePath);
  await fs.rm(backupPath, { force: true });
  console.log(JSON.stringify(receipt, null, 2));
}

async function restoreBackup() {
  await ensurePrivateDirectory();
  assert((await fs.lstat(backupPath)).isFile(), 'A regular private backup is required.');
  const backup = validateFixture(parsePrivateJSON(await fs.readFile(backupPath, 'utf8')));
  const receipt = await fs.readFile(receiptPath, 'utf8').then(parsePrivateJSON, error => { if (error.code !== 'ENOENT') throw error; return null; });
  assert(receipt?.runID !== backup.runID, 'This run was already cleaned; its backup cannot be restored.');
  let validCurrent = false;
  try { await readFixture(); validCurrent = true; } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'PRIVATE_JSON_INVALID') throw error;
  }
  assert(!validCurrent, 'The current fixture is valid. Refuse to overwrite newer cleanup or account state.');
  await fs.copyFile(backupPath, fixturePath);
  await fs.chmod(fixturePath, 0o600);
  console.log('Restored the private backup. Inspect it before continuing; no API request was made.');
}

async function main() {
  const [mode] = process.argv.slice(2);
  if (mode === 'prepare') return prepare();
  if (mode === 'restore-backup') return restoreBackup();
  if (mode === 'inspect') return inspect(await readFixture());
  if (mode === 'cleanup') return cleanup(await readFixture());
  throw new Error('Expected prepare, inspect, cleanup, or restore-backup.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
