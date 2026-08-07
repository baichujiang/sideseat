ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "usernameChangeWindowStartedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "usernameChangeCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "User"
SET
  "usernameChangeWindowStartedAt" = "usernameUpdatedAt",
  "usernameChangeCount" = 1
WHERE "usernameUpdatedAt" IS NOT NULL
  AND "usernameChangeWindowStartedAt" IS NULL
  AND "usernameChangeCount" = 0;
