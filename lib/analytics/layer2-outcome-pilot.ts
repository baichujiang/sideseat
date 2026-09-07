export const LAYER2_PILOT_GATE = {
  windowDays: 14,
  minimumEligiblePlans: 20,
  minimumDistinctPairs: 10,
  minimumBilateralPlans: 8,
  minimumParticipantResponseCoverage: 0.6,
  minimumBilateralPlanCoverage: 0.4,
  requiredConsecutiveSnapshots: 2,
  minimumSnapshotSpacingDays: 7,
} as const;

export const INTERNAL_ACCOUNT_PREFIXES = [
  "test_",
  "liveui_",
  "qa_mutual_",
  "sideseat_showcase_",
  "e2e_",
  "journey_h_",
  "journey_s_",
  "del_",
  "native_",
  "second_",
  "third_",
  "limit_",
] as const;

export const INTERNAL_ACCOUNT_USERNAMES = new Set([
  "alex_tum",
  "amira",
  "ben",
  "demo",
  "elena",
  "empty",
  "eva",
  "jonas",
  "kai",
  "lena",
  "lin",
  "lmu-test",
  "lucas",
  "marco",
  "mia_tum",
  "mila-plan-demo",
  "nina",
  "noor",
  "raj",
  "sara",
  "sofia",
  "tobi",
  "unverified-test",
  "yuki",
  "yuna",
]);

export type Layer2PilotOutcome =
  | "OCCURRED"
  | "DID_NOT_OCCUR"
  | "PREFER_NOT_TO_SAY";

export type Layer2PilotPlan = {
  participantAId: string;
  participantBId: string;
  responses: Array<{
    userId: string;
    value: Layer2PilotOutcome;
  }>;
};

export type Layer2PilotMetrics = {
  eligiblePlans: number;
  distinctPairs: number;
  participantResponseOpportunities: number;
  outcomeResponses: number;
  plansWithAnyResponse: number;
  bilateralResponsePlans: number;
  bilaterallyOccurredPlans: number;
  occurredResponses: number;
  didNotOccurResponses: number;
  skippedResponses: number;
  participantResponseCoverage: number;
  bilateralPlanCoverage: number;
};

export function isInternalAccount(username: string): boolean {
  const normalized = username.trim().toLowerCase();
  return (
    INTERNAL_ACCOUNT_USERNAMES.has(normalized) ||
    INTERNAL_ACCOUNT_PREFIXES.some((prefix) => normalized.startsWith(prefix))
  );
}

export function summarizeLayer2Pilot(
  plans: Layer2PilotPlan[],
): Layer2PilotMetrics {
  const distinctPairs = new Set<string>();
  let outcomeResponses = 0;
  let plansWithAnyResponse = 0;
  let bilateralResponsePlans = 0;
  let bilaterallyOccurredPlans = 0;
  let occurredResponses = 0;
  let didNotOccurResponses = 0;
  let skippedResponses = 0;

  for (const plan of plans) {
    distinctPairs.add(
      [plan.participantAId, plan.participantBId].sort().join(":"),
    );
    const participantIds = new Set([
      plan.participantAId,
      plan.participantBId,
    ]);
    const responses = plan.responses.filter((response) =>
      participantIds.has(response.userId),
    );

    outcomeResponses += responses.length;
    if (responses.length > 0) plansWithAnyResponse += 1;
    if (responses.length === 2) {
      bilateralResponsePlans += 1;
      if (responses.every((response) => response.value === "OCCURRED")) {
        bilaterallyOccurredPlans += 1;
      }
    }

    for (const response of responses) {
      if (response.value === "OCCURRED") occurredResponses += 1;
      if (response.value === "DID_NOT_OCCUR") didNotOccurResponses += 1;
      if (response.value === "PREFER_NOT_TO_SAY") skippedResponses += 1;
    }
  }

  const participantResponseOpportunities = plans.length * 2;
  return {
    eligiblePlans: plans.length,
    distinctPairs: distinctPairs.size,
    participantResponseOpportunities,
    outcomeResponses,
    plansWithAnyResponse,
    bilateralResponsePlans,
    bilaterallyOccurredPlans,
    occurredResponses,
    didNotOccurResponses,
    skippedResponses,
    participantResponseCoverage:
      participantResponseOpportunities === 0
        ? 0
        : outcomeResponses / participantResponseOpportunities,
    bilateralPlanCoverage:
      plans.length === 0 ? 0 : bilateralResponsePlans / plans.length,
  };
}

export function evaluateLayer2PilotSnapshot(metrics: Layer2PilotMetrics) {
  const checks = {
    eligiblePlans:
      metrics.eligiblePlans >= LAYER2_PILOT_GATE.minimumEligiblePlans,
    distinctPairs:
      metrics.distinctPairs >= LAYER2_PILOT_GATE.minimumDistinctPairs,
    bilateralPlans:
      metrics.bilateralResponsePlans >=
      LAYER2_PILOT_GATE.minimumBilateralPlans,
    participantResponseCoverage:
      metrics.participantResponseCoverage >=
      LAYER2_PILOT_GATE.minimumParticipantResponseCoverage,
    bilateralPlanCoverage:
      metrics.bilateralPlanCoverage >=
      LAYER2_PILOT_GATE.minimumBilateralPlanCoverage,
  };

  return {
    qualifies: Object.values(checks).every(Boolean),
    checks,
    unmetChecks: Object.entries(checks)
      .filter(([, passed]) => !passed)
      .map(([name]) => name),
  };
}

export function percentage(value: number): number {
  return Math.round(value * 1_000) / 10;
}
