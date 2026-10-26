/** Test prerequisites only: never grant verification or write business progress in production. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';

async function main() {
const url = new URL(process.env.DATABASE_URL ?? 'http://invalid');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '15434');
assert.equal(url.pathname, '/sideseat_five_roots_20261026');
const privateDir = '/tmp/sideseat-five-roots-private';
const fixture = JSON.parse(await fs.readFile(`${privateDir}/fixture.json`, 'utf8'));
assert.equal(fixture.baseURL, 'http://127.0.0.1:3344');
assert.equal(fixture.accounts.length, 2);
assert(fixture.accounts.every((a: { identifier: string; role: string }) =>
  a.identifier === `e2e_roots_${a.role}_${fixture.runID}`));
const db = new PrismaClient();
try {
  const users = await db.user.findMany({ select: { id: true, username: true } });
  assert.equal(users.length, 2, 'The dedicated database must contain only this run.');
  assert.deepEqual(users.map(u => u.id).sort(), fixture.accounts.map((a: { id: string }) => a.id).sort());
  assert.equal(await db.weeklyIntent.count(), 0, 'Run prerequisites before business UI actions.');
  assert.equal(await db.connection.count(), 0);
  assert.equal(await db.planRequest.count(), 0);
  assert.equal(await db.calendarEntry.count(), 0);
  await db.$transaction(async tx => {
    for (const user of users) {
      assert(user.username.startsWith('e2e_roots_'));
      await tx.user.update({ where: { id: user.id }, data: {
        verifiedStudent: true, studentVerificationStatus: 'VERIFIED',
      } });
      await tx.userLanguage.upsert({ where: { userId_tag: { userId: user.id, tag: 'ENGLISH' } },
        create: { userId: user.id, tag: 'ENGLISH', proficiency: 'FLUENT' }, update: {} });
    }
  });
  await fs.writeFile(`${privateDir}/local-prerequisites.json`, JSON.stringify({
    passed: true, database: 'isolated local only', userCount: 2,
    prerequisites: ['student verification test state', 'English language'],
    businessRecordsCreated: 0, at: new Date().toISOString(),
  }, null, 2) + '\n', { mode: 0o600 });
  console.log('Two local-only test profiles ready; no intentions, messages, connections, plans or calendars seeded.');
} finally { await db.$disconnect(); }

}
main().catch(error => { console.error(error); process.exitCode = 1; });
