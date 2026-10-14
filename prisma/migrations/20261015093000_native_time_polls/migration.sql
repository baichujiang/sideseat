-- CreateTable
CREATE TABLE "TimePoll" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL,
    "dates" TEXT[],
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "slots" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimePoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimePollResponse" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "slotIds" INTEGER[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimePollResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TimePoll_token_key" ON "TimePoll"("token");

-- CreateIndex
CREATE INDEX "TimePoll_creatorId_updatedAt_idx" ON "TimePoll"("creatorId", "updatedAt");

-- CreateIndex
CREATE INDEX "TimePollResponse_userId_updatedAt_idx" ON "TimePollResponse"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TimePollResponse_pollId_userId_key" ON "TimePollResponse"("pollId", "userId");

-- AddForeignKey
ALTER TABLE "TimePoll" ADD CONSTRAINT "TimePoll_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimePollResponse" ADD CONSTRAINT "TimePollResponse_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "TimePoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimePollResponse" ADD CONSTRAINT "TimePollResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

