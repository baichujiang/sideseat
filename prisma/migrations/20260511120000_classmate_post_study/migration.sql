-- CreateEnum
CREATE TYPE "StudyPurpose" AS ENUM ('DAILY_SELF_STUDY', 'EXAM_PREP', 'SPRINT');

CREATE TYPE "StudyTimeSlot" AS ENUM ('MORNING', 'AFTERNOON', 'EVENING');

CREATE TYPE "StudyVenue" AS ENUM ('MAIN_LIBRARY', 'GARCHING_MI_LIBRARY', 'OLYMPIA_PARK_LIBRARY', 'OTHER');

-- CreateTable
CREATE TABLE "ClassmatePostStudy" (
    "postId" TEXT NOT NULL,
    "purposes" "StudyPurpose"[] DEFAULT ARRAY[]::"StudyPurpose"[],
    "timeSlots" "StudyTimeSlot"[] DEFAULT ARRAY[]::"StudyTimeSlot"[],
    "venues" "StudyVenue"[] DEFAULT ARRAY[]::"StudyVenue"[],
    "venueOtherNote" VARCHAR(60),

    CONSTRAINT "ClassmatePostStudy_pkey" PRIMARY KEY ("postId")
);

-- AddForeignKey
ALTER TABLE "ClassmatePostStudy" ADD CONSTRAINT "ClassmatePostStudy_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ClassmatePost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
