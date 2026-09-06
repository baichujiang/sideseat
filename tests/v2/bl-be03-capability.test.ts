import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTION_COORDINATION_CAPABILITY_TOKEN,
  actionPolicySnapshotForCreation,
  creatorGatedEnrollmentGatesAllow,
  directContextConflictReason,
  directConversationPolicySnapshot,
  evaluateActionCoordinationCapability,
  isCreatorGatedAssignmentEligible,
  readOrEnrollStableAssignment,
} from "../../lib/v2/action-coordination/capability";

function capableHeaders(overrides: Record<string, string> = {}): Headers {
  return new Headers({
    "X-SideSeat-Capabilities": ACTION_COORDINATION_CAPABILITY_TOKEN,
    "X-SideSeat-Platform": "ios",
    "X-SideSeat-App-Version": "2.4.0",
    "X-SideSeat-Build": "240",
    ...overrides,
  });
}

const configuredFloor = {
  minimumAppVersion: "2.3.0",
  minimumBuild: "230",
};

test("creator-gated capability fails closed without both configured floors", () => {
  const missingVersion = evaluateActionCoordinationCapability(
    capableHeaders(),
    { minimumBuild: "230" },
  );
  const missingBuild = evaluateActionCoordinationCapability(
    capableHeaders(),
    { minimumAppVersion: "2.3.0" },
  );
  const invalidFloor = evaluateActionCoordinationCapability(
    capableHeaders(),
    { minimumAppVersion: "2.x", minimumBuild: "230" },
  );

  for (const capability of [missingVersion, missingBuild, invalidFloor]) {
    assert.equal(capability.supported, false);
    assert.equal(capability.snapshot.reason, "SERVER_FLOOR_UNCONFIGURED");
  }
});

test("capability requires the token, iOS, version, and build floors together", () => {
  const cases = [
    [
      new Headers({
        "X-SideSeat-Platform": "ios",
        "X-SideSeat-App-Version": "2.4.0",
        "X-SideSeat-Build": "240",
      }),
      "CAPABILITY_NOT_DECLARED",
    ],
    [
      capableHeaders({ "X-SideSeat-Platform": "web" }),
      "UNSUPPORTED_PLATFORM",
    ],
    [
      capableHeaders({ "X-SideSeat-App-Version": "2.x" }),
      "INVALID_CLIENT_VERSION",
    ],
    [
      capableHeaders({ "X-SideSeat-Build": "build-240" }),
      "INVALID_CLIENT_BUILD",
    ],
    [
      capableHeaders({ "X-SideSeat-App-Version": "2.2.9" }),
      "VERSION_BELOW_FLOOR",
    ],
    [
      capableHeaders({ "X-SideSeat-Build": "229" }),
      "BUILD_BELOW_FLOOR",
    ],
  ] as const;

  for (const [headers, reason] of cases) {
    const capability = evaluateActionCoordinationCapability(
      headers,
      configuredFloor,
    );
    assert.equal(capability.supported, false, reason);
    assert.equal(capability.snapshot.reason, reason);
  }

  const supported = evaluateActionCoordinationCapability(
    capableHeaders({
      "X-SideSeat-Capabilities": `future-token, ${ACTION_COORDINATION_CAPABILITY_TOKEN}`,
      "X-SideSeat-App-Version": "2.3",
      "X-SideSeat-Build": "230.0",
    }),
    configuredFloor,
  );
  assert.equal(supported.supported, true);
  assert.equal(supported.snapshot.reason, "CAPABLE");
});

test("Action creation snapshots gated treatment and direct control immutably", () => {
  const capability = evaluateActionCoordinationCapability(
    capableHeaders(),
    configuredFloor,
  );
  const now = new Date("2026-08-30T12:00:00.000Z");
  const gated = actionPolicySnapshotForCreation({
    capability,
    assignment: {
      key: "action_to_plan_creator_gated_v2",
      eligible: true,
      variant: "TREATMENT",
    },
    now,
  });
  assert.equal(gated.coordinationPolicy, "CREATOR_GATED_V2");
  assert.equal(gated.policySchemaVersion, 1);
  assert.deepEqual(gated.policyParametersSnapshot, {
    maxActiveCoordinations: 2,
  });
  assert.equal(gated.experimentVariantSnapshot, "TREATMENT");
  assert.equal(gated.policySnapshottedAt, now);
  assert.equal(gated.clientCapabilitySnapshot?.supported, true);

  const control = actionPolicySnapshotForCreation({
    capability,
    assignment: {
      key: "action_to_plan_creator_gated_v2",
      eligible: true,
      variant: "CONTROL",
    },
    now,
  });
  assert.equal(control.coordinationPolicy, "DIRECT_CONVERSATION_V1");
  assert.deepEqual(control.policyParametersSnapshot, {});
  assert.equal(control.experimentVariantSnapshot, "CONTROL");
});

test("unsupported and legacy creators always receive DIRECT_V1", () => {
  const unsupported = evaluateActionCoordinationCapability(
    capableHeaders({ "X-SideSeat-Build": "1" }),
    configuredFloor,
  );
  const snapshot = actionPolicySnapshotForCreation({
    capability: unsupported,
    assignment: {
      key: "action_to_plan_creator_gated_v2",
      eligible: true,
      variant: "TREATMENT",
    },
  });
  assert.equal(snapshot.coordinationPolicy, "DIRECT_CONVERSATION_V1");
  assert.equal(snapshot.experimentKeySnapshot, null);
  assert.equal(snapshot.experimentVariantSnapshot, null);
  assert.equal(snapshot.clientCapabilitySnapshot?.supported, false);

  const legacy = directConversationPolicySnapshot({
    now: new Date("2026-08-30T12:00:00.000Z"),
  });
  assert.equal(legacy.coordinationPolicy, "DIRECT_CONVERSATION_V1");
  assert.equal(legacy.clientCapabilitySnapshot, null);
});

test("creator-gated enrollment fails closed when any rollout gate is absent", async () => {
  const open = {
    globalKillSwitchActive: false,
    legacyExperimentEnabled: true,
    actionInterestEnabled: true,
    creatorGatedExperimentEnabled: true,
  };
  assert.equal(creatorGatedEnrollmentGatesAllow(open), true);
  for (const key of Object.keys(open) as (keyof typeof open)[]) {
    let enrollCalls = 0;
    const gatesAllow = creatorGatedEnrollmentGatesAllow({
      ...open,
      [key]: key === "globalKillSwitchActive",
    });
    assert.equal(
      gatesAllow,
      false,
      key,
    );
    await readOrEnrollStableAssignment({
      eligible: gatesAllow,
      readExisting: async () => null,
      enrollOnce: async () => {
        enrollCalls += 1;
        return { variant: "TREATMENT" };
      },
    });
    assert.equal(enrollCalls, 0, `${key} must not persist an assignment`);
  }
  assert.equal(
    isCreatorGatedAssignmentEligible({
      capabilitySupported: true,
      enrollmentEnabled: true,
      pilotUser: true,
    }),
    true,
  );
  for (const key of [
    "capabilitySupported",
    "enrollmentEnabled",
    "pilotUser",
  ] as const) {
    assert.equal(
      isCreatorGatedAssignmentEligible({
        capabilitySupported: key !== "capabilitySupported",
        enrollmentEnabled: key !== "enrollmentEnabled",
        pilotUser: key !== "pilotUser",
      }),
      false,
      key,
    );
  }
});

test("DIRECT Context compatibility rejects real Activation or another Connection", () => {
  const exact = {
    currentActivationId: null,
    connectionId: "connection-1",
    state: "OPEN",
    reservationId: null,
    reservationGeneration: 0,
    leaseExpiresAt: null,
    activatedAt: new Date("2026-08-30T10:00:00.000Z"),
    firstCounterpartResponseAt: null,
    endedAt: null,
    endedById: null,
    endReason: null,
    createdAt: new Date("2026-08-30T10:00:00.000Z"),
  };
  const expectedAt = new Date("2026-08-30T10:00:00.000Z");
  assert.equal(
    directContextConflictReason(null, "connection-1", expectedAt),
    null,
  );
  assert.equal(
    directContextConflictReason(exact, "connection-1", expectedAt),
    null,
  );
  assert.equal(
    directContextConflictReason(
      { ...exact, currentActivationId: "activation-1" },
      "connection-1",
      expectedAt,
    ),
    "HAS_ACTIVATION",
  );
  assert.equal(
    directContextConflictReason(exact, "connection-2", expectedAt),
    "CONNECTION_MISMATCH",
  );
  assert.equal(
    directContextConflictReason(
      { ...exact, state: "ENDED" },
      "connection-1",
      expectedAt,
    ),
    "STATE_MISMATCH",
  );
  for (const conflict of [
    { ...exact, reservationGeneration: 1 },
    { ...exact, firstCounterpartResponseAt: expectedAt },
    { ...exact, activatedAt: new Date(expectedAt.getTime() + 1) },
    { ...exact, createdAt: new Date(expectedAt.getTime() + 1) },
  ]) {
    assert.equal(
      directContextConflictReason(conflict, "connection-1", expectedAt),
      "STATE_MISMATCH",
    );
  }
});
