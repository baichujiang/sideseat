ALTER TABLE "WeeklyIntent" ALTER COLUMN "expiresAt" DROP NOT NULL;

-- Finish already elapsed legacy intentions before removing active deadlines.
-- Never revive an expired/ended record or enroll an unpublished intention.
WITH elapsed AS (
  UPDATE "WeeklyIntent"
  SET "status" = 'EXPIRED', "endedAt" = CURRENT_TIMESTAMP, "pausedAt" = NULL,
      "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
  WHERE "status" IN ('ACTIVE', 'PAUSED') AND "expiresAt" <= CURRENT_TIMESTAMP
  RETURNING "id"
)
UPDATE "MutualOpportunity"
SET "status" = 'EXPIRED', "terminalAt" = CURRENT_TIMESTAMP,
    "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'PENDING'
  AND ("intentAId" IN (SELECT "id" FROM elapsed)
    OR "intentBId" IN (SELECT "id" FROM elapsed));

UPDATE "WeeklyIntent"
SET "expiresAt" = NULL, "version" = "version" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IN ('ACTIVE', 'PAUSED') AND "expiresAt" > CURRENT_TIMESTAMP;
