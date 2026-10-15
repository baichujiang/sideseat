CREATE TABLE "TimePollGuest" (
  "id" TEXT NOT NULL,
  "pollId" TEXT NOT NULL,
  "credentialHash" TEXT NOT NULL,
  "displayName" VARCHAR(60) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TimePollGuest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TimePollGuest_pollId_credentialHash_key" ON "TimePollGuest"("pollId", "credentialHash");
ALTER TABLE "TimePollGuest" ADD CONSTRAINT "TimePollGuest_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "TimePoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimePollResponse" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "TimePollResponse" ADD COLUMN "guestId" TEXT;
ALTER TABLE "TimePollInvitation" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "TimePollInvitation" ADD COLUMN "guestId" TEXT;
CREATE UNIQUE INDEX "TimePollResponse_pollId_guestId_key" ON "TimePollResponse"("pollId", "guestId");
CREATE UNIQUE INDEX "TimePollInvitation_pollId_guestId_key" ON "TimePollInvitation"("pollId", "guestId");
ALTER TABLE "TimePollResponse" ADD CONSTRAINT "TimePollResponse_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "TimePollGuest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimePollInvitation" ADD CONSTRAINT "TimePollInvitation_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "TimePollGuest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimePollResponse" ADD CONSTRAINT "TimePollResponse_one_identity" CHECK (("userId" IS NOT NULL) <> ("guestId" IS NOT NULL));
ALTER TABLE "TimePollInvitation" ADD CONSTRAINT "TimePollInvitation_one_identity" CHECK (("userId" IS NOT NULL) <> ("guestId" IS NOT NULL));
