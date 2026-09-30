CREATE TABLE "MembershipInviteBatch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "requestKey" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdByName" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "mode" TEXT NOT NULL CHECK ("mode" IN ('SHARED', 'INDIVIDUAL')),
  "quantity" INTEGER NOT NULL CHECK ("quantity" BETWEEN 1 AND 500),
  "durationDays" INTEGER NOT NULL CHECK ("durationDays" BETWEEN 1 AND 3650),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "disabledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "MembershipInviteBatch_requestKey_key" ON "MembershipInviteBatch"("requestKey");
ALTER TABLE "MembershipInviteCode" ADD COLUMN "batchId" TEXT;
ALTER TABLE "MembershipInviteCode" ADD CONSTRAINT "MembershipInviteCode_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "MembershipInviteBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "MembershipInviteCode_batchId_createdAt_idx" ON "MembershipInviteCode"("batchId", "createdAt");
CREATE TABLE "MembershipInviteAudit" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "batchId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "actorName" TEXT NOT NULL,
  "action" TEXT NOT NULL CHECK ("action" IN ('CREATE_BATCH', 'DISABLE_BATCH', 'DISABLE_CODE')),
  "codeId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MembershipInviteAudit_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "MembershipInviteBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "MembershipInviteAudit_batchId_createdAt_idx" ON "MembershipInviteAudit"("batchId", "createdAt");
