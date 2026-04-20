-- CreateEnum
CREATE TYPE "ReportActionType" AS ENUM ('STATUS_CHANGED', 'NOTES_UPDATED', 'USER_BLOCKED');

-- CreateTable
CREATE TABLE "ReportAction" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "actionType" "ReportActionType" NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "fromStatus" "ReportStatus",
    "toStatus" "ReportStatus",
    "noteSnapshot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationBlock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportId" TEXT,
    "reason" TEXT,
    "createdByEmail" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportAction_reportId_createdAt_idx" ON "ReportAction"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "ModerationBlock_userId_isActive_idx" ON "ModerationBlock"("userId", "isActive");

-- AddForeignKey
ALTER TABLE "ReportAction" ADD CONSTRAINT "ReportAction_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationBlock" ADD CONSTRAINT "ModerationBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationBlock" ADD CONSTRAINT "ModerationBlock_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;
