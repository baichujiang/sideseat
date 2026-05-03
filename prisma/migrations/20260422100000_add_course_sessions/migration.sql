-- Add structured course sessions so we can render a weekly calendar
-- and compute schedule overlap between users.

CREATE TYPE "Weekday" AS ENUM ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN');

CREATE TABLE "CourseSession" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "weekday" "Weekday" NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CourseSession_courseId_idx" ON "CourseSession"("courseId");
CREATE INDEX "CourseSession_weekday_startMinute_idx" ON "CourseSession"("weekday", "startMinute");

ALTER TABLE "CourseSession"
    ADD CONSTRAINT "CourseSession_courseId_fkey" FOREIGN KEY ("courseId")
    REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
