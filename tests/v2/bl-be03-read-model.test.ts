import assert from "node:assert/strict";
import test from "node:test";

import { evaluateActionCoordinationCapability } from "../../lib/v2/action-coordination/capability";
import { actionCoordinationReadModel } from "../../lib/v2/action-coordination/read-model";

const historicalAction = {
  coordinationPolicy: null,
  policySchemaVersion: null,
  policyParametersSnapshot: null,
  experimentKeySnapshot: null,
  experimentVariantSnapshot: null,
  clientCapabilitySnapshot: null,
  policySnapshottedAt: null,
} as const;

const directAction = {
  coordinationPolicy: "DIRECT_CONVERSATION_V1",
  policySchemaVersion: 1,
  policyParametersSnapshot: {},
  experimentKeySnapshot: null,
  experimentVariantSnapshot: null,
  clientCapabilitySnapshot: null,
  policySnapshottedAt: new Date("2026-08-30T12:00:00.000Z"),
} as const;

const capable = evaluateActionCoordinationCapability(
  new Headers({
    "X-SideSeat-Capabilities": "action-coordination-v2",
    "X-SideSeat-Platform": "ios",
    "X-SideSeat-App-Version": "2.4.0",
    "X-SideSeat-Build": "240",
  }),
  { minimumAppVersion: "2.4.0", minimumBuild: "240" },
);

const creatorGatedAction = {
  ...directAction,
  coordinationPolicy: "CREATOR_GATED_V2",
  policyParametersSnapshot: { maxActiveCoordinations: 2 },
  experimentKeySnapshot: "action_to_plan_creator_gated_v2",
  experimentVariantSnapshot: "TREATMENT",
  clientCapabilitySnapshot: capable.snapshot,
} as const;

test("historical and explicit DIRECT Actions keep legacy interaction semantics", () => {
  assert.deepEqual(
    actionCoordinationReadModel({ action: historicalAction }),
    {
      policy: "DIRECT_CONVERSATION_V1",
      schemaVersion: 1,
      interactionMode: "DIRECT_CONVERSATION",
      readOnlyReason: null,
    },
  );
  assert.equal(
    actionCoordinationReadModel({
      action: directAction,
    }).interactionMode,
    "DIRECT_CONVERSATION",
  );
});

test("CREATOR_GATED Actions fail closed for unsupported or unknown policy clients", () => {
  const unsupported = actionCoordinationReadModel({
    action: creatorGatedAction,
  });
  assert.equal(unsupported.interactionMode, "READ_ONLY");
  assert.equal(unsupported.readOnlyReason, "CLIENT_UPDATE_REQUIRED");

  const unknownSchema = actionCoordinationReadModel({
    action: { ...creatorGatedAction, policySchemaVersion: 2 },
    capability: capable,
    assignment: { eligible: true, variant: "TREATMENT" },
  });
  assert.equal(unknownSchema.interactionMode, "READ_ONLY");
  assert.equal(unknownSchema.readOnlyReason, "CLIENT_UPDATE_REQUIRED");

  for (const action of [
    { ...directAction, policySchemaVersion: 2 },
    { ...historicalAction, policySchemaVersion: 2 },
    { ...creatorGatedAction, policyParametersSnapshot: {} },
    { ...creatorGatedAction, experimentVariantSnapshot: "CONTROL" as const },
    { ...creatorGatedAction, clientCapabilitySnapshot: { supported: true } },
  ]) {
    const invalidDirect = actionCoordinationReadModel({ action });
    assert.equal(invalidDirect.interactionMode, "READ_ONLY");
    assert.equal(invalidDirect.readOnlyReason, "CLIENT_UPDATE_REQUIRED");
  }
});

test("CREATOR_GATED Actions are actionable only for an eligible treatment viewer", () => {
  for (const assignment of [
    null,
    { eligible: false, variant: "TREATMENT" as const },
    { eligible: true, variant: "CONTROL" as const },
  ]) {
    const readModel = actionCoordinationReadModel({
      action: creatorGatedAction,
      capability: capable,
      assignment,
    });
    assert.equal(readModel.interactionMode, "READ_ONLY");
    assert.equal(readModel.readOnlyReason, "PILOT_UNAVAILABLE");
  }

  assert.deepEqual(
    actionCoordinationReadModel({
      action: creatorGatedAction,
      capability: capable,
      assignment: { eligible: true, variant: "TREATMENT" },
    }),
    {
      policy: "CREATOR_GATED_V2",
      schemaVersion: 1,
      interactionMode: "EXPRESS_INTEREST",
      readOnlyReason: null,
    },
  );
});
