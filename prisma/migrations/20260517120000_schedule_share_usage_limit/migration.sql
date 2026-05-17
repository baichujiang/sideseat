-- CreateEnum
CREATE TYPE "ScheduleShareUsageLimit" AS ENUM ('SINGLE_USE', 'UNLIMITED');

-- AlterTable
ALTER TABLE "ScheduleShareLink"
ADD COLUMN "usageLimit" "ScheduleShareUsageLimit" NOT NULL DEFAULT 'UNLIMITED',
ADD COLUMN "consumedAt" TIMESTAMP(3),
ADD COLUMN "consumedByUserId" TEXT;
