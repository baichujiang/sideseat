-- Backfill when UserCalendarCategory was created before icsSubscriptionUrl was on CREATE TABLE.
ALTER TABLE "UserCalendarCategory" ADD COLUMN IF NOT EXISTS "icsSubscriptionUrl" TEXT;
