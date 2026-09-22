-- Layer 2: a Shared Encounter is derived only when both participants privately
-- report that an accepted Plan occurred. Private answers remain in
-- PlanOutcomeResponse and are never copied onto this shared record.

CREATE TABLE "SharedEncounter" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "planCommitmentId" TEXT,
  "derivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SharedEncounter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SharedEncounter_planId_key"
  ON "SharedEncounter"("planId");

CREATE UNIQUE INDEX "SharedEncounter_planCommitmentId_key"
  ON "SharedEncounter"("planCommitmentId");

CREATE INDEX "SharedEncounter_derivedAt_idx"
  ON "SharedEncounter"("derivedAt");

ALTER TABLE "SharedEncounter"
  ADD CONSTRAINT "SharedEncounter_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "PlanRequest"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SharedEncounter"
  ADD CONSTRAINT "SharedEncounter_planCommitmentId_fkey"
  FOREIGN KEY ("planCommitmentId") REFERENCES "PlanCommitment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
