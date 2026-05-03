CREATE TYPE "ActivityType" AS ENUM (
  'STUDY_SESSION',
  'LUNCH',
  'MEETUP',
  'GO_TO_CLASS'
);

ALTER TABLE "StudySessionProposal"
ADD COLUMN "activityType" "ActivityType" NOT NULL DEFAULT 'STUDY_SESSION';
