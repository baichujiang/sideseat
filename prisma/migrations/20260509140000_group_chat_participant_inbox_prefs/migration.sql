-- AlterTable
ALTER TABLE "GroupChatParticipant" ADD COLUMN "inboxPinnedAt" TIMESTAMP(3),
ADD COLUMN "inboxHiddenAt" TIMESTAMP(3);
