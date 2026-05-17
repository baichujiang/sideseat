-- One pending proposal per signed-in proposer per share link.
CREATE UNIQUE INDEX "ScheduleShareGuestProposal_link_proposer_pending_key"
ON "ScheduleShareGuestProposal"("scheduleShareLinkId", "proposerUserId")
WHERE "status" = 'PENDING' AND "proposerUserId" IS NOT NULL;
