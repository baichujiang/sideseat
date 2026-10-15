/** One-shot Preview 100 release preflight. Run only in the verified staged production build. */
import assert from "node:assert/strict";
import fs from "node:fs";
import { gzipSync } from "node:zlib";
import { createHash, randomBytes, createCipheriv, publicEncrypt } from "node:crypto";
import { spawnSync } from "node:child_process";
import pg from "pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { put, get } from "@vercel/blob";

if (process.env.SIDESEAT_UNIFIED_RELEASE !== "preview100") {
  console.log("Unified-plan release preflight not requested; skipped.");
  process.exit(0);
}
assert.equal(process.env.VERCEL_ENV, "production");
assert.equal(process.env.VERCEL_PROJECT_ID, "prj_Mmv4C0ROdAmglCHaI41vrzTXiH2N");
const publicKey = Buffer.from(process.env.SIDESEAT_UNIFIED_RELEASE_PUBLIC_KEY ?? "", "base64").toString();
assert(publicKey.includes("BEGIN PUBLIC KEY"));
const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
assert(new URL(connectionString).hostname.endsWith(".neon.tech"));
const blobToken = process.env.PRIVATE_MEDIA_BLOB_READ_WRITE_TOKEN || process.env.VERIFICATION_BLOB_READ_WRITE_TOKEN;
assert(blobToken, "Existing private backup storage is required");
const sql = new pg.Client({ connectionString });
await sql.connect();
const pendingNames = ["20261015120000_unified_planning", "20261015123000_unified_planning_calendar_index"];
const applied = (await sql.query('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL')).rows.map(r => r.migration_name);
const migrations = fs.readdirSync("prisma/migrations").filter(n => /^\d/.test(n));
assert(applied.every(n => migrations.includes(n)), "Unknown production migration");
assert(migrations.filter(n => !applied.includes(n)).every(n => pendingNames.includes(n)), "Unexpected pending migration");
const hasNewSchema = applied.includes(pendingNames[0]);
if (!hasNewSchema) {
  await sql.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const names = (await sql.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r => r.tablename);
  assert(names.includes("TimePoll") && !names.includes("TimePollInvitation"));
  const backup = { createdAt: new Date().toISOString(), tables: {} };
  for (const name of names) backup.tables[name] = (await sql.query('SELECT row_to_json(t) AS row FROM public."' + name.replaceAll('"', '""') + '" t')).rows.map(r => r.row);
  await sql.query("COMMIT");
  const bytes = gzipSync(JSON.stringify(backup));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const pathname = `release-backups/2026-10-15-unified-plans100/${sha256}.json.gz`;
  await put(pathname, bytes, { access: "private", token: blobToken, addRandomSuffix: false, allowOverwrite: false, contentType: "application/gzip" });
  const readback = await get(pathname, { access: "private", token: blobToken, useCache: false });
  assert(readback?.statusCode === 200);
  const restored = Buffer.from(await new Response(readback.stream).arrayBuffer());
  assert.equal(createHash("sha256").update(restored).digest("hex"), sha256);
  console.log("UNIFIED_PLAN_BACKUP " + JSON.stringify({ createdAt: backup.createdAt, pathname, sha256, bytes: bytes.length, tables: names.length, totalRows: Object.values(backup.tables).reduce((n, rows) => n + rows.length, 0), appliedMigrations: applied.length, privateReadbackVerified: true }));
}
await sql.end();
const migration = spawnSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit", env: { ...process.env, DATABASE_URL_UNPOOLED: connectionString } });
assert.equal(migration.status, 0, "Migration failed");
const db = new PrismaClient();
const accounts = [];
const suffix = "u100" + randomBytes(4).toString("hex");
for (let n = 0; n < 5; n++) {
  const identifier = `pollqa_${suffix}_${n}`, password = randomBytes(18).toString("base64url");
  const user = await db.user.create({ data: { username: identifier, nickname: "Person " + (n + 1), hashedPassword: await bcrypt.hash(password, 12), onboardingComplete: true, school: "TUM", studentStatus: "CURRENT_STUDENT", degreeLevel: "BACHELOR", semester: 3 }, select: { id: true } });
  accounts.push({ identifier, password, id: user.id });
}
await db.$disconnect();
// Only the local operator's private key can recover QA passwords from this receipt.
const key = randomBytes(32), iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
const ciphertext = Buffer.concat([cipher.update(JSON.stringify(accounts)), cipher.final()]);
const envelope = { key: publicEncrypt({ key: publicKey, oaepHash: "sha256" }, key).toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") };
console.log("UNIFIED_PLAN_QA_ENCRYPTED " + JSON.stringify(envelope));
console.log("UNIFIED_PLAN_PREFLIGHT " + JSON.stringify({ migrations: pendingNames, qaAccounts: accounts.length, backedUpInThisRun: !hasNewSchema }));
