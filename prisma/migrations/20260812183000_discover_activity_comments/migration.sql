CREATE TABLE "DiscoverActivityComment" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parentId" TEXT,
    "body" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscoverActivityComment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Report"
ADD COLUMN "discoverActivityCommentId" TEXT;

CREATE UNIQUE INDEX "DiscoverActivityComment_parentId_key"
ON "DiscoverActivityComment"("parentId");

CREATE INDEX "DiscoverActivityComment_activityId_createdAt_idx"
ON "DiscoverActivityComment"("activityId", "createdAt");

CREATE INDEX "DiscoverActivityComment_userId_createdAt_idx"
ON "DiscoverActivityComment"("userId", "createdAt");

CREATE INDEX "Report_discoverActivityCommentId_idx"
ON "Report"("discoverActivityCommentId");

ALTER TABLE "DiscoverActivityComment"
ADD CONSTRAINT "DiscoverActivityComment_activityId_fkey"
FOREIGN KEY ("activityId") REFERENCES "DiscoverActivity"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DiscoverActivityComment"
ADD CONSTRAINT "DiscoverActivityComment_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DiscoverActivityComment"
ADD CONSTRAINT "DiscoverActivityComment_parentId_fkey"
FOREIGN KEY ("parentId") REFERENCES "DiscoverActivityComment"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Report"
ADD CONSTRAINT "Report_discoverActivityCommentId_fkey"
FOREIGN KEY ("discoverActivityCommentId") REFERENCES "DiscoverActivityComment"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
