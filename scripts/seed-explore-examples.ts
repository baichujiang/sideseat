/** Explicit, bounded Explore example publication. Dry-run by default; never logs in. */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { formatInTimeZone } from "date-fns-tz";
import { weeklyIntentCreateSchema } from "../lib/validators/weekly-intent";
import { flexiblePreferenceFitsLifecycle, recentIntentExpiry } from "../lib/v2/intent-timing";
import { EXPLORE_EXAMPLE_AUTHORS, EXPLORE_EXAMPLE_CASES, EXPLORE_EXAMPLE_MARKER,
  EXPLORE_EXAMPLE_NOTE, exploreExampleIntentId } from "../lib/v2/explore-example-catalog";

const { values } = parseArgs({ options: { apply: { type: "boolean" }, production: { type: "boolean" } } });
const url = new URL(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "");
if (values.production) {
  assert.equal(url.hostname, "ep-muddy-glitter-apcgou54.c-7.us-east-1.aws.neon.tech");
  assert.equal(url.pathname, "/neondb");
} else {
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "Remote writes require --production");
  assert.ok(url.pathname.includes("explore_examples"), "Use an isolated explore_examples test database");
}
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
const now = new Date();
const expiry = recentIntentExpiry(now);
const startDate = formatInTimeZone(new Date(now.getTime() + 86_400_000), "Europe/Berlin", "yyyy-MM-dd");
const endDate = formatInTimeZone(new Date(expiry.getTime() - 86_400_000), "Europe/Berlin", "yyyy-MM-dd");
const ids = EXPLORE_EXAMPLE_AUTHORS.flatMap(author => EXPLORE_EXAMPLE_CASES.map(item => exploreExampleIntentId(author.id, item.key)));
const drafts = EXPLORE_EXAMPLE_CASES.map(({ key, period, ...activity }) => {
  const input = weeklyIntentCreateSchema.parse({ ...activity, togetherMode: "SAME_ACTIVITY",
    timeWindows: [], timeZone: "Europe/Berlin", exploreVisible: true, note: EXPLORE_EXAMPLE_NOTE,
    timePreference: period ? { kind: "FLEXIBLE", startDate, endDate, period } : { kind: "UNDECIDED" },
  });
  assert.ok(flexiblePreferenceFitsLifecycle(input.timePreference!, input.timeZone, now, expiry));
  return { key, input };
});

async function main() {
  for (const author of EXPLORE_EXAMPLE_AUTHORS) {
    const existing = await db.user.findFirst({
      where: { OR: [{ id: author.id }, { username: author.username }] },
      select: { id: true, username: true, studentVerificationNotes: true, verifiedStudent: true,
        isGuest: true, hideFromDiscovery: true, hideFromRecommendations: true,
        _count: { select: { sessions: true } }, togetherMatchingSession: { select: { id: true } } },
    });
    if (existing) {
      assert.equal(existing.id, author.id, "Reserved example username belongs to another user; stopping");
      assert.equal(existing.username, author.username);
      assert.equal(existing.studentVerificationNotes, EXPLORE_EXAMPLE_MARKER);
      assert.ok(existing.isGuest && !existing.verifiedStudent && existing.hideFromDiscovery && existing.hideFromRecommendations);
      assert.equal(existing._count.sessions, 0);
      assert.equal(existing.togetherMatchingSession, null);
    }
    const existingIntents = await db.weeklyIntent.findMany({ where: { id: { in: ids.filter(id => id.startsWith(author.id)) } }, select: { userId: true } });
    assert.ok(existingIntents.every(intent => intent.userId === author.id), "An example ID belongs to another user");
  }
  console.log(JSON.stringify({ mode: values.apply ? "APPLY" : "DRY_RUN", schools: EXPLORE_EXAMPLE_AUTHORS.map(a => a.school),
    exampleCount: ids.length, expiresAt: expiry.toISOString(), authenticProfilesModified: 0, matchingEnabled: false }));
  if (!values.apply) return;
  const passwords = await Promise.all(EXPLORE_EXAMPLE_AUTHORS.map(() => bcrypt.hash(randomBytes(48).toString("hex"), 12)));
  await db.$transaction(async tx => {
    for (const [index, author] of EXPLORE_EXAMPLE_AUTHORS.entries()) {
      await tx.user.upsert({ where: { id: author.id }, update: {}, create: {
        ...author, hashedPassword: passwords[index]!, nickname: "SideSeat 示例 / Demo",
        bio: "官方示例数据；不是学生资料或真实邀约。", isGuest: true, verifiedStudent: false,
        studentVerificationStatus: "UNVERIFIED", studentVerificationNotes: EXPLORE_EXAMPLE_MARKER,
        onboardingComplete: false, hideFromDiscovery: true, hideFromRecommendations: true,
        hideFromCourseMembers: true, discoverByCourse: false, discoverByMajor: false,
        discoverBySemester: false, allowInvitationNotes: false, contactInfoOptIn: false,
      } });
      for (const [order, draft] of drafts.entries()) {
        const data = { ...draft.input, userId: author.id, automaticMatching: false, expiresAt: expiry,
          timeWindows: [], timePreference: draft.input.timePreference!, status: "ACTIVE" as const };
        await tx.weeklyIntent.upsert({ where: { id: exploreExampleIntentId(author.id, draft.key) },
          create: { id: exploreExampleIntentId(author.id, draft.key), ...data, createdAt: new Date(now.getTime() - order * 1000) },
          update: { ...data, version: { increment: 1 }, pausedAt: null, endedAt: null },
        });
      }
    }
  }, { timeout: 30_000 });
  const rows = await db.weeklyIntent.findMany({ where: { id: { in: ids } },
    select: { id: true, userId: true, topic: true, exploreVisible: true, automaticMatching: true, status: true, expiresAt: true } });
  assert.equal(rows.length, 10);
  assert.ok(rows.every(row => row.exploreVisible && !row.automaticMatching && row.status === "ACTIVE"));
  const authorIds = EXPLORE_EXAMPLE_AUTHORS.map(author => author.id);
  assert.equal(await db.session.count({ where: { userId: { in: authorIds } } }), 0);
  assert.equal(await db.togetherMatchingSession.count({ where: { userId: { in: authorIds } } }), 0);
  assert.equal(await db.mutualOpportunity.count({ where: { OR: [{ userAId: { in: authorIds } }, { userBId: { in: authorIds } }] } }), 0);
  console.log(JSON.stringify({ status: "SEEDED", count: rows.length, schools: EXPLORE_EXAMPLE_AUTHORS.map(a => a.school),
    examplesPerSchool: 5, expiresAt: expiry.toISOString(), loginSessions: 0, matchingSessions: 0, opportunities: 0 }));
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Example setup failed");
  process.exitCode = 1;
}).finally(() => db.$disconnect());
