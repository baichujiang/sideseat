-- Additive timing preference; legacy intentions keep their exact windows.
ALTER TABLE "WeeklyIntent" ADD COLUMN "timePreference" JSONB;

-- A flexible opportunity is not an appointment. Never fabricate timestamps.
ALTER TABLE "MutualOpportunity"
  ALTER COLUMN "startsAt" DROP NOT NULL,
  ALTER COLUMN "endsAt" DROP NOT NULL,
  DROP CONSTRAINT "MutualOpportunity_time_check",
  ADD CONSTRAINT "MutualOpportunity_time_check" CHECK (
    ("startsAt" IS NULL AND "endsAt" IS NULL)
    OR ("startsAt" IS NOT NULL AND "endsAt" IS NOT NULL AND "startsAt" < "endsAt")
  );
-- Existing expiry <= startsAt CHECK still applies to exact opportunities;
-- flexible opportunities have an independent finite expiresAt.
