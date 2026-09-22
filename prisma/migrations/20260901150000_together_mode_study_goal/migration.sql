-- Add shared-scene intent semantics without changing existing opportunities.
-- Existing rows retain their original same-activity behavior.

CREATE TYPE "TogetherMode" AS ENUM (
  'SAME_ACTIVITY',
  'PARALLEL',
  'EITHER'
);

CREATE TYPE "MutualOpportunityMatchKind" AS ENUM (
  'EXACT_ACTIVITY',
  'SHARED_CONTEXT'
);

CREATE TYPE "MutualOpportunitySharedContext" AS ENUM (
  'PARALLEL_STUDY'
);

ALTER TABLE "WeeklyIntent"
  ADD COLUMN "togetherMode" "TogetherMode" NOT NULL DEFAULT 'SAME_ACTIVITY',
  ADD COLUMN "studyGoal" VARCHAR(80);

ALTER TABLE "MutualOpportunity"
  ADD COLUMN "matchKind" "MutualOpportunityMatchKind" NOT NULL DEFAULT 'EXACT_ACTIVITY',
  ADD COLUMN "sharedContext" "MutualOpportunitySharedContext",
  ADD COLUMN "intentAStudyGoal" VARCHAR(80),
  ADD COLUMN "intentBStudyGoal" VARCHAR(80),
  ADD COLUMN "intentATogetherMode" "TogetherMode" NOT NULL DEFAULT 'SAME_ACTIVITY',
  ADD COLUMN "intentBTogetherMode" "TogetherMode" NOT NULL DEFAULT 'SAME_ACTIVITY';
