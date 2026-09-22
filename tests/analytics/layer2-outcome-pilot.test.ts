import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateLayer2PilotSnapshot,
  isInternalAccount,
  summarizeLayer2Pilot,
  type Layer2PilotPlan,
} from "../../lib/analytics/layer2-outcome-pilot";

function plan(
  index: number,
  responses: Layer2PilotPlan["responses"] = [],
): Layer2PilotPlan {
  return {
    participantAId: `a-${index}`,
    participantBId: `b-${index}`,
    responses,
  };
}

describe("Layer 2 Outcome pilot", () => {
  it("excludes repository-owned QA, generated test and demo accounts", () => {
    for (const username of [
      "test_001",
      "LIVEUI_1729",
      "qa_mutual_run_a",
      "journey_h_123",
      "lin",
      "mila-plan-demo",
    ]) {
      assert.equal(isInternalAccount(username), true, username);
    }
    assert.equal(isInternalAccount("organic_student_42"), false);
  });

  it("counts silence as missing and only two answers as bilateral", () => {
    const metrics = summarizeLayer2Pilot([
      plan(1, [{ userId: "a-1", value: "OCCURRED" }]),
      plan(2, [
        { userId: "a-2", value: "OCCURRED" },
        { userId: "b-2", value: "OCCURRED" },
      ]),
      plan(3, [
        { userId: "a-3", value: "DID_NOT_OCCUR" },
        { userId: "b-3", value: "PREFER_NOT_TO_SAY" },
      ]),
    ]);

    assert.equal(metrics.participantResponseOpportunities, 6);
    assert.equal(metrics.outcomeResponses, 5);
    assert.equal(metrics.plansWithAnyResponse, 3);
    assert.equal(metrics.bilateralResponsePlans, 2);
    assert.equal(metrics.bilaterallyOccurredPlans, 1);
    assert.equal(metrics.occurredResponses, 3);
    assert.equal(metrics.didNotOccurResponses, 1);
    assert.equal(metrics.skippedResponses, 1);
  });

  it("requires every minimum sample and coverage check", () => {
    const qualifyingPlans = Array.from({ length: 20 }, (_, index) =>
      plan(index, [
        { userId: `a-${index}`, value: "OCCURRED" },
        ...(index < 8
          ? ([{ userId: `b-${index}`, value: "OCCURRED" }] as const)
          : []),
      ]),
    );
    const qualifying = evaluateLayer2PilotSnapshot(
      summarizeLayer2Pilot(qualifyingPlans),
    );
    assert.equal(qualifying.qualifies, true);

    const insufficient = evaluateLayer2PilotSnapshot(
      summarizeLayer2Pilot(qualifyingPlans.slice(0, 19)),
    );
    assert.equal(insufficient.qualifies, false);
    assert.ok(insufficient.unmetChecks.includes("eligiblePlans"));
  });
});
