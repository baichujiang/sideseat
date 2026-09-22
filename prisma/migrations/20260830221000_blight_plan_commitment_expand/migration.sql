-- BL-DB-02, part 2: expand-only stable Plan persistence.
--
-- Legacy PlanRequest, CalendarEntry, and PlanOutcomeResponse rows remain the
-- active read model. New ownership/revision columns stay nullable until the
-- verified BL-DB-05 backfill. No history is inferred in this migration.

BEGIN;

ALTER TABLE "CalendarEntry"
  ADD COLUMN "planCommitmentId" TEXT,
  ADD COLUMN "projectionStatus" "CalendarProjectionStatus" NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "ClassmatePost"
  ADD COLUMN "fulfilledByPlanId" TEXT;

ALTER TABLE "PlanOutcomeResponse"
  ADD COLUMN "planCommitmentId" TEXT;

ALTER TABLE "PlanRequest"
  ADD COLUMN "commitmentId" TEXT,
  ADD COLUMN "originActionId" TEXT,
  ADD COLUMN "originContextId" TEXT,
  ADD COLUMN "resolutionReason" "PlanResolutionReason",
  ADD COLUMN "resolvedAt" TIMESTAMP(3),
  ADD COLUMN "resolvedByUserId" TEXT,
  ADD COLUMN "revisionKind" "PlanRevisionKind";

CREATE TABLE "PlanCommitment" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "participantAId" TEXT NOT NULL,
  "participantBId" TEXT NOT NULL,
  "originActionId" TEXT,
  "originContextId" TEXT,
  "status" "PlanCommitmentStatus" NOT NULL DEFAULT 'NEGOTIATING',
  "currentAcceptedRevisionId" TEXT,
  "currentPendingRevisionId" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "canceledByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlanCommitment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlanCommitment_currentAcceptedRevisionId_key"
  ON "PlanCommitment"("currentAcceptedRevisionId");
CREATE UNIQUE INDEX "PlanCommitment_currentPendingRevisionId_key"
  ON "PlanCommitment"("currentPendingRevisionId");
CREATE INDEX "PlanCommitment_participantAId_status_updatedAt_idx"
  ON "PlanCommitment"("participantAId", "status", "updatedAt");
CREATE INDEX "PlanCommitment_participantBId_status_updatedAt_idx"
  ON "PlanCommitment"("participantBId", "status", "updatedAt");
CREATE INDEX "PlanCommitment_connectionId_status_idx"
  ON "PlanCommitment"("connectionId", "status");
CREATE INDEX "PlanCommitment_originActionId_idx"
  ON "PlanCommitment"("originActionId");
CREATE INDEX "PlanCommitment_originContextId_idx"
  ON "PlanCommitment"("originContextId");
CREATE INDEX "PlanCommitment_status_updatedAt_idx"
  ON "PlanCommitment"("status", "updatedAt");

CREATE INDEX "CalendarEntry_planCommitmentId_projectionStatus_idx"
  ON "CalendarEntry"("planCommitmentId", "projectionStatus");
CREATE UNIQUE INDEX "ClassmatePost_fulfilledByPlanId_key"
  ON "ClassmatePost"("fulfilledByPlanId");
CREATE INDEX "PlanOutcomeResponse_planCommitmentId_userId_idx"
  ON "PlanOutcomeResponse"("planCommitmentId", "userId");
CREATE INDEX "PlanRequest_commitmentId_createdAt_idx"
  ON "PlanRequest"("commitmentId", "createdAt");
CREATE INDEX "PlanRequest_originActionId_status_createdAt_idx"
  ON "PlanRequest"("originActionId", "status", "createdAt");
CREATE INDEX "PlanRequest_originContextId_createdAt_idx"
  ON "PlanRequest"("originContextId", "createdAt");
CREATE INDEX "PlanRequest_resolvedByUserId_resolvedAt_idx"
  ON "PlanRequest"("resolvedByUserId", "resolvedAt");

ALTER TABLE "ProductFunnelEvent"
  ADD CONSTRAINT "ProductFunnelEvent_planCommitmentId_fkey"
  FOREIGN KEY ("planCommitmentId") REFERENCES "PlanCommitment"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductFunnelEvent"
  ADD CONSTRAINT "ProductFunnelEvent_planRevisionId_fkey"
  FOREIGN KEY ("planRevisionId") REFERENCES "PlanRequest"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClassmatePost"
  ADD CONSTRAINT "ClassmatePost_fulfilledByPlanId_fkey"
  FOREIGN KEY ("fulfilledByPlanId") REFERENCES "PlanCommitment"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlanCommitment"
  ADD CONSTRAINT "PlanCommitment_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "Connection"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanCommitment"
  ADD CONSTRAINT "PlanCommitment_participantAId_fkey"
  FOREIGN KEY ("participantAId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanCommitment"
  ADD CONSTRAINT "PlanCommitment_participantBId_fkey"
  FOREIGN KEY ("participantBId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanCommitment"
  ADD CONSTRAINT "PlanCommitment_originActionId_fkey"
  FOREIGN KEY ("originActionId") REFERENCES "ClassmatePost"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlanCommitment"
  ADD CONSTRAINT "PlanCommitment_originContextId_fkey"
  FOREIGN KEY ("originContextId") REFERENCES "ActionCoordinationContext"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlanCommitment"
  ADD CONSTRAINT "PlanCommitment_currentAcceptedRevisionId_fkey"
  FOREIGN KEY ("currentAcceptedRevisionId") REFERENCES "PlanRequest"("id")
  ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "PlanCommitment"
  ADD CONSTRAINT "PlanCommitment_currentPendingRevisionId_fkey"
  FOREIGN KEY ("currentPendingRevisionId") REFERENCES "PlanRequest"("id")
  ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "PlanCommitment"
  ADD CONSTRAINT "PlanCommitment_canceledByUserId_fkey"
  FOREIGN KEY ("canceledByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlanRequest"
  ADD CONSTRAINT "PlanRequest_commitmentId_fkey"
  FOREIGN KEY ("commitmentId") REFERENCES "PlanCommitment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanRequest"
  ADD CONSTRAINT "PlanRequest_originActionId_fkey"
  FOREIGN KEY ("originActionId") REFERENCES "ClassmatePost"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlanRequest"
  ADD CONSTRAINT "PlanRequest_originContextId_fkey"
  FOREIGN KEY ("originContextId") REFERENCES "ActionCoordinationContext"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlanRequest"
  ADD CONSTRAINT "PlanRequest_resolvedByUserId_fkey"
  FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlanOutcomeResponse"
  ADD CONSTRAINT "PlanOutcomeResponse_planCommitmentId_fkey"
  FOREIGN KEY ("planCommitmentId") REFERENCES "PlanCommitment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CalendarEntry"
  ADD CONSTRAINT "CalendarEntry_planCommitmentId_fkey"
  FOREIGN KEY ("planCommitmentId") REFERENCES "PlanCommitment"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
