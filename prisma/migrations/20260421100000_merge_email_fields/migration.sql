-- Merge User.schoolEmail into User.email, then drop the school-specific columns.
-- If the user already has an `email` value (from signup), keep it. Otherwise
-- promote the existing schoolEmail so no verified student loses their address.

UPDATE "User"
SET "email" = "schoolEmail"
WHERE "email" IS NULL
  AND "schoolEmail" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "User" u2
    WHERE u2."email" = "User"."schoolEmail"
      AND u2."id" <> "User"."id"
  );

-- Preserve the timestamp so /profile can still show when a student was
-- verified; rename the column to match the unified email field.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3);

UPDATE "User"
SET "emailVerifiedAt" = "schoolEmailVerifiedAt"
WHERE "emailVerifiedAt" IS NULL
  AND "schoolEmailVerifiedAt" IS NOT NULL;

ALTER TABLE "User" DROP COLUMN IF EXISTS "schoolEmail";
ALTER TABLE "User" DROP COLUMN IF EXISTS "schoolEmailVerifiedAt";

-- Pending/verified email verification records: rename the column too.
ALTER TABLE "SchoolEmailVerification"
  RENAME COLUMN "schoolEmail" TO "email";
