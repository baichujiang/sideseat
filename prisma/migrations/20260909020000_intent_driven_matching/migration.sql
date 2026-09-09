-- Explicit publication opts into intention-lifecycle matching. Existing saved
-- intentions keep their legacy session consent; do not enroll them by migration.
ALTER TABLE "WeeklyIntent" ADD COLUMN "automaticMatching" BOOLEAN NOT NULL DEFAULT false;
