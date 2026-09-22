CREATE TYPE "MeetAgainValue" AS ENUM ('YES', 'NO', 'WITHDRAWN');

CREATE TABLE "MeetAgainPermission" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "value" "MeetAgainValue" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MeetAgainPermission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MeetAgainPermission_planId_userId_key" ON "MeetAgainPermission"("planId", "userId");
CREATE INDEX "MeetAgainPermission_userId_updatedAt_idx" ON "MeetAgainPermission"("userId", "updatedAt");
ALTER TABLE "MeetAgainPermission" ADD CONSTRAINT "MeetAgainPermission_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "PlanRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetAgainPermission" ADD CONSTRAINT "MeetAgainPermission_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MutualOpportunity" ADD COLUMN "repeatOfPlanId" TEXT;
CREATE INDEX "MutualOpportunity_repeatOfPlanId_status_idx" ON "MutualOpportunity"("repeatOfPlanId", "status");
ALTER TABLE "MutualOpportunity" ADD CONSTRAINT "MutualOpportunity_repeatOfPlanId_fkey"
  FOREIGN KEY ("repeatOfPlanId") REFERENCES "PlanRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
