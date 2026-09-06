-- A shared event is an immutable, privacy-filtered snapshot. Importing it
-- creates an independent CalendarEntry and never creates attendee/RSVP state.
CREATE TABLE "EventShareLink" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "sourceEventId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "ownerDisplayLabel" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "location" TEXT,
  "note" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventShareLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventShareLink_tokenHash_key"
  ON "EventShareLink"("tokenHash");

CREATE INDEX "EventShareLink_ownerUserId_createdAt_idx"
  ON "EventShareLink"("ownerUserId", "createdAt");

CREATE INDEX "EventShareLink_expiresAt_idx"
  ON "EventShareLink"("expiresAt");

ALTER TABLE "EventShareLink"
  ADD CONSTRAINT "EventShareLink_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CalendarEntry"
  ADD COLUMN "eventShareLinkId" TEXT;

CREATE UNIQUE INDEX "CalendarEntry_userId_eventShareLinkId_key"
  ON "CalendarEntry"("userId", "eventShareLinkId");

ALTER TABLE "CalendarEntry"
  ADD CONSTRAINT "CalendarEntry_eventShareLinkId_fkey"
  FOREIGN KEY ("eventShareLinkId") REFERENCES "EventShareLink"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
