-- SideSeat calendar subscription links are read-only bearer credentials.
-- Persist only their SHA-256 hashes so database reads cannot recover URLs.
CREATE TABLE "CalendarSubscriptionLink" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "lastAccessedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarSubscriptionLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CalendarSubscriptionLink_tokenHash_key"
ON "CalendarSubscriptionLink"("tokenHash");

CREATE INDEX "CalendarSubscriptionLink_ownerUserId_revokedAt_createdAt_idx"
ON "CalendarSubscriptionLink"("ownerUserId", "revokedAt", "createdAt");

ALTER TABLE "CalendarSubscriptionLink"
ADD CONSTRAINT "CalendarSubscriptionLink_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
