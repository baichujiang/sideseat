-- Move CourseSession to hang off UserCourse instead of Course so each user
-- has their own copy of the weekly times. Matching still happens via Course
-- (course code / name / semester). Existing session rows are demo-only and
-- can be safely dropped; re-entering them is cheap.

DELETE FROM "CourseSession";

ALTER TABLE "CourseSession" DROP CONSTRAINT IF EXISTS "CourseSession_courseId_fkey";
DROP INDEX IF EXISTS "CourseSession_courseId_idx";
ALTER TABLE "CourseSession" DROP COLUMN "courseId";

ALTER TABLE "CourseSession" ADD COLUMN "userCourseId" TEXT NOT NULL;
ALTER TABLE "CourseSession"
    ADD CONSTRAINT "CourseSession_userCourseId_fkey"
    FOREIGN KEY ("userCourseId") REFERENCES "UserCourse"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "CourseSession_userCourseId_idx" ON "CourseSession"("userCourseId");

-- Course-level location/schedule no longer makes sense now that each user
-- records their own times. Drop them.
ALTER TABLE "Course" DROP COLUMN IF EXISTS "location";
ALTER TABLE "Course" DROP COLUMN IF EXISTS "schedule";
