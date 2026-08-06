CREATE TABLE "ChatRealtimeEvent" (
    "sequence" BIGSERIAL NOT NULL,
    "conversationKind" VARCHAR(16) NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "eventType" VARCHAR(16) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatRealtimeEvent_pkey" PRIMARY KEY ("sequence")
);

CREATE INDEX "ChatRealtimeEvent_conversationKind_conversationId_sequence_idx"
ON "ChatRealtimeEvent"("conversationKind", "conversationId", "sequence");

CREATE INDEX "ChatRealtimeEvent_occurredAt_idx"
ON "ChatRealtimeEvent"("occurredAt");

-- Backfill a stable high-water mark for conversations that already contain
-- messages when this migration is deployed. Message bodies are never copied.
INSERT INTO "ChatRealtimeEvent" (
    "conversationKind",
    "conversationId",
    "messageId",
    "eventType",
    "occurredAt"
)
SELECT 'DIRECT', "connectionId", "id", 'UPSERT', "createdAt"
FROM "Message"
ORDER BY "createdAt", "id";

INSERT INTO "ChatRealtimeEvent" (
    "conversationKind",
    "conversationId",
    "messageId",
    "eventType",
    "occurredAt"
)
SELECT 'COURSE', "courseId", "id", 'UPSERT', "createdAt"
FROM "CourseRoomMessage"
ORDER BY "createdAt", "id";

INSERT INTO "ChatRealtimeEvent" (
    "conversationKind",
    "conversationId",
    "messageId",
    "eventType",
    "occurredAt"
)
SELECT 'GROUP', "groupChatId", "id", 'UPSERT', "createdAt"
FROM "GroupChatMessage"
ORDER BY "createdAt", "id";

CREATE OR REPLACE FUNCTION "append_direct_chat_realtime_event"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO "ChatRealtimeEvent" (
            "conversationKind", "conversationId", "messageId", "eventType"
        ) VALUES ('DIRECT', OLD."connectionId", OLD."id", 'REMOVE');
        RETURN OLD;
    END IF;

    INSERT INTO "ChatRealtimeEvent" (
        "conversationKind", "conversationId", "messageId", "eventType"
    ) VALUES ('DIRECT', NEW."connectionId", NEW."id", 'UPSERT');
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
            "conversationKind", "conversationId", "messageId", "eventType"
        ) VALUES ('COURSE', OLD."courseId", OLD."id", 'REMOVE');
        RETURN OLD;
    END IF;

    INSERT INTO "ChatRealtimeEvent" (
        "conversationKind", "conversationId", "messageId", "eventType"
    ) VALUES ('COURSE', NEW."courseId", NEW."id", 'UPSERT');
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
            "conversationKind", "conversationId", "messageId", "eventType"
        ) VALUES ('GROUP', OLD."groupChatId", OLD."id", 'REMOVE');
        RETURN OLD;
    END IF;

    INSERT INTO "ChatRealtimeEvent" (
        "conversationKind", "conversationId", "messageId", "eventType"
    ) VALUES ('GROUP', NEW."groupChatId", NEW."id", 'UPSERT');
    RETURN NEW;
END;
$$;

CREATE TRIGGER "Message_chat_realtime_event"
AFTER INSERT OR UPDATE OR DELETE ON "Message"
FOR EACH ROW EXECUTE FUNCTION "append_direct_chat_realtime_event"();

CREATE TRIGGER "CourseRoomMessage_chat_realtime_event"
AFTER INSERT OR UPDATE OR DELETE ON "CourseRoomMessage"
FOR EACH ROW EXECUTE FUNCTION "append_course_chat_realtime_event"();

CREATE TRIGGER "GroupChatMessage_chat_realtime_event"
AFTER INSERT OR UPDATE OR DELETE ON "GroupChatMessage"
FOR EACH ROW EXECUTE FUNCTION "append_group_chat_realtime_event"();
