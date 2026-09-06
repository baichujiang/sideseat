ALTER TYPE "MessageType" ADD VALUE 'MUTUAL_OPPORTUNITY_CARD';
ALTER TYPE "PlanOriginKind" ADD VALUE 'MUTUAL_OPPORTUNITY';

CREATE TYPE "MutualOpportunityStatus" AS ENUM (
  'PENDING',
  'MUTUAL',
  'EXPIRED',
  'UNAVAILABLE'
);

CREATE TYPE "MutualOpportunityDecisionValue" AS ENUM (
  'YES',
  'NO',
  'WITHDRAWN'
);

CREATE TABLE "MutualOpportunity" (
  "id" TEXT NOT NULL,
  "policyVersion" VARCHAR(48) NOT NULL DEFAULT 'MUTUAL_OPPORTUNITY_V1',
  "userAId" TEXT NOT NULL,
  "userBId" TEXT NOT NULL,
  "intentAId" TEXT NOT NULL,
  "intentBId" TEXT NOT NULL,
  "topic" "SocialIntentTopic" NOT NULL,
  "courseId" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "status" "MutualOpportunityStatus" NOT NULL DEFAULT 'PENDING',
  "contextSnapshot" JSONB NOT NULL,
  "connectionId" TEXT,
  "activatedAt" TIMESTAMP(3),
  "terminalAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MutualOpportunity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MutualOpportunity_distinct_users_check" CHECK ("userAId" <> "userBId"),
  CONSTRAINT "MutualOpportunity_time_check" CHECK ("startsAt" < "endsAt"),
  CONSTRAINT "MutualOpportunity_expiry_check" CHECK ("expiresAt" <= "startsAt"),
  CONSTRAINT "MutualOpportunity_activation_check" CHECK (
    ("status" = 'MUTUAL' AND "connectionId" IS NOT NULL AND "activatedAt" IS NOT NULL AND "terminalAt" IS NULL)
    OR
    ("status" = 'PENDING' AND "connectionId" IS NULL AND "activatedAt" IS NULL AND "terminalAt" IS NULL)
    OR
    ("status" IN ('EXPIRED', 'UNAVAILABLE') AND "activatedAt" IS NULL AND "terminalAt" IS NOT NULL)
  )
);

CREATE TABLE "MutualOpportunityDecision" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "value" "MutualOpportunityDecisionValue" NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MutualOpportunityDecision_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Message" ADD COLUMN "mutualOpportunityId" TEXT;

CREATE UNIQUE INDEX "MutualOpportunity_intentAId_intentBId_key"
  ON "MutualOpportunity"("intentAId", "intentBId");
CREATE INDEX "MutualOpportunity_userAId_status_expiresAt_idx"
  ON "MutualOpportunity"("userAId", "status", "expiresAt");
CREATE INDEX "MutualOpportunity_userBId_status_expiresAt_idx"
  ON "MutualOpportunity"("userBId", "status", "expiresAt");
CREATE INDEX "MutualOpportunity_status_expiresAt_idx"
  ON "MutualOpportunity"("status", "expiresAt");
CREATE INDEX "MutualOpportunity_userAId_userBId_createdAt_idx"
  ON "MutualOpportunity"("userAId", "userBId", "createdAt");
CREATE INDEX "MutualOpportunity_connectionId_status_idx"
  ON "MutualOpportunity"("connectionId", "status");
CREATE UNIQUE INDEX "MutualOpportunityDecision_opportunityId_userId_key"
  ON "MutualOpportunityDecision"("opportunityId", "userId");
CREATE INDEX "MutualOpportunityDecision_userId_value_updatedAt_idx"
  ON "MutualOpportunityDecision"("userId", "value", "updatedAt");
CREATE UNIQUE INDEX "Message_mutualOpportunityId_key"
  ON "Message"("mutualOpportunityId");

ALTER TABLE "MutualOpportunity"
  ADD CONSTRAINT "MutualOpportunity_userAId_fkey"
  FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MutualOpportunity"
  ADD CONSTRAINT "MutualOpportunity_userBId_fkey"
  FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MutualOpportunity"
  ADD CONSTRAINT "MutualOpportunity_intentAId_fkey"
  FOREIGN KEY ("intentAId") REFERENCES "WeeklyIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MutualOpportunity"
  ADD CONSTRAINT "MutualOpportunity_intentBId_fkey"
  FOREIGN KEY ("intentBId") REFERENCES "WeeklyIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MutualOpportunity"
  ADD CONSTRAINT "MutualOpportunity_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MutualOpportunity"
  ADD CONSTRAINT "MutualOpportunity_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "Connection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MutualOpportunityDecision"
  ADD CONSTRAINT "MutualOpportunityDecision_opportunityId_fkey"
  FOREIGN KEY ("opportunityId") REFERENCES "MutualOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MutualOpportunityDecision"
  ADD CONSTRAINT "MutualOpportunityDecision_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message"
  ADD CONSTRAINT "Message_mutualOpportunityId_fkey"
  FOREIGN KEY ("mutualOpportunityId") REFERENCES "MutualOpportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
