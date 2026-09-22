-- Private Weekly Intent foundation for Together. This migration is additive;
-- existing Discover, B-light, Plan, and Calendar rows keep their semantics.

CREATE TYPE "WeeklyIntentStatus" AS ENUM (
  'ACTIVE',
  'PAUSED',
  'ENDED',
  'EXPIRED'
);

CREATE TABLE "WeeklyIntent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "topic" "SocialIntentTopic" NOT NULL,
  "courseId" TEXT,
  "timeWindows" JSONB NOT NULL,
  "timeZone" TEXT NOT NULL DEFAULT 'Europe/Berlin',
  "note" VARCHAR(160),
  "status" "WeeklyIntentStatus" NOT NULL DEFAULT 'ACTIVE',
  "policyVersion" INTEGER NOT NULL DEFAULT 1,
  "version" INTEGER NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "pausedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WeeklyIntent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WeeklyIntent_policyVersion_check" CHECK ("policyVersion" = 1),
  CONSTRAINT "WeeklyIntent_version_check" CHECK ("version" >= 1),
  CONSTRAINT "WeeklyIntent_terminal_check" CHECK (
    ("status" IN ('ACTIVE', 'PAUSED') AND "endedAt" IS NULL)
    OR
    ("status" IN ('ENDED', 'EXPIRED') AND "endedAt" IS NOT NULL)
  )
);

CREATE INDEX "WeeklyIntent_userId_status_expiresAt_idx"
  ON "WeeklyIntent"("userId", "status", "expiresAt");
CREATE INDEX "WeeklyIntent_status_expiresAt_idx"
  ON "WeeklyIntent"("status", "expiresAt");
CREATE INDEX "WeeklyIntent_courseId_status_idx"
  ON "WeeklyIntent"("courseId", "status");

ALTER TABLE "WeeklyIntent"
  ADD CONSTRAINT "WeeklyIntent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WeeklyIntent"
  ADD CONSTRAINT "WeeklyIntent_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
