CREATE TABLE "ClassmatePostComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parentId" TEXT,
    "body" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassmatePostComment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Report"
ADD COLUMN "classmatePostCommentId" TEXT;

CREATE UNIQUE INDEX "ClassmatePostComment_parentId_key"
ON "ClassmatePostComment"("parentId");

CREATE INDEX "ClassmatePostComment_postId_createdAt_idx"
ON "ClassmatePostComment"("postId", "createdAt");

CREATE INDEX "ClassmatePostComment_userId_createdAt_idx"
ON "ClassmatePostComment"("userId", "createdAt");

CREATE INDEX "Report_classmatePostCommentId_idx"
ON "Report"("classmatePostCommentId");

ALTER TABLE "ClassmatePostComment"
ADD CONSTRAINT "ClassmatePostComment_postId_fkey"
FOREIGN KEY ("postId") REFERENCES "ClassmatePost"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClassmatePostComment"
ADD CONSTRAINT "ClassmatePostComment_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClassmatePostComment"
ADD CONSTRAINT "ClassmatePostComment_parentId_fkey"
FOREIGN KEY ("parentId") REFERENCES "ClassmatePostComment"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Report"
ADD CONSTRAINT "Report_classmatePostCommentId_fkey"
FOREIGN KEY ("classmatePostCommentId") REFERENCES "ClassmatePostComment"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
