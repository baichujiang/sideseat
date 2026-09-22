CREATE TABLE "ChatRealtimeRetention" (
    "conversationKind" VARCHAR(16) NOT NULL,
    "conversationId" TEXT NOT NULL,
    "retainedAfterSequence" BIGINT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatRealtimeRetention_pkey"
        PRIMARY KEY ("conversationKind", "conversationId")
);

CREATE INDEX "ChatRealtimeRetention_updatedAt_idx"
ON "ChatRealtimeRetention"("updatedAt");
