-- Add a concrete action to the broad COFFEE, EXPLORE, FOOD and EVENTS
-- categories. Existing TestFlight rows remain readable with NULL.

ALTER TABLE "WeeklyIntent"
  ADD COLUMN "activityText" VARCHAR(80);

ALTER TABLE "MutualOpportunity"
  ADD COLUMN "activityText" VARCHAR(80);
