ALTER TABLE "Report"
ADD COLUMN "groupChatMessageId" TEXT,
ADD COLUMN "classmatePostId" TEXT;

ALTER TABLE "GroupChatMessage"
ADD COLUMN "replyToId" TEXT;

CREATE INDEX "Report_groupChatMessageId_idx" ON "Report"("groupChatMessageId");
CREATE INDEX "Report_classmatePostId_idx" ON "Report"("classmatePostId");
CREATE INDEX "GroupChatMessage_replyToId_idx" ON "GroupChatMessage"("replyToId");

ALTER TABLE "Report"
ADD CONSTRAINT "Report_groupChatMessageId_fkey"
FOREIGN KEY ("groupChatMessageId") REFERENCES "GroupChatMessage"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Report"
ADD CONSTRAINT "Report_classmatePostId_fkey"
FOREIGN KEY ("classmatePostId") REFERENCES "ClassmatePost"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GroupChatMessage"
ADD CONSTRAINT "GroupChatMessage_replyToId_fkey"
FOREIGN KEY ("replyToId") REFERENCES "GroupChatMessage"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
