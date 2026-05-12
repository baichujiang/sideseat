-- CreateEnum
CREATE TYPE "MealVenueTag" AS ENUM (
    'MAIN_CAMPUS_MENSA',
    'GARCHING_MENSA',
    'GARCHING_CAFE',
    'LEOPOLDSTRASSE_MENSA',
    'LOTHSTRASSE_MENSA',
    'MARTINSRIED_MENSA',
    'WEIHENSTEPHAN_MENSA',
    'OUTSIDE',
    'OTHER'
);

-- CreateTable
CREATE TABLE "ClassmatePostMeals" (
    "postId" TEXT NOT NULL,
    "venueTags" "MealVenueTag"[] DEFAULT ARRAY[]::"MealVenueTag"[],
    "venueOtherNote" VARCHAR(60),

    CONSTRAINT "ClassmatePostMeals_pkey" PRIMARY KEY ("postId")
);

-- AddForeignKey
ALTER TABLE "ClassmatePostMeals" ADD CONSTRAINT "ClassmatePostMeals_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ClassmatePost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
