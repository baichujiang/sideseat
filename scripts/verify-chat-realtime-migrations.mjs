import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";
import pg from "pg";

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(2);
}

const parsed = new URL(sourceUrl);
if (!new Set(["127.0.0.1", "localhost", "::1"]).has(parsed.hostname)) {
  console.error("Realtime migration verification refuses non-local PostgreSQL hosts.");
  process.exit(2);
}

const sourceDatabase = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
const suffix = `_rt_upgrade_${process.pid}`;
const testDatabase = `${sourceDatabase.slice(0, 63 - suffix.length)}${suffix}`;
if (!/^[a-z][a-z0-9_]{0,62}$/.test(testDatabase)) {
  console.error("Unable to derive a safe temporary database name.");
  process.exit(2);
}

const adminUrl = new URL(sourceUrl);
adminUrl.pathname = "/postgres";
adminUrl.searchParams.delete("schema");
const testUrl = new URL(sourceUrl);
testUrl.pathname = `/${testDatabase}`;
testUrl.searchParams.set("schema", "public");

const targetMigrations = new Set([
  "20260716210000_chat_realtime_events",
  "20260716211000_chat_realtime_event_sender",
  "20260716212000_chat_realtime_retention",
]);
const temporaryRoot = await mkdtemp(join(tmpdir(), "sideseat-realtime-migration-"));
const temporaryPrisma = join(temporaryRoot, "prisma");
const temporaryMigrations = join(temporaryPrisma, "migrations");
let fixtureClient;
let verificationClient;
let admin;

function runMigrate(schemaPath) {
  const result = spawnSync(
    "npx",
    ["prisma", "migrate", "deploy", "--schema", schemaPath],
    {
      cwd: root,
      env: {
        ...process.env,
        DATABASE_URL: testUrl.toString(),
        DATABASE_URL_UNPOOLED: testUrl.toString(),
      },
      stdio: "inherit",
    },
  );
  if (result.status !== 0) {
    throw new Error(`prisma migrate deploy failed with exit ${result.status ?? 1}.`);
  }
}

try {
  admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${testDatabase}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${testDatabase}"`);

  await mkdir(temporaryMigrations, { recursive: true });
  await cp(join(root, "prisma", "schema.prisma"), join(temporaryPrisma, "schema.prisma"));
  const migrationEntries = await readdir(join(root, "prisma", "migrations"), {
    withFileTypes: true,
  });
  for (const entry of migrationEntries) {
    if (entry.isDirectory() && targetMigrations.has(entry.name)) continue;
    await cp(
      join(root, "prisma", "migrations", entry.name),
      join(temporaryMigrations, entry.name),
      { recursive: entry.isDirectory() },
    );
  }

  runMigrate(join(temporaryPrisma, "schema.prisma"));

  fixtureClient = new PrismaClient({ datasources: { db: { url: testUrl.toString() } } });
  const marker = `migration_${process.pid}`;
  const [user, peer] = await Promise.all([
    fixtureClient.user.create({
      data: { username: `${marker}_user`, hashedPassword: "fixture", onboardingComplete: true },
    }),
    fixtureClient.user.create({
      data: { username: `${marker}_peer`, hashedPassword: "fixture", onboardingComplete: true },
    }),
  ]);
  const connection = await fixtureClient.connection.create({
    data: { userAId: user.id, userBId: peer.id, status: "ACTIVE" },
  });
  const directMessage = await fixtureClient.message.create({
    data: { connectionId: connection.id, senderId: peer.id, body: "existing direct" },
  });
  const course = await fixtureClient.course.create({
    data: {
      name: `Existing Course ${marker}`,
      school: "TUM",
      semesterLabel: marker,
      members: { create: [{ userId: user.id, intentions: [] }, { userId: peer.id, intentions: [] }] },
    },
  });
  const courseMessage = await fixtureClient.courseRoomMessage.create({
    data: { courseId: course.id, senderId: peer.id, body: "existing course" },
  });
  const group = await fixtureClient.groupChat.create({
    data: {
      createdById: user.id,
      participants: { create: [{ userId: user.id }, { userId: peer.id }] },
    },
  });
  const groupMessage = await fixtureClient.groupChatMessage.create({
    data: { groupChatId: group.id, senderId: peer.id, body: "existing group" },
  });
  await fixtureClient.$disconnect();
  fixtureClient = undefined;

  runMigrate(join(root, "prisma", "schema.prisma"));

  verificationClient = new PrismaClient({ datasources: { db: { url: testUrl.toString() } } });
  const backfilled = await verificationClient.chatRealtimeEvent.findMany({
    where: { messageId: { in: [directMessage.id, courseMessage.id, groupMessage.id] } },
    select: {
      conversationKind: true,
      messageId: true,
      senderId: true,
      eventType: true,
    },
    orderBy: { sequence: "asc" },
  });
  if (backfilled.length !== 3 || backfilled.some((event) => event.senderId !== peer.id)) {
    throw new Error("Existing chat messages were not backfilled with sender routing metadata.");
  }
  if (backfilled.some((event) => event.eventType !== "UPSERT")) {
    throw new Error("Existing chat messages were backfilled with an unexpected event type.");
  }

  const newMessage = await verificationClient.message.create({
    data: { connectionId: connection.id, senderId: user.id, body: "trigger insert" },
  });
  await verificationClient.message.update({
    where: { id: newMessage.id },
    data: { body: "trigger update" },
  });
  await verificationClient.message.delete({ where: { id: newMessage.id } });
  const triggerEvents = await verificationClient.chatRealtimeEvent.findMany({
    where: { messageId: newMessage.id },
    select: { senderId: true, eventType: true },
    orderBy: { sequence: "asc" },
  });
  const triggerTypes = triggerEvents.map((event) => event.eventType).join(",");
  if (triggerTypes !== "UPSERT,UPSERT,REMOVE") {
    throw new Error(`Realtime trigger sequence was ${triggerTypes || "empty"}.`);
  }
  if (triggerEvents.some((event) => event.senderId !== user.id)) {
    throw new Error("Realtime trigger events lost sender routing metadata.");
  }
  const retentionRows = await verificationClient.chatRealtimeRetention.count();
  if (retentionRows !== 0) {
    throw new Error("Realtime retention migration created unexpected boundary rows.");
  }

  console.log(
    `Realtime migration upgrade verified: ${backfilled.length} backfills and ${triggerEvents.length} trigger events.`,
  );
} finally {
  await fixtureClient?.$disconnect().catch(() => {});
  await verificationClient?.$disconnect().catch(() => {});
  if (admin) {
    await admin.query(`DROP DATABASE IF EXISTS "${testDatabase}" WITH (FORCE)`).catch(() => {});
    await admin.end().catch(() => {});
  }
  await rm(temporaryRoot, { recursive: true, force: true });
}
