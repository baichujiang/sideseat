-- Backfill for databases that created UserCalendarCategory before icsSubscriptionUrl was on CREATE TABLE.
ALTER TABLE "UserCalendarCategory" ADD COLUMN IF NOT EXISTS "icsSubscriptionUrl" TEXT;
