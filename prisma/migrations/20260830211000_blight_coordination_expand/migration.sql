-- BL-DB-01, part 2: expand-only coordination persistence.
--
-- Existing Action policy fields remain nullable until BL-DB-03 performs a
-- verified DIRECT_CONVERSATION_V1 backfill. History-dependent CHECKs and partial
-- unique indexes remain owned by BL-DB-04. Product enrollment stays disabled.

BEGIN;

ALTER TABLE "ActionInterest"
  DROP CONSTRAINT "ActionInterest_connectionId_fkey";

ALTER TABLE "ActionInterest"
  ALTER COLUMN "connectionId" DROP NOT NULL;

ALTER TABLE "ClassmatePost"
  ADD COLUMN "clientCapabilitySnapshot" JSONB,
  ADD COLUMN "coordinationPolicy" "ActionCoordinationPolicy",
  ADD COLUMN "experimentKeySnapshot" TEXT,
  ADD COLUMN "experimentVariantSnapshot" "ExperimentVariant",
  ADD COLUMN "expiredAt" TIMESTAMP(3),
  ADD COLUMN "fulfilledAt" TIMESTAMP(3),
  ADD COLUMN "policyParametersSnapshot" JSONB,
  ADD COLUMN "policySchemaVersion" INTEGER,
  ADD COLUMN "policySnapshottedAt" TIMESTAMP(3),
  ADD COLUMN "removedAt" TIMESTAMP(3);

ALTER TABLE "Message"
  ADD COLUMN "actionContextId" TEXT;

ALTER TABLE "ProductFunnelEvent"
  ADD COLUMN "actionContextId" TEXT,
  ADD COLUMN "actionInterestId" TEXT,
  ADD COLUMN "businessEventKey" VARCHAR(191),
  ADD COLUMN "coordinationPolicy" "ActionCoordinationPolicy",
  ADD COLUMN "firstContentType" "ActionFirstContentType",
  ADD COLUMN "interestActivationId" TEXT,
  ADD COLUMN "interestSurface" "ActionInterestSurface",
  ADD COLUMN "planCommitmentId" TEXT,
  ADD COLUMN "planRevisionId" TEXT,
  ADD COLUMN "policySchemaVersion" INTEGER,
  ADD COLUMN "terminalReason" "ActionInterestTerminalReason";

CREATE TABLE "NotificationOutbox" (
  "id" TEXT NOT NULL,
  "dedupeKey" VARCHAR(191) NOT NULL,
  "kind" VARCHAR(64) NOT NULL,
  "recipientId" TEXT NOT NULL,
  "destination" JSONB NOT NULL,
  "payloadVersion" INTEGER NOT NULL,
  "payload" JSONB NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastAttemptAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "deadLetterAt" TIMESTAMP(3),
  "lastErrorCode" VARCHAR(64),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ActionInterestActivation" (
  "id" TEXT NOT NULL,
  "interestId" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "interestSurface" "ActionInterestSurface" NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "connectedAt" TIMESTAMP(3),
  "firstContentType" "ActionFirstContentType",
  "terminalReason" "ActionInterestTerminalReason",
  "terminalAt" TIMESTAMP(3),
  CONSTRAINT "ActionInterestActivation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ActionCoordinationContext" (
  "id" TEXT NOT NULL,
  "interestId" TEXT NOT NULL,
  "currentActivationId" TEXT NOT NULL,
  "state" "ActionCoordinationState" NOT NULL DEFAULT 'WAITING',
  "reservationId" UUID,
  "reservationGeneration" INTEGER NOT NULL DEFAULT 0,
  "leaseExpiresAt" TIMESTAMP(3),
  "connectionId" TEXT,
  "activatedAt" TIMESTAMP(3),
  "firstCounterpartResponseAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "endedById" TEXT,
  "endReason" "ActionCoordinationEndReason",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ActionCoordinationContext_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ActionInterestPresentation" (
  "interestId" TEXT NOT NULL,
  "creatorId" TEXT NOT NULL,
  "hiddenAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActionInterestPresentation_pkey" PRIMARY KEY ("interestId")
);

CREATE TABLE "ActionInterestViewReceipt" (
  "id" TEXT NOT NULL,
  "activationId" TEXT NOT NULL,
  "interestId" TEXT NOT NULL,
  "creatorId" TEXT NOT NULL,
  "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActionInterestViewReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ActionResponseSnapshot" (
  "id" TEXT NOT NULL,
  "creatorId" TEXT NOT NULL,
  "actionIdFilter" TEXT,
  "hiddenFilter" BOOLEAN,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ActionResponseSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ActionResponseSnapshotItem" (
  "snapshotId" TEXT NOT NULL,
  "interestId" TEXT NOT NULL,
  "activationId" TEXT NOT NULL,
  "actionId" TEXT NOT NULL,
  "sortOrdinal" INTEGER NOT NULL,
  "hiddenAtSnapshot" TIMESTAMP(3),
  "viewedAtSnapshot" TIMESTAMP(3),
  "hasUnseenVisibleAtSnapshot" BOOLEAN NOT NULL,
  "latestActivationAtSnapshot" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ActionResponseSnapshotItem_pkey" PRIMARY KEY ("snapshotId", "interestId")
);

CREATE UNIQUE INDEX "NotificationOutbox_dedupeKey_key"
  ON "NotificationOutbox"("dedupeKey");
CREATE INDEX "NotificationOutbox_availableAt_deliveredAt_deadLetterAt_idx"
  ON "NotificationOutbox"("availableAt", "deliveredAt", "deadLetterAt");
CREATE INDEX "NotificationOutbox_recipientId_createdAt_idx"
  ON "NotificationOutbox"("recipientId", "createdAt");

CREATE INDEX "ActionInterestActivation_interestId_startedAt_idx"
  ON "ActionInterestActivation"("interestId", "startedAt");
CREATE INDEX "ActionInterestActivation_terminalReason_terminalAt_idx"
  ON "ActionInterestActivation"("terminalReason", "terminalAt");
CREATE UNIQUE INDEX "ActionInterestActivation_interestId_ordinal_key"
  ON "ActionInterestActivation"("interestId", "ordinal");

CREATE UNIQUE INDEX "ActionCoordinationContext_interestId_key"
  ON "ActionCoordinationContext"("interestId");
CREATE UNIQUE INDEX "ActionCoordinationContext_currentActivationId_key"
  ON "ActionCoordinationContext"("currentActivationId");
CREATE UNIQUE INDEX "ActionCoordinationContext_reservationId_key"
  ON "ActionCoordinationContext"("reservationId");
CREATE INDEX "ActionCoordinationContext_state_leaseExpiresAt_idx"
  ON "ActionCoordinationContext"("state", "leaseExpiresAt");
CREATE INDEX "ActionCoordinationContext_connectionId_state_idx"
  ON "ActionCoordinationContext"("connectionId", "state");
CREATE INDEX "ActionCoordinationContext_interestId_state_idx"
  ON "ActionCoordinationContext"("interestId", "state");

CREATE INDEX "ActionInterestPresentation_creatorId_hiddenAt_updatedAt_idx"
  ON "ActionInterestPresentation"("creatorId", "hiddenAt", "updatedAt");

CREATE UNIQUE INDEX "ActionInterestViewReceipt_activationId_key"
  ON "ActionInterestViewReceipt"("activationId");
CREATE INDEX "ActionInterestViewReceipt_interestId_viewedAt_idx"
  ON "ActionInterestViewReceipt"("interestId", "viewedAt");
CREATE INDEX "ActionInterestViewReceipt_creatorId_viewedAt_idx"
  ON "ActionInterestViewReceipt"("creatorId", "viewedAt");

CREATE INDEX "ActionResponseSnapshot_creatorId_expiresAt_idx"
  ON "ActionResponseSnapshot"("creatorId", "expiresAt");
CREATE INDEX "ActionResponseSnapshot_expiresAt_idx"
  ON "ActionResponseSnapshot"("expiresAt");
CREATE UNIQUE INDEX "ActionResponseSnapshotItem_snapshotId_sortOrdinal_key"
  ON "ActionResponseSnapshotItem"("snapshotId", "sortOrdinal");
CREATE INDEX "ActionResponseSnapshotItem_snapshotId_actionId_sortOrdinal_idx"
  ON "ActionResponseSnapshotItem"("snapshotId", "actionId", "sortOrdinal");

CREATE INDEX "ClassmatePost_status_expiresAt_idx"
  ON "ClassmatePost"("status", "expiresAt");
CREATE INDEX "ClassmatePost_coordinationPolicy_createdAt_idx"
  ON "ClassmatePost"("coordinationPolicy", "createdAt");
CREATE INDEX "Message_actionContextId_createdAt_id_idx"
  ON "Message"("actionContextId", "createdAt", "id");

CREATE UNIQUE INDEX "ProductFunnelEvent_businessEventKey_key"
  ON "ProductFunnelEvent"("businessEventKey");
CREATE INDEX "ProductFunnelEvent_actionInterestId_occurredAt_idx"
  ON "ProductFunnelEvent"("actionInterestId", "occurredAt");
CREATE INDEX "ProductFunnelEvent_interestActivationId_occurredAt_idx"
  ON "ProductFunnelEvent"("interestActivationId", "occurredAt");
CREATE INDEX "ProductFunnelEvent_actionContextId_occurredAt_idx"
  ON "ProductFunnelEvent"("actionContextId", "occurredAt");
CREATE INDEX "ProductFunnelEvent_planCommitmentId_occurredAt_idx"
  ON "ProductFunnelEvent"("planCommitmentId", "occurredAt");
CREATE INDEX "ProductFunnelEvent_planRevisionId_occurredAt_idx"
  ON "ProductFunnelEvent"("planRevisionId", "occurredAt");

ALTER TABLE "ProductFunnelEvent"
  ADD CONSTRAINT "ProductFunnelEvent_actionInterestId_fkey"
  FOREIGN KEY ("actionInterestId") REFERENCES "ActionInterest"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductFunnelEvent"
  ADD CONSTRAINT "ProductFunnelEvent_interestActivationId_fkey"
  FOREIGN KEY ("interestActivationId") REFERENCES "ActionInterestActivation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductFunnelEvent"
  ADD CONSTRAINT "ProductFunnelEvent_actionContextId_fkey"
  FOREIGN KEY ("actionContextId") REFERENCES "ActionCoordinationContext"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NotificationOutbox"
  ADD CONSTRAINT "NotificationOutbox_recipientId_fkey"
  FOREIGN KEY ("recipientId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActionInterest"
  ADD CONSTRAINT "ActionInterest_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "Connection"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ActionInterestActivation"
  ADD CONSTRAINT "ActionInterestActivation_interestId_fkey"
  FOREIGN KEY ("interestId") REFERENCES "ActionInterest"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActionCoordinationContext"
  ADD CONSTRAINT "ActionCoordinationContext_interestId_fkey"
  FOREIGN KEY ("interestId") REFERENCES "ActionInterest"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActionCoordinationContext"
  ADD CONSTRAINT "ActionCoordinationContext_currentActivationId_fkey"
  FOREIGN KEY ("currentActivationId") REFERENCES "ActionInterestActivation"("id")
  ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "ActionCoordinationContext"
  ADD CONSTRAINT "ActionCoordinationContext_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "Connection"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ActionCoordinationContext"
  ADD CONSTRAINT "ActionCoordinationContext_endedById_fkey"
  FOREIGN KEY ("endedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ActionInterestPresentation"
  ADD CONSTRAINT "ActionInterestPresentation_interestId_fkey"
  FOREIGN KEY ("interestId") REFERENCES "ActionInterest"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActionInterestPresentation"
  ADD CONSTRAINT "ActionInterestPresentation_creatorId_fkey"
  FOREIGN KEY ("creatorId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActionInterestViewReceipt"
  ADD CONSTRAINT "ActionInterestViewReceipt_activationId_fkey"
  FOREIGN KEY ("activationId") REFERENCES "ActionInterestActivation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActionInterestViewReceipt"
  ADD CONSTRAINT "ActionInterestViewReceipt_interestId_fkey"
  FOREIGN KEY ("interestId") REFERENCES "ActionInterest"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActionInterestViewReceipt"
  ADD CONSTRAINT "ActionInterestViewReceipt_creatorId_fkey"
  FOREIGN KEY ("creatorId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActionResponseSnapshot"
  ADD CONSTRAINT "ActionResponseSnapshot_creatorId_fkey"
  FOREIGN KEY ("creatorId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActionResponseSnapshot"
  ADD CONSTRAINT "ActionResponseSnapshot_actionIdFilter_fkey"
  FOREIGN KEY ("actionIdFilter") REFERENCES "ClassmatePost"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActionResponseSnapshotItem"
  ADD CONSTRAINT "ActionResponseSnapshotItem_snapshotId_fkey"
  FOREIGN KEY ("snapshotId") REFERENCES "ActionResponseSnapshot"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActionResponseSnapshotItem"
  ADD CONSTRAINT "ActionResponseSnapshotItem_interestId_fkey"
  FOREIGN KEY ("interestId") REFERENCES "ActionInterest"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActionResponseSnapshotItem"
  ADD CONSTRAINT "ActionResponseSnapshotItem_activationId_fkey"
  FOREIGN KEY ("activationId") REFERENCES "ActionInterestActivation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActionResponseSnapshotItem"
  ADD CONSTRAINT "ActionResponseSnapshotItem_actionId_fkey"
  FOREIGN KEY ("actionId") REFERENCES "ClassmatePost"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Message"
  ADD CONSTRAINT "Message_actionContextId_fkey"
  FOREIGN KEY ("actionContextId") REFERENCES "ActionCoordinationContext"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
