// Product creation runs in the iPhone UI; this script observes and cleans disposable data.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
const base = 'https://api.sideseat.de';
const [mode, logPath] = process.argv.slice(2);
const privatePath = path.join(os.tmpdir(), 'sideseat-plan-option155-private.json');
const out = path.resolve(process.env.SIDESEAT_QA_OUTPUT || 'docs/qa/evidence/2026-10-20-plans155');
await fs.mkdir(out, { recursive: true });
async function call(route, account, method = 'GET', body, status = 200) {
  const r = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json',
    'x-sideseat-platform': 'ios', 'Idempotency-Key': randomUUID(),
    ...(account?.accessToken ? { Authorization: `Bearer ${account.accessToken}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const p = await r.json().catch(() => ({}));
  assert.equal(r.status, status, `${method} ${route}: ${r.status}; ${p.error?.message || ''}`); return p.data;
}
if (mode === 'prepare') {
  await assert.rejects(fs.access(privatePath), 'Clean the earlier disposable fixture first.');
  const suffix = randomBytes(4).toString('hex');
  const f = { identifier: `pqa_o155_${suffix}`, password: randomBytes(22).toString('base64url'),
    bundle: 'app.sideseat.mobile.preview', knownTitle: `图书馆复习 ${suffix}`, ideaTitle: `周末一起玩 ${suffix}` };
  const persist = () => fs.writeFile(privatePath, JSON.stringify(f), { mode: 0o600 }); await persist();
  await call('/api/auth/signup', null, 'POST', { username: f.identifier, password: f.password, displayName: 'Option QA',
    school: 'TUM', studentStatus: 'CURRENT_STUDENT', degreeLevel: 'BACHELOR', semester: 3 }, 201);
  const login = await call('/api/v1/auth/login', null, 'POST', { identifier: f.identifier, password: f.password,
    device: { id: randomUUID(), name: 'Suggestion option phone QA', appVersion: '1.0.0', platformVersion: '26.6.1' } });
  f.accessToken = login.tokens.accessToken; await persist();
  console.log('Prepared one disposable account; no plans created by the script.');
} else {
  const f = JSON.parse(await fs.readFile(privatePath, 'utf8')); assert(f.identifier.startsWith('pqa_o155_'));
  if (mode === 'cleanup') {
    const plans = (await call('/api/v1/time-polls', f)).polls;
    await call('/api/v1/me', f, 'DELETE', { confirmUsername: f.identifier });
    await call('/api/v1/me', f, 'GET', undefined, 401);
    for (const p of plans) assert.equal((await fetch(base + '/api/public/time-polls/' + p.token)).status, 404);
    await fs.writeFile(`${out}/cleanup.json`, JSON.stringify({ accountsRemoved: 1, tokens401: 1, links404: plans.length, at: new Date().toISOString() }, null, 2));
    await fs.unlink(privatePath); console.log('Disposable account removed; token 401 and plan links 404 verified.');
  } else if (mode === 'observe') {
    assert(logPath); const checks = []; let failure;
    try {
      const seen = new Set(), deadline = Date.now() + 10 * 60_000;
      while (checks.length < 2 && Date.now() < deadline) {
        const log = await fs.readFile(logPath, 'utf8').catch(() => '');
        for (const [phase, title, suggestions] of [['known-created', f.knownTitle, false], ['idea-created', f.ideaTitle, true]]) {
          if (seen.has(phase) || !log.includes('PLAN_OPTION155_PHASE ' + phase)) continue;
          const list = (await call('/api/v1/time-polls', f)).polls;
          const item = list.find(p => p.title === title); assert(item, 'Phone-created plan appears in the real list.');
          const poll = await call('/api/v1/time-polls/' + item.token, f);
          assert.equal(poll.phase, 'COLLECTING'); assert.equal(poll.location, '校园');
          assert.equal(poll.activitySelection?.isOpen === true, suggestions);
          assert.equal(poll.summary.participantCount, 0); assert.deepEqual(poll.mySlotIds, []);
          checks.push({ phase, suggestionsEnabled: suggestions, responses: 0, phaseOnServer: poll.phase, at: new Date().toISOString() });
          seen.add(phase); console.log('OPTION155 verified ' + phase);
          await fs.writeFile(`${out}/native-api.json`, JSON.stringify({ passed: false, checks }, null, 2));
        }
        if (log.includes('** TEST EXECUTE FAILED **') || log.includes('** TEST FAILED **')) throw Error('Phone test failed; partial observations preserved.');
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      assert.equal(checks.length, 2, 'Both checkbox states must create the intended plan.');
    } catch (cause) { failure = cause; }
    await fs.writeFile(`${out}/native-api.json`, JSON.stringify({ passed: !failure, checks, failure: failure?.message ?? null }, null, 2));
    if (failure) throw failure;
  } else throw Error('Expected prepare, observe <log>, or cleanup.');
}
