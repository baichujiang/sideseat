import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const productionWriters = [
  "lib/connections/open-conversation.ts",
  "app/api/connections/start/route.ts",
  "lib/schedule-share/ensure-connection-for-schedule-share.ts",
  "lib/api/v1/contacts-service.ts",
  "app/api/contacts/add/route.ts",
];

test("BL-DB-04 production pair writers use the canonical Connection scope", () => {
  for (const path of productionWriters.slice(0, 4)) {
    const source = readFileSync(path, "utf8");
    assert.match(
      source,
      /withCanonicalConnectionScope/,
      `${path} must enter the canonical pair-locked scope`,
    );
    assert.doesNotMatch(
      source,
      /\.connection\.create\s*\(/,
      `${path} must not bypass the canonical create primitive`,
    );
  }

  const legacyWeb = readFileSync("app/api/contacts/add/route.ts", "utf8");
  assert.match(legacyWeb, /addContact\s*\(/);
  assert.doesNotMatch(legacyWeb, /\.connection\.(?:findFirst|create)\s*\(/);

  const nativeContacts = readFileSync("app/api/v1/contacts/route.ts", "utf8");
  assert.match(nativeContacts, /addContact\([\s\S]*db:\s*tx/);

  const start = readFileSync("app/api/connections/start/route.ts", "utf8");
  assert.match(
    start,
    /withCanonicalConnectionScope[\s\S]*createDirectMessageRecord/,
  );
  assert.match(start, /withSelfNotesConnectionScope/);
});

test("canonical helper is the only app/lib Connection create authority", () => {
  const helper = readFileSync("lib/connections/canonical-connection.ts", "utf8");
  assert.match(helper, /pairSafetyLock/);
  assert.match(
    helper,
    /userConnectionSafetyLocks\(tx,[\s\S]*pairSafetyLock\(tx/,
  );
  assert.match(helper, /FOR UPDATE/);
  assert.match(helper, /userAId:\s*pair\.minUserId/);
  assert.match(helper, /userBId:\s*pair\.maxUserId/);
  assert.match(helper, /connection\.createMany[\s\S]*skipDuplicates:\s*true/);
  assert.match(helper, /createMany[\s\S]*lockDistinctPairConnections/);
  assert.match(helper, /SELF_NOTES_LOCK_DOMAIN/);

  for (const path of productionWriters) {
    assert.doesNotMatch(
      readFileSync(path, "utf8"),
      /\.connection\.create\s*\(/,
    );
  }
});

test("admin moderation and DIRECT Interest follow user-safety before pair order", () => {
  const admin = readFileSync(
    "app/api/admin/reports/[reportId]/block/route.ts",
    "utf8",
  );
  assert.match(admin, /installUserModerationBlock/);

  const moderation = readFileSync(
    "lib/connections/moderation-block-transaction.ts",
    "utf8",
  );
  assert.match(
    moderation,
    /userConnectionSafetyLocks[\s\S]*terminalizeConnectionsAndDirectV1Contexts[\s\S]*moderationBlock\.create/,
  );

  const interest = readFileSync("lib/v2/action-interest.ts", "utf8");
  assert.match(
    interest,
    /userConnectionSafetyLocks\(options\.tx,[\s\S]*pairSafetyLock\(options\.tx/,
  );
});

test("Block and schedule-share commands retain the pair lock through domain writes", () => {
  const blockService = readFileSync(
    "lib/api/v1/pair-block-transaction.ts",
    "utf8",
  );
  assert.match(
    blockService,
    /installPairPeerBlock[\s\S]*userConnectionSafetyLocks[\s\S]*pairSafetyLock[\s\S]*convergeLockedPairPeerBlock/,
  );
  const blockConvergence = readFileSync(
    "lib/api/v1/connection-block-transaction.ts",
    "utf8",
  );
  assert.match(
    blockConvergence,
    /convergeLockedPairPeerBlock[\s\S]*block\.upsert[\s\S]*terminalizeCreatorGatedSafetyState[\s\S]*terminalizeConnectionAndDirectV1Contexts[\s\S]*terminalizePairPlanCommitmentsForSafety/,
  );

  const schedule = readFileSync(
    "lib/schedule-share/create-plan-from-guest-proposal.ts",
    "utf8",
  );
  assert.match(
    schedule,
    /db\.\$transaction[\s\S]*ensureActiveConnectionForScheduleShare[\s\S]*upsertScheduleSharePlanInTx/,
  );
});

test("DIRECT reactivation uses one card and generation-scoped funnel identities", () => {
  const interest = readFileSync("lib/v2/action-interest.ts", "utf8");
  const funnel = readFileSync("lib/v2/funnel-event-producer.ts", "utf8");
  assert.match(
    interest,
    /actionInterestId: interest\.id[\s\S]*actionContext:[\s\S]*interestId: interest\.id[\s\S]*orderBy:\s*\[\{ createdAt: "asc" \}, \{ id: "asc" \}\]/,
  );
  assert.match(interest, /directTransitionGeneration:\s*\{ increment: 1 \}/);
  assert.match(interest, /directTransitionInterested/);
  assert.doesNotMatch(interest, /productFunnelEvent\.count/);
  assert.match(interest, /transitionOccurredAt/);
  assert.match(funnel, /directTransitionInterested:[\s\S]*positiveVersion/);
  assert.match(funnel, /directTransitionWithdrawn:[\s\S]*positiveVersion/);
  assert.match(funnel, /direct-transition-v2/);
});
