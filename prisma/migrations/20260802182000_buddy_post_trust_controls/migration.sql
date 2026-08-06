CREATE TYPE "ClassmatePostVisibility" AS ENUM (
  'SCHOOL_ONLY',
  'CITY_INTERNATIONALS',
  'VERIFIED_ONLY',
  'COURSEMATES_ONLY'
);

CREATE TYPE "ClassmatePostReplyPreference" AS ENUM (
  'DIRECT_MESSAGE',
  'REQUEST_FIRST',
  'VERIFIED_ONLY'
);

ALTER TABLE "ClassmatePost"
  ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "visibility" "ClassmatePostVisibility" NOT NULL DEFAULT 'SCHOOL_ONLY',
  ADD COLUMN "replyPreference" "ClassmatePostReplyPreference" NOT NULL DEFAULT 'REQUEST_FIRST';

CREATE INDEX "ClassmatePost_visibility_status_city_createdAt_idx"
  ON "ClassmatePost"("visibility", "status", "city", "createdAt");
