CREATE TYPE "ClassmatePostClosureReason" AS ENUM ('AUTHOR_CLOSED', 'SCHOOL_CHANGED');

ALTER TABLE "ClassmatePost"
ADD COLUMN "closureReason" "ClassmatePostClosureReason",
ADD COLUMN "closedAt" TIMESTAMP(3);
