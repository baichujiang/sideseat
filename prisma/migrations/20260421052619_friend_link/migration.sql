-- CreateEnum
CREATE TYPE "FriendLinkStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateTable
CREATE TABLE "FriendLink" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "responderId" TEXT NOT NULL,
    "status" "FriendLinkStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FriendLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FriendLink_connectionId_key" ON "FriendLink"("connectionId");

-- CreateIndex
CREATE INDEX "FriendLink_responderId_status_idx" ON "FriendLink"("responderId", "status");

-- CreateIndex
CREATE INDEX "FriendLink_requesterId_status_idx" ON "FriendLink"("requesterId", "status");

-- AddForeignKey
ALTER TABLE "FriendLink" ADD CONSTRAINT "FriendLink_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "Connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendLink" ADD CONSTRAINT "FriendLink_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendLink" ADD CONSTRAINT "FriendLink_responderId_fkey" FOREIGN KEY ("responderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
