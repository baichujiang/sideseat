-- CreateEnum
CREATE TYPE "SportTag" AS ENUM (
    'BASKETBALL',
    'BADMINTON',
    'TABLE_TENNIS',
    'FOOTBALL',
    'VOLLEYBALL',
    'TENNIS',
    'GYM',
    'RUNNING',
    'HIKING',
    'CYCLING',
    'SWIMMING',
    'SKIING',
    'CLIMBING',
    'YOGA',
    'OTHER'
);

-- CreateTable
CREATE TABLE "ClassmatePostSport" (
    "postId" TEXT NOT NULL,
    "sportTags" "SportTag"[] DEFAULT ARRAY[]::"SportTag"[],
    "sportOtherNote" VARCHAR(60),

    CONSTRAINT "ClassmatePostSport_pkey" PRIMARY KEY ("postId")
);

-- AddForeignKey
ALTER TABLE "ClassmatePostSport" ADD CONSTRAINT "ClassmatePostSport_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ClassmatePost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
