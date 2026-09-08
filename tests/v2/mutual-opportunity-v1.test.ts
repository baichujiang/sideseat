import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { mutualOpportunityDecisionSchema } from "../../lib/validators/mutual-opportunity";

const source = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("Mutual Opportunity decisions are explicit and closed to extra input", () => {
  assert.equal(
    mutualOpportunityDecisionSchema.safeParse({ decision: "YES" }).success,
    true,
  );
  assert.equal(
    mutualOpportunityDecisionSchema.safeParse({ decision: "NO" }).success,
    true,
  );
  assert.equal(
    mutualOpportunityDecisionSchema.safeParse({ decision: "MAYBE" }).success,
    false,
  );
  assert.equal(
    mutualOpportunityDecisionSchema.safeParse({
      decision: "YES",
      peerDecision: "YES",
    }).success,
    false,
  );
});

test("Mutual Opportunity migration is additive and enforces pair ownership", () => {
  const migration = source(
    "prisma/migrations/20260831210000_mutual_opportunity_v1/migration.sql",
  );
  assert.match(migration, /CREATE TABLE "MutualOpportunity"/);
  assert.match(migration, /CREATE TABLE "MutualOpportunityDecision"/);
  assert.match(migration, /MutualOpportunity_distinct_users_check/);
  assert.match(migration, /MutualOpportunityDecision_opportunityId_userId_key/);
  assert.match(migration, /REFERENCES "WeeklyIntent"\("id"\)/);
  assert.match(migration, /ADD COLUMN "mutualOpportunityId" TEXT/);
  assert.doesNotMatch(migration, /ALTER TABLE "PlanRequest"/);
  assert.doesNotMatch(migration, /ALTER TABLE "CalendarEntry"/);
});

test("matching uses private active intent context and hard eligibility filters", () => {
  const service = source("lib/v2/mutual-opportunities.ts");
  assert.doesNotMatch(service, /MAX_UNRESOLVED_PER_USER/);
  assert.match(service, /const ownerIntents = await prisma\.weeklyIntent\.findMany/);
  assert.match(service, /mutualOpportunitiesAsA:[\s\S]*none:[\s\S]*"PENDING", "MUTUAL"/);
  assert.match(service, /MIN_OVERLAP_MS = 30 \* 60 \* 1_000/);
  assert.match(service, /ownerIntent\.topic !== candidateIntent\.topic/);
  assert.match(service, /sharedLanguages\(ownerIntent\.user, candidateIntent\.user\)\.length === 0/);
  assert.match(service, /ownerSchool !== null[\s\S]*candidateSchool !== null[\s\S]*ownerSchool === candidateSchool/);
  assert.match(service, /hideFromRecommendations: false/);
  assert.match(service, /verifiedStudent: true/);
  assert.doesNotMatch(service, /DEFAULT_SCHOOL/);
});

test("viewer projection never discloses the peer decision or ranking", () => {
  const service = source("lib/v2/mutual-opportunities.ts");
  const projection = service.slice(
    service.indexOf("function viewerProjection"),
    service.indexOf("function contextSnapshot"),
  );
  assert.match(projection, /viewerIntentId: viewerIsA \? row\.intentAId : row\.intentBId/);
  assert.match(projection, /viewerDecision: ownDecision/);
  assert.doesNotMatch(projection, /peerDecision/);
  assert.doesNotMatch(projection, /peerIntentId/);
  assert.doesNotMatch(projection, /peerId/);
  assert.doesNotMatch(projection, /score|rank|compatibility/i);
  assert.doesNotMatch(projection, /decidedAt|createdAt|updatedAt/);
});

test("both current YES decisions activate one canonical contextual conversation", () => {
  const service = source("lib/v2/mutual-opportunities.ts");
  assert.match(service, /withCanonicalConnectionScope\(tx, seed\.userAId, seed\.userBId/);
  assert.match(service, /FOR UPDATE/);
  assert.match(service, /yesUsers\.has\(row\.userAId\) && yesUsers\.has\(row\.userBId\)/);
  assert.match(service, /type: MessageType\.MUTUAL_OPPORTUNITY_CARD/);
  assert.match(service, /mutualOpportunityId: row\.id/);
  assert.match(service, /status: "MUTUAL"/);

  const planService = source("lib/api/v1/plans-service.ts");
  assert.match(planService, /origin\?\.kind === "MUTUAL_OPPORTUNITY"/);
  assert.match(planService, /trustedMutualOrigin\?\.contextSnapshot/);
  assert.match(planService, /trustedMutualOrigin[\s\S]*\? "MUTUAL_OPPORTUNITY"/);
});

test("decision mutations are idempotent and notify only after mutual activation", () => {
  const route = source(
    "app/api/v1/me/mutual-opportunities/[opportunityId]/decision/route.ts",
  );
  assert.match(route, /runIdempotentV1Mutation/);
  assert.match(route, /body\.state === "READY_TO_COORDINATE"/);
  assert.match(route, /scheduleNewDirectChatMessageNotification/);
  assert.match(route, /senderId: auth\.user\.id/);
});

test("Together presents finite private decisions and reveals chat only after mutual YES", () => {
  const root = source(
    "ios-native/SideSeat/Features/Together/TogetherRootView.swift",
  );
  const store = source(
    "ios-native/SideSeat/Features/Together/MutualOpportunityStore.swift",
  );
  assert.match(root, /Button\(action: onNo\)\s*\{\s*Text\("Not this time"\)/);
  assert.match(root, /SSPrimaryButton\([\s\S]{0,240}title: AppLocalization\.string\("Do it together"\)[\s\S]{0,200}action: onYes/);
  assert.match(root, /Button\("Withdraw", action: onWithdraw\)/);
  assert.match(root, /case "READY_TO_COORDINATE" where hasCoordination:/);
  assert.match(root, /case \.mutual:[\s\S]*"Start planning"/);
  assert.match(store, /opportunities\.removeAll \{ \$0\.id == opportunity\.id \}/);
  assert.match(root, /Your choice is saved privately/);
  assert.doesNotMatch(root, /Waiting for the other person to respond/);
  assert.doesNotMatch(store, /Waiting for the other person to respond/);
});
