-- The two-message gate is only a first-contact safeguard. Once both people
-- have sent a real message, the conversation remains unlocked permanently.
ALTER TABLE "Connection" ADD COLUMN "replyLimitUnlockedAt" TIMESTAMP(3);

UPDATE "Connection" AS connection
SET "replyLimitUnlockedAt" = mutual_reply."unlockedAt"
FROM (
  SELECT
    candidate."connectionId",
    MAX(candidate."createdAt") AS "unlockedAt"
  FROM "Message" AS candidate
  WHERE candidate."type" <> 'SYSTEM'
    AND EXISTS (
      SELECT 1
      FROM "Message" AS peer_message
      WHERE peer_message."connectionId" = candidate."connectionId"
        AND peer_message."type" <> 'SYSTEM'
        AND peer_message."senderId" <> candidate."senderId"
    )
  GROUP BY candidate."connectionId"
) AS mutual_reply
WHERE connection."id" = mutual_reply."connectionId";
