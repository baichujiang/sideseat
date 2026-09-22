CREATE TYPE "StudentVerificationMethod" AS ENUM ('SCHOOL_EMAIL', 'MANUAL_DOCUMENT');

ALTER TABLE "User"
ADD COLUMN "studentVerificationMethod" "StudentVerificationMethod",
ADD COLUMN "studentVerifiedAt" TIMESTAMP(3);

ALTER TABLE "UserSchoolVerification"
ADD COLUMN "studentVerificationMethod" "StudentVerificationMethod",
ADD COLUMN "studentVerifiedAt" TIMESTAMP(3);

UPDATE "User"
SET
  "studentVerificationMethod" = CASE
    WHEN "emailVerifiedAt" IS NOT NULL THEN 'SCHOOL_EMAIL'::"StudentVerificationMethod"
    ELSE 'MANUAL_DOCUMENT'::"StudentVerificationMethod"
  END,
  "studentVerifiedAt" = COALESCE("emailVerifiedAt", "updatedAt")
WHERE "studentVerificationStatus" = 'VERIFIED';

UPDATE "UserSchoolVerification" state
SET
  "studentVerificationMethod" = CASE
    WHEN state."emailVerifiedAt" IS NOT NULL THEN 'SCHOOL_EMAIL'::"StudentVerificationMethod"
    ELSE 'MANUAL_DOCUMENT'::"StudentVerificationMethod"
  END,
  "studentVerifiedAt" = COALESCE(state."emailVerifiedAt", state."updatedAt")
WHERE state."studentVerificationStatus" = 'VERIFIED';
