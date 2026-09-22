-- Recurring user events are stored as one series master and expanded for the
-- requested calendar window. Existing materialized series stay untouched and
-- are upgraded lazily when edited, so detached legacy occurrences remain safe.
ALTER TABLE "CalendarEntry"
  ADD COLUMN "isRecurrenceMaster" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "recurrenceMasterId" TEXT,
  ADD COLUMN "recurrenceOriginalStartAt" TIMESTAMP(3);

CREATE INDEX "CalendarEntry_userId_isRecurrenceMaster_startAt_idx"
  ON "CalendarEntry"("userId", "isRecurrenceMaster", "startAt");

CREATE INDEX "CalendarEntry_recurrenceMasterId_recurrenceOriginalStartAt_idx"
  ON "CalendarEntry"("recurrenceMasterId", "recurrenceOriginalStartAt");

CREATE UNIQUE INDEX "CalendarEntry_recurrenceMasterId_recurrenceOriginalStartAt_key"
  ON "CalendarEntry"("recurrenceMasterId", "recurrenceOriginalStartAt");

ALTER TABLE "CalendarEntry"
  ADD CONSTRAINT "CalendarEntry_recurrenceMasterId_fkey"
  FOREIGN KEY ("recurrenceMasterId") REFERENCES "CalendarEntry"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CalendarRecurrenceCancellation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "recurrenceMasterId" TEXT NOT NULL,
  "originalStartAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CalendarRecurrenceCancellation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CalendarRecurrenceCancellation_recurrenceMasterId_originalStartAt_key"
  ON "CalendarRecurrenceCancellation"("recurrenceMasterId", "originalStartAt");

CREATE INDEX "CalendarRecurrenceCancellation_userId_originalStartAt_idx"
  ON "CalendarRecurrenceCancellation"("userId", "originalStartAt");

ALTER TABLE "CalendarRecurrenceCancellation"
  ADD CONSTRAINT "CalendarRecurrenceCancellation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CalendarRecurrenceCancellation"
  ADD CONSTRAINT "CalendarRecurrenceCancellation_recurrenceMasterId_fkey"
  FOREIGN KEY ("recurrenceMasterId") REFERENCES "CalendarEntry"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CalendarRecurrenceReminderReceipt" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "recurrenceMasterId" TEXT NOT NULL,
  "originalStartAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CalendarRecurrenceReminderReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CalendarRecurrenceReminderReceipt_recurrenceMasterId_originalStartAt_key"
  ON "CalendarRecurrenceReminderReceipt"("recurrenceMasterId", "originalStartAt");

CREATE INDEX "CalendarRecurrenceReminderReceipt_sentAt_idx"
  ON "CalendarRecurrenceReminderReceipt"("sentAt");

ALTER TABLE "CalendarRecurrenceReminderReceipt"
  ADD CONSTRAINT "CalendarRecurrenceReminderReceipt_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CalendarRecurrenceReminderReceipt"
  ADD CONSTRAINT "CalendarRecurrenceReminderReceipt_recurrenceMasterId_fkey"
  FOREIGN KEY ("recurrenceMasterId") REFERENCES "CalendarEntry"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
