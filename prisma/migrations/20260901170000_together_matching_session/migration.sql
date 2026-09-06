-- Add an explicit user-controlled 48-hour Together matching window.
-- No existing intent is enrolled implicitly; a session begins only after POST.

CREATE TABLE "TogetherMatchingSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "matchingUntil" TIMESTAMP(3) NOT NULL,
  "stoppedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TogetherMatchingSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TogetherMatchingSession_window_check" CHECK ("startedAt" < "matchingUntil")
);

CREATE UNIQUE INDEX "TogetherMatchingSession_userId_key"
  ON "TogetherMatchingSession"("userId");

CREATE INDEX "TogetherMatchingSession_matchingUntil_stoppedAt_idx"
  ON "TogetherMatchingSession"("matchingUntil", "stoppedAt");

ALTER TABLE "TogetherMatchingSession"
  ADD CONSTRAINT "TogetherMatchingSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
