import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { PrismaClient } from "@prisma/client";

type CommonJsModuleResolver = typeof Module & {
  _resolveFilename: (
    request: string,
    parent: unknown,
    isMain: boolean,
    options?: unknown,
  ) => string;
};

const commonJsModule = Module as CommonJsModuleResolver;
const resolveFilename = commonJsModule._resolveFilename;
const serverOnlyStub = fileURLToPath(
  new URL("./server-only-test-stub.cjs", import.meta.url),
);
const nextServerStub = fileURLToPath(
  new URL("./next-server-after-test-stub.cjs", import.meta.url),
);
commonJsModule._resolveFilename = function resolveForServerIntegrationTest(
  request,
  parent,
  isMain,
  options,
) {
  if (request === "server-only") return serverOnlyStub;
  if (request === "next/server") return nextServerStub;
  return resolveFilename.call(this, request, parent, isMain, options);
};

const localDatabaseUrl = localPostgresUrl(process.env.DATABASE_URL);

test("automatic matching PostgreSQL test refuses non-local database targets", () => {
  assert.equal(
    localPostgresUrl("postgresql://user:password@example.invalid/database"),
    undefined,
  );
  assert.equal(
    localPostgresUrl("postgresql://user:password@127.0.0.1:5433/database"),
    "postgresql://user:password@127.0.0.1:5433/database",
  );
});

for (const related of [false, true]) test(
  `${related ? "60/100 related coffee activities" : "exact sports activities"}: two explicit sessions produce a mutual Plan and both Calendars`,
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    assert.ok(localDatabaseUrl);
    const { createWeeklyIntent } = await import("../../lib/v2/weekly-intents");
    const { weeklyIntentExpiry } = await import(
      "../../lib/v2/weekly-intent-policy"
    );
    const {
      decideMutualOpportunity,
      generateMutualOpportunitiesForUser,
      listMutualOpportunities,
    } = await import("../../lib/v2/mutual-opportunities");
    const plans = await import("../../lib/api/v1/plans-service");

    const db = new PrismaClient({
      datasources: { db: { url: localDatabaseUrl } },
    });
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const userAId = `auto-match-${suffix}-a`;
    const userBId = `auto-match-${suffix}-b`;
    await db.$connect();
    const previousFitFlag = process.env.V2_ACTIVITY_FIT_ENABLED;
    process.env.V2_ACTIVITY_FIT_ENABLED = related ? "1" : "0";

    try {
      await db.user.createMany({
        data: [
          {
            id: userAId,
            username: `auto_match_${suffix}_a`,
            hashedPassword: "fixture",
            nickname: "Alex",
            school: "TUM",
            onboardingComplete: true,
            verifiedStudent: true,
          },
          {
            id: userBId,
            username: `auto_match_${suffix}_b`,
            hashedPassword: "fixture",
            nickname: "Mia",
            school: "TUM",
            onboardingComplete: true,
            verifiedStudent: true,
          },
        ],
      });
      await db.userLanguage.createMany({
        data: [
          { userId: userAId, tag: "ENGLISH", proficiency: "FLUENT" },
          { userId: userBId, tag: "ENGLISH", proficiency: "FLUENT" },
        ],
      });

      const realNow = new Date();
      const currentWeekExpiry = weeklyIntentExpiry("Europe/Berlin", realNow);
      const serviceNow = currentWeekExpiry.getTime() - realNow.getTime() >= 6 * 60 * 60_000
        ? realNow
        : new Date(currentWeekExpiry.getTime() + 2 * 60 * 60_000);
      const startsAt = new Date(serviceNow.getTime() + 2 * 60 * 60_000);
      const endsAt = new Date(startsAt.getTime() + (related ? 30 : 60) * 60_000);
      const input = {
        topic: related ? "COFFEE" as const : "SPORTS" as const,
        sportTag: related ? undefined : "BADMINTON" as const,
        activityText: related ? "喝咖啡" : undefined,
        courseId: null,
        timeWindows: [{
          startAt: startsAt.toISOString(),
          endAt: endsAt.toISOString(),
        }],
        timeZone: "Europe/Berlin",
        note: "Badminton after class",
      };

      const first = await createWeeklyIntent(userAId, input, serviceNow);
      const second = await createWeeklyIntent(userBId, {
        ...input, activityText: related ? "咖啡聊聊" : undefined,
      }, serviceNow);
      assert.equal(first.intent.sportTag, related ? null : "BADMINTON");
      assert.equal(second.intent.sportTag, related ? null : "BADMINTON");

      assert.equal(
        await db.mutualOpportunity.count({
          where: { OR: [{ userAId }, { userBId: userAId }] },
        }),
        0,
        "saving intentions must not implicitly join matching",
      );
      await activateMatchingSessions(db, [userAId]);
      assert.deepEqual(await generateMutualOpportunitiesForUser(userAId), []);
      assert.equal(
        await db.mutualOpportunity.count({
          where: { OR: [{ userAId }, { userBId: userAId }] },
        }),
        0,
        "one active session is not enough",
      );
      await activateMatchingSessions(db, [userBId]);
      if (related) {
        process.env.V2_ACTIVITY_FIT_ENABLED = "0";
        assert.deepEqual(await generateMutualOpportunitiesForUser(userBId), [], "old-client rollout does not broaden early");
        process.env.V2_ACTIVITY_FIT_ENABLED = "1";
      }
      assert.equal(
        (await generateMutualOpportunitiesForUser(userBId)).length,
        1,
      );

      const firstList = await listMutualOpportunities(userAId, false);
      const opportunity = firstList.opportunities.find(
        (item) =>
          item.state === "NEEDS_DECISION" &&
          item.viewerIntentId === first.intent.id,
      );
      assert.ok(opportunity, "the second active session should create the match");
      assert.equal(opportunity.viewerIntentId, first.intent.id);
      assert.equal(opportunity.matchFit?.score, related ? 60 : 100);
      assert.equal(opportunity.matchFit?.basis, related ? "RELATED_ACTIVITY" : "EXACT_ACTIVITY");
      if (related) {
        assert.equal(opportunity.activityText, null, "no fabricated agreed concrete action");
        assert.equal(opportunity.matchFit?.viewerActivityText, "喝咖啡");
        assert.equal(opportunity.matchFit?.peerActivityText, "咖啡聊聊");
        const peer = (await listMutualOpportunities(userBId, false)).opportunities[0]!;
        assert.equal(peer.matchFit?.score, 60);
        assert.equal(peer.matchFit?.viewerActivityText, "咖啡聊聊");
        assert.equal(peer.matchFit?.peerActivityText, "喝咖啡");
      }

      await stopMatchingSessions(db, [userAId, userBId]);
      assert.equal(
        (await listMutualOpportunities(userAId, false)).opportunities.some(
          (item) => item.id === opportunity.id,
        ),
        true,
        "stopping matching must not delete an already generated opportunity",
      );

      const waiting = await decideMutualOpportunity({
        userId: userAId,
        opportunityId: opportunity.id,
        decision: "YES",
      });
      assert.equal(waiting.opportunity.state, "DECIDED");
      assert.equal(waiting.opportunity.viewerDecision, "YES");
      const privatePeer = (await listMutualOpportunities(userBId, false)).opportunities[0]!;
      assert.equal(privatePeer.viewerDecision, null);
      assert.equal(privatePeer.state, "NEEDS_DECISION");
      assert.equal(privatePeer.coordination, null);
      assert.equal(
        (await listMutualOpportunities(userAId, false)).opportunities.some(
          (item) => item.id === opportunity.id && item.state === "DECIDED",
        ),
        true,
      );

      const mutual = await decideMutualOpportunity({
        userId: userBId,
        opportunityId: opportunity.id,
        decision: "YES",
      });
      assert.equal(mutual.opportunity.state, "READY_TO_COORDINATE");
      const connectionId = mutual.opportunity.coordination?.connectionId;
      assert.ok(connectionId);
      assert.equal(
        await db.message.count({
          where: {
            connectionId,
            mutualOpportunityId: opportunity.id,
            type: "MUTUAL_OPPORTUNITY_CARD",
          },
        }),
        1,
      );

      const created = await plans.createDirectPlanRequest({
        userId: userAId,
        connectionId,
        receiverUserId: userBId,
        title: related ? "Coffee together" : "Play badminton together",
        location: related ? "Campus cafe" : "TUM Sports Center",
        startTime: startsAt.toISOString(),
        endTime: endsAt.toISOString(),
        planType: related ? "CUSTOM" : "SPORTS",
        origin: { kind: "MUTUAL_OPPORTUNITY", id: opportunity.id },
      });
      assert.equal(created.plan.status, "PENDING");
      assert.equal(created.plan.origin?.id, opportunity.id);

      const accepted = await plans.acceptPlanRequest({
        userId: userBId,
        planId: created.plan.id,
      });
      assert.equal(accepted.status, "ACCEPTED");
      assert.ok(accepted.commitmentId);
      assert.deepEqual(
        await db.calendarEntry.findMany({
          where: { planCommitmentId: accepted.commitmentId },
          select: { userId: true, projectionStatus: true },
          orderBy: { userId: "asc" },
        }),
        [userAId, userBId]
          .sort()
          .map((userId) => ({ userId, projectionStatus: "ACTIVE" })),
      );
    } finally {
      if (previousFitFlag === undefined) delete process.env.V2_ACTIVITY_FIT_ENABLED;
      else process.env.V2_ACTIVITY_FIT_ENABLED = previousFitFlag;
      await db.user.deleteMany({
        where: { id: { in: [userAId, userBId] } },
      });
      await db.$disconnect();
    }
  },
);

test("published flexible intentions: automatic match without sessions, bilateral interest, explicit Plan and both calendars",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" }, async () => {
    const { createWeeklyIntent, patchWeeklyIntent } = await import("../../lib/v2/weekly-intents");
    const { generateMutualOpportunitiesForUser, listMutualOpportunities, decideMutualOpportunity } = await import("../../lib/v2/mutual-opportunities");
    const plans = await import("../../lib/api/v1/plans-service");
    const { formatInTimeZone } = await import("date-fns-tz");
    const flags = ["V2_FLEXIBLE_TIMING_ENABLED", "V2_AUTOMATIC_MATCHING_ENABLED", "V2_WEEKLY_INTENT_ENABLED", "V2_MUTUAL_OPPORTUNITY_ENABLED"];
    const previous = flags.map(key => process.env[key]);
    flags.forEach(key => { process.env[key] = "1"; });
    try {
      await withMatchingPair("flex-timing", async ({ db, userAId, userBId }) => {
        const now = new Date();
        const tomorrow = formatInTimeZone(new Date(now.getTime() + 86400000), "Europe/Berlin", "yyyy-MM-dd");
        const input = { topic: "COFFEE" as const, activityText: "Automatic coffee", timeZone: "Europe/Berlin", timeWindows: [], timePreference: { kind: "UNDECIDED" as const }, automaticMatching: true as const };
        const publishedAt = new Date(now.getTime() - 3 * 86400000);
        const first = await createWeeklyIntent(userAId, input, publishedAt);
        assert.equal(new Date(first.intent.expiresAt).getTime() - publishedAt.getTime(), 14 * 86400000);
        assert.equal(first.intent.automaticMatching, true);
        assert.equal((await listMutualOpportunities(userAId, false)).opportunities.length, 0);
        const edited = await patchWeeklyIntent(userAId, first.intent.id, { action: "EDIT", expectedVersion: first.intent.version,
          timePreference: { kind: "FLEXIBLE", startDate: tomorrow, endDate: tomorrow, period: "ANY" }, timeWindows: [] });
        const extended = await patchWeeklyIntent(userAId, first.intent.id, { action: "EXTEND", expectedVersion: edited.intent.version });
        assert.ok(new Date(extended.intent.expiresAt) >= new Date(first.intent.expiresAt));
        assert.deepEqual(extended.intent.timeWindows, []);
        const second = await createWeeklyIntent(userBId, input, now);
        assert.equal(second.intent.status, "ACTIVE");
        assert.equal(await db.togetherMatchingSession.count({ where: { userId: { in: [userAId, userBId] } } }), 0);
        assert.equal(await db.mutualOpportunity.count({ where: { OR: [{ userAId }, { userBId: userAId }] } }), 1,
          "second publication creates an opportunity immediately; no matching start or refresh is needed");
        assert.deepEqual(await generateMutualOpportunitiesForUser(userAId), [], "refresh does not duplicate the opportunity");
        const opportunity = (await listMutualOpportunities(userAId, false)).opportunities[0]!;
        assert.ok(opportunity);
        assert.equal(opportunity.startsAt, null);
        assert.equal(opportunity.endsAt, null);
        assert.equal(opportunity.matchFit?.timePoints, null);
        assert.equal(opportunity.matchFit?.overlapMinutes, null);
        assert.equal(opportunity.matchFit?.score, 100);
        assert.equal((opportunity.timeContext as { kind: string }).kind, "FLEXIBLE");
        await decideMutualOpportunity({ userId: userAId, opportunityId: opportunity.id, decision: "YES" });
        assert.equal((await listMutualOpportunities(userBId, false)).opportunities[0]?.viewerDecision, null);
        const mutual = await decideMutualOpportunity({ userId: userBId, opportunityId: opportunity.id, decision: "YES" });
        const connectionId = mutual.opportunity.coordination?.connectionId;
        assert.ok(connectionId);
        const chat = await db.message.findFirstOrThrow({ where: { connectionId, mutualOpportunityId: opportunity.id } });
        assert.equal(chat.type, "MUTUAL_OPPORTUNITY_CARD");
        assert.equal(await db.calendarEntry.count({ where: { userId: { in: [userAId, userBId] } } }), 0);
        const start = new Date(now.getTime() + 86400000);
        const created = await plans.createDirectPlanRequest({ userId: userAId, receiverUserId: userBId, connectionId,
          title: "Coffee together", startTime: start.toISOString(), endTime: new Date(start.getTime() + 3600000).toISOString(),
          planType: "CUSTOM", origin: { kind: "MUTUAL_OPPORTUNITY", id: opportunity.id } });
        assert.equal(created.plan.status, "PENDING");
        assert.equal(await db.calendarEntry.count({ where: { userId: { in: [userAId, userBId] } } }), 0);
        const accepted = await plans.acceptPlanRequest({ userId: userBId, planId: created.plan.id });
        assert.equal(accepted.status, "ACCEPTED");
        assert.ok(accepted.commitmentId);
        assert.equal(await db.calendarEntry.count({ where: { planCommitmentId: accepted.commitmentId, projectionStatus: "ACTIVE" } }), 2);
      });
    } finally {
      flags.forEach((key, index) => {
        if (previous[index] === undefined) delete process.env[key];
        else process.env[key] = previous[index];
      });
    }
  });

test("intention-driven matching preserves legacy consent, pause/resume and rollout controls",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" }, async () => {
    const { createWeeklyIntent, patchWeeklyIntent, endWeeklyIntent } = await import("../../lib/v2/weekly-intents");
    const { generateMutualOpportunitiesForUser } = await import("../../lib/v2/mutual-opportunities");
    const { stopTogetherMatchingSession } = await import("../../lib/v2/together-matching-session");
    const flags = ["V2_FLEXIBLE_TIMING_ENABLED", "V2_AUTOMATIC_MATCHING_ENABLED", "V2_WEEKLY_INTENT_ENABLED", "V2_MUTUAL_OPPORTUNITY_ENABLED"];
    const previous = flags.map(key => process.env[key]);
    flags.forEach(key => { process.env[key] = "1"; });
    try {
      for (const scenario of ["legacy", "pause", "rollout", "expired", "ended"] as const) {
        await withMatchingPair(`intent-${scenario}`, async ({ db, userAId, userBId }) => {
          const input = { topic: "COFFEE" as const, activityText: `Coffee ${scenario}`, timeZone: "Europe/Berlin", timeWindows: [],
            timePreference: { kind: "UNDECIDED" as const }, automaticMatching: true as const };
          let first = await createWeeklyIntent(userAId, { ...input, automaticMatching: scenario === "legacy" ? undefined : true });
          if (scenario === "pause") first = await patchWeeklyIntent(userAId, first.intent.id, { action: "PAUSE", expectedVersion: first.intent.version });
          if (scenario === "ended") await endWeeklyIntent(userAId, first.intent.id, first.intent.version);
          if (scenario === "rollout") process.env.V2_AUTOMATIC_MATCHING_ENABLED = "0";
          if (scenario === "expired") await db.weeklyIntent.update({ where: { id: first.intent.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
          await createWeeklyIntent(userBId, input);
          assert.equal(await db.mutualOpportunity.count({ where: { OR: [{ userAId }, { userBId: userAId }] } }), 0, scenario);
          if (scenario === "legacy") {
            assert.equal(first.intent.automaticMatching, false);
            await patchWeeklyIntent(userAId, first.intent.id, { action: "EDIT", expectedVersion: first.intent.version, automaticMatching: true });
          } else if (scenario === "pause") {
            await patchWeeklyIntent(userAId, first.intent.id, { action: "RESUME", expectedVersion: first.intent.version, automaticMatching: true });
          } else if (scenario === "rollout") {
            process.env.V2_AUTOMATIC_MATCHING_ENABLED = "1";
            await generateMutualOpportunitiesForUser(userAId);
          } else return;
          assert.equal(await db.mutualOpportunity.count({ where: { OR: [{ userAId }, { userBId: userAId }] } }), 1, scenario);
          // Stop on an older installed client must still stop this owner's supply.
          await stopTogetherMatchingSession(userAId);
          assert.equal((await db.weeklyIntent.findUniqueOrThrow({ where: { id: first.intent.id } })).status, "PAUSED");
          assert.equal(await db.mutualOpportunity.count({ where: { userAId: { in: [userAId, userBId] }, status: "PENDING" } }), 0);
        });
      }
    } finally {
      flags.forEach((key, index) => {
        if (previous[index] === undefined) delete process.env[key];
        else process.env[key] = previous[index];
      });
    }
  });

test("legacy intents without concrete activity never receive invented activity points",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" }, async () => {
    const { createWeeklyIntent } = await import("../../lib/v2/weekly-intents");
    const { generateMutualOpportunitiesForUser, listMutualOpportunities } = await import("../../lib/v2/mutual-opportunities");
    await withMatchingPair("legacy-fit", async ({ db, userAId, userBId }) => {
      const { serviceNow, startsAt, endsAt } = await matchingWindow();
      const input = { topic: "COFFEE" as const, activityText: "Coffee", courseId: null,
        timeZone: "Europe/Berlin", timeWindows: [{ startAt: startsAt.toISOString(), endAt: endsAt.toISOString() }] };
      const a = await createWeeklyIntent(userAId, input, serviceNow);
      const b = await createWeeklyIntent(userBId, input, serviceNow);
      // Model actual pre-concrete rows, which current input validators cannot create.
      await db.weeklyIntent.updateMany({ where: { id: { in: [a.intent.id, b.intent.id] } }, data: { activityText: null } });
      await activateMatchingSessions(db, [userAId, userBId]);
      assert.equal((await generateMutualOpportunitiesForUser(userAId)).length, 1);
      assert.equal((await listMutualOpportunities(userAId, false)).opportunities[0]?.matchFit, null);
    });
  });

test(
  "parallel study goals create an explainable shared-context Plan and two Calendar projections",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const { createWeeklyIntent } = await import("../../lib/v2/weekly-intents");
    const {
      decideMutualOpportunity,
      generateMutualOpportunitiesForUser,
      listMutualOpportunities,
    } = await import("../../lib/v2/mutual-opportunities");
    const plans = await import("../../lib/api/v1/plans-service");

    await withMatchingPair("shared-study", async ({ db, userAId, userBId }) => {
      const { serviceNow, startsAt, endsAt } = await matchingWindow();
      const baseInput = {
        topic: "STUDY" as const,
        courseId: null,
        timeWindows: [{
          startAt: startsAt.toISOString(),
          endAt: endsAt.toISOString(),
        }],
        timeZone: "Europe/Berlin",
        note: "Quiet library session",
      };
      const first = await createWeeklyIntent(userAId, {
        ...baseInput,
        togetherMode: "PARALLEL",
        studyGoal: "Write thesis",
      }, serviceNow);
      const second = await createWeeklyIntent(userBId, {
        ...baseInput,
        togetherMode: "EITHER",
        studyGoal: "Exam revision",
      }, serviceNow);
      await activateMatchingSessions(db, [userAId, userBId]);
      assert.equal(
        (await generateMutualOpportunitiesForUser(userBId)).length,
        1,
      );

      const listA = await listMutualOpportunities(userAId, false);
      const opportunityA = listA.opportunities.find(
        (item) => item.viewerIntentId === first.intent.id,
      );
      assert.ok(opportunityA);
      assert.equal(opportunityA.matchKind, "SHARED_CONTEXT");
      assert.equal(opportunityA.sharedContext, "PARALLEL_STUDY");
      assert.equal(opportunityA.viewerStudyGoal, "Write thesis");
      assert.equal(opportunityA.peerStudyGoal, "Exam revision");
      assert.equal(opportunityA.viewerTogetherMode, "PARALLEL");
      assert.equal(opportunityA.peerTogetherMode, "EITHER");

      const listB = await listMutualOpportunities(userBId, false);
      const opportunityB = listB.opportunities.find(
        (item) => item.id === opportunityA.id,
      );
      assert.ok(opportunityB);
      assert.equal(opportunityB.viewerIntentId, second.intent.id);
      assert.equal(opportunityB.viewerStudyGoal, "Exam revision");
      assert.equal(opportunityB.peerStudyGoal, "Write thesis");
      assert.equal(opportunityB.viewerTogetherMode, "EITHER");
      assert.equal(opportunityB.peerTogetherMode, "PARALLEL");

      const stored = await db.mutualOpportunity.findUniqueOrThrow({
        where: { id: opportunityA.id },
        select: {
          matchKind: true,
          sharedContext: true,
          intentAStudyGoal: true,
          intentBStudyGoal: true,
          intentATogetherMode: true,
          intentBTogetherMode: true,
          contextSnapshot: true,
        },
      });
      assert.equal(stored.matchKind, "SHARED_CONTEXT");
      assert.equal(stored.sharedContext, "PARALLEL_STUDY");
      assert.deepEqual(
        new Set([stored.intentAStudyGoal, stored.intentBStudyGoal]),
        new Set(["Write thesis", "Exam revision"]),
      );
      const snapshot = stored.contextSnapshot as Record<string, unknown>;
      assert.equal(snapshot.title, "Study side by side");
      assert.equal(snapshot.matchKind, "SHARED_CONTEXT");
      assert.equal(snapshot.sharedContext, "PARALLEL_STUDY");
      assert.equal(snapshot.location, null);

      await decideMutualOpportunity({
        userId: userAId,
        opportunityId: opportunityA.id,
        decision: "YES",
      });
      const mutual = await decideMutualOpportunity({
        userId: userBId,
        opportunityId: opportunityA.id,
        decision: "YES",
      });
      const connectionId = mutual.opportunity.coordination?.connectionId;
      assert.ok(connectionId);
      assert.equal(
        await db.message.count({
          where: {
            connectionId,
            mutualOpportunityId: opportunityA.id,
            type: "MUTUAL_OPPORTUNITY_CARD",
          },
        }),
        1,
      );

      const created = await plans.createDirectPlanRequest({
        userId: userAId,
        connectionId,
        receiverUserId: userBId,
        title: "Study side by side",
        startTime: startsAt.toISOString(),
        endTime: endsAt.toISOString(),
        planType: "STUDY",
        origin: { kind: "MUTUAL_OPPORTUNITY", id: opportunityA.id },
      });
      assert.equal(created.plan.location, null);
      const originSnapshot = await db.planRequest.findUniqueOrThrow({
        where: { id: created.plan.id },
        select: { originSnapshot: true },
      });
      assert.equal(
        (originSnapshot.originSnapshot as Record<string, unknown>).matchKind,
        "SHARED_CONTEXT",
      );

      const accepted = await plans.acceptPlanRequest({
        userId: userBId,
        planId: created.plan.id,
      });
      assert.equal(accepted.status, "ACCEPTED");
      assert.ok(accepted.commitmentId);
      assert.deepEqual(
        await db.calendarEntry.findMany({
          where: { planCommitmentId: accepted.commitmentId },
          select: { userId: true, projectionStatus: true },
          orderBy: { userId: "asc" },
        }),
        [userAId, userBId]
          .sort()
          .map((userId) => ({ userId, projectionStatus: "ACTIVE" })),
      );
    });
  },
);

test(
  "different study goals do not match when either participant requires the same activity",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const { createWeeklyIntent } = await import("../../lib/v2/weekly-intents");
    const {
      generateMutualOpportunitiesForUser,
      listMutualOpportunities,
    } = await import(
      "../../lib/v2/mutual-opportunities"
    );

    await withMatchingPair("same-only", async ({ db, userAId, userBId }) => {
      const { serviceNow, startsAt, endsAt } = await matchingWindow();
      const baseInput = {
        topic: "STUDY" as const,
        courseId: null,
        timeWindows: [{
          startAt: startsAt.toISOString(),
          endAt: endsAt.toISOString(),
        }],
        timeZone: "Europe/Berlin",
      };
      await createWeeklyIntent(userAId, {
        ...baseInput,
        togetherMode: "SAME_ACTIVITY",
        studyGoal: "Write thesis",
      }, serviceNow);
      await createWeeklyIntent(userBId, {
        ...baseInput,
        togetherMode: "EITHER",
        studyGoal: "Exam revision",
      }, serviceNow);
      await activateMatchingSessions(db, [userAId, userBId]);
      assert.deepEqual(await generateMutualOpportunitiesForUser(userAId), []);

      assert.equal((await listMutualOpportunities(userAId, false)).opportunities.length, 0);
      assert.equal((await listMutualOpportunities(userBId, false)).opportunities.length, 0);
      assert.equal(
        await db.mutualOpportunity.count({
          where: {
            OR: [{ userAId }, { userBId }, { userAId: userBId }, { userBId: userAId }],
          },
        }),
        0,
      );
    });
  },
);

test(
  "exact study activity wins over an older compatible parallel-study candidate",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const { createWeeklyIntent } = await import("../../lib/v2/weekly-intents");
    const {
      generateMutualOpportunitiesForUser,
      listMutualOpportunities,
    } = await import(
      "../../lib/v2/mutual-opportunities"
    );

    await withMatchingUsers("exact-first", 3, async ({ db, userIds }) => {
      const [ownerId, sharedCandidateId, exactCandidateId] = userIds;
      assert.ok(ownerId && sharedCandidateId && exactCandidateId);
      const { serviceNow, startsAt, endsAt } = await matchingWindow();
      const baseInput = {
        topic: "STUDY" as const,
        courseId: null,
        timeWindows: [{
          startAt: startsAt.toISOString(),
          endAt: endsAt.toISOString(),
        }],
        timeZone: "Europe/Berlin",
      };

      await createWeeklyIntent(sharedCandidateId, {
        ...baseInput,
        togetherMode: "PARALLEL",
        studyGoal: "Exam revision",
      }, serviceNow);
      await createWeeklyIntent(exactCandidateId, {
        ...baseInput,
        togetherMode: "SAME_ACTIVITY",
        studyGoal: "Write thesis",
      }, serviceNow);
      const owner = await createWeeklyIntent(ownerId, {
        ...baseInput,
        togetherMode: "EITHER",
        studyGoal: "Write thesis",
      }, serviceNow);
      await activateMatchingSessions(db, [
        ownerId,
        sharedCandidateId,
        exactCandidateId,
      ]);
      assert.equal(
        (await generateMutualOpportunitiesForUser(ownerId)).length,
        1,
      );

      const opportunities = (await listMutualOpportunities(ownerId, false)).opportunities;
      assert.equal(opportunities.length, 1);
      assert.equal(opportunities[0]?.viewerIntentId, owner.intent.id);
      assert.equal(opportunities[0]?.matchKind, "EXACT_ACTIVITY");
      assert.equal(opportunities[0]?.viewerStudyGoal, "Write thesis");
      assert.equal(opportunities[0]?.peerStudyGoal, "Write thesis");
      assert.equal(
        (await listMutualOpportunities(sharedCandidateId, false)).opportunities.length,
        0,
      );
    });
  },
);

test(
  "stopped and expired matching sessions never create new opportunities",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const { createWeeklyIntent } = await import("../../lib/v2/weekly-intents");
    const { generateMutualOpportunitiesForUser } = await import(
      "../../lib/v2/mutual-opportunities"
    );

    const assertSessionCannotMatch = async (
      label: string,
      peerSession: "STOPPED" | "EXPIRED",
    ) => withMatchingPair(label, async ({ db, userAId, userBId }) => {
      const { serviceNow, startsAt, endsAt } = await matchingWindow();
      const input = {
        topic: "SPORTS" as const,
        sportTag: "BADMINTON" as const,
        courseId: null,
        timeWindows: [{
          startAt: startsAt.toISOString(),
          endAt: endsAt.toISOString(),
        }],
        timeZone: "Europe/Berlin",
      };
      await createWeeklyIntent(userAId, input, serviceNow);
      await createWeeklyIntent(userBId, input, serviceNow);
      await activateMatchingSessions(db, [userAId]);
      if (peerSession === "STOPPED") {
        await stopMatchingSessions(db, [userBId]);
      } else {
        await expireMatchingSessions(db, [userBId]);
      }

      assert.deepEqual(await generateMutualOpportunitiesForUser(userAId), []);
      assert.equal(
        await db.mutualOpportunity.count({
          where: {
            OR: [
              { userAId, userBId },
              { userAId: userBId, userBId: userAId },
            ],
          },
        }),
        0,
      );
    });

    await assertSessionCannotMatch("stopped-session", "STOPPED");
    await assertSessionCannotMatch("expired-session", "EXPIRED");
  },
);

async function matchingWindow() {
  const { weeklyIntentExpiry } = await import("../../lib/v2/weekly-intent-policy");
  const realNow = new Date();
  const currentWeekExpiry = weeklyIntentExpiry("Europe/Berlin", realNow);
  const serviceNow = currentWeekExpiry.getTime() - realNow.getTime() >= 6 * 60 * 60_000
    ? realNow
    : new Date(currentWeekExpiry.getTime() + 2 * 60 * 60_000);
  const startsAt = new Date(serviceNow.getTime() + 2 * 60 * 60_000);
  return {
    serviceNow,
    startsAt,
    endsAt: new Date(startsAt.getTime() + 60 * 60_000),
  };
}

async function withMatchingPair(
  label: string,
  run: (fixture: {
    db: PrismaClient;
    userAId: string;
    userBId: string;
  }) => Promise<void>,
) {
  return withMatchingUsers(label, 2, async ({ db, userIds }) => {
    const [userAId, userBId] = userIds;
    assert.ok(userAId && userBId);
    await run({ db, userAId, userBId });
  });
}

async function withMatchingUsers(
  label: string,
  count: number,
  run: (fixture: {
    db: PrismaClient;
    userIds: string[];
  }) => Promise<void>,
) {
  assert.ok(localDatabaseUrl);
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const userIds = Array.from(
    { length: count },
    (_, index) => `${label}-${suffix}-${index + 1}`,
  );
  const db = new PrismaClient({
    datasources: { db: { url: localDatabaseUrl } },
  });
  await db.$connect();
  try {
    await db.user.createMany({
      data: userIds.map((id, index) => ({
        id,
        username: `${label}_${suffix}_${index + 1}`,
        hashedPassword: "fixture",
        nickname: `Student ${index + 1}`,
        school: "TUM",
        onboardingComplete: true,
        verifiedStudent: true,
      })),
    });
    await db.userLanguage.createMany({
      data: userIds.map((userId) => ({
        userId,
        tag: "ENGLISH",
        proficiency: "FLUENT",
      })),
    });
    await run({ db, userIds });
  } finally {
    await db.user.deleteMany({
      where: { id: { in: userIds } },
    });
    await db.$disconnect();
  }
}

async function activateMatchingSessions(db: PrismaClient, userIds: string[]) {
  const now = new Date();
  const matchingUntil = new Date(now.getTime() + 48 * 60 * 60_000);
  for (const userId of userIds) {
    await db.togetherMatchingSession.upsert({
      where: { userId },
      create: { userId, startedAt: now, matchingUntil, stoppedAt: null },
      update: {
        startedAt: now,
        matchingUntil,
        stoppedAt: null,
        version: { increment: 1 },
      },
    });
  }
}

async function stopMatchingSessions(db: PrismaClient, userIds: string[]) {
  await activateMatchingSessions(db, userIds);
  await db.togetherMatchingSession.updateMany({
    where: { userId: { in: userIds } },
    data: { stoppedAt: new Date(), version: { increment: 1 } },
  });
}

async function expireMatchingSessions(db: PrismaClient, userIds: string[]) {
  const now = new Date();
  const matchingUntil = new Date(now.getTime() - 1_000);
  for (const userId of userIds) {
    await db.togetherMatchingSession.upsert({
      where: { userId },
      create: {
        userId,
        startedAt: new Date(now.getTime() - 49 * 60 * 60_000),
        matchingUntil,
        stoppedAt: null,
      },
      update: {
        startedAt: new Date(now.getTime() - 49 * 60 * 60_000),
        matchingUntil,
        stoppedAt: null,
        version: { increment: 1 },
      },
    });
  }
}

function localPostgresUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    return undefined;
  }
  if (!new Set(["127.0.0.1", "localhost", "::1"]).has(parsed.hostname)) {
    return undefined;
  }
  const targetOverrides = new Set([
    "database",
    "dbname",
    "host",
    "hostaddr",
    "password",
    "port",
    "service",
    "user",
  ]);
  if (
    [...parsed.searchParams.keys()].some((key) =>
      targetOverrides.has(key.toLowerCase()),
    )
  ) {
    return undefined;
  }
  return value;
}
