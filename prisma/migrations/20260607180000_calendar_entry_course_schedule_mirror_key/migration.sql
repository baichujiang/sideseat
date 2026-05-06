-- Optional link from calendar rows to recurring course slots (Home dedupe + drag UX).
ALTER TABLE "CalendarEntry" ADD COLUMN "courseScheduleMirrorKey" TEXT;

CREATE INDEX "CalendarEntry_userId_courseScheduleMirrorKey_idx"
  ON "CalendarEntry"("userId", "courseScheduleMirrorKey");
