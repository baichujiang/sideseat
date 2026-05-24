-- Profile life photos (生活照)
CREATE TABLE "UserLifePhoto" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserLifePhoto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserLifePhoto_userId_sortOrder_key" ON "UserLifePhoto"("userId", "sortOrder");

CREATE INDEX "UserLifePhoto_userId_idx" ON "UserLifePhoto"("userId");

ALTER TABLE "UserLifePhoto" ADD CONSTRAINT "UserLifePhoto_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
