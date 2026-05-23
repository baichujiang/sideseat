-- CreateEnum
CREATE TYPE "CourseExternalSource" AS ENUM ('TUM_NAT', 'LMU_LSF');

-- AlterTable
ALTER TABLE "Course" ADD COLUMN "externalSource" "CourseExternalSource",
ADD COLUMN "externalId" TEXT,
ADD COLUMN "officialScheduleSyncedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CourseOfficialScheduleVariant" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "externalKey" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseOfficialScheduleVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseOfficialScheduleSession" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "weekday" "Weekday" NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "location" TEXT,

    CONSTRAINT "CourseOfficialScheduleSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Course_school_semesterLabel_externalSource_idx" ON "Course"("school", "semesterLabel", "externalSource");

-- CreateIndex
CREATE UNIQUE INDEX "CourseOfficialScheduleVariant_courseId_fingerprint_key" ON "CourseOfficialScheduleVariant"("courseId", "fingerprint");

-- CreateIndex
CREATE INDEX "CourseOfficialScheduleVariant_courseId_idx" ON "CourseOfficialScheduleVariant"("courseId");

-- CreateIndex
CREATE INDEX "CourseOfficialScheduleSession_variantId_idx" ON "CourseOfficialScheduleSession"("variantId");

-- AddForeignKey
ALTER TABLE "CourseOfficialScheduleVariant" ADD CONSTRAINT "CourseOfficialScheduleVariant_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseOfficialScheduleSession" ADD CONSTRAINT "CourseOfficialScheduleSession_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "CourseOfficialScheduleVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
