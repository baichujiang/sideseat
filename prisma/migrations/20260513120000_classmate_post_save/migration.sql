-- Saved Discover posts (per-user bookmarks).

CREATE TABLE "ClassmatePostSave" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "classmatePostId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassmatePostSave_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClassmatePostSave_userId_classmatePostId_key" ON "ClassmatePostSave"("userId", "classmatePostId");

CREATE INDEX "ClassmatePostSave_userId_createdAt_idx" ON "ClassmatePostSave"("userId", "createdAt");

ALTER TABLE "ClassmatePostSave" ADD CONSTRAINT "ClassmatePostSave_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClassmatePostSave" ADD CONSTRAINT "ClassmatePostSave_classmatePostId_fkey" FOREIGN KEY ("classmatePostId") REFERENCES "ClassmatePost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
