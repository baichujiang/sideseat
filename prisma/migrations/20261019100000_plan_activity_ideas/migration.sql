-- AlterTable
ALTER TABLE "TimePoll" ADD COLUMN     "activityChosenAt" TIMESTAMP(3),
ADD COLUMN     "activitySelectedId" TEXT,
ADD COLUMN     "activityTopic" TEXT;

-- CreateTable
CREATE TABLE "TimePollActivityIdea" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "userId" TEXT,
    "guestId" TEXT,
    "displayName" VARCHAR(60) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "location" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimePollActivityIdea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimePollActivityInterest" (
    "id" TEXT NOT NULL,
    "ideaId" TEXT NOT NULL,
    "userId" TEXT,
    "guestId" TEXT,
    "displayName" VARCHAR(60) NOT NULL,

    CONSTRAINT "TimePollActivityInterest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimePollActivityIdea_pollId_createdAt_idx" ON "TimePollActivityIdea"("pollId", "createdAt");

-- CreateIndex
CREATE INDEX "TimePollActivityIdea_userId_idx" ON "TimePollActivityIdea"("userId");

-- CreateIndex
CREATE INDEX "TimePollActivityIdea_guestId_idx" ON "TimePollActivityIdea"("guestId");

-- CreateIndex
CREATE INDEX "TimePollActivityInterest_userId_idx" ON "TimePollActivityInterest"("userId");

-- CreateIndex
CREATE INDEX "TimePollActivityInterest_guestId_idx" ON "TimePollActivityInterest"("guestId");

-- CreateIndex
CREATE UNIQUE INDEX "TimePollActivityInterest_ideaId_userId_key" ON "TimePollActivityInterest"("ideaId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TimePollActivityInterest_ideaId_guestId_key" ON "TimePollActivityInterest"("ideaId", "guestId");

-- AddForeignKey
ALTER TABLE "TimePollActivityIdea" ADD CONSTRAINT "TimePollActivityIdea_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "TimePoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimePollActivityIdea" ADD CONSTRAINT "TimePollActivityIdea_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimePollActivityIdea" ADD CONSTRAINT "TimePollActivityIdea_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "TimePollGuest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimePollActivityInterest" ADD CONSTRAINT "TimePollActivityInterest_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "TimePollActivityIdea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimePollActivityInterest" ADD CONSTRAINT "TimePollActivityInterest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimePollActivityInterest" ADD CONSTRAINT "TimePollActivityInterest_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "TimePollGuest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

