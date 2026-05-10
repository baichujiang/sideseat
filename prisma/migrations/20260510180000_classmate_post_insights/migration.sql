-- CreateEnum
CREATE TYPE "ClassmatePostInsightKind" AS ENUM ('DETAIL_VIEW', 'MESSAGE_INTENT');

-- CreateTable
CREATE TABLE "ClassmatePostInsight" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "kind" "ClassmatePostInsightKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassmatePostInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClassmatePostInsight_postId_actorId_kind_key" ON "ClassmatePostInsight"("postId", "actorId", "kind");

-- CreateIndex
CREATE INDEX "ClassmatePostInsight_postId_kind_idx" ON "ClassmatePostInsight"("postId", "kind");

-- AddForeignKey
ALTER TABLE "ClassmatePostInsight" ADD CONSTRAINT "ClassmatePostInsight_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ClassmatePost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassmatePostInsight" ADD CONSTRAINT "ClassmatePostInsight_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
