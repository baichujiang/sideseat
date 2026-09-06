import assert from "node:assert/strict";
import test from "node:test";

import {
  actionPolicyTupleKind,
  allowsLegacyDirectConversationForAction,
  directConversationPolicyTupleKind,
} from "../../lib/v2/action-coordination/policy-snapshot";
import { evaluateActionCoordinationCapability } from "../../lib/v2/action-coordination/capability";

const capableSnapshot = evaluateActionCoordinationCapability(
  new Headers({
    "X-SideSeat-Capabilities": "action-coordination-v2",
    "X-SideSeat-Platform": "ios",
    "X-SideSeat-App-Version": "2.4.0",
    "X-SideSeat-Build": "240",
  }),
  { minimumAppVersion: "2.4.0", minimumBuild: "240" },
).snapshot;

const historical = {
  coordinationPolicy: null,
  policySchemaVersion: null,
  policyParametersSnapshot: null,
  experimentKeySnapshot: null,
  experimentVariantSnapshot: null,
  clientCapabilitySnapshot: null,
  policySnapshottedAt: null,
} as const;

const direct = {
  coordinationPolicy: "DIRECT_CONVERSATION_V1",
  policySchemaVersion: 1,
  policyParametersSnapshot: {},
  experimentKeySnapshot: null,
  experimentVariantSnapshot: null,
  clientCapabilitySnapshot: null,
  policySnapshottedAt: new Date("2026-08-30T12:00:00.000Z"),
} as const;

test("only exact historical and valid schema-1 DIRECT tuples retain immediate chat", () => {
  assert.equal(
    directConversationPolicyTupleKind(historical),
    "HISTORICAL_UNSNAPSHOTTED",
  );
  assert.equal(
    directConversationPolicyTupleKind(direct),
    "SNAPSHOTTED_DIRECT",
  );
  assert.equal(allowsLegacyDirectConversationForAction(historical), true);
  assert.equal(allowsLegacyDirectConversationForAction(direct), true);
});

test("partial, unknown-schema, contradictory experiment, and malformed JSON tuples fail closed", () => {
  const invalid = [
    { ...historical, policySchemaVersion: undefined },
    { ...historical, policySchemaVersion: 2 },
    { ...direct, policySchemaVersion: 2 },
    { ...direct, experimentKeySnapshot: "experiment", experimentVariantSnapshot: null },
    {
      ...direct,
      experimentKeySnapshot: "action_to_plan_creator_gated_v2",
      experimentVariantSnapshot: "TREATMENT" as const,
    },
    { ...direct, clientCapabilitySnapshot: [] },
    { ...direct, policyParametersSnapshot: { unexpected: true } },
  ];
  for (const action of invalid) {
    assert.equal(directConversationPolicyTupleKind(action), "INVALID");
    assert.equal(allowsLegacyDirectConversationForAction(action), false);
  }
});

test("creator-gated CONTROL may snapshot DIRECT and exact treatment may snapshot creator-gated", () => {
  assert.equal(
    directConversationPolicyTupleKind({
      ...direct,
      experimentKeySnapshot: "action_to_plan_creator_gated_v2",
      experimentVariantSnapshot: "CONTROL",
      clientCapabilitySnapshot: { supported: true },
    }),
    "SNAPSHOTTED_DIRECT",
  );
  const creatorGated = {
    ...direct,
    coordinationPolicy: "CREATOR_GATED_V2" as const,
    policyParametersSnapshot: { maxActiveCoordinations: 2 },
    experimentKeySnapshot: "action_to_plan_creator_gated_v2",
    experimentVariantSnapshot: "TREATMENT" as const,
    clientCapabilitySnapshot: capableSnapshot,
  };
  assert.equal(actionPolicyTupleKind(creatorGated), "SNAPSHOTTED_CREATOR_GATED");
  assert.equal(
    allowsLegacyDirectConversationForAction(creatorGated),
    false,
    "an activated creator-gated Action must not regain any legacy direct surface",
  );
});

test("creator-gated tuples require the exact schema, parameters, experiment, and capability", () => {
  const valid = {
    ...direct,
    coordinationPolicy: "CREATOR_GATED_V2" as const,
    policyParametersSnapshot: { maxActiveCoordinations: 2 },
    experimentKeySnapshot: "action_to_plan_creator_gated_v2",
    experimentVariantSnapshot: "TREATMENT" as const,
    clientCapabilitySnapshot: capableSnapshot,
  };
  for (const action of [
    { ...valid, policySchemaVersion: 2 },
    { ...valid, policyParametersSnapshot: {} },
    { ...valid, policyParametersSnapshot: { maxActiveCoordinations: 3 } },
    { ...valid, experimentVariantSnapshot: "CONTROL" as const },
    { ...valid, clientCapabilitySnapshot: { supported: true } },
    {
      ...valid,
      clientCapabilitySnapshot: {
        ...capableSnapshot,
        build: "239",
      },
    },
    {
      ...valid,
      clientCapabilitySnapshot: {
        ...capableSnapshot,
        declared: false,
      },
    },
  ]) {
    assert.equal(actionPolicyTupleKind(action), "INVALID");
  }
});
