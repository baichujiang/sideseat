-- CreateEnum
CREATE TYPE "DiscoverActivityCategory" AS ENUM ('STUDY_GROUP', 'SOCIAL', 'SPORTS', 'FOOD', 'CAMPUS_EVENT', 'OTHER');

-- CreateEnum
CREATE TYPE "DiscoverActivityStatus" AS ENUM ('OPEN', 'FULL', 'CLOSED', 'CANCELED');

-- CreateEnum
CREATE TYPE "DiscoverActivitySignupStatus" AS ENUM ('GOING', 'CANCELED');

-- CreateTable
CREATE TABLE "DiscoverActivity" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "school" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "category" "DiscoverActivityCategory" NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "location" VARCHAR(120) NOT NULL,
    "capacity" INTEGER,
    "status" "DiscoverActivityStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscoverActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoverActivitySignup" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "DiscoverActivitySignupStatus" NOT NULL DEFAULT 'GOING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "canceledAt" TIMESTAMP(3),

    CONSTRAINT "DiscoverActivitySignup_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "CalendarEntry" ADD COLUMN "discoverActivityId" TEXT;

-- CreateIndex
CREATE INDEX "DiscoverActivity_city_status_startAt_idx" ON "DiscoverActivity"("city", "status", "startAt");

-- CreateIndex
CREATE INDEX "DiscoverActivity_organizerId_status_idx" ON "DiscoverActivity"("organizerId", "status");

-- CreateIndex
CREATE INDEX "DiscoverActivitySignup_activityId_status_idx" ON "DiscoverActivitySignup"("activityId", "status");

-- CreateIndex
CREATE INDEX "DiscoverActivitySignup_userId_createdAt_idx" ON "DiscoverActivitySignup"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DiscoverActivitySignup_activityId_userId_key" ON "DiscoverActivitySignup"("activityId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEntry_userId_discoverActivityId_key" ON "CalendarEntry"("userId", "discoverActivityId");

-- AddForeignKey
ALTER TABLE "DiscoverActivity" ADD CONSTRAINT "DiscoverActivity_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoverActivitySignup" ADD CONSTRAINT "DiscoverActivitySignup_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "DiscoverActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoverActivitySignup" ADD CONSTRAINT "DiscoverActivitySignup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEntry" ADD CONSTRAINT "CalendarEntry_discoverActivityId_fkey" FOREIGN KEY ("discoverActivityId") REFERENCES "DiscoverActivity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
