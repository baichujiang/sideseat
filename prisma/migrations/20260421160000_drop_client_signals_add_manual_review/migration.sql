-- Drop Safety/ClientSignal feature entirely.
DROP TABLE IF EXISTS "ClientSignal";
DROP TYPE IF EXISTS "ClientSignalAction";

-- Add manual student-verification review fields.
ALTER TABLE "User"
  ADD COLUMN "manualReviewProofUrl" TEXT,
  ADD COLUMN "manualReviewProofFilename" TEXT,
  ADD COLUMN "manualReviewRequestedAt" TIMESTAMP(3);
