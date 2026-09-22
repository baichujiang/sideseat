ALTER TABLE "ChatRealtimeEvent" ADD COLUMN "senderId" TEXT;

UPDATE "ChatRealtimeEvent" AS event
SET "senderId" = message."senderId"
FROM "Message" AS message
WHERE event."conversationKind" = 'DIRECT'
  AND event."messageId" = message."id";

UPDATE "ChatRealtimeEvent" AS event
SET "senderId" = message."senderId"
FROM "CourseRoomMessage" AS message
WHERE event."conversationKind" = 'COURSE'
  AND event."messageId" = message."id";

UPDATE "ChatRealtimeEvent" AS event
SET "senderId" = message."senderId"
FROM "GroupChatMessage" AS message
WHERE event."conversationKind" = 'GROUP'
  AND event."messageId" = message."id";

CREATE INDEX "ChatRealtimeEvent_senderId_occurredAt_idx"
ON "ChatRealtimeEvent"("senderId", "occurredAt");

CREATE OR REPLACE FUNCTION "append_direct_chat_realtime_event"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO "ChatRealtimeEvent" (
            "conversationKind", "conversationId", "messageId", "senderId", "eventType"
        ) VALUES ('DIRECT', OLD."connectionId", OLD."id", OLD."senderId", 'REMOVE');
        RETURN OLD;
    END IF;

    INSERT INTO "ChatRealtimeEvent" (
        "conversationKind", "conversationId", "messageId", "senderId", "eventType"
    ) VALUES ('DIRECT', NEW."connectionId", NEW."id", NEW."senderId", 'UPSERT');
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "append_course_chat_realtime_event"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO "ChatRealtimeEvent" (
            "conversationKind", "conversationId", "messageId", "senderId", "eventType"
        ) VALUES ('COURSE', OLD."courseId", OLD."id", OLD."senderId", 'REMOVE');
        RETURN OLD;
    END IF;

    INSERT INTO "ChatRealtimeEvent" (
        "conversationKind", "conversationId", "messageId", "senderId", "eventType"
    ) VALUES ('COURSE', NEW."courseId", NEW."id", NEW."senderId", 'UPSERT');
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "append_group_chat_realtime_event"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO "ChatRealtimeEvent" (
            "conversationKind", "conversationId", "messageId", "senderId", "eventType"
        ) VALUES ('GROUP', OLD."groupChatId", OLD."id", OLD."senderId", 'REMOVE');
        RETURN OLD;
    END IF;

    INSERT INTO "ChatRealtimeEvent" (
        "conversationKind", "conversationId", "messageId", "senderId", "eventType"
    ) VALUES ('GROUP', NEW."groupChatId", NEW."id", NEW."senderId", 'UPSERT');
    RETURN NEW;
END;
$$;
