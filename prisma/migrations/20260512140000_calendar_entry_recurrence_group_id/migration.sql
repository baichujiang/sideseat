-- AlterTable
ALTER TABLE "CalendarEntry" ADD COLUMN "recurrenceGroupId" TEXT;

-- CreateIndex
CREATE INDEX "CalendarEntry_userId_recurrenceGroupId_idx" ON "CalendarEntry"("userId", "recurrenceGroupId");
