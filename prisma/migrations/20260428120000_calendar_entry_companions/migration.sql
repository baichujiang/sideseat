CREATE TABLE "CalendarEntryCompanion" (
  "id" TEXT NOT NULL,
  "calendarEntryId" TEXT NOT NULL,
  "userId" TEXT,
  "displayName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CalendarEntryCompanion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CalendarEntryCompanion_calendarEntryId_idx"
  ON "CalendarEntryCompanion"("calendarEntryId");

CREATE INDEX "CalendarEntryCompanion_userId_idx"
  ON "CalendarEntryCompanion"("userId");

ALTER TABLE "CalendarEntryCompanion"
  ADD CONSTRAINT "CalendarEntryCompanion_calendarEntryId_fkey"
  FOREIGN KEY ("calendarEntryId")
  REFERENCES "CalendarEntry"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "CalendarEntryCompanion"
  ADD CONSTRAINT "CalendarEntryCompanion_userId_fkey"
  FOREIGN KEY ("userId")
  REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
