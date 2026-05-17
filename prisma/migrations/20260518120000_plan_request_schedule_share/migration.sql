-- Link plan requests to schedule share links (guest proposals → Chats Plan).
ALTER TABLE "PlanRequest" ADD COLUMN "scheduleShareLinkId" TEXT;
ALTER TABLE "PlanRequest" ADD COLUMN "scheduleShareGuestProposalId" TEXT;

ALTER TABLE "PlanRequest" ADD CONSTRAINT "PlanRequest_scheduleShareLinkId_fkey"
  FOREIGN KEY ("scheduleShareLinkId") REFERENCES "ScheduleShareLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlanRequest" ADD CONSTRAINT "PlanRequest_scheduleShareGuestProposalId_fkey"
  FOREIGN KEY ("scheduleShareGuestProposalId") REFERENCES "ScheduleShareGuestProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "PlanRequest_scheduleShareGuestProposalId_key" ON "PlanRequest"("scheduleShareGuestProposalId");

CREATE INDEX "PlanRequest_scheduleShareLinkId_createdAt_idx" ON "PlanRequest"("scheduleShareLinkId", "createdAt");

-- One pending plan per proposer per share link.
CREATE UNIQUE INDEX "PlanRequest_link_proposer_pending_key"
ON "PlanRequest"("scheduleShareLinkId", "proposerUserId")
WHERE "status" = 'PENDING' AND "scheduleShareLinkId" IS NOT NULL;
