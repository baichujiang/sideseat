-- Creator-gated assignment identity remains immutable. Current eligibility and
-- its bounded, append-only audit history live in additive tables.

BEGIN;

CREATE TYPE "ExperimentEligibilityReason" AS ENUM (
  'ASSIGNMENT_BASELINE',
  'ELIGIBLE',
  'CLIENT_UNSUPPORTED',
  'ENROLLMENT_DISABLED',
  'PILOT_NOT_ELIGIBLE'
);

CREATE TABLE "ExperimentEligibilityState" (
  "assignmentId" TEXT NOT NULL,
  "eligible" BOOLEAN NOT NULL,
  "reason" "ExperimentEligibilityReason" NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExperimentEligibilityState_pkey" PRIMARY KEY ("assignmentId"),
  CONSTRAINT "ExperimentEligibilityState_version_check" CHECK ("version" >= 1)
);

CREATE TABLE "ExperimentEligibilityTransition" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "eligible" BOOLEAN NOT NULL,
  "reason" "ExperimentEligibilityReason" NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExperimentEligibilityTransition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExperimentEligibilityTransition_version_check" CHECK ("version" >= 1)
);

CREATE UNIQUE INDEX "ExperimentEligibilityTransition_assignmentId_version_key"
  ON "ExperimentEligibilityTransition"("assignmentId", "version");
CREATE INDEX "ExperimentEligibilityTransition_assignmentId_observedAt_idx"
  ON "ExperimentEligibilityTransition"("assignmentId", "observedAt");

ALTER TABLE "ExperimentEligibilityState"
  ADD CONSTRAINT "ExperimentEligibilityState_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "ExperimentAssignment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExperimentEligibilityTransition"
  ADD CONSTRAINT "ExperimentEligibilityTransition_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "ExperimentAssignment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing creator-gated assignments receive an explicit version-1 baseline.
-- Other experiments keep their existing behavior and are not silently enrolled
-- into this versioned eligibility contract.
INSERT INTO "ExperimentEligibilityState" (
  "assignmentId", "eligible", "reason", "version", "observedAt", "updatedAt"
)
SELECT
  assignment."id",
  assignment."eligible",
  CAST('ASSIGNMENT_BASELINE' AS "ExperimentEligibilityReason"),
  1,
  assignment."assignedAt",
  assignment."assignedAt"
FROM "ExperimentAssignment" assignment
WHERE assignment."experimentKey" = 'action_to_plan_creator_gated_v2';

INSERT INTO "ExperimentEligibilityTransition" (
  "id", "assignmentId", "version", "eligible", "reason", "observedAt"
)
SELECT
  'eligibility-baseline:' || assignment."id",
  assignment."id",
  1,
  assignment."eligible",
  CAST('ASSIGNMENT_BASELINE' AS "ExperimentEligibilityReason"),
  assignment."assignedAt"
FROM "ExperimentEligibilityState" state
INNER JOIN "ExperimentAssignment" assignment
  ON assignment."id" = state."assignmentId"
WHERE assignment."experimentKey" = 'action_to_plan_creator_gated_v2';

COMMIT;
