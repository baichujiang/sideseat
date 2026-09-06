import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

import type { ExperimentVariant, Prisma } from "@prisma/client";

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
commonJsModule._resolveFilename = function resolveForServerContractTest(
  request,
  parent,
  isMain,
  options,
) {
  if (request === "server-only") return serverOnlyStub;
  return resolveFilename.call(this, request, parent, isMain, options);
};

type AttributionSource = Readonly<{
  coordinationPolicy:
    | "DIRECT_CONVERSATION_V1"
    | "CREATOR_GATED_V2"
    | null;
  policySchemaVersion: number | null;
  policyParametersSnapshot: Prisma.JsonValue | null;
  experimentKeySnapshot: string | null;
  experimentVariantSnapshot: ExperimentVariant | null;
  clientCapabilitySnapshot: Prisma.JsonValue | null;
  policySnapshottedAt: Date | null;
}>;

async function attributionResolver() {
  const actionInterestModule = await import("../../lib/v2/action-interest");
  return actionInterestModule.actionFunnelAttributionFromSnapshot;
}

function directControlSnapshot(): AttributionSource {
  return {
    coordinationPolicy: "DIRECT_CONVERSATION_V1",
    policySchemaVersion: 1,
    policyParametersSnapshot: {},
    experimentKeySnapshot: "action_to_plan_creator_gated_v2",
    experimentVariantSnapshot: "CONTROL",
    clientCapabilitySnapshot: {
      capability: "action-coordination-v2",
      supported: true,
    },
    policySnapshottedAt: new Date("2026-08-30T12:00:00.000Z"),
  };
}

test("DIRECT control attribution comes from the Action snapshot, not the responder's legacy assignment", async () => {
  const resolve = await attributionResolver();
  assert.deepEqual(resolve(directControlSnapshot(), "TREATMENT"), {
    coordinationPolicy: "DIRECT_CONVERSATION_V1",
    policySchemaVersion: 1,
    experimentKey: "action_to_plan_creator_gated_v2",
    experimentVariant: "CONTROL",
  });
});

test("withdraw and create share the exact snapshot resolver; only seven-null history uses the legacy fallback", async () => {
  const resolve = await attributionResolver();
  const historical: AttributionSource = {
    coordinationPolicy: null,
    policySchemaVersion: null,
    policyParametersSnapshot: null,
    experimentKeySnapshot: null,
    experimentVariantSnapshot: null,
    clientCapabilitySnapshot: null,
    policySnapshottedAt: null,
  };
  assert.deepEqual(resolve(historical, "TREATMENT"), {
    coordinationPolicy: "DIRECT_CONVERSATION_V1",
    experimentKey: "action_to_plan_v2",
    experimentVariant: "TREATMENT",
  });

  const source = await readFile(
    new URL("../../lib/v2/action-interest.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /createActionInterest[\s\S]*actionFunnelAttributionFromSnapshot\(\s*post,\s*options\.experimentVariant/,
  );
  assert.match(
    source,
    /withdrawActionInterest[\s\S]*actionFunnelAttributionFromSnapshot\(\s*interest\.classmatePost,\s*options\.experimentVariant/,
  );
  assert.equal(
    [...source.matchAll(/\.\.\.actionAttribution,/g)].length,
    3,
    "interest, conversation, and withdrawal events must share Action attribution",
  );
});

test("partial or contradictory Action attribution fails closed", async () => {
  const resolve = await attributionResolver();
  for (const invalid of [
    { ...directControlSnapshot(), policySchemaVersion: null },
    { ...directControlSnapshot(), experimentVariantSnapshot: null },
    {
      ...directControlSnapshot(),
      experimentVariantSnapshot: "TREATMENT" as const,
    },
    {
      ...directControlSnapshot(),
      coordinationPolicy: "CREATOR_GATED_V2" as const,
      policyParametersSnapshot: { maxActiveCoordinations: 2 },
      experimentVariantSnapshot: "TREATMENT" as const,
      clientCapabilitySnapshot: null,
    },
  ]) {
    assert.throws(
      () => resolve(invalid, "CONTROL"),
      (cause: unknown) =>
        cause instanceof Error &&
        "code" in cause &&
        cause.code === "INVALID_STATE",
    );
  }
});

test("retry/reactivation preserves the first origin snapshot and cannot adopt a null creator-gated Connection", async () => {
  const source = await readFile(
    new URL("../../lib/v2/action-interest.ts", import.meta.url),
    "utf8",
  );
  const upsert = source.match(
    /const interest = await options\.tx\.actionInterest\.upsert\(\{([\s\S]*?)\n  \}\);/,
  )?.[1];
  assert.ok(upsert, "ActionInterest upsert must remain inspectable");
  const update = upsert.match(/update:\s*\{([\s\S]*?)\n    \},/)?.[1];
  assert.ok(update, "reactivation update must remain explicit");
  assert.match(update, /status:\s*"ACTIVE"/);
  assert.match(update, /withdrawnAt:\s*null/);
  assert.doesNotMatch(update, /originSnapshot/);
  assert.doesNotMatch(update, /connectionId/);
  assert.match(
    source,
    /if \(previous\?\.connectionId === null\)[\s\S]*This response belongs to creator-gated coordination[\s\S]*openConversationForUser/,
  );
  assert.match(
    source,
    /!interest\.connectionId \|\|[\s\S]*interest\.connectionId !== opened\.connectionId[\s\S]*conflicting conversation state/,
  );
  assert.match(
    source,
    /const interestContext = requireActionContextSnapshot\(interest\.originSnapshot\)/,
  );
  assert.match(source, /sourceKind:\s*interestContext\.sourceKind/);
  assert.doesNotMatch(source, /originSnapshot as ActionContextSnapshot/);
});

test("different idempotency keys serialize one DIRECT Interest transition before side effects", async () => {
  const source = await readFile(
    new URL("../../lib/v2/action-interest.ts", import.meta.url),
    "utf8",
  );
  const createBody = source.slice(source.indexOf("export async function createActionInterest"));
  const positions = [
    createBody.indexOf("const pairSnapshot"),
    createBody.indexOf("await pairSafetyLock"),
    createBody.indexOf('FROM "ClassmatePost"'),
    createBody.indexOf('FROM "ActionInterest"'),
    createBody.indexOf('FROM "ActionCoordinationContext"'),
    createBody.indexOf("opened = await openConversationForUser"),
    createBody.indexOf("actionInterest.upsert"),
    createBody.indexOf('FROM "Connection"'),
    createBody.indexOf("message.create"),
    createBody.indexOf("recordServerFunnelEvent"),
  ];
  assert.ok(positions.every((position) => position >= 0), positions.join(","));
  for (let index = 1; index < positions.length; index += 1) {
    assert.ok(
      positions[index - 1] < positions[index],
      `lock/effect stage ${index} must follow stage ${index - 1}`,
    );
  }
  assert.match(
    createBody,
    /if \(!previous \|\| previous\.status === "WITHDRAWN"\) \{[\s\S]*message\.create[\s\S]*recordServerFunnelEvent/,
  );
});

test("POST remains enrollment-gated while DELETE is a non-enrolling safe drain", async () => {
  const route = await readFile(
    new URL(
      "../../app/api/v1/discover/posts/[postId]/interest/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const post = route.slice(
    route.indexOf("export async function POST"),
    route.indexOf("export async function DELETE"),
  );
  const withdraw = route.slice(route.indexOf("export async function DELETE"));
  assert.match(post, /requireTreatment\(request, auth\.user\)/);
  assert.match(post, /treatment\.assignment\.variant/);
  assert.doesNotMatch(withdraw, /requireTreatment\(/);
  assert.doesNotMatch(withdraw, /getActionToPlanAssignment\(/);
  assert.doesNotMatch(withdraw, /experimentAssignment\.upsert/);
  assert.match(withdraw, /experimentAssignment\.findUnique/);
  assert.match(
    withdraw,
    /experimentVariant:\s*existingAssignment\?\.variant \?\? "CONTROL"/,
  );
});
