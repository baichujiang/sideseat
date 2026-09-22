-- Add concrete SPORTS semantics to private intents and their generated
-- opportunities. Existing rows remain valid and retain NULL for both fields.

ALTER TABLE "WeeklyIntent"
  ADD COLUMN "sportTag" "SportTag",
  ADD COLUMN "sportOtherNote" VARCHAR(60);

ALTER TABLE "MutualOpportunity"
  ADD COLUMN "sportTag" "SportTag",
  ADD COLUMN "sportOtherNote" VARCHAR(60);
