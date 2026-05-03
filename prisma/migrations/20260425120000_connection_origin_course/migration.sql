-- AlterTable
ALTER TABLE "Connection" ADD COLUMN "originCourseId" TEXT;

-- CreateIndex
CREATE INDEX "Connection_originCourseId_idx" ON "Connection"("originCourseId");

-- AddForeignKey
ALTER TABLE "Connection"
  ADD CONSTRAINT "Connection_originCourseId_fkey"
  FOREIGN KEY ("originCourseId")
  REFERENCES "Course"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- Backfill existing connections from their legacy invitation's courseId.
UPDATE "Connection" c
SET "originCourseId" = i."courseId"
FROM "Invitation" i
WHERE c."invitationId" = i.id
  AND c."originCourseId" IS NULL;
