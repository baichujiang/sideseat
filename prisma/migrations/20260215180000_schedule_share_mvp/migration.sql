-- CreateEnum
CREATE TYPE "ScheduleShareGuestProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateTable
CREATE TABLE "ScheduleShareLink" (
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

-- CreateTable
CREATE TABLE "ScheduleShareGuestProposal" (
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

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleShareLink_tokenHash_key" ON "ScheduleShareLink"("tokenHash");

-- CreateIndex
CREATE INDEX "ScheduleShareLink_ownerUserId_idx" ON "ScheduleShareLink"("ownerUserId");

-- CreateIndex
CREATE INDEX "ScheduleShareLink_expiresAt_idx" ON "ScheduleShareLink"("expiresAt");

-- CreateIndex
CREATE INDEX "ScheduleShareGuestProposal_scheduleShareLinkId_idx" ON "ScheduleShareGuestProposal"("scheduleShareLinkId");

-- CreateIndex
CREATE INDEX "ScheduleShareGuestProposal_proposerUserId_idx" ON "ScheduleShareGuestProposal"("proposerUserId");

-- CreateIndex
CREATE INDEX "ScheduleShareGuestProposal_status_idx" ON "ScheduleShareGuestProposal"("status");

-- CreateIndex
CREATE INDEX "ScheduleShareGuestProposal_startTime_idx" ON "ScheduleShareGuestProposal"("startTime");

-- AddForeignKey
ALTER TABLE "ScheduleShareLink" ADD CONSTRAINT "ScheduleShareLink_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleShareGuestProposal" ADD CONSTRAINT "ScheduleShareGuestProposal_scheduleShareLinkId_fkey" FOREIGN KEY ("scheduleShareLinkId") REFERENCES "ScheduleShareLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleShareGuestProposal" ADD CONSTRAINT "ScheduleShareGuestProposal_proposerUserId_fkey" FOREIGN KEY ("proposerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
