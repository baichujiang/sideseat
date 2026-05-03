-- Message reply + soft delete
ALTER TABLE "Message" ADD COLUMN "replyToId" TEXT;
ALTER TABLE "Message" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "Message_replyToId_idx" ON "Message"("replyToId");
ALTER TABLE "Message"
  ADD CONSTRAINT "Message_replyToId_fkey"
  FOREIGN KEY ("replyToId")
  REFERENCES "Message"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- CourseRoomMessage reply + soft delete
ALTER TABLE "CourseRoomMessage" ADD COLUMN "replyToId" TEXT;
ALTER TABLE "CourseRoomMessage" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "CourseRoomMessage_replyToId_idx" ON "CourseRoomMessage"("replyToId");
ALTER TABLE "CourseRoomMessage"
  ADD CONSTRAINT "CourseRoomMessage_replyToId_fkey"
  FOREIGN KEY ("replyToId")
  REFERENCES "CourseRoomMessage"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- Per-message report pointers (polymorphic).
ALTER TABLE "Report" ADD COLUMN "messageId" TEXT;
ALTER TABLE "Report" ADD COLUMN "courseRoomMessageId" TEXT;
CREATE INDEX "Report_messageId_idx" ON "Report"("messageId");
CREATE INDEX "Report_courseRoomMessageId_idx" ON "Report"("courseRoomMessageId");
ALTER TABLE "Report"
  ADD CONSTRAINT "Report_messageId_fkey"
  FOREIGN KEY ("messageId")
  REFERENCES "Message"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
ALTER TABLE "Report"
  ADD CONSTRAINT "Report_courseRoomMessageId_fkey"
  FOREIGN KEY ("courseRoomMessageId")
  REFERENCES "CourseRoomMessage"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- Push subscription storage. No rows until the service worker wires up.
CREATE TABLE "PushSubscription" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "endpoint"  TEXT NOT NULL,
  "p256dh"    TEXT NOT NULL,
  "auth"      TEXT NOT NULL,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");
ALTER TABLE "PushSubscription"
  ADD CONSTRAINT "PushSubscription_userId_fkey"
  FOREIGN KEY ("userId")
  REFERENCES "User"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
