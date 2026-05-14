-- Optional images on classmate Discover posts (max 3 per post via sortOrder 0..2).

CREATE TABLE "ClassmatePostImage" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassmatePostImage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClassmatePostImage_postId_sortOrder_key" ON "ClassmatePostImage"("postId", "sortOrder");

CREATE INDEX "ClassmatePostImage_postId_idx" ON "ClassmatePostImage"("postId");

ALTER TABLE "ClassmatePostImage" ADD CONSTRAINT "ClassmatePostImage_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ClassmatePost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
