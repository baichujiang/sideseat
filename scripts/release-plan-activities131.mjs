/** Additive activity-ideas migration, invoked only by the verified staged release. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { put, get } from '@vercel/blob';
if (process.env.SIDESEAT_ACTIVITY_RELEASE !== 'preview131') process.exit(0);
assert.equal(process.env.VERCEL_ENV, 'production');
assert.equal(process.env.VERCEL_PROJECT_ID, 'prj_Mmv4C0ROdAmglCHaI41vrzTXiH2N');
const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
assert(new URL(connectionString).hostname.endsWith('.neon.tech'));
const token = process.env.PRIVATE_MEDIA_BLOB_READ_WRITE_TOKEN || process.env.VERIFICATION_BLOB_READ_WRITE_TOKEN;
assert(token, 'Existing private backup storage required');
const db = new pg.Client({ connectionString }); await db.connect();
const name = '20261019100000_plan_activity_ideas';
const applied = (await db.query('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL')).rows.map(r => r.migration_name);
const known = fs.readdirSync('prisma/migrations').filter(n => /^\d/.test(n));
assert(applied.every(n => known.includes(n)), 'Unrecognized production migration');
assert(known.filter(n => !applied.includes(n)).every(n => n === name), 'Unexpected pending migration');
if (!applied.includes(name)) {
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const names = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r => r.tablename);
  const snapshot = { createdAt: new Date().toISOString(), tables: {} };
  for (const table of names) snapshot.tables[table] = (await db.query('SELECT row_to_json(t) AS row FROM public."' + table.replaceAll('"', '""') + '" t')).rows.map(r => r.row);
  await db.query('COMMIT');
  const bytes = gzipSync(JSON.stringify(snapshot));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const pathname = `release-backups/2026-10-19-activity-ideas131/${sha256}.json.gz`;
  await put(pathname, bytes, { access: 'private', token, addRandomSuffix: false, allowOverwrite: false, contentType: 'application/gzip' });
  const readback = await get(pathname, { access: 'private', token, useCache: false }); assert.equal(readback?.statusCode, 200);
  assert.equal(createHash('sha256').update(Buffer.from(await new Response(readback.stream).arrayBuffer())).digest('hex'), sha256);
  console.log('ACTIVITY_IDEAS_BACKUP ' + JSON.stringify({ pathname, sha256, bytes: bytes.length, tables: names.length, totalRows: Object.values(snapshot.tables).reduce((sum, rows) => sum + rows.length, 0), privateReadbackVerified: true }));
}
await db.end();
const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], { stdio: 'inherit', env: { ...process.env, DATABASE_URL_UNPOOLED: connectionString } });
assert.equal(result.status, 0, 'Activity migration failed');
console.log('ACTIVITY_IDEAS_PREFLIGHT ' + JSON.stringify({ migration: name, additiveOnly: true, previousRecordsRewritten: false }));
