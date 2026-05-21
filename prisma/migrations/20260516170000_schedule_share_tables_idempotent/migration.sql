-- Ensure schedule share exists when 20260215180000 was skipped/marked applied before init.
DO $$ BEGIN
  CREATE TYPE "ScheduleShareGuestProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ScheduleShareLink" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "rangeStart" TIMESTAMP(3) NOT NULL,
    "rangeEnd" TIMESTAMP(3) NOT NULL,
    "revealConfig" JSONB NOT NULL,
    "allowGuestProposals" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleShareLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ScheduleShareGuestProposal" (
    "id" TEXT NOT NULL,
    "scheduleShareLinkId" TEXT NOT NULL,
    "proposerUserId" TEXT,
    "guestDisplayName" TEXT NOT NULL,
    "guestContact" TEXT,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "location" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "status" "ScheduleShareGuestProposalStatus" NOT NULL DEFAULT 'PENDING',
    "acceptedCalendarEntryId" TEXT,
    "createdFromIp" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleShareGuestProposal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ScheduleShareLink_tokenHash_key" ON "ScheduleShareLink"("tokenHash");
CREATE INDEX IF NOT EXISTS "ScheduleShareLink_ownerUserId_idx" ON "ScheduleShareLink"("ownerUserId");
CREATE INDEX IF NOT EXISTS "ScheduleShareLink_expiresAt_idx" ON "ScheduleShareLink"("expiresAt");
CREATE INDEX IF NOT EXISTS "ScheduleShareGuestProposal_scheduleShareLinkId_idx" ON "ScheduleShareGuestProposal"("scheduleShareLinkId");
CREATE INDEX IF NOT EXISTS "ScheduleShareGuestProposal_proposerUserId_idx" ON "ScheduleShareGuestProposal"("proposerUserId");
CREATE INDEX IF NOT EXISTS "ScheduleShareGuestProposal_status_idx" ON "ScheduleShareGuestProposal"("status");
CREATE INDEX IF NOT EXISTS "ScheduleShareGuestProposal_startTime_idx" ON "ScheduleShareGuestProposal"("startTime");

DO $$ BEGIN
  ALTER TABLE "ScheduleShareLink" ADD CONSTRAINT "ScheduleShareLink_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ScheduleShareGuestProposal" ADD CONSTRAINT "ScheduleShareGuestProposal_scheduleShareLinkId_fkey" FOREIGN KEY ("scheduleShareLinkId") REFERENCES "ScheduleShareLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ScheduleShareGuestProposal" ADD CONSTRAINT "ScheduleShareGuestProposal_proposerUserId_fkey" FOREIGN KEY ("proposerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ScheduleShareGuestProposal_link_proposer_pending_key"
ON "ScheduleShareGuestProposal"("scheduleShareLinkId", "proposerUserId")
WHERE "status" = 'PENDING' AND "proposerUserId" IS NOT NULL;
