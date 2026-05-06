ALTER TABLE "SchoolEmailVerification"
ADD COLUMN "school" TEXT NOT NULL DEFAULT 'TUM';

UPDATE "SchoolEmailVerification" sev
SET "school" = COALESCE(u."school", 'TUM')
FROM "User" u
WHERE u."id" = sev."userId";

CREATE INDEX "SchoolEmailVerification_userId_school_status_idx"
ON "SchoolEmailVerification"("userId", "school", "status");

CREATE TABLE "UserSchoolVerification" (
    "userId" TEXT NOT NULL,
    "school" TEXT NOT NULL,
    "email" TEXT,
    "verifiedStudent" BOOLEAN NOT NULL DEFAULT false,
    "studentVerificationStatus" "StudentVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "emailVerifiedAt" TIMESTAMP(3),
    "studentVerificationNotes" TEXT,
    "manualReviewProofUrl" TEXT,
    "manualReviewProofFilename" TEXT,
    "manualReviewRequestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSchoolVerification_pkey" PRIMARY KEY ("userId","school")
);

CREATE INDEX "UserSchoolVerification_school_studentVerificationStatus_idx"
ON "UserSchoolVerification"("school", "studentVerificationStatus");

ALTER TABLE "UserSchoolVerification"
ADD CONSTRAINT "UserSchoolVerification_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "UserSchoolVerification" (
    "userId",
    "school",
    "email",
    "verifiedStudent",
    "studentVerificationStatus",
    "emailVerifiedAt",
    "studentVerificationNotes",
    "manualReviewProofUrl",
    "manualReviewProofFilename",
    "manualReviewRequestedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    "id" AS "userId",
    COALESCE("school", 'TUM') AS "school",
    "email",
    "verifiedStudent",
    "studentVerificationStatus",
    "emailVerifiedAt",
    "studentVerificationNotes",
    "manualReviewProofUrl",
    "manualReviewProofFilename",
    "manualReviewRequestedAt",
    "createdAt",
    "updatedAt"
FROM "User"
WHERE "school" IS NOT NULL
   OR "email" IS NOT NULL
   OR "verifiedStudent" = true
   OR "studentVerificationStatus" <> 'UNVERIFIED'
   OR "studentVerificationNotes" IS NOT NULL
   OR "manualReviewProofUrl" IS NOT NULL
   OR "manualReviewProofFilename" IS NOT NULL
   OR "manualReviewRequestedAt" IS NOT NULL;
