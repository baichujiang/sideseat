-- Add case-insensitive nickname uniqueness for search (guests keep NULL key).
ALTER TABLE "User" ADD COLUMN "nicknameKey" TEXT;

UPDATE "User"
SET "nicknameKey" = LOWER(TRIM("nickname"))
WHERE "isGuest" = false
  AND "nickname" IS NOT NULL
  AND TRIM("nickname") <> '';

-- Resolve duplicate keys: keep earliest account, assign others username-based keys.
WITH ranked AS (
  SELECT
    id,
    LOWER(TRIM("nickname")) AS base_key,
    "username",
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(TRIM("nickname"))
      ORDER BY "createdAt" ASC NULLS LAST, id ASC
    ) AS rn
  FROM "User"
  WHERE "isGuest" = false
    AND "nickname" IS NOT NULL
    AND TRIM("nickname") <> ''
)
UPDATE "User" u
SET "nicknameKey" = CASE
  WHEN r.rn = 1 THEN r.base_key
  ELSE r."username"
END
FROM ranked r
WHERE u.id = r.id;

CREATE UNIQUE INDEX "User_nicknameKey_key" ON "User"("nicknameKey");
