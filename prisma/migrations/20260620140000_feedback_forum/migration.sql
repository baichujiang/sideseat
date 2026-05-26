CREATE TYPE "ProductFeedbackVoteValue" AS ENUM ('UP', 'DOWN');

ALTER TABLE "ProductFeedback"
  ADD COLUMN IF NOT EXISTS "title" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "ProductFeedbackVote" (
  "id" TEXT NOT NULL,
  "feedbackId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "value" "ProductFeedbackVoteValue" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductFeedbackVote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductFeedbackComment" (
  "id" TEXT NOT NULL,
  "feedbackId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "isOfficial" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductFeedbackComment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductFeedbackVote_feedbackId_userId_key" ON "ProductFeedbackVote"("feedbackId", "userId");
CREATE INDEX "ProductFeedbackVote_userId_createdAt_idx" ON "ProductFeedbackVote"("userId", "createdAt");
CREATE INDEX "ProductFeedbackComment_feedbackId_createdAt_idx" ON "ProductFeedbackComment"("feedbackId", "createdAt");
CREATE INDEX "ProductFeedbackComment_userId_createdAt_idx" ON "ProductFeedbackComment"("userId", "createdAt");

ALTER TABLE "ProductFeedbackVote" ADD CONSTRAINT "ProductFeedbackVote_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "ProductFeedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductFeedbackVote" ADD CONSTRAINT "ProductFeedbackVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductFeedbackComment" ADD CONSTRAINT "ProductFeedbackComment_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "ProductFeedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductFeedbackComment" ADD CONSTRAINT "ProductFeedbackComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
