import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { notificationOutboxInputSchema } from "../../lib/v2/notification-outbox-producer";

async function source(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("ADR-BL-001 installs Block before Context, Connection, Commitment, Revision, and Calendar convergence", async () => {
  const block = await source("lib/api/v1/connection-block-transaction.ts");
  const ordered = [
    "tx.block.upsert",
    "terminalizeCreatorGatedSafetyState",
    "terminalizeConnectionAndDirectV1Contexts",
    "terminalizePairPlanCommitmentsForSafety",
    "enqueuePlanSafetyEndedNotification",
  ].map((needle) => block.indexOf(needle, block.indexOf("convergeLockedPairPeerBlock")));
  assert.ok(ordered.every((index) => index >= 0), ordered.join(","));
  assert.deepEqual([...ordered].sort((left, right) => left - right), ordered);

  const terminalizer = await source("lib/v2/plan-safety-terminalizer.ts");
  assert.match(terminalizer, /ORDER BY commitment\."id"\s+FOR UPDATE/);
  assert.match(terminalizer, /ORDER BY revision\."id"\s+FOR UPDATE/);
  assert.match(
    terminalizer,
    /ORDER BY calendar\."planCommitmentId", calendar\."id"\s+FOR UPDATE/,
  );
  assert.match(terminalizer, /"EXPIRED" : "INVALIDATED"/);
  assert.match(terminalizer, /"SAFETY_UNAVAILABLE"/);
  assert.match(terminalizer, /status: "CANCELED"/);
  assert.match(terminalizer, /projectionStatus: "CANCELED"/);
  assert.match(terminalizer, /status: completedHistory \? "EXPIRED" : "INVALIDATED"/);
  assert.match(terminalizer, /"COMMITMENT_COMPLETED"/);
});

test("OPEN creator-gated Contexts are no longer deferred when they own a Plan", async () => {
  const safety = await source("lib/v2/action-coordination/safety-terminalizer.ts");
  assert.doesNotMatch(safety, /row\.hasPlanFocus/);
  assert.doesNotMatch(safety, /deferredOpenContextIds/);
  assert.match(
    safety,
    /if \(row\.contextState === "OPEN"\)[\s\S]*?state: "ENDED"[\s\S]*?"SAFETY_UNAVAILABLE"/,
  );
});

test("Unblock is serialized on user and pair locks and never revives Plan state", async () => {
  const unblock = await source("lib/api/v1/blocks-service.ts");
  const userLock = unblock.indexOf("userConnectionSafetyLocks");
  const pairLock = unblock.indexOf("pairSafetyLock", userLock);
  const deletion = unblock.indexOf("tx.block.deleteMany", pairLock);
  assert.ok(userLock >= 0 && pairLock > userLock && deletion > pairLock);
  assert.doesNotMatch(unblock, /planCommitment\.(?:update|upsert)/);
  assert.doesNotMatch(unblock, /calendarEntry\.(?:update|upsert)/);
});

test("every calendar read surface defaults to ACTIVE Plan projections", async () => {
  for (const path of [
    "lib/calendar/load-calendar-entry-occurrences.ts",
    "lib/api/v1/calendar-search-service.ts",
    "lib/home/load-home-schedule-payload.ts",
    "lib/calendar/load-calendar-ics-export.ts",
    "lib/push/calendar-reminder-cron.ts",
    "lib/schedule-share/build-schedule-share-snapshot.ts",
    "lib/api/v1/calendar-event-service.ts",
    "lib/event-share/event-share-service.ts",
  ]) {
    assert.match(
      await source(path),
      /projectionStatus:\s*"ACTIVE"/,
      `${path} must exclude canceled projections`,
    );
  }
  const loader = await source("lib/calendar/load-calendar-entry-occurrences.ts");
  assert.match(loader, /safetyRestrictedAt/);
  assert.match(loader, /title: "Shared plan"/);
  assert.match(loader, /companions: \[\]/);
});

test("the aggregate safety outbox accepts no copy, actor, route, or Plan data", () => {
  const base = {
    kind: "PLAN_SAFETY_ENDED",
    recipientId: "user-b",
    sourceKey: "notification-batch:batch-1:plan-safety-ended",
    destination: {
      type: "PLAN_SAFETY_ENDED",
      notificationBatchId: "batch-1",
    },
    availableAt: new Date("2026-08-31T10:00:00.000Z"),
  } as const;
  assert.equal(notificationOutboxInputSchema.safeParse(base).success, true);
  for (const privateField of [
    { title: "Private title" },
    { body: "Blocked you" },
    { actorId: "user-a" },
    { route: "/chat/private" },
    { commitmentIds: ["plan-1"] },
  ]) {
    assert.equal(
      notificationOutboxInputSchema.safeParse({ ...base, ...privateField }).success,
      false,
    );
  }
});

test("analytics remains explicitly deferred instead of attributing a safety action to a participant", async () => {
  const schema = await source("prisma/schema.prisma");
  const terminalizer = await source("lib/v2/plan-safety-terminalizer.ts");
  assert.match(schema, /model ProductFunnelEvent[\s\S]*?actorId\s+String\b/);
  assert.match(terminalizer, /analyticsDeferredCommitmentIds/);
  assert.doesNotMatch(terminalizer, /recordServerFunnelEvent/);
});

test("legacy Plan writers enter pair safety before Connection and Plan locks", async () => {
  const compatibility = await source(
    "lib/plans/legacy-plan-commitment-compat.ts",
  );
  const userLock = compatibility.indexOf("userConnectionSafetyLocks", compatibility.indexOf("lockLegacyPlanConnectionSafety"));
  const pairLock = compatibility.indexOf("pairSafetyLock", userLock);
  const blockRead = compatibility.indexOf("tx.block.findFirst", pairLock);
  const moderationRead = compatibility.indexOf("tx.moderationBlock.findFirst", pairLock);
  const connectionLock = compatibility.indexOf('FROM "Connection"', blockRead);
  const commitmentLock = compatibility.indexOf('FROM "PlanCommitment"', connectionLock);
  const revisionLock = compatibility.indexOf('FROM "PlanRequest"', commitmentLock);
  assert.ok(userLock >= 0);
  assert.ok(pairLock > userLock);
  assert.ok(blockRead > pairLock);
  assert.ok(moderationRead > pairLock);
  assert.ok(connectionLock > blockRead && connectionLock > moderationRead);
  assert.ok(commitmentLock > connectionLock);
  assert.ok(revisionLock > commitmentLock);
  assert.match(compatibility, /commitment\.safetyRestrictedAt/);

  const service = await source("lib/api/v1/plans-service.ts");
  assert.match(service, /legacyParticipantVisibleWhere/);
  assert.match(service, /safetyRestrictedAt:\s*null/);
  assert.match(service, /afterConnectionSafety/);
  const directCreate = service.indexOf("createDirectPlanRequest");
  assert.ok(
    service.indexOf("lockLegacyPlanConnectionSafety", directCreate) <
      service.indexOf("assertDirectUnrepliedSendAllowed", directCreate),
  );
  for (const path of [
    "app/api/plan-requests/[requestId]/accept/route.ts",
    "app/api/plan-requests/[requestId]/decline/route.ts",
    "app/api/plan-requests/[requestId]/counter-propose/route.ts",
  ]) {
    assert.match(await source(path), /safetyRestrictedAt:\s*null/);
  }
  for (const path of [
    "app/api/connections/[connectionId]/plan-requests/route.ts",
    "app/api/availability-shares/[shareId]/plan-requests/route.ts",
  ]) {
    assert.match(await source(path), /lockLegacyPlanConnectionSafety/);
  }
});

test("ordinary direct notification delivery rechecks all current safety barriers", async () => {
  const notifications = await source("lib/push/notify-user.ts");
  const helper = notifications.slice(
    notifications.indexOf("deliverableDirectNotificationConnection"),
    notifications.indexOf("export type CourseRoomNotificationParams"),
  );
  assert.match(helper, /status:\s*"ACTIVE"/);
  assert.match(helper, /moderationBlocks:\s*\{\s*none:\s*\{\s*isActive:\s*true/);
  assert.match(helper, /prisma\.block\.findFirst/);
  assert.match(helper, /safetyRestrictedAt:\s*null/);
  assert.match(helper, /if \(!\(await isDirectChatNotificationDeliverable\(params\)\)\) return/);
  assert.match(helper, /PLAN_SAFETY_ENDED outbox uses a separate delivery path/);
});
