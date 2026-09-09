import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("Weekly Intent collection keeps the legacy singular field while returning all intents", () => {
  const service = source("lib/v2/weekly-intents.ts");
  assert.match(service, /MAX_NON_TERMINAL_INTENTS_PER_USER = 12/);
  assert.doesNotMatch(service, /CURRENT_ACTIVE_LIMIT = 1/);
  assert.match(service, /const intents = ordered\.map\(ownerResponse\)/);
  assert.match(service, /intent: intents\[0\] \?\? null,[\s\S]*intents/);
  assert.match(service, /const rows = await tx\.weeklyIntent\.findMany/);
  assert.match(service, /return ownerCollection\(rows\)/);
});

test("editing, pausing, ending, or expiring an intent terminalizes only pending opportunities", () => {
  const service = source("lib/v2/weekly-intents.ts");
  assert.match(service, /async function invalidatePendingOpportunities/);
  assert.match(service, /status: "PENDING"[\s\S]*status: "UNAVAILABLE"/);
  assert.match(
    service,
    /input\.action === "PAUSE" \|\| input\.action === "EDIT"[\s\S]*invalidatePendingOpportunities/,
  );
  assert.match(service, /status: "ENDED"[\s\S]*invalidatePendingOpportunities/);
  assert.match(service, /status: "EXPIRED"[\s\S]*terminalAt: now/);
  assert.doesNotMatch(
    service.slice(
      service.indexOf("async function invalidatePendingOpportunities"),
      service.indexOf("async function assertCurrentCourse"),
    ),
    /status: "MUTUAL"/,
  );
});

test("matching gives every active intent one fair pass and enforces one active opportunity per intent and pair", () => {
  const service = source("lib/v2/mutual-opportunities.ts");
  assert.match(service, /for \(const ownerIntent of ownerIntents\)/);
  assert.match(service, /for \(const \{ candidate \} of rankedCandidates\)/);
  assert.match(service, /const opportunity = await createCandidateOpportunity\([\s\S]*if \(opportunity\) \{[\s\S]*break/);
  assert.match(service, /orderBy: \[\{ createdAt: "asc" \}, \{ id: "asc" \}\]/);
  assert.match(service, /status: \{ in: \["PENDING", "MUTUAL"\] \}/);
  assert.match(service, /intentAId: \{ in: intentIds \}/);
  assert.match(service, /intentBId: \{ in: intentIds \}/);
  assert.match(service, /\{ userAId: userA\.id, userBId: userB\.id \}/);
  assert.doesNotMatch(service, /existingCount >= 3|createdCount >= 3/);
});

test("candidate creation locks and revalidates both intent snapshots before inserting", () => {
  const service = source("lib/v2/mutual-opportunities.ts");
  const locking = service.slice(
    service.indexOf("async function lockIntentRows"),
    service.indexOf("async function createCandidateOpportunity"),
  );
  const creation = service.slice(
    service.indexOf("async function createCandidateOpportunity"),
    service.indexOf("export async function generateMutualOpportunitiesForUser"),
  );
  assert.match(locking, /ORDER BY "id"[\s\S]*FOR UPDATE/);
  assert.match(creation, /await lockIntentRows/);
  assert.match(creation, /intent\.status === "ACTIVE"/);
  assert.match(creation, /intent\.version === snapshot\.version/);
  assert.match(creation, /intent\.topic === snapshot\.topic/);
  assert.match(creation, /intent\.courseId === snapshot\.courseId/);
  assert.match(creation, /JSON\.stringify\(intent\.timeWindows\)/);
  assert.ok(
    creation.indexOf("const intentsAreCurrent") <
      creation.indexOf("tx.mutualOpportunity.createMany"),
  );
  assert.match(
    creation,
    /status: "PENDING"[\s\S]*startsAt: \{ lte: now \}[\s\S]*status: "EXPIRED"/,
  );
});

test("opportunity projection returns only the viewer's own intent identifier", () => {
  const service = source("lib/v2/mutual-opportunities.ts");
  const projection = service.slice(
    service.indexOf("function viewerProjection"),
    service.indexOf("function contextSnapshot"),
  );
  assert.match(
    projection,
    /viewerIntentId: viewerIsA \? row\.intentAId : row\.intentBId/,
  );
  assert.doesNotMatch(projection, /peerIntentId/);
  assert.doesNotMatch(projection, /intentAId:/);
  assert.doesNotMatch(projection, /intentBId:/);
});

test("accepted Mutual Opportunity plans disappear from Together without mutating history", () => {
  const service = source("lib/v2/mutual-opportunities.ts");
  const rows = service.slice(
    service.indexOf("async function rowsForUser"),
    service.indexOf("export async function listMutualOpportunities"),
  );
  assert.match(rows, /prisma\.planRequest\.findMany/);
  assert.match(rows, /originKind: "MUTUAL_OPPORTUNITY"/);
  assert.match(rows, /status: "ACCEPTED"/);
  assert.match(rows, /id: \{ notIn: acceptedOpportunityIds \}/);
  assert.doesNotMatch(rows, /mutualOpportunity\.update/);
});

test("arranged Mutual history stops occupying a pair only after the cooldown", () => {
  const service = source("lib/v2/mutual-opportunities.ts");
  const creation = service.slice(
    service.indexOf("async function createCandidateOpportunity"),
    service.indexOf("export async function generateMutualOpportunitiesForUser"),
  );
  assert.match(creation, /PAIR_COOLDOWN_MS/);
  assert.match(
    creation,
    /createdAt: \{ gte: new Date\(now\.getTime\(\) - PAIR_COOLDOWN_MS\) \}/,
  );
  assert.match(creation, /const mutualOccupationIds = occupationRows\.flatMap/);
  assert.match(creation, /originKind: "MUTUAL_OPPORTUNITY"/);
  assert.match(creation, /originId: \{ in: mutualOccupationIds \}/);
  assert.match(creation, /status: "ACCEPTED"/);
  assert.match(
    creation,
    /row\.status === "PENDING" \|\| !arrangedOpportunityIds\.has\(row\.id\)/,
  );
  assert.ok(
    creation.indexOf("if (blocked || moderated || recent) return false") <
      creation.indexOf("const acceptedOrigins"),
  );
});
