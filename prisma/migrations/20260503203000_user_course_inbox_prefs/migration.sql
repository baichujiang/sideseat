-- Per-user course chat row in Contacts: pin order + hide from inbox without unenrolling.
ALTER TABLE "UserCourse" ADD COLUMN "inboxPinnedAt" TIMESTAMP(3);
ALTER TABLE "UserCourse" ADD COLUMN "inboxHiddenAt" TIMESTAMP(3);
