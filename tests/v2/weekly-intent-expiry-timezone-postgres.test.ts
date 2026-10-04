import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PrismaClient, Prisma } from "@prisma/client";
const resolver = Module as typeof Module & { _resolveFilename: (request: string, parent: unknown, isMain: boolean, options?: unknown) => string };
const original = resolver._resolveFilename;
resolver._resolveFilename = function(request, parent, isMain, options) {
 if (request === "server-only") return fileURLToPath(new URL("./server-only-test-stub.cjs", import.meta.url));
 if (request === "next/server") return fileURLToPath(new URL("./next-server-after-test-stub.cjs", import.meta.url));
 return original.call(this, request, parent, isMain, options);
};
const local = process.env.DATABASE_URL && ["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL).hostname);
for (const zone of ["UTC", "Europe/Berlin", "America/New_York"]) {
 test(`intention expiry uses UTC storage under ${zone} database sessions`, {skip: !local}, async () => {
  const url = new URL(process.env.DATABASE_URL!); url.searchParams.set("connection_limit", "1");
  const db = new PrismaClient({datasources:{db:{url:url.href}}});
  const globalDB = globalThis as typeof globalThis & {prisma?: PrismaClient};
  const previous = globalDB.prisma; globalDB.prisma = db;
  const id = `expiry_${randomUUID()}`;
  const now = new Date("2026-10-04T10:15:00.000Z");
  try {
   await db.$queryRaw(Prisma.sql`SELECT set_config('TimeZone', ${zone}, false)`);
   await db.user.create({data:{id,username:id,hashedPassword:"test-only"}});
   for (const status of ["ACTIVE", "PAUSED"] as const) {
    for (const [label,offset] of [["past",-3_600_000],["future",3_600_000]] as const) {
     await db.weeklyIntent.create({data:{userId:id,topic:"COFFEE",activityText:`${status}-${label}`,status,
      timeWindows:[],expiresAt:new Date(now.getTime()+offset)}});
    }
   }
   await db.weeklyIntent.create({data:{userId:id,topic:"COFFEE",activityText:"undecided",timeWindows:[],timePreference:{kind:"UNDECIDED"}}});
   const {loadCurrentWeeklyIntent}=await import("../../lib/v2/weekly-intents");
   await loadCurrentWeeklyIntent(id,now);
   const rows=await db.weeklyIntent.findMany({where:{userId:id}});
   for(const row of rows) {
    const expected=row.activityText?.endsWith("past")?"EXPIRED":row.activityText?.startsWith("PAUSED")?"PAUSED":"ACTIVE";
    assert.equal(row.status,expected,`${zone}: ${row.activityText}`);
    assert.equal(row.endedAt?.toISOString()??null,expected==="EXPIRED"?now.toISOString():null);
   }
  } finally {
   await db.user.deleteMany({where:{id}});await db.$disconnect();globalDB.prisma=previous;
  }
 });
}
