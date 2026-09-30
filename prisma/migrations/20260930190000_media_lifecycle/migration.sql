CREATE TABLE "MediaDeletionJob" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "store" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaDeletionJob_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MediaDeletionJob_store_check" CHECK ("store" IN ('public', 'chat', 'verification'))
);
CREATE UNIQUE INDEX "MediaDeletionJob_url_key" ON "MediaDeletionJob"("url");
CREATE INDEX "MediaDeletionJob_availableAt_idx" ON "MediaDeletionJob"("availableAt");
CREATE TABLE "MediaSweepState" (
    "store" TEXT NOT NULL,
    "cursor" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MediaSweepState_pkey" PRIMARY KEY ("store")
);
