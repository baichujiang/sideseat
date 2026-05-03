-- Track Web Push "15 min before start" reminder so cron does not repeat-send.
ALTER TABLE "CalendarEntry" ADD COLUMN "reminder15mSentAt" TIMESTAMP(3);
