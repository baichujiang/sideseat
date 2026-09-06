-- BL-DB-06, part 2: expand-only persistence for the approved Block safety ADR.
--
-- No Plan, Block, or Calendar row is transitioned here. The nullable marker and
-- restricted Block pointer remain unused until the pair-wide safety command is
-- implemented and its read paths are ready.

BEGIN;

ALTER TABLE "PlanCommitment"
  ADD COLUMN "cancellationReason" "PlanCommitmentCancellationReason",
  ADD COLUMN "safetyRestrictedAt" TIMESTAMP(3),
  ADD COLUMN "safetyBlockId" TEXT;

CREATE INDEX "PlanCommitment_safetyBlockId_idx"
  ON "PlanCommitment"("safetyBlockId");
CREATE INDEX "PlanCommitment_cancellationReason_canceledAt_idx"
  ON "PlanCommitment"("cancellationReason", "canceledAt");

ALTER TABLE "PlanCommitment"
  ADD CONSTRAINT "PlanCommitment_safetyBlockId_fkey"
  FOREIGN KEY ("safetyBlockId") REFERENCES "Block"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
