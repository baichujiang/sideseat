import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string): Promise<string> {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("creator-gated experiment is isolated and never rewrites assignment variant", async () => {
  const experiments = await source("lib/v2/experiments.ts");
  const stableAssignment = experiments.slice(
    experiments.indexOf("async function createOrReadStableAssignment"),
    experiments.indexOf("async function databaseObservationTime"),
  );
  assert.match(experiments, /action_to_plan_creator_gated_v2/);
  assert.match(
    stableAssignment,
    /experimentAssignment\.createMany[\s\S]*skipDuplicates:\s*true[\s\S]*findUniqueOrThrow/,
  );
  assert.doesNotMatch(
    stableAssignment,
    /experimentAssignment\.(?:update|upsert)/,
  );
  assert.match(
    experiments,
    /capability\.supported[\s\S]*isCreatorGatedExperimentEnrollmentEnabled\(\)[\s\S]*isV2PilotUser/,
  );
  assert.match(
    experiments,
    /readOrEnrollStableAssignment\([\s\S]*eligible:\s*observation\.eligible,[\s\S]*enrollOnce:[\s\S]*createOrReadStableAssignment[\s\S]*readExisting:[\s\S]*experimentAssignment\.findUnique/,
  );
  assert.match(experiments, /withAssignmentTransaction\(db/);
  assert.match(experiments, /recordEligibilityObservation/);
});

test("kill switch separates new enrollment from safe-drain operations", async () => {
  const flags = await source("lib/v2/feature-flags.ts");
  assert.match(flags, /isV2EnrollmentOperationAllowed/);
  assert.match(flags, /isV2SafeDrainOperationAllowed/);
  assert.match(
    flags,
    /function isV2SafeDrainOperationAllowed\(\): boolean \{\s*return true;/,
  );
  assert.match(
    flags,
    /V2_CREATOR_GATED_EXPERIMENT_ENABLED === "1"/,
  );
  assert.match(flags, /legacyExperimentEnabled:\s*isV2ExperimentEnabled\(\)/);
});

test("native Action creation resolves assignment and snapshots policy in one transaction", async () => {
  const route = await source("app/api/v1/discover/posts/route.ts");
  const create = await source("lib/discover/create-classmate-post.ts");
  assert.match(
    route,
    /prisma\.\$transaction[\s\S]*getCreatorGatedActionToPlanAssignment\([\s\S]*tx,[\s\S]*createClassmatePostForUser\([\s\S]*policySnapshot/,
  );
  for (const field of [
    "coordinationPolicy",
    "policySchemaVersion",
    "policyParametersSnapshot",
    "experimentKeySnapshot",
    "experimentVariantSnapshot",
    "clientCapabilitySnapshot",
    "policySnapshottedAt",
  ]) {
    assert.match(create, new RegExp(`${field}:\\s*policySnapshot\\.${field}`));
  }
  assert.match(create, /projectActionPolicyFields/);
  assert.match(
    create,
    /policy:\s*existing\.coordinationPolicy[\s\S]*courseSelectionValid/,
  );
  assert.match(create, /replyPreference:\s*policyFields\.replyPreference/);
  assert.match(create, /capacity:\s*policyFields\.capacity/);
});

test("legacy direct Interest maintains an OPEN Context without inventing Activation", async () => {
  const interest = await source("lib/v2/action-interest.ts");
  assert.match(
    interest,
    /pairSafetyLock[\s\S]*FROM "ClassmatePost"[\s\S]*FOR UPDATE[\s\S]*FROM "ActionInterest"[\s\S]*FROM "ActionCoordinationContext"[\s\S]*openConversationForUser[\s\S]*FROM "Connection"[\s\S]*lockedConnection\.status !== "ACTIVE"/,
  );
  assert.match(interest, /actionCoordinationContext\.upsert/);
  assert.match(interest, /currentActivationId:\s*null/);
  assert.match(interest, /state:\s*"OPEN"/);
  assert.match(interest, /createdAt:\s*interest\.createdAt/);
  assert.match(interest, /activatedAt:\s*interest\.createdAt/);
  assert.match(interest, /updatedAt:\s*interest\.updatedAt/);
  assert.match(interest, /directContextConflictReason/);
  assert.match(
    interest,
    /if \(directContextConflict\)[\s\S]*throw new ActionInterestError[\s\S]*actionCoordinationContext\.upsert/,
  );
  assert.doesNotMatch(interest, /actionInterestActivation\.(?:create|upsert)/);
});

test("experiments endpoint keeps legacy assignment and adds the capability-gated key", async () => {
  const route = await source("app/api/v1/me/experiments/route.ts");
  assert.match(route, /evaluateActionCoordinationCapability\(request\.headers\)/);
  assert.match(route, /getActionToPlanAssignment\(auth\.user\)/);
  assert.match(
    route,
    /getCreatorGatedActionToPlanAssignment\(auth\.user, capability\)/,
  );
  assert.match(route, /const experiments = \[legacyAssignment\]/);
  assert.match(route, /experiments\.push/);
});

test("Discover feed/detail serialize capability-aware policy and close the legacy message bypass", async () => {
  const feedRoute = await source("app/api/v1/discover/route.ts");
  const detailRoute = await source(
    "app/api/v1/discover/posts/[postId]/route.ts",
  );
  const service = await source("lib/api/v1/discover-service.ts");

  for (const route of [feedRoute, detailRoute]) {
    assert.match(
      route,
      /evaluateActionCoordinationCapability\(request\.headers\)/,
    );
    assert.match(route, /getCreatorGatedActionToPlanAssignment/);
  }
  assert.match(service, /coordination:\s*actionCoordinationReadModel/);
  assert.match(
    service,
    /viewerCanMessage\s*&&\s*coordination\.interactionMode ===\s*"DIRECT_CONVERSATION"/,
  );
  assert.match(
    service,
    /allowsLegacyDirectConversationForAction\(post\)/,
  );
  assert.match(
    service,
    /activeInterest:\s*allowsLegacyDirectConversation\s*&&[\s\S]*interest\?\.status === "ACTIVE"\s*&&[\s\S]*interest\.connectionId !== null[\s\S]*\? actionInterestResponse\(interest\)[\s\S]*:\s*null/,
  );

  const messageButton = await source(
    "components/discover/discover-message-button.tsx",
  );
  const webDetail = await source("lib/queries/classmate-post-detail.ts");
  const postCard = await source("components/discover/discover-post-card.tsx");
  const buddyCard = await source("components/discover/buddy-request-card.tsx");

  assert.match(
    messageButton,
    /insightPostId\s*\?\s*\{\s*postId:\s*insightPostId\s*\}\s*:\s*\{\}/,
  );
  assert.match(
    webDetail,
    /viewerCanMessage:\s*allowsLegacyDirectConversationForAction\(basePost\)/,
  );
  assert.match(
    postCard,
    /post\.allowsLegacyDirectConversation\s*\?\s*\([\s\S]*<DiscoverMessageButton/,
  );
  assert.match(
    buddyCard,
    /showDefaultMessage\s*=[\s\S]*post\.allowsLegacyDirectConversation/,
  );

  const openConversation = await source("lib/connections/open-conversation.ts");
  assert.match(
    openConversation,
    /select:\s*\{[\s\S]*policySchemaVersion:\s*true,[\s\S]*policySnapshottedAt:\s*true,[\s\S]*allowsLegacyDirectConversationForAction\(post\)/,
  );
});
