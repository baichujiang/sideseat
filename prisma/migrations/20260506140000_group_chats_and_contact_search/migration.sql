CREATE TABLE "GroupChat" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(80),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupChat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GroupChatParticipant" (
    "groupChatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadAt" TIMESTAMP(3),

    CONSTRAINT "GroupChatParticipant_pkey" PRIMARY KEY ("groupChatId","userId")
);

CREATE TABLE "GroupChatMessage" (
    "id" TEXT NOT NULL,
    "groupChatId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GroupChat_updatedAt_idx" ON "GroupChat"("updatedAt");
CREATE INDEX "GroupChat_createdById_createdAt_idx" ON "GroupChat"("createdById", "createdAt");
CREATE INDEX "GroupChatParticipant_userId_joinedAt_idx" ON "GroupChatParticipant"("userId", "joinedAt");
CREATE INDEX "GroupChatMessage_groupChatId_createdAt_idx" ON "GroupChatMessage"("groupChatId", "createdAt");
CREATE INDEX "GroupChatMessage_senderId_createdAt_idx" ON "GroupChatMessage"("senderId", "createdAt");

ALTER TABLE "GroupChat"
ADD CONSTRAINT "GroupChat_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupChatParticipant"
ADD CONSTRAINT "GroupChatParticipant_groupChatId_fkey"
FOREIGN KEY ("groupChatId") REFERENCES "GroupChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupChatParticipant"
ADD CONSTRAINT "GroupChatParticipant_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupChatMessage"
ADD CONSTRAINT "GroupChatMessage_groupChatId_fkey"
FOREIGN KEY ("groupChatId") REFERENCES "GroupChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupChatMessage"
ADD CONSTRAINT "GroupChatMessage_senderId_fkey"
FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
