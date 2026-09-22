-- BL-DB-05: final, compatibility-only Plan persistence hardening.
--
-- This migration deliberately does not add a new product object or Plan state.
-- It gives each provable legacy PlanRequest counter chain one stable
-- PlanCommitment, backfills the two stable ownership surfaces, and installs the
-- minimum invariants required before the user-visible B-light flow is enabled.
-- Every ambiguity is detected before the first persistent INSERT/UPDATE.

BEGIN;

-- Acquire relation locks in the same parent-to-child order followed by account,
-- source, and Plan deletion cascades. Separate statements make the order
-- explicit instead of leaving a multi-relation LOCK to PostgreSQL's OID order.
LOCK TABLE "User" IN SHARE MODE;
LOCK TABLE "Connection" IN SHARE MODE;
LOCK TABLE "ClassmatePost" IN SHARE MODE;
LOCK TABLE "ActionInterest" IN SHARE MODE;
LOCK TABLE "ActionCoordinationContext" IN SHARE MODE;
LOCK TABLE "PlanCommitment" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE "PlanRequest" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE "CalendarEntry" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE "PlanOutcomeResponse" IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE "_bl_db05_chain_map" (
  "revisionId" TEXT PRIMARY KEY,
  "rootId" TEXT NOT NULL,
  "depth" INTEGER NOT NULL
) ON COMMIT DROP;

WITH RECURSIVE chain AS (
  SELECT
    revision."id" AS "revisionId",
    revision."id" AS "rootId",
    0 AS "depth",
    ARRAY[revision."id"]::TEXT[] AS path
  FROM "PlanRequest" revision
  WHERE revision."counterOfId" IS NULL

  UNION ALL

  SELECT
    child."id",
    chain."rootId",
    chain."depth" + 1,
    chain.path || child."id"
  FROM chain
  JOIN "PlanRequest" child
    ON child."counterOfId" = chain."revisionId"
  WHERE NOT child."id" = ANY(chain.path)
)
INSERT INTO "_bl_db05_chain_map" ("revisionId", "rootId", "depth")
SELECT "revisionId", "rootId", "depth"
FROM chain;

CREATE TEMP TABLE "_bl_db05_interest_source" (
  "rootId" TEXT NOT NULL,
  "interestId" TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO "_bl_db05_interest_source" ("rootId", "interestId")
SELECT map."rootId", revision."actionInterestId"
FROM "_bl_db05_chain_map" map
JOIN "PlanRequest" revision ON revision."id" = map."revisionId"
WHERE revision."actionInterestId" IS NOT NULL
UNION
SELECT map."rootId", context."interestId"
FROM "_bl_db05_chain_map" map
JOIN "PlanRequest" revision ON revision."id" = map."revisionId"
JOIN "ActionCoordinationContext" context
  ON context."id" = revision."originContextId";

CREATE TEMP TABLE "_bl_db05_action_source" (
  "rootId" TEXT NOT NULL,
  "actionId" TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO "_bl_db05_action_source" ("rootId", "actionId")
SELECT map."rootId", revision."originActionId"
FROM "_bl_db05_chain_map" map
JOIN "PlanRequest" revision ON revision."id" = map."revisionId"
WHERE revision."originActionId" IS NOT NULL
UNION
SELECT source."rootId", interest."classmatePostId"
FROM "_bl_db05_interest_source" source
JOIN "ActionInterest" interest ON interest."id" = source."interestId";

CREATE TEMP TABLE "_bl_db05_context_source" (
  "rootId" TEXT NOT NULL,
  "contextId" TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO "_bl_db05_context_source" ("rootId", "contextId")
SELECT map."rootId", revision."originContextId"
FROM "_bl_db05_chain_map" map
JOIN "PlanRequest" revision ON revision."id" = map."revisionId"
WHERE revision."originContextId" IS NOT NULL
UNION
SELECT source."rootId", context."id"
FROM "_bl_db05_interest_source" source
JOIN "ActionCoordinationContext" context
  ON context."interestId" = source."interestId";

CREATE TEMP TABLE "_bl_db05_chain_facts" ON COMMIT DROP AS
SELECT
  map."rootId",
  'legacy-plan:' || map."rootId" AS "generatedCommitmentId",
  MIN(revision."connectionId") AS "connectionId",
  MIN(connection."userAId") AS "participantAId",
  MIN(connection."userBId") AS "participantBId",
  COUNT(*)::INTEGER AS "revisionCount",
  COUNT(*) FILTER (WHERE revision."commitmentId" IS NULL)::INTEGER AS "nullCommitmentCount",
  COUNT(DISTINCT revision."commitmentId") FILTER (
    WHERE revision."commitmentId" IS NOT NULL
  )::INTEGER AS "existingCommitmentCount",
  MIN(revision."commitmentId") FILTER (
    WHERE revision."commitmentId" IS NOT NULL
  ) AS "existingCommitmentId",
  COUNT(*) FILTER (WHERE revision."status" = 'PENDING')::INTEGER AS "pendingCount",
  MIN(revision."id") FILTER (WHERE revision."status" = 'PENDING') AS "pendingRevisionId",
  COUNT(*) FILTER (WHERE revision."status" = 'ACCEPTED')::INTEGER AS "acceptedCount",
  MIN(revision."id") FILTER (WHERE revision."status" = 'ACCEPTED') AS "acceptedRevisionId",
  MIN(revision."createdAt") AS "createdAt",
  MAX(revision."updatedAt") AS "updatedAt",
  (
    SELECT COUNT(DISTINCT source."interestId")::INTEGER
    FROM "_bl_db05_interest_source" source
    WHERE source."rootId" = map."rootId"
  ) AS "interestSourceCount",
  (
    SELECT MIN(source."interestId")
    FROM "_bl_db05_interest_source" source
    WHERE source."rootId" = map."rootId"
  ) AS "interestId",
  (
    SELECT COUNT(DISTINCT source."actionId")::INTEGER
    FROM "_bl_db05_action_source" source
    WHERE source."rootId" = map."rootId"
  ) AS "actionSourceCount",
  (
    SELECT MIN(source."actionId")
    FROM "_bl_db05_action_source" source
    WHERE source."rootId" = map."rootId"
  ) AS "originActionId",
  (
    SELECT COUNT(DISTINCT source."contextId")::INTEGER
    FROM "_bl_db05_context_source" source
    WHERE source."rootId" = map."rootId"
  ) AS "contextSourceCount",
  (
    SELECT MIN(source."contextId")
    FROM "_bl_db05_context_source" source
    WHERE source."rootId" = map."rootId"
  ) AS "originContextId"
FROM "_bl_db05_chain_map" map
JOIN "PlanRequest" revision ON revision."id" = map."revisionId"
JOIN "Connection" connection ON connection."id" = revision."connectionId"
GROUP BY map."rootId";

CREATE UNIQUE INDEX "_bl_db05_chain_facts_root_key"
  ON "_bl_db05_chain_facts" ("rootId");

DO $preflight$
DECLARE
  finding_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO finding_count
  FROM "PlanRequest" parent
  JOIN "PlanRequest" child ON child."counterOfId" = parent."id"
  GROUP BY parent."id"
  HAVING COUNT(*) > 1
  LIMIT 1;
  IF finding_count IS NOT NULL THEN
    RAISE EXCEPTION 'BL-DB-05 ambiguous Plan history: a counter chain branches';
  END IF;

  SELECT COUNT(*) INTO finding_count
  FROM "PlanRequest" revision
  LEFT JOIN "_bl_db05_chain_map" map ON map."revisionId" = revision."id"
  WHERE map."revisionId" IS NULL;
  IF finding_count <> 0 THEN
    RAISE EXCEPTION 'BL-DB-05 ambiguous Plan history: a counter chain contains a cycle or has no provable root (%)', finding_count;
  END IF;

  SELECT COUNT(*) INTO finding_count
  FROM "PlanRequest" child
  JOIN "PlanRequest" parent ON parent."id" = child."counterOfId"
  WHERE child."connectionId" <> parent."connectionId"
     OR child."proposerUserId" <> parent."receiverUserId"
     OR child."receiverUserId" <> parent."proposerUserId";
  IF finding_count <> 0 THEN
    RAISE EXCEPTION 'BL-DB-05 ambiguous Plan history: a counter edge changes connection or participant direction (%)', finding_count;
  END IF;

  SELECT COUNT(*) INTO finding_count
  FROM "PlanRequest" revision
  JOIN "Connection" connection ON connection."id" = revision."connectionId"
  WHERE revision."proposerUserId" = revision."receiverUserId"
     OR NOT (
       (revision."proposerUserId" = connection."userAId" AND revision."receiverUserId" = connection."userBId")
       OR
       (revision."proposerUserId" = connection."userBId" AND revision."receiverUserId" = connection."userAId")
     );
  IF finding_count <> 0 THEN
    RAISE EXCEPTION 'BL-DB-05 invalid Plan history: revision participants do not equal the Connection pair (%)', finding_count;
  END IF;

  SELECT COUNT(*) INTO finding_count
  FROM "PlanRequest" revision
  WHERE (
      EXISTS (SELECT 1 FROM "PlanRequest" child WHERE child."counterOfId" = revision."id")
      AND revision."status" <> 'COUNTER_PROPOSED'
    ) OR (
      NOT EXISTS (SELECT 1 FROM "PlanRequest" child WHERE child."counterOfId" = revision."id")
      AND revision."status" = 'COUNTER_PROPOSED'
    );
  IF finding_count <> 0 THEN
    RAISE EXCEPTION 'BL-DB-05 ambiguous Plan history: counter status does not match chain position (%)', finding_count;
  END IF;

  SELECT COUNT(*) INTO finding_count
  FROM "_bl_db05_chain_facts"
  WHERE "existingCommitmentCount" > 1
     OR ("existingCommitmentCount" = 1 AND "nullCommitmentCount" > 0);
  IF finding_count <> 0 THEN
    RAISE EXCEPTION 'BL-DB-05 ambiguous Plan history: a counter chain mixes stable ownership (%)', finding_count;
  END IF;

  SELECT COUNT(*) INTO finding_count
  FROM "_bl_db05_chain_facts" facts
  WHERE facts."existingCommitmentCount" = 0
    AND (
      facts."pendingCount" > 1
      OR facts."acceptedCount" > 1
      OR (facts."pendingCount" = 1 AND facts."acceptedCount" = 1)
      OR (
        COALESCE(facts."pendingRevisionId", facts."acceptedRevisionId") IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM "PlanRequest" child
          WHERE child."counterOfId" = COALESCE(facts."pendingRevisionId", facts."acceptedRevisionId")
        )
      )
    );
  IF finding_count <> 0 THEN
    RAISE EXCEPTION 'BL-DB-05 ambiguous legacy Plan history: actionable or accepted state is not uniquely provable (%)', finding_count;
  END IF;

  SELECT COUNT(*) INTO finding_count
  FROM "_bl_db05_chain_facts"
  WHERE "interestSourceCount" > 1
     OR "actionSourceCount" > 1
     OR "contextSourceCount" > 1;
  IF finding_count <> 0 THEN
    RAISE EXCEPTION 'BL-DB-05 ambiguous Plan history: source IDs conflict inside a counter chain (%)', finding_count;
  END IF;

  SELECT COUNT(*) INTO finding_count
  FROM "_bl_db05_chain_facts" facts
  JOIN "ActionInterest" interest ON interest."id" = facts."interestId"
  JOIN "ClassmatePost" action ON action."id" = interest."classmatePostId"
  WHERE interest."classmatePostId" <> facts."originActionId"
     OR (interest."connectionId" IS NOT NULL AND interest."connectionId" <> facts."connectionId")
     OR NOT (
       (interest."userId" = facts."participantAId" AND action."userId" = facts."participantBId")
       OR
       (interest."userId" = facts."participantBId" AND action."userId" = facts."participantAId")
     );
  IF finding_count <> 0 THEN
    RAISE EXCEPTION 'BL-DB-05 invalid Plan history: Action Interest does not belong to the Plan pair (%)', finding_count;
  END IF;

  SELECT COUNT(*) INTO finding_count
  FROM "_bl_db05_chain_facts" facts
  JOIN "ActionCoordinationContext" context ON context."id" = facts."originContextId"
  WHERE context."interestId" <> facts."interestId"
     OR context."connectionId" IS DISTINCT FROM facts."connectionId";
  IF finding_count <> 0 THEN
    RAISE EXCEPTION 'BL-DB-05 invalid Plan history: Action Context does not belong to the Plan source (%)', finding_count;
  END IF;

  SELECT COUNT(*) INTO finding_count
  FROM "PlanRequest" revision
  JOIN "_bl_db05_chain_map" map ON map."revisionId" = revision."id"
  JOIN "_bl_db05_chain_facts" facts ON facts."rootId" = map."rootId"
  WHERE (
      revision."originKind" = 'ACTION_INTEREST'
      AND (facts."interestId" IS NULL OR revision."originId" IS DISTINCT FROM facts."interestId")
    ) OR (
      revision."originKind" = 'CLASSMATE_POST'
      AND (facts."originActionId" IS NULL OR revision."originId" IS DISTINCT FROM facts."originActionId")
    );
  IF finding_count <> 0 THEN
    RAISE EXCEPTION 'BL-DB-05 invalid Plan history: legacy origin metadata conflicts with trusted source rows (%)', finding_count;
  END IF;

  SELECT COUNT(*) INTO finding_count
  FROM "_bl_db05_chain_facts" facts
  JOIN "PlanCommitment" commitment ON commitment."id" = facts."existingCommitmentId"
  WHERE facts."existingCommitmentCount" = 1
    AND (
      commitment."connectionId" <> facts."connectionId"
      OR NOT (
        (commitment."participantAId" = facts."participantAId" AND commitment."participantBId" = facts."participantBId")
        OR
        (commitment."participantAId" = facts."participantBId" AND commitment."participantBId" = facts."participantAId")
      )
    );
  IF finding_count <> 0 THEN
    RAISE EXCEPTION 'BL-DB-05 invalid stable Plan history: Commitment does not own its revision pair (%)', finding_count;
  END IF;

  SELECT COUNT(*) INTO finding_count
  FROM "PlanCommitment" commitment
  JOIN "Connection" connection ON connection."id" = commitment."connectionId"
  WHERE commitment."participantAId" = commitment."participantBId"
     OR NOT (
       (commitment."participantAId" = connection."userAId" AND commitment."participantBId" = connection."userBId")
       OR
       (commitment."participantAId" = connection."userBId" AND commitment."participantBId" = connection."userAId")
     );
  IF finding_count <> 0 THEN
    RAISE EXCEPTION 'BL-DB-05 invalid stable Plan history: Commitment participants do not equal Connection pair (%)', finding_count;
  END IF;

  SELECT COUNT(*) INTO finding_count
  FROM "PlanRequest" revision
  JOIN "PlanCommitment" commitment ON commitment."id" = revision."commitmentId"
  WHERE revision."revisionKind" IS NULL
     OR revision."connectionId" <> commitment."connectionId"
     OR NOT (
       (revision."proposerUserId" = commitment."participantAId" AND revision."receiverUserId" = commitment."participantBId")
       OR
       (revision."proposerUserId" = commitment."participantBId" AND revision."receiverUserId" = commitment."participantAId")
     );
  IF finding_count <> 0 THEN
    RAISE EXCEPTION 'BL-DB-05 invalid stable Plan history: bound revision ownership is inconsistent (%)', finding_count;
  END IF;

  SELECT COUNT(*) INTO finding_count
  FROM "PlanCommitment" commitment
  LEFT JOIN "PlanRequest" accepted ON accepted."id" = commitment."currentAcceptedRevisionId"
  LEFT JOIN "PlanRequest" pending ON pending."id" = commitment."currentPendingRevisionId"
  WHERE commitment."currentAcceptedRevisionId" = commitment."currentPendingRevisionId"
        AND commitment."currentAcceptedRevisionId" IS NOT NULL
     OR commitment."status" = 'NEGOTIATING' AND (
       commitment."currentAcceptedRevisionId" IS NOT NULL OR commitment."currentPendingRevisionId" IS NULL
     )
     OR commitment."status" = 'CONFIRMED' AND commitment."currentAcceptedRevisionId" IS NULL
     OR commitment."status" = 'CANCELED' AND (
       commitment."currentAcceptedRevisionId" IS NULL OR commitment."currentPendingRevisionId" IS NOT NULL
     )
     OR commitment."status" = 'CLOSED' AND commitment."currentPendingRevisionId" IS NOT NULL
     OR commitment."currentAcceptedRevisionId" IS NOT NULL AND (
       accepted."id" IS NULL OR accepted."commitmentId" <> commitment."id" OR accepted."status" <> 'ACCEPTED'
     )
     OR commitment."currentPendingRevisionId" IS NOT NULL AND (
       pending."id" IS NULL OR pending."commitmentId" <> commitment."id" OR pending."status" <> 'PENDING'
     )
     OR commitment."status" = 'NEGOTIATING' AND pending."revisionKind" <> 'INITIAL'
     OR commitment."status" = 'CONFIRMED' AND pending."id" IS NOT NULL AND pending."revisionKind" <> 'RESCHEDULE';
  IF finding_count <> 0 THEN
    RAISE EXCEPTION 'BL-DB-05 invalid stable Plan history: pointer shape, ownership, or status mismatch (%)', finding_count;
  END IF;

  SELECT COUNT(*) INTO finding_count
  FROM (
    SELECT revision."commitmentId"
    FROM "PlanRequest" revision
    WHERE revision."commitmentId" IS NOT NULL AND revision."status" = 'PENDING'
    GROUP BY revision."commitmentId"
    HAVING COUNT(*) > 1
  ) duplicates;
  IF finding_count <> 0 THEN
    RAISE EXCEPTION 'BL-DB-05 invalid stable Plan history: more than one pending revision per Commitment (%)', finding_count;
  END IF;

  SELECT COUNT(*) INTO finding_count
  FROM "PlanRequest" pending
  JOIN "PlanCommitment" commitment ON commitment."id" = pending."commitmentId"
  WHERE pending."status" = 'PENDING'
    AND commitment."currentPendingRevisionId" IS DISTINCT FROM pending."id";
  IF finding_count <> 0 THEN
    RAISE EXCEPTION 'BL-DB-05 invalid stable Plan history: pending revision is not the Commitment pointer (%)', finding_count;
  END IF;

  SELECT COUNT(*) INTO finding_count
  FROM "_bl_db05_chain_facts" facts
  JOIN "PlanCommitment" collision ON collision."id" = facts."generatedCommitmentId"
  WHERE facts."existingCommitmentCount" = 0;
  IF finding_count <> 0 THEN
    RAISE EXCEPTION 'BL-DB-05 cannot allocate deterministic legacy Commitment IDs (%)', finding_count;
  END IF;

  SELECT COUNT(*) INTO finding_count
  FROM (
    SELECT future."originActionId"
    FROM (
      SELECT
        CASE
          WHEN facts."existingCommitmentCount" = 0 THEN facts."originActionId"
          ELSE revision."originActionId"
        END AS "originActionId"
      FROM "PlanRequest" revision
      JOIN "_bl_db05_chain_map" map ON map."revisionId" = revision."id"
      JOIN "_bl_db05_chain_facts" facts ON facts."rootId" = map."rootId"
      WHERE revision."status" = 'PENDING'
    ) future
    WHERE future."originActionId" IS NOT NULL
    GROUP BY future."originActionId"
    HAVING COUNT(*) > 1
  ) duplicates;
  IF finding_count <> 0 THEN
    RAISE EXCEPTION 'BL-DB-05 invalid Plan history: more than one pending Plan for one Action (%)', finding_count;
  END IF;

  SELECT COUNT(*) INTO finding_count
  FROM "_bl_db05_chain_facts" facts
  WHERE facts."existingCommitmentCount" = 0
    AND facts."acceptedCount" = 1
    AND (
      SELECT COUNT(*)
      FROM "CalendarEntry" calendar
      WHERE calendar."planRequestId" = facts."acceptedRevisionId"
    ) <> 2;
  IF finding_count <> 0 THEN
    RAISE EXCEPTION 'BL-DB-05 incomplete accepted Plan history: exactly two Calendar projections are required (%)', finding_count;
  END IF;

  SELECT COUNT(*) INTO finding_count
  FROM "CalendarEntry" calendar
  JOIN "_bl_db05_chain_map" map ON map."revisionId" = calendar."planRequestId"
  JOIN "_bl_db05_chain_facts" facts ON facts."rootId" = map."rootId"
  LEFT JOIN "PlanRequest" accepted ON accepted."id" = facts."acceptedRevisionId"
  WHERE facts."existingCommitmentCount" = 0
    AND (
      facts."acceptedRevisionId" IS NULL
      OR calendar."planRequestId" <> facts."acceptedRevisionId"
      OR calendar."planCommitmentId" IS NOT NULL
      OR calendar."projectionStatus" <> 'ACTIVE'
      OR calendar."userId" NOT IN (facts."participantAId", facts."participantBId")
      OR calendar."title" IS DISTINCT FROM accepted."title"
      OR calendar."location" IS DISTINCT FROM accepted."location"
      OR calendar."startAt" IS DISTINCT FROM accepted."startTime"
      OR calendar."endAt" IS DISTINCT FROM accepted."endTime"
    );
  IF finding_count <> 0 THEN
    RAISE EXCEPTION 'BL-DB-05 invalid accepted Plan history: Calendar projection facts diverge (%)', finding_count;
  END IF;

  SELECT COUNT(*) INTO finding_count
  FROM "_bl_db05_chain_facts" facts
  WHERE facts."existingCommitmentCount" = 0
    AND facts."acceptedCount" = 1
    AND (
      SELECT COUNT(DISTINCT calendar."userId")
      FROM "CalendarEntry" calendar
      WHERE calendar."planRequestId" = facts."acceptedRevisionId"
    ) <> 2;
  IF finding_count <> 0 THEN
    RAISE EXCEPTION 'BL-DB-05 invalid accepted Plan history: Calendar projection participants are incomplete (%)', finding_count;
  END IF;

  SELECT COUNT(*) INTO finding_count
  FROM "PlanOutcomeResponse" outcome
  JOIN "_bl_db05_chain_map" map ON map."revisionId" = outcome."planId"
  JOIN "_bl_db05_chain_facts" facts ON facts."rootId" = map."rootId"
  WHERE facts."existingCommitmentCount" = 0
    AND (
      outcome."planId" IS DISTINCT FROM facts."acceptedRevisionId"
      OR outcome."planCommitmentId" IS NOT NULL
      OR outcome."userId" NOT IN (facts."participantAId", facts."participantBId")
    );
  IF finding_count <> 0 THEN
    RAISE EXCEPTION 'BL-DB-05 invalid Outcome history: response is not owned by the accepted Plan pair (%)', finding_count;
  END IF;

  SELECT COUNT(*) INTO finding_count
  FROM (
    SELECT
      COALESCE(outcome."planCommitmentId", facts."generatedCommitmentId") AS commitment_id,
      outcome."userId"
    FROM "PlanOutcomeResponse" outcome
    JOIN "PlanRequest" revision ON revision."id" = outcome."planId"
    LEFT JOIN "_bl_db05_chain_map" map ON map."revisionId" = revision."id"
    LEFT JOIN "_bl_db05_chain_facts" facts
      ON facts."rootId" = map."rootId" AND facts."existingCommitmentCount" = 0
    GROUP BY COALESCE(outcome."planCommitmentId", facts."generatedCommitmentId"), outcome."userId"
    HAVING COUNT(*) > 1
  ) duplicates;
  IF finding_count <> 0 THEN
    RAISE EXCEPTION 'BL-DB-05 ambiguous Outcome history: duplicate participant responses would collapse (%)', finding_count;
  END IF;

  SELECT COUNT(*) INTO finding_count
  FROM (
    SELECT
      COALESCE(calendar."planCommitmentId", facts."generatedCommitmentId") AS commitment_id,
      calendar."userId"
    FROM "CalendarEntry" calendar
    LEFT JOIN "_bl_db05_chain_map" map ON map."revisionId" = calendar."planRequestId"
    LEFT JOIN "_bl_db05_chain_facts" facts
      ON facts."rootId" = map."rootId" AND facts."existingCommitmentCount" = 0
    WHERE calendar."planCommitmentId" IS NOT NULL OR facts."generatedCommitmentId" IS NOT NULL
    GROUP BY COALESCE(calendar."planCommitmentId", facts."generatedCommitmentId"), calendar."userId"
    HAVING COUNT(*) > 1
  ) duplicates;
  IF finding_count <> 0 THEN
    RAISE EXCEPTION 'BL-DB-05 ambiguous Calendar history: duplicate stable participant projections would collapse (%)', finding_count;
  END IF;
END
$preflight$;

INSERT INTO "PlanCommitment" (
  "id",
  "connectionId",
  "participantAId",
  "participantBId",
  "originActionId",
  "originContextId",
  "status",
  "currentAcceptedRevisionId",
  "currentPendingRevisionId",
  "confirmedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  facts."generatedCommitmentId",
  facts."connectionId",
  facts."participantAId",
  facts."participantBId",
  facts."originActionId",
  facts."originContextId",
  CASE
    WHEN facts."acceptedCount" = 1 THEN 'CONFIRMED'::"PlanCommitmentStatus"
    WHEN facts."pendingCount" = 1 THEN 'NEGOTIATING'::"PlanCommitmentStatus"
    ELSE 'CLOSED'::"PlanCommitmentStatus"
  END,
  facts."acceptedRevisionId",
  facts."pendingRevisionId",
  NULL,
  facts."createdAt",
  facts."updatedAt"
FROM "_bl_db05_chain_facts" facts
WHERE facts."existingCommitmentCount" = 0;

UPDATE "PlanRequest" revision
SET
  "commitmentId" = facts."generatedCommitmentId",
  "revisionKind" = 'INITIAL',
  "originActionId" = facts."originActionId",
  "originContextId" = facts."originContextId"
FROM "_bl_db05_chain_map" map
JOIN "_bl_db05_chain_facts" facts ON facts."rootId" = map."rootId"
WHERE revision."id" = map."revisionId"
  AND facts."existingCommitmentCount" = 0;

UPDATE "CalendarEntry" calendar
SET
  "planCommitmentId" = facts."generatedCommitmentId",
  "projectionStatus" = 'ACTIVE'
FROM "_bl_db05_chain_map" map
JOIN "_bl_db05_chain_facts" facts ON facts."rootId" = map."rootId"
WHERE calendar."planRequestId" = map."revisionId"
  AND facts."existingCommitmentCount" = 0
  AND map."revisionId" = facts."acceptedRevisionId";

UPDATE "PlanOutcomeResponse" outcome
SET "planCommitmentId" = facts."generatedCommitmentId"
FROM "_bl_db05_chain_map" map
JOIN "_bl_db05_chain_facts" facts ON facts."rootId" = map."rootId"
WHERE outcome."planId" = map."revisionId"
  AND facts."existingCommitmentCount" = 0
  AND map."revisionId" = facts."acceptedRevisionId";

DO $verify$
DECLARE
  finding_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO finding_count
  FROM "PlanRequest"
  WHERE "commitmentId" IS NULL OR "revisionKind" IS NULL;
  IF finding_count <> 0 THEN
    RAISE EXCEPTION 'BL-DB-05 post-verification failed: unowned historical revisions remain (%)', finding_count;
  END IF;

  SELECT COUNT(*) INTO finding_count
  FROM "CalendarEntry" calendar
  JOIN "PlanRequest" revision ON revision."id" = calendar."planRequestId"
  WHERE calendar."planCommitmentId" IS DISTINCT FROM revision."commitmentId";
  IF finding_count <> 0 THEN
    RAISE EXCEPTION 'BL-DB-05 post-verification failed: Calendar ownership mismatch (%)', finding_count;
  END IF;

  SELECT COUNT(*) INTO finding_count
  FROM "PlanOutcomeResponse" outcome
  JOIN "PlanRequest" revision ON revision."id" = outcome."planId"
  WHERE outcome."planCommitmentId" IS DISTINCT FROM revision."commitmentId";
  IF finding_count <> 0 THEN
    RAISE EXCEPTION 'BL-DB-05 post-verification failed: Outcome ownership mismatch (%)', finding_count;
  END IF;
END
$verify$;

CREATE UNIQUE INDEX "PlanRequest_one_pending_per_origin_action"
  ON "PlanRequest" ("originActionId")
  WHERE "originActionId" IS NOT NULL AND "status" = 'PENDING';

CREATE UNIQUE INDEX "PlanRequest_one_pending_per_commitment"
  ON "PlanRequest" ("commitmentId")
  WHERE "commitmentId" IS NOT NULL AND "status" = 'PENDING';

CREATE UNIQUE INDEX "CalendarEntry_userId_planCommitmentId_key"
  ON "CalendarEntry" ("userId", "planCommitmentId");

CREATE UNIQUE INDEX "PlanOutcomeResponse_planCommitmentId_userId_key"
  ON "PlanOutcomeResponse" ("planCommitmentId", "userId");

ALTER TABLE "PlanRequest"
  ADD CONSTRAINT "PlanRequest_commitment_revision_kind_check"
  CHECK (
    ("commitmentId" IS NULL AND "revisionKind" IS NULL)
    OR
    ("commitmentId" IS NOT NULL AND "revisionKind" IS NOT NULL)
  );

ALTER TABLE "PlanCommitment"
  ADD CONSTRAINT "PlanCommitment_pointer_shape_check"
  CHECK (
    ("currentAcceptedRevisionId" IS NULL OR "currentAcceptedRevisionId" <> "currentPendingRevisionId")
    AND
    CASE "status"
      -- The pending half is cross-row and is verified by the deferred trigger.
      -- Keeping it out of this immediate CHECK permits the transaction-local
      -- insert order Commitment -> revision -> pointer.
      WHEN 'NEGOTIATING' THEN "currentAcceptedRevisionId" IS NULL
      WHEN 'CONFIRMED' THEN "currentAcceptedRevisionId" IS NOT NULL
      WHEN 'CANCELED' THEN "currentAcceptedRevisionId" IS NOT NULL AND "currentPendingRevisionId" IS NULL
      WHEN 'CLOSED' THEN "currentPendingRevisionId" IS NULL
    END
  );

CREATE FUNCTION "_bl_db05_validate_plan_commitment"(target_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  commitment_row "PlanCommitment"%ROWTYPE;
  accepted_row "PlanRequest"%ROWTYPE;
  pending_row "PlanRequest"%ROWTYPE;
  connection_a TEXT;
  connection_b TEXT;
  pending_count BIGINT;
  mismatch_count BIGINT;
BEGIN
  IF target_id IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO commitment_row
  FROM "PlanCommitment"
  WHERE "id" = target_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF (commitment_row."status" = 'NEGOTIATING' AND (
        commitment_row."currentAcceptedRevisionId" IS NOT NULL
        OR commitment_row."currentPendingRevisionId" IS NULL
      ))
     OR (commitment_row."status" = 'CONFIRMED'
       AND commitment_row."currentAcceptedRevisionId" IS NULL)
     OR (commitment_row."status" = 'CANCELED' AND (
       commitment_row."currentAcceptedRevisionId" IS NULL
       OR commitment_row."currentPendingRevisionId" IS NOT NULL
     ))
     OR (commitment_row."status" = 'CLOSED'
       AND commitment_row."currentPendingRevisionId" IS NOT NULL)
     OR (
       commitment_row."currentAcceptedRevisionId" IS NOT NULL
       AND commitment_row."currentAcceptedRevisionId" = commitment_row."currentPendingRevisionId"
     ) THEN
    RAISE EXCEPTION 'PlanCommitment % pointer shape does not match status %',
      target_id, commitment_row."status"
      USING ERRCODE = '23514';
  END IF;

  SELECT "userAId", "userBId" INTO connection_a, connection_b
  FROM "Connection"
  WHERE "id" = commitment_row."connectionId";

  IF NOT FOUND OR commitment_row."participantAId" = commitment_row."participantBId"
     OR NOT (
       (commitment_row."participantAId" = connection_a AND commitment_row."participantBId" = connection_b)
       OR
       (commitment_row."participantAId" = connection_b AND commitment_row."participantBId" = connection_a)
     ) THEN
    RAISE EXCEPTION 'PlanCommitment % participants must equal its Connection pair', target_id
      USING ERRCODE = '23514';
  END IF;

  SELECT COUNT(*) INTO mismatch_count
  FROM "PlanRequest" revision
  WHERE revision."commitmentId" = target_id
    AND (
      revision."revisionKind" IS NULL
      OR revision."connectionId" <> commitment_row."connectionId"
      OR NOT (
        (revision."proposerUserId" = commitment_row."participantAId" AND revision."receiverUserId" = commitment_row."participantBId")
        OR
        (revision."proposerUserId" = commitment_row."participantBId" AND revision."receiverUserId" = commitment_row."participantAId")
      )
    );
  IF mismatch_count <> 0 THEN
    RAISE EXCEPTION 'PlanCommitment % has a revision owned by another pair', target_id
      USING ERRCODE = '23514';
  END IF;

  IF commitment_row."currentAcceptedRevisionId" IS NOT NULL THEN
    SELECT * INTO accepted_row
    FROM "PlanRequest"
    WHERE "id" = commitment_row."currentAcceptedRevisionId";
    IF NOT FOUND OR accepted_row."commitmentId" IS DISTINCT FROM target_id
       OR accepted_row."status" <> 'ACCEPTED' THEN
      RAISE EXCEPTION 'PlanCommitment % accepted pointer must reference its ACCEPTED revision', target_id
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF commitment_row."currentPendingRevisionId" IS NOT NULL THEN
    SELECT * INTO pending_row
    FROM "PlanRequest"
    WHERE "id" = commitment_row."currentPendingRevisionId";
    IF NOT FOUND OR pending_row."commitmentId" IS DISTINCT FROM target_id
       OR pending_row."status" <> 'PENDING' THEN
      RAISE EXCEPTION 'PlanCommitment % pending pointer must reference its PENDING revision', target_id
        USING ERRCODE = '23514';
    END IF;
    IF commitment_row."status" = 'NEGOTIATING'
       AND pending_row."revisionKind" <> 'INITIAL' THEN
      RAISE EXCEPTION 'PlanCommitment % negotiating pointer must reference an INITIAL revision', target_id
        USING ERRCODE = '23514';
    END IF;
    IF commitment_row."status" = 'CONFIRMED'
       AND pending_row."revisionKind" <> 'RESCHEDULE' THEN
      RAISE EXCEPTION 'PlanCommitment % confirmed pending pointer must reference a RESCHEDULE revision', target_id
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT COUNT(*) INTO pending_count
  FROM "PlanRequest"
  WHERE "commitmentId" = target_id AND "status" = 'PENDING';

  IF pending_count > 1
     OR (pending_count = 1 AND commitment_row."currentPendingRevisionId" IS NULL)
     OR (pending_count = 0 AND commitment_row."currentPendingRevisionId" IS NOT NULL) THEN
    RAISE EXCEPTION 'PlanCommitment % pending pointer must equal its only PENDING revision', target_id
      USING ERRCODE = '23514';
  END IF;
END
$function$;

CREATE FUNCTION "_bl_db05_plan_commitment_constraint_trigger"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM "_bl_db05_validate_plan_commitment"(OLD."id");
  ELSE
    PERFORM "_bl_db05_validate_plan_commitment"(NEW."id");
    IF TG_OP = 'UPDATE' AND OLD."id" IS DISTINCT FROM NEW."id" THEN
      PERFORM "_bl_db05_validate_plan_commitment"(OLD."id");
    END IF;
  END IF;
  RETURN NULL;
END
$function$;

CREATE FUNCTION "_bl_db05_plan_revision_constraint_trigger"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM "_bl_db05_validate_plan_commitment"(OLD."commitmentId");
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM "_bl_db05_validate_plan_commitment"(NEW."commitmentId");
  END IF;
  RETURN NULL;
END
$function$;

CREATE CONSTRAINT TRIGGER "PlanCommitment_revision_pointer_state"
AFTER INSERT OR UPDATE OR DELETE ON "PlanCommitment"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "_bl_db05_plan_commitment_constraint_trigger"();

CREATE CONSTRAINT TRIGGER "PlanRequest_commitment_pointer_state"
AFTER INSERT OR UPDATE OR DELETE ON "PlanRequest"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "_bl_db05_plan_revision_constraint_trigger"();

COMMIT;
