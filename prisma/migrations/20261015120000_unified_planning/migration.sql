ALTER TABLE "TimePoll"
 ADD COLUMN "location" TEXT,
 ADD COLUMN "durationMinutes" INTEGER,
 ADD COLUMN "expectedCount" INTEGER,
 ADD COLUMN "planningMode" TEXT NOT NULL DEFAULT 'COLLECT',
 ADD COLUMN "phase" TEXT NOT NULL DEFAULT 'COLLECTING',
 ADD COLUMN "invitationVersion" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "chosenStart" TIMESTAMP(3),
 ADD COLUMN "chosenEnd" TIMESTAMP(3),
 ADD COLUMN "confirmedAt" TIMESTAMP(3),
 ADD COLUMN "canceledAt" TIMESTAMP(3);
CREATE TABLE "TimePollInvitation" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "pollId" TEXT NOT NULL REFERENCES "TimePoll"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "displayName" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'INVITED',
 "version" INTEGER NOT NULL,
 "selected" BOOLEAN NOT NULL DEFAULT true,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "TimePollInvitation_pollId_userId_key" ON "TimePollInvitation"("pollId", "userId");
CREATE INDEX "TimePollInvitation_userId_updatedAt_idx" ON "TimePollInvitation"("userId", "updatedAt");
ALTER TABLE "CalendarEntry" ADD COLUMN "timePollId" TEXT;
ALTER TABLE "CalendarEntry" ADD CONSTRAINT "CalendarEntry_timePollId_fkey" FOREIGN KEY ("timePollId") REFERENCES "TimePoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "CalendarEntry_userId_timePollId_key" ON "CalendarEntry"("userId", "timePollId");
