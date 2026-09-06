-- BL-DB-04: conservatively repair canonical Connections and source cards, then
-- install the database invariants required by creator-gated coordination.
--
-- This migration deliberately refuses ambiguous history. The preflight runs
-- before any persistent UPDATE/DELETE and aborts the whole transaction when a
-- duplicate pair contains conflicting single-value semantics.

BEGIN;

-- Activation history cannot be reconstructed safely. Refuse invalid rows
-- instead of guessing the first content type or terminal timestamps.
DO $preflight_activation$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ActionInterestActivation"
    WHERE ("connectedAt" IS NULL) <> ("firstContentType" IS NULL)
       OR ("connectedAt" IS NOT NULL AND "terminalReason" IS NOT NULL)
       OR ("terminalReason" IS NULL) <> ("terminalAt" IS NULL)
  ) THEN
    RAISE EXCEPTION
      'BL-DB-04 preflight failed: invalid ActionInterestActivation terminal state';
  END IF;
END
$preflight_activation$;

-- Duplicate Connection history is auto-repairable only when every semantic
-- single-value field agrees. Private A/B remarks are compared after rotating
-- them to the actual user id, never by physical A/B column position.
DO $preflight_connections$
BEGIN
  IF EXISTS (
    WITH duplicate_pairs AS (
      SELECT
        LEAST("userAId", "userBId") AS low_user_id,
        GREATEST("userAId", "userBId") AS high_user_id
      FROM "Connection"
      GROUP BY 1, 2
      HAVING COUNT(*) > 1
    ), grouped AS (
      SELECT
        pair.low_user_id,
        pair.high_user_id,
        COUNT(DISTINCT connection."status") AS status_count,
        COUNT(DISTINCT jsonb_build_array(
          connection."endedAt",
          connection."endedById"
        )) AS terminal_metadata_count,
        COUNT(DISTINCT connection."invitationId")
          FILTER (WHERE connection."invitationId" IS NOT NULL) AS invitation_count,
        COUNT(DISTINCT connection."originCourseId")
          FILTER (WHERE connection."originCourseId" IS NOT NULL) AS course_count
      FROM duplicate_pairs pair
      JOIN "Connection" connection
        ON LEAST(connection."userAId", connection."userBId") = pair.low_user_id
       AND GREATEST(connection."userAId", connection."userBId") = pair.high_user_id
      GROUP BY pair.low_user_id, pair.high_user_id
    )
    SELECT 1
    FROM grouped
    WHERE status_count > 1
       OR terminal_metadata_count > 1
       OR invitation_count > 1
       OR course_count > 1
  ) THEN
    RAISE EXCEPTION
      'BL-DB-04 preflight failed: duplicate Connection pair has conflicting status, terminal metadata, invitation, or course';
  END IF;

  IF EXISTS (
    WITH duplicate_pairs AS (
      SELECT
        LEAST("userAId", "userBId") AS low_user_id,
        GREATEST("userAId", "userBId") AS high_user_id
      FROM "Connection"
      GROUP BY 1, 2
      HAVING COUNT(*) > 1
    ), participant_remarks AS (
      SELECT
        pair.low_user_id,
        pair.high_user_id,
        private_field.user_id,
        NULLIF(BTRIM(private_field.remark), '') AS remark
      FROM duplicate_pairs pair
      JOIN "Connection" connection
        ON LEAST(connection."userAId", connection."userBId") = pair.low_user_id
       AND GREATEST(connection."userAId", connection."userBId") = pair.high_user_id
      CROSS JOIN LATERAL (
        VALUES
          (connection."userAId", connection."contactRemarkByA"),
          (connection."userBId", connection."contactRemarkByB")
      ) AS private_field(user_id, remark)
    )
    SELECT 1
    FROM participant_remarks
    WHERE remark IS NOT NULL
    GROUP BY low_user_id, high_user_id, user_id
    HAVING COUNT(DISTINCT remark) > 1
  ) THEN
    RAISE EXCEPTION
      'BL-DB-04 preflight failed: duplicate Connection pair has conflicting per-user remarks';
  END IF;

  IF EXISTS (
    WITH duplicate_pairs AS (
      SELECT
        LEAST("userAId", "userBId") AS low_user_id,
        GREATEST("userAId", "userBId") AS high_user_id
      FROM "Connection"
      GROUP BY 1, 2
      HAVING COUNT(*) > 1
    )
    SELECT 1
    FROM duplicate_pairs pair
    JOIN "Connection" connection
      ON LEAST(connection."userAId", connection."userBId") = pair.low_user_id
     AND GREATEST(connection."userAId", connection."userBId") = pair.high_user_id
    JOIN "FriendLink" friend ON friend."connectionId" = connection."id"
    GROUP BY pair.low_user_id, pair.high_user_id
    HAVING COUNT(DISTINCT jsonb_build_array(
      friend."requesterId",
      friend."responderId",
      friend."status"
    )) > 1
  ) THEN
    RAISE EXCEPTION
      'BL-DB-04 preflight failed: duplicate Connection pair has conflicting FriendLink semantics';
  END IF;
END
$preflight_connections$;

-- Build the would-be survivor map before source-card preflight. This is a
-- transaction-local planning relation only: no persistent row has been
-- mutated yet. Source attribution is compared after normalizing every current
-- Connection id through this map, so opposite-orientation duplicates are safe
-- while a genuinely different participant pair aborts the migration.
CREATE TEMP TABLE "_bl_db04_connection_map" ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    connection."id" AS connection_id,
    FIRST_VALUE(connection."id") OVER (
      PARTITION BY
        LEAST(connection."userAId", connection."userBId"),
        GREATEST(connection."userAId", connection."userBId")
      ORDER BY connection."createdAt" ASC, connection."id" ASC
    ) AS survivor_id
  FROM "Connection" connection
)
SELECT connection_id, survivor_id
FROM ranked;

CREATE UNIQUE INDEX "_bl_db04_connection_map_connection_key"
  ON "_bl_db04_connection_map"(connection_id);
CREATE INDEX "_bl_db04_connection_map_survivor_idx"
  ON "_bl_db04_connection_map"(survivor_id);

-- A source card may carry one or both attribution columns, but when it carries
-- both they must name the same Interest. One Interest also cannot be associated
-- with multiple Context ids (or vice versa) through source-card history. The
-- effective Interest's unique Context is authoritative even when the Message
-- does not carry actionContextId. At least one of Interest/Context must provide
-- a provable Connection, and every non-null source Connection must normalize
-- to the same would-be survivor as the Message.
DO $preflight_source_cards$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Message" message
    LEFT JOIN "ActionCoordinationContext" context
      ON context."id" = message."actionContextId"
    WHERE message."type" = 'ACTION_INTEREST_CARD'
      AND message."actionContextId" IS NOT NULL
      AND context."id" IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM "Message" message
    JOIN "ActionCoordinationContext" context
      ON context."id" = message."actionContextId"
    WHERE message."type" = 'ACTION_INTEREST_CARD'
      AND message."actionInterestId" IS NOT NULL
      AND message."actionInterestId" <> context."interestId"
  ) OR EXISTS (
    SELECT 1
    FROM "Message"
    WHERE "type" = 'ACTION_INTEREST_CARD'
      AND "actionInterestId" IS NOT NULL
      AND "actionContextId" IS NOT NULL
    GROUP BY "actionInterestId"
    HAVING COUNT(DISTINCT "actionContextId") > 1
  ) OR EXISTS (
    SELECT 1
    FROM "Message"
    WHERE "type" = 'ACTION_INTEREST_CARD'
      AND "actionInterestId" IS NOT NULL
      AND "actionContextId" IS NOT NULL
    GROUP BY "actionContextId"
    HAVING COUNT(DISTINCT "actionInterestId") > 1
  ) OR EXISTS (
    SELECT 1
    FROM "Message" message
    LEFT JOIN "ActionCoordinationContext" explicit_context
      ON explicit_context."id" = message."actionContextId"
    LEFT JOIN "ActionInterest" interest
      ON interest."id" = COALESCE(
        message."actionInterestId",
        explicit_context."interestId"
      )
    LEFT JOIN "ActionCoordinationContext" effective_context
      ON effective_context."interestId" = interest."id"
    LEFT JOIN "_bl_db04_connection_map" message_map
      ON message_map.connection_id = message."connectionId"
    LEFT JOIN "_bl_db04_connection_map" interest_map
      ON interest_map.connection_id = interest."connectionId"
    LEFT JOIN "_bl_db04_connection_map" context_map
      ON context_map.connection_id = effective_context."connectionId"
    WHERE message."type" = 'ACTION_INTEREST_CARD'
      AND COALESCE(
        message."actionInterestId",
        explicit_context."interestId"
      ) IS NOT NULL
      AND (
        interest."id" IS NULL
        OR message_map.survivor_id IS NULL
        OR (
          interest."connectionId" IS NULL
          AND effective_context."connectionId" IS NULL
        )
        OR (
          interest."connectionId" IS NOT NULL
          AND (
            interest_map.survivor_id IS NULL
            OR message_map.survivor_id IS DISTINCT FROM interest_map.survivor_id
          )
        )
        OR (
          effective_context."connectionId" IS NOT NULL
          AND (
            context_map.survivor_id IS NULL
            OR message_map.survivor_id IS DISTINCT FROM context_map.survivor_id
          )
        )
        OR (
          interest."connectionId" IS NOT NULL
          AND effective_context."connectionId" IS NOT NULL
          AND interest_map.survivor_id IS DISTINCT FROM context_map.survivor_id
        )
      )
  ) THEN
    RAISE EXCEPTION
      'BL-DB-04 preflight failed: ACTION_INTEREST_CARD attribution is inconsistent';
  END IF;
END
$preflight_source_cards$;

-- DIRECT transition idempotency must not depend on ProductFunnelEvent retention.
-- No generation-based key has shipped yet, so every existing Interest starts at
-- the neutral generation and future guarded status transitions increment it.
ALTER TABLE "ActionInterest"
  ADD COLUMN "directTransitionGeneration" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "ActionInterest_directTransitionGeneration_nonnegative_check"
    CHECK ("directTransitionGeneration" >= 0);

-- Stage every merged survivor value before mutating the source rows. MAX is
-- allowed only for private timestamps and reply-limit time. Remarks are chosen
-- by actual participant id; preflight proved there is at most one non-empty
-- value for that participant.
CREATE TEMP TABLE "_bl_db04_connection_merge" ON COMMIT DROP AS
SELECT
  survivor."id" AS survivor_id,
  COALESCE(
    survivor."invitationId",
    (
      SELECT candidate."invitationId"
      FROM "Connection" candidate
      JOIN "_bl_db04_connection_map" candidate_map
        ON candidate_map.connection_id = candidate."id"
      WHERE candidate_map.survivor_id = survivor."id"
        AND candidate."invitationId" IS NOT NULL
      ORDER BY candidate."createdAt" ASC, candidate."id" ASC
      LIMIT 1
    )
  ) AS invitation_id,
  COALESCE(
    survivor."originCourseId",
    (
      SELECT candidate."originCourseId"
      FROM "Connection" candidate
      JOIN "_bl_db04_connection_map" candidate_map
        ON candidate_map.connection_id = candidate."id"
      WHERE candidate_map.survivor_id = survivor."id"
        AND candidate."originCourseId" IS NOT NULL
      ORDER BY candidate."createdAt" ASC, candidate."id" ASC
      LIMIT 1
    )
  ) AS origin_course_id,
  (
    SELECT MAX(private_field.pinned_at)
    FROM "Connection" candidate
    JOIN "_bl_db04_connection_map" candidate_map
      ON candidate_map.connection_id = candidate."id"
    CROSS JOIN LATERAL (
      VALUES
        (candidate."userAId", candidate."pinnedByAAt"),
        (candidate."userBId", candidate."pinnedByBAt")
    ) AS private_field(user_id, pinned_at)
    WHERE candidate_map.survivor_id = survivor."id"
      AND private_field.user_id = survivor."userAId"
  ) AS pinned_by_a_at,
  (
    SELECT MAX(private_field.pinned_at)
    FROM "Connection" candidate
    JOIN "_bl_db04_connection_map" candidate_map
      ON candidate_map.connection_id = candidate."id"
    CROSS JOIN LATERAL (
      VALUES
        (candidate."userAId", candidate."pinnedByAAt"),
        (candidate."userBId", candidate."pinnedByBAt")
    ) AS private_field(user_id, pinned_at)
    WHERE candidate_map.survivor_id = survivor."id"
      AND private_field.user_id = survivor."userBId"
  ) AS pinned_by_b_at,
  (
    SELECT MAX(private_field.read_at)
    FROM "Connection" candidate
    JOIN "_bl_db04_connection_map" candidate_map
      ON candidate_map.connection_id = candidate."id"
    CROSS JOIN LATERAL (
      VALUES
        (candidate."userAId", candidate."readByAAt"),
        (candidate."userBId", candidate."readByBAt")
    ) AS private_field(user_id, read_at)
    WHERE candidate_map.survivor_id = survivor."id"
      AND private_field.user_id = survivor."userAId"
  ) AS read_by_a_at,
  (
    SELECT MAX(private_field.read_at)
    FROM "Connection" candidate
    JOIN "_bl_db04_connection_map" candidate_map
      ON candidate_map.connection_id = candidate."id"
    CROSS JOIN LATERAL (
      VALUES
        (candidate."userAId", candidate."readByAAt"),
        (candidate."userBId", candidate."readByBAt")
    ) AS private_field(user_id, read_at)
    WHERE candidate_map.survivor_id = survivor."id"
      AND private_field.user_id = survivor."userBId"
  ) AS read_by_b_at,
  COALESCE(
    (
      SELECT private_field.remark
      FROM "Connection" candidate
      JOIN "_bl_db04_connection_map" candidate_map
        ON candidate_map.connection_id = candidate."id"
      CROSS JOIN LATERAL (
        VALUES
          (candidate."userAId", candidate."contactRemarkByA"),
          (candidate."userBId", candidate."contactRemarkByB")
      ) AS private_field(user_id, remark)
      WHERE candidate_map.survivor_id = survivor."id"
        AND private_field.user_id = survivor."userAId"
        AND NULLIF(BTRIM(private_field.remark), '') IS NOT NULL
      ORDER BY candidate."createdAt" ASC, candidate."id" ASC
      LIMIT 1
    ),
    survivor."contactRemarkByA"
  ) AS contact_remark_by_a,
  COALESCE(
    (
      SELECT private_field.remark
      FROM "Connection" candidate
      JOIN "_bl_db04_connection_map" candidate_map
        ON candidate_map.connection_id = candidate."id"
      CROSS JOIN LATERAL (
        VALUES
          (candidate."userAId", candidate."contactRemarkByA"),
          (candidate."userBId", candidate."contactRemarkByB")
      ) AS private_field(user_id, remark)
      WHERE candidate_map.survivor_id = survivor."id"
        AND private_field.user_id = survivor."userBId"
        AND NULLIF(BTRIM(private_field.remark), '') IS NOT NULL
      ORDER BY candidate."createdAt" ASC, candidate."id" ASC
      LIMIT 1
    ),
    survivor."contactRemarkByB"
  ) AS contact_remark_by_b,
  (
    SELECT MAX(candidate."replyLimitUnlockedAt")
    FROM "Connection" candidate
    JOIN "_bl_db04_connection_map" candidate_map
      ON candidate_map.connection_id = candidate."id"
    WHERE candidate_map.survivor_id = survivor."id"
  ) AS reply_limit_unlocked_at,
  (
    SELECT MAX(candidate."updatedAt")
    FROM "Connection" candidate
    JOIN "_bl_db04_connection_map" candidate_map
      ON candidate_map.connection_id = candidate."id"
    WHERE candidate_map.survivor_id = survivor."id"
  ) AS updated_at
FROM "Connection" survivor
JOIN "_bl_db04_connection_map" survivor_map
  ON survivor_map.connection_id = survivor."id"
 AND survivor_map.survivor_id = survivor."id";

-- FriendLink is the only Connection child with a unique connectionId. The
-- preflight proved duplicate rows are semantically identical, so retain the
-- earliest row and remove only redundant representations of that same fact.
CREATE TEMP TABLE "_bl_db04_friend_survivor" ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    friend."id" AS friend_id,
    map.survivor_id,
    ROW_NUMBER() OVER (
      PARTITION BY map.survivor_id
      ORDER BY friend."createdAt" ASC, friend."id" ASC
    ) AS ordinal,
    MIN(friend."createdAt") OVER (
      PARTITION BY map.survivor_id
    ) AS created_at,
    MAX(friend."updatedAt") OVER (
      PARTITION BY map.survivor_id
    ) AS updated_at
  FROM "FriendLink" friend
  JOIN "_bl_db04_connection_map" map
    ON map.connection_id = friend."connectionId"
)
SELECT friend_id, survivor_id, created_at, updated_at
FROM ranked
WHERE ordinal = 1;

DELETE FROM "FriendLink" redundant
USING "_bl_db04_connection_map" map,
      "_bl_db04_friend_survivor" canonical
WHERE redundant."connectionId" = map.connection_id
  AND map.survivor_id = canonical.survivor_id
  AND redundant."id" <> canonical.friend_id;

UPDATE "FriendLink" friend
SET
  "connectionId" = canonical.survivor_id,
  "createdAt" = canonical.created_at,
  "updatedAt" = canonical.updated_at
FROM "_bl_db04_friend_survivor" canonical
WHERE friend."id" = canonical.friend_id;

-- Repoint all remaining Connection foreign keys. Do not synthesize or rewrite
-- any Plan origin/action/context attribution while doing so.
UPDATE "ProductFunnelEvent" child
SET "connectionId" = map.survivor_id
FROM "_bl_db04_connection_map" map
WHERE child."connectionId" = map.connection_id
  AND map.connection_id <> map.survivor_id;

UPDATE "ActionInterest" child
SET "connectionId" = map.survivor_id
FROM "_bl_db04_connection_map" map
WHERE child."connectionId" = map.connection_id
  AND map.connection_id <> map.survivor_id;

UPDATE "ActionCoordinationContext" child
SET "connectionId" = map.survivor_id
FROM "_bl_db04_connection_map" map
WHERE child."connectionId" = map.connection_id
  AND map.connection_id <> map.survivor_id;

UPDATE "Message" child
SET "connectionId" = map.survivor_id
FROM "_bl_db04_connection_map" map
WHERE child."connectionId" = map.connection_id
  AND map.connection_id <> map.survivor_id;

UPDATE "AvailabilityShare" child
SET "connectionId" = map.survivor_id
FROM "_bl_db04_connection_map" map
WHERE child."connectionId" = map.connection_id
  AND map.connection_id <> map.survivor_id;

UPDATE "PlanCommitment" child
SET "connectionId" = map.survivor_id
FROM "_bl_db04_connection_map" map
WHERE child."connectionId" = map.connection_id
  AND map.connection_id <> map.survivor_id;

UPDATE "PlanRequest" child
SET "connectionId" = map.survivor_id
FROM "_bl_db04_connection_map" map
WHERE child."connectionId" = map.connection_id
  AND map.connection_id <> map.survivor_id;

UPDATE "ContactExchangeRequest" child
SET "connectionId" = map.survivor_id
FROM "_bl_db04_connection_map" map
WHERE child."connectionId" = map.connection_id
  AND map.connection_id <> map.survivor_id;

UPDATE "Block" child
SET "connectionId" = map.survivor_id
FROM "_bl_db04_connection_map" map
WHERE child."connectionId" = map.connection_id
  AND map.connection_id <> map.survivor_id;

UPDATE "Report" child
SET "connectionId" = map.survivor_id
FROM "_bl_db04_connection_map" map
WHERE child."connectionId" = map.connection_id
  AND map.connection_id <> map.survivor_id;

UPDATE "StudySessionProposal" child
SET "connectionId" = map.survivor_id
FROM "_bl_db04_connection_map" map
WHERE child."connectionId" = map.connection_id
  AND map.connection_id <> map.survivor_id;

-- Realtime direct-conversation ids are deliberately logical references rather
-- than foreign keys. Preserve every event while moving only the DIRECT stream;
-- COURSE/GROUP ids that happen to equal a Connection id are unrelated.
UPDATE "ChatRealtimeEvent" event
SET "conversationId" = map.survivor_id
FROM "_bl_db04_connection_map" map
WHERE event."conversationKind" = 'DIRECT'
  AND event."conversationId" = map.connection_id
  AND map.connection_id <> map.survivor_id;

-- Retention has a composite primary key, so first merge all duplicate DIRECT
-- boundaries into the survivor (both sequence boundary and timestamp use MAX),
-- then delete only the loser keys.
INSERT INTO "ChatRealtimeRetention" (
  "conversationKind",
  "conversationId",
  "retainedAfterSequence",
  "updatedAt"
)
SELECT
  'DIRECT',
  map.survivor_id,
  MAX(retention."retainedAfterSequence"),
  MAX(retention."updatedAt")
FROM "ChatRealtimeRetention" retention
JOIN "_bl_db04_connection_map" map
  ON retention."conversationKind" = 'DIRECT'
 AND retention."conversationId" = map.connection_id
GROUP BY map.survivor_id
ON CONFLICT ("conversationKind", "conversationId") DO UPDATE SET
  "retainedAfterSequence" = GREATEST(
    "ChatRealtimeRetention"."retainedAfterSequence",
    EXCLUDED."retainedAfterSequence"
  ),
  "updatedAt" = GREATEST(
    "ChatRealtimeRetention"."updatedAt",
    EXCLUDED."updatedAt"
  );

DELETE FROM "ChatRealtimeRetention" retention
USING "_bl_db04_connection_map" map
WHERE retention."conversationKind" = 'DIRECT'
  AND retention."conversationId" = map.connection_id
  AND map.connection_id <> map.survivor_id;

-- Outbox destinations have a strict top-level connectionId in the affected
-- ACTION_CONTEXT/PLAN envelopes. Rewrite that exact scalar only; never recurse
-- through arbitrary JSON or touch payload/body/blob fields.
UPDATE "NotificationOutbox" outbox
SET "destination" = jsonb_set(
  outbox."destination",
  '{connectionId}',
  to_jsonb(map.survivor_id),
  false
)
FROM "_bl_db04_connection_map" map
WHERE jsonb_typeof(outbox."destination") = 'object'
  AND jsonb_typeof(outbox."destination" -> 'connectionId') = 'string'
  AND outbox."destination" ->> 'connectionId' = map.connection_id
  AND map.connection_id <> map.survivor_id;

-- Known native connection/contact receipts store the Connection id as an exact
-- top-level scalar. Repair only that proven envelope shape. Receipts expire;
-- unknown/nested JSON must not be guessed or recursively rewritten.
UPDATE "ApiIdempotencyRecord" receipt
SET "responseBody" = jsonb_set(
  receipt."responseBody",
  '{connectionId}',
  to_jsonb(map.survivor_id),
  false
)
FROM "_bl_db04_connection_map" map
WHERE jsonb_typeof(receipt."responseBody") = 'object'
  AND jsonb_typeof(receipt."responseBody" -> 'connectionId') = 'string'
  AND receipt."responseBody" ->> 'connectionId' = map.connection_id
  AND map.connection_id <> map.survivor_id;

-- Release unique invitation ids from loser rows before assigning the staged
-- single value to the survivor.
UPDATE "Connection" loser
SET "invitationId" = NULL
FROM "_bl_db04_connection_map" map
WHERE loser."id" = map.connection_id
  AND map.connection_id <> map.survivor_id
  AND loser."invitationId" IS NOT NULL;

UPDATE "Connection" survivor
SET
  "invitationId" = merged.invitation_id,
  "originCourseId" = merged.origin_course_id,
  "pinnedByAAt" = merged.pinned_by_a_at,
  "pinnedByBAt" = merged.pinned_by_b_at,
  "contactRemarkByA" = merged.contact_remark_by_a,
  "contactRemarkByB" = merged.contact_remark_by_b,
  "readByAAt" = merged.read_by_a_at,
  "readByBAt" = merged.read_by_b_at,
  "replyLimitUnlockedAt" = merged.reply_limit_unlocked_at,
  "updatedAt" = merged.updated_at
FROM "_bl_db04_connection_merge" merged
WHERE survivor."id" = merged.survivor_id;

-- Prove every current single-column Connection FK has been repointed before a
-- loser can be deleted. This dynamically catches future child tables too.
DO $verify_connection_repoint$
DECLARE
  foreign_key RECORD;
  has_loser_reference BOOLEAN;
BEGIN
  FOR foreign_key IN
    SELECT
      constraint_row.conrelid::regclass AS child_table,
      attribute.attname AS child_column
    FROM pg_constraint constraint_row
    JOIN pg_attribute attribute
      ON attribute.attrelid = constraint_row.conrelid
     AND attribute.attnum = constraint_row.conkey[1]
    WHERE constraint_row.contype = 'f'
      AND constraint_row.confrelid = '"Connection"'::regclass
      AND cardinality(constraint_row.conkey) = 1
      AND cardinality(constraint_row.confkey) = 1
  LOOP
    EXECUTE format(
      'SELECT EXISTS (
         SELECT 1
         FROM %s child
         JOIN "_bl_db04_connection_map" map
           ON child.%I = map.connection_id
         WHERE map.connection_id <> map.survivor_id
       )',
      foreign_key.child_table,
      foreign_key.child_column
    ) INTO has_loser_reference;

    IF has_loser_reference THEN
      RAISE EXCEPTION
        'BL-DB-04 verification failed: %.% still references a loser Connection',
        foreign_key.child_table,
        foreign_key.child_column;
    END IF;
  END LOOP;
END
$verify_connection_repoint$;

DO $verify_logical_connection_repoint$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ChatRealtimeEvent" event
    JOIN "_bl_db04_connection_map" map
      ON event."conversationKind" = 'DIRECT'
     AND event."conversationId" = map.connection_id
    WHERE map.connection_id <> map.survivor_id
  ) OR EXISTS (
    SELECT 1
    FROM "ChatRealtimeRetention" retention
    JOIN "_bl_db04_connection_map" map
      ON retention."conversationKind" = 'DIRECT'
     AND retention."conversationId" = map.connection_id
    WHERE map.connection_id <> map.survivor_id
  ) OR EXISTS (
    SELECT 1
    FROM "NotificationOutbox" outbox
    JOIN "_bl_db04_connection_map" map
      ON jsonb_typeof(outbox."destination") = 'object'
     AND outbox."destination" ->> 'connectionId' = map.connection_id
    WHERE map.connection_id <> map.survivor_id
  ) OR EXISTS (
    SELECT 1
    FROM "ApiIdempotencyRecord" receipt
    JOIN "_bl_db04_connection_map" map
      ON jsonb_typeof(receipt."responseBody") = 'object'
     AND receipt."responseBody" ->> 'connectionId' = map.connection_id
    WHERE map.connection_id <> map.survivor_id
  ) THEN
    RAISE EXCEPTION
      'BL-DB-04 verification failed: a supported logical Connection reference still points to a loser';
  END IF;
END
$verify_logical_connection_repoint$;

DELETE FROM "Connection" loser
USING "_bl_db04_connection_map" map
WHERE loser."id" = map.connection_id
  AND map.connection_id <> map.survivor_id;

-- Collapse redundant source cards by effective Interest identity. The earliest
-- Message remains canonical. Later rows keep their ids, reply anchors, reports,
-- sender, Connection, and chronology, but become empty deleted SYSTEM tombstones
-- with source attribution removed.
CREATE TEMP TABLE "_bl_db04_redundant_source_cards" ON COMMIT DROP AS
WITH source_cards AS (
  SELECT
    message."id",
    COALESCE(message."actionInterestId", context."interestId") AS effective_interest_id,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(message."actionInterestId", context."interestId")
      ORDER BY message."createdAt" ASC, message."id" ASC
    ) AS ordinal
  FROM "Message" message
  LEFT JOIN "ActionCoordinationContext" context
    ON context."id" = message."actionContextId"
  WHERE message."type" = 'ACTION_INTEREST_CARD'
), ranked AS (
  SELECT id, effective_interest_id, ordinal
  FROM source_cards
  WHERE effective_interest_id IS NOT NULL
)
SELECT id
FROM ranked
WHERE ordinal > 1;

UPDATE "Message" message
SET
  "body" = '',
  "type" = 'SYSTEM',
  "imageUrl" = NULL,
  "locationLat" = NULL,
  "locationLng" = NULL,
  "locationName" = NULL,
  "availabilityShareId" = NULL,
  "planRequestId" = NULL,
  "actionInterestId" = NULL,
  "actionContextId" = NULL,
  "deletedAt" = COALESCE(message."deletedAt", CURRENT_TIMESTAMP)
FROM "_bl_db04_redundant_source_cards" redundant
WHERE message."id" = redundant.id;

-- A context-only canonical card is fully attributable because Context owns a
-- unique Interest. Persist that proven identity after duplicate collapse so a
-- later retry cannot create a second interest-only source card.
UPDATE "Message" message
SET "actionInterestId" = context."interestId"
FROM "ActionCoordinationContext" context
WHERE message."type" = 'ACTION_INTEREST_CARD'
  AND message."actionContextId" = context."id"
  AND message."actionInterestId" IS NULL;

-- Full post-repair verification runs before any invariant is installed.
DO $verify_repair$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Connection"
    GROUP BY LEAST("userAId", "userBId"), GREATEST("userAId", "userBId")
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'BL-DB-04 verification failed: duplicate Connection pair remains';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Message"
    WHERE "type" = 'ACTION_INTEREST_CARD'
      AND "actionInterestId" IS NOT NULL
    GROUP BY "actionInterestId"
    HAVING COUNT(*) > 1
  ) OR EXISTS (
    SELECT 1
    FROM "Message"
    WHERE "type" = 'ACTION_INTEREST_CARD'
      AND "actionContextId" IS NOT NULL
    GROUP BY "actionContextId"
    HAVING COUNT(*) > 1
  ) OR EXISTS (
    SELECT 1
    FROM "Message"
    WHERE "type" = 'ACTION_INTEREST_CARD'
      AND "actionContextId" IS NOT NULL
      AND "actionInterestId" IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM "Message" message
    JOIN "ActionCoordinationContext" context
      ON context."id" = message."actionContextId"
    WHERE message."type" = 'ACTION_INTEREST_CARD'
      AND message."actionInterestId" IS DISTINCT FROM context."interestId"
  ) OR EXISTS (
    SELECT 1
    FROM "Message" message
    LEFT JOIN "ActionInterest" interest
      ON interest."id" = message."actionInterestId"
    LEFT JOIN "ActionCoordinationContext" effective_context
      ON effective_context."interestId" = interest."id"
    WHERE message."type" = 'ACTION_INTEREST_CARD'
      AND message."actionInterestId" IS NOT NULL
      AND (
        interest."id" IS NULL
        OR (
          interest."connectionId" IS NULL
          AND effective_context."connectionId" IS NULL
        )
        OR (
          interest."connectionId" IS NOT NULL
          AND message."connectionId" IS DISTINCT FROM interest."connectionId"
        )
        OR (
          effective_context."connectionId" IS NOT NULL
          AND message."connectionId" IS DISTINCT FROM effective_context."connectionId"
        )
        OR (
          interest."connectionId" IS NOT NULL
          AND effective_context."connectionId" IS NOT NULL
          AND interest."connectionId" IS DISTINCT FROM effective_context."connectionId"
        )
      )
  ) THEN
    RAISE EXCEPTION
      'BL-DB-04 verification failed: duplicate source card remains';
  END IF;
END
$verify_repair$;

CREATE UNIQUE INDEX "Connection_unordered_user_pair_key"
  ON "Connection" (
    (LEAST("userAId", "userBId")),
    (GREATEST("userAId", "userBId"))
  );

CREATE UNIQUE INDEX "Message_actionInterest_source_card_key"
  ON "Message"("actionInterestId")
  WHERE "type" = 'ACTION_INTEREST_CARD'
    AND "actionInterestId" IS NOT NULL;

CREATE UNIQUE INDEX "Message_actionContext_source_card_key"
  ON "Message"("actionContextId")
  WHERE "type" = 'ACTION_INTEREST_CARD'
    AND "actionContextId" IS NOT NULL;

-- PostgreSQL executes ON DELETE actions as separate trigger updates. An
-- immediate CHECK can observe a transient context-only shape while deleting an
-- Interest even though the final historical shape is both-null. Enforce the
-- invariant at transaction end and query the final Message row by id; this
-- permits the legal FK cascade but still rejects a committed context-only card.
CREATE FUNCTION "enforce_message_action_card_final_attribution"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $enforce_message_action_card_final_attribution$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Message" message
    WHERE message."id" = NEW."id"
      AND message."type" = 'ACTION_INTEREST_CARD'
      AND message."actionContextId" IS NOT NULL
      AND message."actionInterestId" IS NULL
  ) THEN
    RAISE EXCEPTION
      'ACTION_INTEREST_CARD with a Context requires Interest attribution'
      USING
        ERRCODE = '23514',
        CONSTRAINT = 'Message_action_interest_card_context_attribution';
  END IF;
  RETURN NULL;
END
$enforce_message_action_card_final_attribution$;

CREATE CONSTRAINT TRIGGER "Message_action_interest_card_context_attribution"
AFTER INSERT OR UPDATE ON "Message"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "enforce_message_action_card_final_attribution"();

ALTER TABLE "ActionInterestActivation"
  ADD CONSTRAINT "ActionInterestActivation_connected_content_check"
    CHECK (("connectedAt" IS NULL) = ("firstContentType" IS NULL)),
  ADD CONSTRAINT "ActionInterestActivation_connected_terminal_exclusive_check"
    CHECK (NOT ("connectedAt" IS NOT NULL AND "terminalReason" IS NOT NULL)),
  ADD CONSTRAINT "ActionInterestActivation_terminal_pair_check"
    CHECK (("terminalReason" IS NULL) = ("terminalAt" IS NULL));

COMMIT;
