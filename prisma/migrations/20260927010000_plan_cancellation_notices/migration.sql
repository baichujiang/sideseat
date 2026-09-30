CREATE TABLE "PlanCancellationNotice" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "planId" TEXT NOT NULL UNIQUE REFERENCES "PlanRequest"("id") ON DELETE CASCADE,
  "actorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "recipientId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "wasConfirmed" BOOLEAN NOT NULL,
  "isLate" BOOLEAN NOT NULL,
  "reasonCode" VARCHAR(32),
  "note" VARCHAR(240),
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlanCancellationNotice_distinct_participants" CHECK ("actorId" <> "recipientId")
);
CREATE INDEX "PlanCancellationNotice_recipientId_readAt_createdAt_idx"
  ON "PlanCancellationNotice"("recipientId", "readAt", "createdAt");
