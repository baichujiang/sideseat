import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("Mutual-origin proposals use a stable commitment and reject a second actionable Plan", () => {
  const service = source("lib/api/v1/plans-service.ts");
  const createStart = service.indexOf(
    "export async function createDirectPlanRequest",
  );
  const acceptStart = service.indexOf(
    "export async function acceptPlanRequest",
    createStart,
  );
  const create = service.slice(createStart, acceptStart);

  assert.match(
    create,
    /originKind:\s*"MUTUAL_OPPORTUNITY"[\s\S]*status:\s*"PENDING"[\s\S]*commitmentId:\s*\{ not:\s*null \}/,
  );
  assert.ok(
    create.indexOf("await finalizeStablePlanRevision") <
      create.indexOf("prisma.$transaction"),
  );
  assert.match(
    create,
    /originKind:\s*"MUTUAL_OPPORTUNITY"[\s\S]*status:\s*\{ in:\s*\["PENDING", "ACCEPTED"\] \}/,
  );
  assert.match(create, /existingSourcePlan\?\.status === "PENDING"/);
  assert.match(create, /existingSourcePlan\?\.status === "ACCEPTED"/);
  assert.match(
    create,
    /tx\.planCommitment\.create\([\s\S]*participantAId:\s*connection\.userAId[\s\S]*participantBId:\s*connection\.userBId[\s\S]*status:\s*"NEGOTIATING"/,
  );
  assert.match(create, /commitmentId:\s*mutualCommitment\?\.id \?\? null/);
  assert.match(create, /revisionKind:\s*mutualCommitment \? "INITIAL" : null/);
  assert.match(
    create,
    /tx\.planCommitment\.update\([\s\S]*currentPendingRevisionId:\s*planRequest\.id/,
  );
});

test("accepting a Mutual-origin Plan closes only its source intents and pending siblings", () => {
  const planService = source("lib/api/v1/plans-service.ts");
  const acceptStart = planService.indexOf(
    "export async function acceptPlanRequest",
  );
  const declineStart = planService.indexOf(
    "export async function declinePlanRequest",
    acceptStart,
  );
  const accept = planService.slice(acceptStart, declineStart);
  assert.ok(
    accept.indexOf("materializePlanCalendarEntries") <
      accept.indexOf("finalizeAcceptedMutualOpportunityPlan"),
  );
  assert.match(
    accept,
    /finalizeAcceptedMutualOpportunityPlan\(tx,\s*\{[\s\S]*connectionId:\s*updated\.connectionId[\s\S]*originKind:\s*updated\.originKind[\s\S]*originId:\s*updated\.originId/,
  );

  const lifecycle = source("lib/v2/mutual-opportunity-plan-lifecycle.ts");
  assert.match(
    lifecycle,
    /source\.originKind !== "MUTUAL_OPPORTUNITY" \|\| !source\.originId/,
  );
  assert.match(
    lifecycle,
    /status:\s*"MUTUAL"[\s\S]*intentAId:\s*true[\s\S]*intentBId:\s*true/,
  );
  assert.match(lifecycle, /FROM "WeeklyIntent"[\s\S]*FOR UPDATE/);
  assert.match(
    lifecycle,
    /tx\.weeklyIntent\.updateMany\([\s\S]*id:\s*\{ in:\s*intentIds \}[\s\S]*status:\s*\{ in:\s*\["ACTIVE", "PAUSED"\] \}[\s\S]*status:\s*"ENDED"/,
  );
  assert.match(
    lifecycle,
    /tx\.mutualOpportunity\.updateMany\([\s\S]*id:\s*\{ in:\s*affectedOpportunityIds \}[\s\S]*status:\s*"PENDING"[\s\S]*status:\s*"UNAVAILABLE"/,
  );
  assert.doesNotMatch(
    lifecycle.slice(
      lifecycle.indexOf("tx.mutualOpportunity.updateMany"),
      lifecycle.indexOf("return {", lifecycle.indexOf("tx.mutualOpportunity.updateMany")),
    ),
    /status:\s*"MUTUAL"/,
  );
});

test("Together hides an accepted source while preserving the MUTUAL history row", () => {
  const service = source("lib/v2/mutual-opportunities.ts");
  const rowsStart = service.indexOf("async function rowsForUser");
  const listStart = service.indexOf(
    "export async function listMutualOpportunities",
    rowsStart,
  );
  const rows = service.slice(rowsStart, listStart);

  assert.match(
    rows,
    /originKind:\s*"MUTUAL_OPPORTUNITY"[\s\S]*status:\s*"ACCEPTED"/,
  );
  assert.match(rows, /id:\s*\{ notIn:\s*acceptedOpportunityIds \}/);
  assert.doesNotMatch(rows, /mutualOpportunity\.(?:update|delete)/);
});

test("Block safety covers stable Mutual commitments and both Calendar projections", () => {
  const terminalizer = source("lib/v2/plan-safety-terminalizer.ts");
  assert.match(
    terminalizer,
    /FROM "PlanCommitment" commitment[\s\S]*participantAId[\s\S]*participantBId[\s\S]*FOR UPDATE/,
  );
  assert.match(
    terminalizer,
    /commitment\.status === "CONFIRMED" && !completed[\s\S]*projectionStatus:\s*"CANCELED"/,
  );
  assert.match(
    terminalizer,
    /status:\s*"CANCELED"[\s\S]*cancellationReason:\s*"SAFETY_UNAVAILABLE"/,
  );
  assert.doesNotMatch(terminalizer, /originKind:\s*"ACTION_INTEREST"/);
});
