DROP INDEX IF EXISTS "Message_connectionId_createdAt_idx";

CREATE INDEX "Message_connectionId_createdAt_id_idx"
ON "Message"("connectionId", "createdAt", "id");
