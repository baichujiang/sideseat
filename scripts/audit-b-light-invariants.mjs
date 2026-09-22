#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import {
  checkFromRows,
  commonHelp,
  findingQuery,
  hasColumns,
  loadTableCatalog,
  parseAuditArgs,
  printReport,
  quoteIdentifier,
  reportsExitCode,
  runReadOnlyTargets,
  sanitizeError,
  skippedCheck,
  summarizeChecks,
} from "./lib/b-light-audit-core.mjs";

const TABLES = [
  "Connection",
  "Message",
  "ActionInterest",
  "ActionInterestActivation",
  "ActionCoordinationContext",
  "PlanCommitment",
  "PlanRequest",
  "CalendarEntry",
  "PlanOutcomeResponse",
];

export async function collectInvariantAudit({ query, schema, strict = false }) {
  const catalog = await loadTableCatalog(query, schema, TABLES);
  const checks = [];

  checks.push(await duplicateConnectionPairs(query, schema, catalog));
  checks.push(await duplicateSourceCards(query, schema, catalog));
  checks.push(await invalidActionInterestActivationShapes(query, schema, catalog));
  checks.push(await multiplePendingOrigins(query, schema, catalog));
  checks.push(await multiplePendingCommitmentRevisions(query, schema, catalog));
  checks.push(await invalidCommitmentRevisionPointers(query, schema, catalog));
  checks.push(await ambiguousCounterChains(query, schema, catalog));
  checks.push(await stableCalendarOwnership(query, schema, catalog));
  checks.push(await projectionIntegrity(query, schema, catalog));
  checks.push(await stableOutcomeOwnership(query, schema, catalog));
  checks.push(await duplicateOutcomeResponses(query, schema, catalog));

  const summary = summarizeChecks(checks, strict);
  return {
    status: summary.status,
    summary,
    checks,
  };
}

async function invalidActionInterestActivationShapes(query, schema, catalog) {
  const id = "invalid_action_interest_activation_shapes";
  const label = "Invalid ActionInterestActivation connected/terminal shapes";
  if (
    !hasColumns(catalog, "ActionInterestActivation", [
      "id",
      "connectedAt",
      "firstContentType",
      "terminalReason",
      "terminalAt",
    ])
  ) {
    return skippedCheck(
      id,
      label,
      "ActionInterestActivation lifecycle columns are not deployed.",
    );
  }
  const table = `${quoteIdentifier(schema)}.${quoteIdentifier("ActionInterestActivation")}`;
  const result = await query(
    findingQuery(`
      SELECT
        "id" AS entity_id,
        ARRAY_REMOVE(ARRAY[
          CASE
            WHEN ("connectedAt" IS NULL) <> ("firstContentType" IS NULL)
            THEN 'CONNECTED_CONTENT_MISMATCH'
          END,
          CASE
            WHEN "connectedAt" IS NOT NULL AND "terminalReason" IS NOT NULL
            THEN 'CONNECTED_AND_TERMINAL'
          END,
          CASE
            WHEN ("terminalReason" IS NULL) <> ("terminalAt" IS NULL)
            THEN 'TERMINAL_PAIR_MISMATCH'
          END
        ], NULL) AS violation_codes
      FROM ${table}
      WHERE ("connectedAt" IS NULL) <> ("firstContentType" IS NULL)
         OR ("connectedAt" IS NOT NULL AND "terminalReason" IS NOT NULL)
         OR ("terminalReason" IS NULL) <> ("terminalAt" IS NULL)
    `),
  );
  return checkFromRows(id, label, result.rows);
}

async function duplicateConnectionPairs(query, schema, catalog) {
  const id = "duplicate_connection_pairs";
  const label = "Duplicate unordered Connection pairs";
  if (!hasColumns(catalog, "Connection", ["id", "userAId", "userBId", "createdAt"])) {
    return skippedCheck(id, label, "Connection pair columns are not deployed.");
  }
  const table = `${quoteIdentifier(schema)}.${quoteIdentifier("Connection")}`;
  const result = await query(
    findingQuery(`
      SELECT
        SUBSTRING(MD5(LEAST("userAId", "userBId") || ':' || GREATEST("userAId", "userBId")), 1, 16) AS entity_id,
        COUNT(*)::text AS connection_count,
        ARRAY_AGG("id" ORDER BY "createdAt", "id") AS connection_ids
      FROM ${table}
      GROUP BY LEAST("userAId", "userBId"), GREATEST("userAId", "userBId")
      HAVING COUNT(*) > 1
    `),
  );
  return checkFromRows(id, label, result.rows);
}

async function duplicateSourceCards(query, schema, catalog) {
  const id = "duplicate_source_cards";
  const label = "Duplicate Action source cards";
  const groupingColumns = ["actionContextId", "actionInterestId"].filter((column) =>
    hasColumns(catalog, "Message", [column]),
  );
  if (
    groupingColumns.length === 0 ||
    !hasColumns(catalog, "Message", ["id", "type", "createdAt"])
  ) {
    return skippedCheck(id, label, "Message source-card attribution columns are not deployed.");
  }
  const table = `${quoteIdentifier(schema)}.${quoteIdentifier("Message")}`;
  const supportsEffectiveInterest =
    hasColumns(catalog, "Message", ["actionContextId", "actionInterestId"]) &&
    hasColumns(catalog, "ActionCoordinationContext", ["id", "interestId"]);
  if (supportsEffectiveInterest) {
    const context = `${quoteIdentifier(schema)}.${quoteIdentifier("ActionCoordinationContext")}`;
    const supportsConnectionIdentity =
      hasColumns(catalog, "Message", ["connectionId"]) &&
      hasColumns(catalog, "ActionInterest", ["id", "connectionId"]) &&
      hasColumns(catalog, "ActionCoordinationContext", ["connectionId"]);
    const interest = `${quoteIdentifier(schema)}.${quoteIdentifier("ActionInterest")}`;
    const connectionSelect = supportsConnectionIdentity
      ? `,
            message."connectionId" AS message_connection_id,
            interest."connectionId" AS interest_connection_id,
            effective_context."connectionId" AS context_connection_id`
      : `,
            NULL::text AS message_connection_id,
            NULL::text AS interest_connection_id,
            NULL::text AS context_connection_id`;
    const interestJoin = supportsConnectionIdentity
      ? `
          LEFT JOIN ${interest} interest
            ON interest."id" = COALESCE(
              message."actionInterestId",
              explicit_context."interestId"
            )
          LEFT JOIN ${context} effective_context
            ON effective_context."interestId" = interest."id"`
      : "";
    const connectionIssues = supportsConnectionIdentity
      ? `
          UNION ALL

          SELECT
            'message:' || message_id AS entity_id,
            'MESSAGE_INTEREST_CONNECTION_MISMATCH'::text AS issue,
            action_interest_id,
            action_context_id,
            context_interest_id,
            effective_interest_id,
            '1'::text AS card_count,
            ARRAY[message_id]::text[] AS message_ids
          FROM source_cards
          WHERE effective_interest_id IS NOT NULL
            AND (
              (
                interest_connection_id IS NULL
                AND context_connection_id IS NULL
              )
              OR (
                interest_connection_id IS NOT NULL
                AND message_connection_id IS DISTINCT FROM interest_connection_id
              )
            )

          UNION ALL

          SELECT
            'message:' || message_id AS entity_id,
            'MESSAGE_CONTEXT_CONNECTION_MISMATCH'::text AS issue,
            action_interest_id,
            action_context_id,
            context_interest_id,
            effective_interest_id,
            '1'::text AS card_count,
            ARRAY[message_id]::text[] AS message_ids
          FROM source_cards
          WHERE effective_interest_id IS NOT NULL
            AND context_connection_id IS NOT NULL
            AND message_connection_id IS DISTINCT FROM context_connection_id

          UNION ALL

          SELECT
            'message:' || message_id AS entity_id,
            'INTEREST_CONTEXT_CONNECTION_MISMATCH'::text AS issue,
            action_interest_id,
            action_context_id,
            context_interest_id,
            effective_interest_id,
            '1'::text AS card_count,
            ARRAY[message_id]::text[] AS message_ids
          FROM source_cards
          WHERE effective_interest_id IS NOT NULL
            AND interest_connection_id IS NOT NULL
            AND context_connection_id IS NOT NULL
            AND interest_connection_id IS DISTINCT FROM context_connection_id
        `
      : "";
    const result = await query(
      findingQuery(`
        WITH source_cards AS (
          SELECT
            message."id" AS message_id,
            message."createdAt" AS created_at,
            message."actionInterestId" AS action_interest_id,
            message."actionContextId" AS action_context_id,
            explicit_context."interestId" AS context_interest_id,
            COALESCE(message."actionInterestId", explicit_context."interestId")
              AS effective_interest_id
            ${connectionSelect}
          FROM ${table} message
          LEFT JOIN ${context} explicit_context
            ON explicit_context."id" = message."actionContextId"
          ${interestJoin}
          WHERE message."type"::text = 'ACTION_INTEREST_CARD'
        ), card_issues AS (
          SELECT
            'message:' || message_id AS entity_id,
            'UNATTRIBUTED_CARD'::text AS issue,
            action_interest_id,
            action_context_id,
            context_interest_id,
            effective_interest_id,
            '1'::text AS card_count,
            ARRAY[message_id]::text[] AS message_ids
          FROM source_cards
          WHERE action_interest_id IS NULL
            AND action_context_id IS NULL

          UNION ALL

          SELECT
            'message:' || message_id AS entity_id,
            'UNRESOLVED_CONTEXT'::text AS issue,
            action_interest_id,
            action_context_id,
            context_interest_id,
            effective_interest_id,
            '1'::text AS card_count,
            ARRAY[message_id]::text[] AS message_ids
          FROM source_cards
          WHERE action_context_id IS NOT NULL
            AND context_interest_id IS NULL

          UNION ALL

          SELECT
            'message:' || message_id AS entity_id,
            'CONTEXT_ONLY_CANONICAL'::text AS issue,
            action_interest_id,
            action_context_id,
            context_interest_id,
            effective_interest_id,
            '1'::text AS card_count,
            ARRAY[message_id]::text[] AS message_ids
          FROM source_cards
          WHERE action_context_id IS NOT NULL
            AND context_interest_id IS NOT NULL
            AND action_interest_id IS NULL

          UNION ALL

          SELECT
            'message:' || message_id AS entity_id,
            'CONTEXT_INTEREST_MISMATCH'::text AS issue,
            action_interest_id,
            action_context_id,
            context_interest_id,
            effective_interest_id,
            '1'::text AS card_count,
            ARRAY[message_id]::text[] AS message_ids
          FROM source_cards
          WHERE action_interest_id IS NOT NULL
            AND context_interest_id IS NOT NULL
            AND action_interest_id <> context_interest_id

          ${connectionIssues}

          UNION ALL

          SELECT
            'interest:' || effective_interest_id AS entity_id,
            'DUPLICATE_EFFECTIVE_INTEREST'::text AS issue,
            NULL::text AS action_interest_id,
            NULL::text AS action_context_id,
            NULL::text AS context_interest_id,
            effective_interest_id,
            COUNT(*)::text AS card_count,
            ARRAY_AGG(message_id ORDER BY created_at, message_id) AS message_ids
          FROM source_cards
          WHERE effective_interest_id IS NOT NULL
          GROUP BY effective_interest_id
          HAVING COUNT(*) > 1
        )
        SELECT *
        FROM card_issues
      `),
    );
    return checkFromRows(id, label, result.rows, {
      groupingColumns,
      effectiveGrouping: true,
      connectionIdentityChecked: supportsConnectionIdentity,
    });
  }
  const scopedCards = groupingColumns
    .map((column) => {
      const group = quoteIdentifier(column);
      return `
        SELECT
          '${column}'::text AS attribution_scope,
          ${group}::text AS attribution_id,
          "id" AS message_id,
          "createdAt" AS created_at
        FROM ${table}
        WHERE ${group} IS NOT NULL
          AND "type"::text = 'ACTION_INTEREST_CARD'
      `;
    })
    .join("\nUNION ALL\n");
  const result = await query(
    findingQuery(`
      WITH scoped_cards AS (
        ${scopedCards}
      )
      SELECT
        attribution_scope || ':' || attribution_id AS entity_id,
        attribution_scope,
        attribution_id,
        COUNT(*)::text AS card_count,
        ARRAY_AGG(message_id ORDER BY created_at, message_id) AS message_ids
      FROM scoped_cards
      GROUP BY attribution_scope, attribution_id
      HAVING COUNT(*) > 1
    `),
  );
  return checkFromRows(id, label, result.rows, { groupingColumns });
}

async function multiplePendingOrigins(query, schema, catalog) {
  const id = "multiple_pending_origins";
  const label = "More than one PENDING Plan revision per origin Action";
  const stableSurfaceDetected = hasColumns(catalog, "PlanRequest", ["originActionId"]);
  const table = `${quoteIdentifier(schema)}.${quoteIdentifier("PlanRequest")}`;
  if (stableSurfaceDetected) {
    if (
      !hasColumns(catalog, "PlanRequest", [
        "id",
        "status",
        "originActionId",
        "createdAt",
      ])
    ) {
      return skippedCheck(
        id,
        label,
        "Stable originActionId uniqueness columns are only partially deployed.",
      );
    }
    const result = await query(
      findingQuery(`
        SELECT
          "originActionId" AS entity_id,
          "originActionId" AS origin_action_id,
          COUNT(*)::text AS pending_count,
          ARRAY_AGG("id" ORDER BY "createdAt", "id") AS revision_ids
        FROM ${table}
        WHERE "status"::text = 'PENDING'
          AND "originActionId" IS NOT NULL
        GROUP BY "originActionId"
        HAVING COUNT(*) > 1
      `),
    );
    return checkFromRows(id, label, result.rows, {
      identityColumns: ["originActionId"],
      model: "STABLE",
    });
  }
  if (
    !hasColumns(catalog, "PlanRequest", [
      "id",
      "status",
      "originKind",
      "originId",
      "createdAt",
    ])
  ) {
    return skippedCheck(id, label, "Plan origin columns are not deployed.");
  }
  const result = await query(
    findingQuery(`
      SELECT
        "originKind"::text || ':' || "originId" AS entity_id,
        "originKind"::text AS origin_kind,
        "originId" AS origin_id,
        COUNT(*)::text AS pending_count,
        ARRAY_AGG("id" ORDER BY "createdAt", "id") AS revision_ids
      FROM ${table}
      WHERE "status"::text = 'PENDING'
        AND "originKind" IS NOT NULL
        AND "originId" IS NOT NULL
      GROUP BY "originKind", "originId"
      HAVING COUNT(*) > 1
    `),
  );
  return checkFromRows(id, label, result.rows, {
    identityColumns: ["originKind", "originId"],
    model: "LEGACY",
  });
}

async function multiplePendingCommitmentRevisions(query, schema, catalog) {
  const id = "multiple_pending_commitment_revisions";
  const label = "More than one PENDING revision per PlanCommitment";
  if (
    !hasColumns(catalog, "PlanRequest", [
      "id",
      "status",
      "commitmentId",
      "createdAt",
    ])
  ) {
    return skippedCheck(
      id,
      label,
      "PlanCommitment revision ownership columns are not deployed.",
    );
  }
  const table = `${quoteIdentifier(schema)}.${quoteIdentifier("PlanRequest")}`;
  const result = await query(
    findingQuery(`
      SELECT
        "commitmentId" AS entity_id,
        COUNT(*)::text AS pending_count,
        ARRAY_AGG("id" ORDER BY "createdAt", "id") AS revision_ids
      FROM ${table}
      WHERE "status"::text = 'PENDING'
        AND "commitmentId" IS NOT NULL
      GROUP BY "commitmentId"
      HAVING COUNT(*) > 1
    `),
  );
  return checkFromRows(id, label, result.rows, {
    identityColumns: ["commitmentId"],
  });
}

async function invalidCommitmentRevisionPointers(query, schema, catalog) {
  const id = "invalid_commitment_revision_pointers";
  const label = "Invalid PlanCommitment accepted/pending revision pointers";
  const stableSurfaceDetected = catalog.has("PlanCommitment");
  const supportsPointers =
    hasColumns(catalog, "PlanCommitment", [
      "id",
      "status",
      "currentAcceptedRevisionId",
      "currentPendingRevisionId",
    ]) &&
    hasColumns(catalog, "PlanRequest", [
      "id",
      "commitmentId",
      "status",
      "revisionKind",
    ]);
  if (stableSurfaceDetected && !supportsPointers) {
    return skippedCheck(
      id,
      label,
      "PlanCommitment pointer or revision-state columns are only partially deployed.",
    );
  }
  if (!supportsPointers) {
    return skippedCheck(id, label, "PlanCommitment pointers are not deployed.");
  }
  const commitment = `${quoteIdentifier(schema)}.${quoteIdentifier("PlanCommitment")}`;
  const revision = `${quoteIdentifier(schema)}.${quoteIdentifier("PlanRequest")}`;
  const result = await query(
    findingQuery(`
      SELECT
        commitment."id" AS entity_id,
        commitment."status"::text AS commitment_status,
        commitment."currentAcceptedRevisionId" AS accepted_revision_id,
        accepted."status"::text AS accepted_revision_status,
        accepted."commitmentId" AS accepted_revision_commitment_id,
        commitment."currentPendingRevisionId" AS pending_revision_id,
        pending."status"::text AS pending_revision_status,
        pending."revisionKind"::text AS pending_revision_kind,
        pending."commitmentId" AS pending_revision_commitment_id,
        ARRAY_REMOVE(ARRAY[
          CASE
            WHEN commitment."status"::text = 'NEGOTIATING'
              AND commitment."currentAcceptedRevisionId" IS NOT NULL
            THEN 'NONCONFIRMED_ACCEPTED_POINTER'
          END,
          CASE
            WHEN commitment."status"::text IN ('CONFIRMED', 'CANCELED')
              AND commitment."currentAcceptedRevisionId" IS NULL
            THEN 'MISSING_ACCEPTED_POINTER'
          END,
          CASE
            WHEN commitment."currentAcceptedRevisionId" IS NOT NULL
              AND accepted."id" IS NULL
            THEN 'UNRESOLVED_ACCEPTED_POINTER'
          END,
          CASE
            WHEN accepted."id" IS NOT NULL
              AND accepted."commitmentId" IS DISTINCT FROM commitment."id"
            THEN 'ACCEPTED_REVISION_WRONG_COMMITMENT'
          END,
          CASE
            WHEN accepted."id" IS NOT NULL
              AND accepted."status"::text <> 'ACCEPTED'
            THEN 'ACCEPTED_POINTER_WRONG_STATUS'
          END,
          CASE
            WHEN commitment."currentPendingRevisionId" IS NOT NULL
              AND pending."id" IS NULL
            THEN 'UNRESOLVED_PENDING_POINTER'
          END,
          CASE
            WHEN commitment."status"::text = 'NEGOTIATING'
              AND commitment."currentPendingRevisionId" IS NULL
            THEN 'MISSING_PENDING_POINTER'
          END,
          CASE
            WHEN pending."id" IS NOT NULL
              AND pending."commitmentId" IS DISTINCT FROM commitment."id"
            THEN 'PENDING_REVISION_WRONG_COMMITMENT'
          END,
          CASE
            WHEN pending."id" IS NOT NULL
              AND pending."status"::text <> 'PENDING'
            THEN 'PENDING_POINTER_WRONG_STATUS'
          END,
          CASE
            WHEN pending."id" IS NOT NULL
              AND commitment."status"::text = 'NEGOTIATING'
              AND pending."revisionKind"::text IS DISTINCT FROM 'INITIAL'
            THEN 'NEGOTIATING_PENDING_NOT_INITIAL'
          END,
          CASE
            WHEN pending."id" IS NOT NULL
              AND commitment."status"::text = 'CONFIRMED'
              AND pending."revisionKind"::text IS DISTINCT FROM 'RESCHEDULE'
            THEN 'CONFIRMED_PENDING_NOT_RESCHEDULE'
          END,
          CASE
            WHEN commitment."status"::text IN ('CLOSED', 'CANCELED')
              AND commitment."currentPendingRevisionId" IS NOT NULL
            THEN 'TERMINAL_COMMITMENT_PENDING_POINTER'
          END,
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM ${revision} actionable
              WHERE actionable."commitmentId" = commitment."id"
                AND actionable."status"::text = 'PENDING'
                AND actionable."id" IS DISTINCT FROM
                  commitment."currentPendingRevisionId"
            )
            THEN 'PENDING_REVISION_NOT_CURRENT'
          END
        ], NULL) AS violation_codes
      FROM ${commitment} commitment
      LEFT JOIN ${revision} accepted
        ON accepted."id" = commitment."currentAcceptedRevisionId"
      LEFT JOIN ${revision} pending
        ON pending."id" = commitment."currentPendingRevisionId"
      WHERE (
          commitment."status"::text = 'NEGOTIATING'
          AND commitment."currentAcceptedRevisionId" IS NOT NULL
        )
        OR (
          commitment."status"::text IN ('CONFIRMED', 'CANCELED')
          AND commitment."currentAcceptedRevisionId" IS NULL
        )
        OR (
          commitment."currentAcceptedRevisionId" IS NOT NULL
          AND (
            accepted."id" IS NULL
            OR accepted."commitmentId" IS DISTINCT FROM commitment."id"
            OR accepted."status"::text <> 'ACCEPTED'
          )
        )
        OR (
          commitment."status"::text = 'NEGOTIATING'
          AND commitment."currentPendingRevisionId" IS NULL
        )
        OR (
          commitment."currentPendingRevisionId" IS NOT NULL
          AND (
            pending."id" IS NULL
            OR pending."commitmentId" IS DISTINCT FROM commitment."id"
            OR pending."status"::text <> 'PENDING'
            OR (
              commitment."status"::text = 'NEGOTIATING'
              AND pending."revisionKind"::text IS DISTINCT FROM 'INITIAL'
            )
            OR (
              commitment."status"::text = 'CONFIRMED'
              AND pending."revisionKind"::text IS DISTINCT FROM 'RESCHEDULE'
            )
          )
        )
        OR (
          commitment."status"::text IN ('CLOSED', 'CANCELED')
          AND commitment."currentPendingRevisionId" IS NOT NULL
        )
        OR EXISTS (
          SELECT 1
          FROM ${revision} actionable
          WHERE actionable."commitmentId" = commitment."id"
            AND actionable."status"::text = 'PENDING'
            AND actionable."id" IS DISTINCT FROM
              commitment."currentPendingRevisionId"
        )
    `),
  );
  return checkFromRows(id, label, result.rows);
}

async function ambiguousCounterChains(query, schema, catalog) {
  const id = "ambiguous_counter_chains";
  const label = "Ambiguous Plan counter chains";
  if (!hasColumns(catalog, "PlanRequest", ["id", "counterOfId", "status", "createdAt"])) {
    return skippedCheck(id, label, "Plan counter-chain columns are not deployed.");
  }
  const table = `${quoteIdentifier(schema)}.${quoteIdentifier("PlanRequest")}`;
  const branches = await query(
      findingQuery(`
        SELECT
          "counterOfId" AS entity_id,
          'BRANCH'::text AS ambiguity,
          COUNT(*)::text AS revision_count,
          ARRAY_AGG("id" ORDER BY "createdAt", "id") AS revision_ids
        FROM ${table}
        WHERE "counterOfId" IS NOT NULL
        GROUP BY "counterOfId"
        HAVING COUNT(*) > 1
      `),
    );
  const cycles = await query(
      findingQuery(`
        WITH RECURSIVE walk AS (
          SELECT
            "id" AS start_id,
            "counterOfId" AS next_id,
            ARRAY["id"]::text[] AS path,
            0 AS depth
          FROM ${table}
          WHERE "counterOfId" IS NOT NULL

          UNION ALL

          SELECT
            walk.start_id,
            parent."counterOfId" AS next_id,
            walk.path || parent."id",
            walk.depth + 1
          FROM walk
          JOIN ${table} parent ON parent."id" = walk.next_id
          WHERE NOT parent."id" = ANY(walk.path)
            AND walk.depth < 100
        ), cycle_or_depth AS (
          SELECT DISTINCT
            walk.start_id AS entity_id,
            CASE
              WHEN parent."id" = ANY(walk.path) THEN 'CYCLE'
              ELSE 'DEPTH_LIMIT'
            END::text AS ambiguity,
            walk.path AS revision_ids
          FROM walk
          JOIN ${table} parent ON parent."id" = walk.next_id
          WHERE parent."id" = ANY(walk.path)
             OR (walk.depth = 100 AND walk.next_id IS NOT NULL)
        )
        SELECT * FROM cycle_or_depth
      `),
    );
  const pendingRoots = await query(
      findingQuery(`
        WITH RECURSIVE ancestry AS (
          SELECT
            "id" AS revision_id,
            "id" AS ancestor_id,
            "counterOfId" AS parent_id,
            ARRAY["id"]::text[] AS path,
            0 AS depth
          FROM ${table}

          UNION ALL

          SELECT
            ancestry.revision_id,
            parent."id" AS ancestor_id,
            parent."counterOfId" AS parent_id,
            ancestry.path || parent."id",
            ancestry.depth + 1
          FROM ancestry
          JOIN ${table} parent ON parent."id" = ancestry.parent_id
          WHERE NOT parent."id" = ANY(ancestry.path)
            AND ancestry.depth < 100
        ), roots AS (
          SELECT revision_id, ancestor_id AS root_id
          FROM ancestry
          WHERE parent_id IS NULL
        )
        SELECT
          roots.root_id AS entity_id,
          'MULTIPLE_PENDING'::text AS ambiguity,
          COUNT(*) FILTER (WHERE revision."status"::text = 'PENDING')::text AS revision_count,
          ARRAY_AGG(revision."id" ORDER BY revision."createdAt", revision."id")
            FILTER (WHERE revision."status"::text = 'PENDING') AS revision_ids
        FROM roots
        JOIN ${table} revision ON revision."id" = roots.revision_id
        GROUP BY roots.root_id
        HAVING COUNT(*) FILTER (WHERE revision."status"::text = 'PENDING') > 1
      `),
    );
  const rows = [...branches.rows, ...cycles.rows, ...pendingRoots.rows];
  rows.sort((left, right) => String(left.entity_id).localeCompare(String(right.entity_id)));
  const normalized = rows.slice(0, 100).map((row) => {
    const finding = { ...row };
    delete finding.total_findings;
    return finding;
  });
  const total =
    countWindowTotal(branches.rows) + countWindowTotal(cycles.rows) + countWindowTotal(pendingRoots.rows);
  return {
    id,
    label,
    status: total === 0n ? "PASS" : "FAIL",
    findingCount: total.toString(),
    truncated: total > BigInt(normalized.length),
    findings: normalized,
  };
}

function countWindowTotal(rows) {
  return rows.length > 0 ? BigInt(rows[0].total_findings) : 0n;
}

async function stableCalendarOwnership(query, schema, catalog) {
  const id = "stable_calendar_ownership";
  const label = "Invalid or duplicate stable Calendar projection ownership";
  const stableSurfaceDetected =
    catalog.has("PlanCommitment") ||
    hasColumns(catalog, "CalendarEntry", ["planCommitmentId"]);
  const supportsStableOwnership =
    hasColumns(catalog, "PlanCommitment", [
      "id",
      "participantAId",
      "participantBId",
    ]) &&
    hasColumns(catalog, "PlanRequest", ["id", "commitmentId"]) &&
    hasColumns(catalog, "CalendarEntry", [
      "id",
      "userId",
      "planRequestId",
      "planCommitmentId",
    ]);
  if (stableSurfaceDetected && !supportsStableOwnership) {
    return skippedCheck(
      id,
      label,
      "Stable Calendar ownership columns are only partially deployed.",
    );
  }
  if (!supportsStableOwnership) {
    return skippedCheck(id, label, "Stable Calendar ownership is not deployed.");
  }

  const commitment = `${quoteIdentifier(schema)}.${quoteIdentifier("PlanCommitment")}`;
  const revision = `${quoteIdentifier(schema)}.${quoteIdentifier("PlanRequest")}`;
  const calendar = `${quoteIdentifier(schema)}.${quoteIdentifier("CalendarEntry")}`;
  const result = await query(
    findingQuery(`
      WITH projection_identity AS (
        SELECT
          calendar."id" AS calendar_id,
          calendar."userId" AS user_id,
          calendar."planRequestId" AS revision_id,
          revision."commitmentId" AS revision_commitment_id,
          calendar."planCommitmentId" AS projection_commitment_id,
          commitment."id" AS resolved_commitment_id,
          commitment."participantAId" AS participant_a_id,
          commitment."participantBId" AS participant_b_id
        FROM ${calendar} calendar
        LEFT JOIN ${revision} revision
          ON revision."id" = calendar."planRequestId"
        LEFT JOIN ${commitment} commitment
          ON commitment."id" = calendar."planCommitmentId"
      ), ownership_issues AS (
        SELECT
          'calendar:' || calendar_id AS entity_id,
          'MISSING_STABLE_COMMITMENT'::text AS issue,
          revision_id,
          revision_commitment_id,
          projection_commitment_id,
          user_id,
          '1'::text AS projection_count,
          ARRAY[calendar_id]::text[] AS calendar_ids
        FROM projection_identity
        WHERE revision_commitment_id IS NOT NULL
          AND projection_commitment_id IS NULL

        UNION ALL

        SELECT
          'calendar:' || calendar_id AS entity_id,
          'REVISION_COMMITMENT_MISMATCH'::text AS issue,
          revision_id,
          revision_commitment_id,
          projection_commitment_id,
          user_id,
          '1'::text AS projection_count,
          ARRAY[calendar_id]::text[] AS calendar_ids
        FROM projection_identity
        WHERE projection_commitment_id IS NOT NULL
          AND revision_id IS NOT NULL
          AND revision_commitment_id IS DISTINCT FROM projection_commitment_id

        UNION ALL

        SELECT
          'calendar:' || calendar_id AS entity_id,
          'UNRESOLVED_STABLE_COMMITMENT'::text AS issue,
          revision_id,
          revision_commitment_id,
          projection_commitment_id,
          user_id,
          '1'::text AS projection_count,
          ARRAY[calendar_id]::text[] AS calendar_ids
        FROM projection_identity
        WHERE projection_commitment_id IS NOT NULL
          AND resolved_commitment_id IS NULL

        UNION ALL

        SELECT
          'calendar:' || calendar_id AS entity_id,
          'NONPARTICIPANT_PROJECTION'::text AS issue,
          revision_id,
          revision_commitment_id,
          projection_commitment_id,
          user_id,
          '1'::text AS projection_count,
          ARRAY[calendar_id]::text[] AS calendar_ids
        FROM projection_identity
        WHERE resolved_commitment_id IS NOT NULL
          AND user_id NOT IN (participant_a_id, participant_b_id)

        UNION ALL

        SELECT
          'projection:' || "planCommitmentId" || ':' || "userId" AS entity_id,
          'DUPLICATE_STABLE_PROJECTION'::text AS issue,
          NULL::text AS revision_id,
          NULL::text AS revision_commitment_id,
          "planCommitmentId" AS projection_commitment_id,
          "userId" AS user_id,
          COUNT(*)::text AS projection_count,
          ARRAY_AGG("id" ORDER BY "id") AS calendar_ids
        FROM ${calendar}
        WHERE "planCommitmentId" IS NOT NULL
        GROUP BY "planCommitmentId", "userId"
        HAVING COUNT(*) > 1
      )
      SELECT *
      FROM ownership_issues
    `),
  );
  return checkFromRows(id, label, result.rows, {
    identityColumns: ["userId", "planCommitmentId"],
  });
}

async function projectionIntegrity(query, schema, catalog) {
  const id = "missing_or_divergent_calendar_projections";
  const label = "Missing or divergent Calendar projections";
  const stableSurfaceDetected =
    catalog.has("PlanCommitment") ||
    hasColumns(catalog, "CalendarEntry", ["planCommitmentId"]);
  const supportsStable =
    hasColumns(catalog, "PlanCommitment", [
      "id",
      "status",
      "participantAId",
      "participantBId",
      "currentAcceptedRevisionId",
    ]) &&
    hasColumns(catalog, "PlanRequest", [
      "id",
      "title",
      "location",
      "startTime",
      "endTime",
    ]) &&
    hasColumns(catalog, "CalendarEntry", [
      "id",
      "userId",
      "planCommitmentId",
      "projectionStatus",
      "title",
      "location",
      "startAt",
      "endAt",
    ]);
  const supportsLegacy =
    hasColumns(catalog, "PlanRequest", [
      "id",
      "status",
      "proposerUserId",
      "receiverUserId",
      "title",
      "location",
      "startTime",
      "endTime",
    ]) &&
    hasColumns(catalog, "CalendarEntry", [
      "id",
      "userId",
      "planRequestId",
      "title",
      "location",
      "startAt",
      "endAt",
    ]);

  if (stableSurfaceDetected && !supportsStable) {
    return skippedCheck(
      id,
      label,
      "Stable PlanCommitment projection columns, including projectionStatus, are incomplete.",
    );
  }
  if (!supportsStable && !supportsLegacy) {
    return skippedCheck(id, label, "Plan/Calendar projection columns are not deployed.");
  }

  const plan = `${quoteIdentifier(schema)}.${quoteIdentifier("PlanRequest")}`;
  const calendar = `${quoteIdentifier(schema)}.${quoteIdentifier("CalendarEntry")}`;
  const resultSets = [];
  const models = [];
  if (supportsStable) {
    const commitment = `${quoteIdentifier(schema)}.${quoteIdentifier("PlanCommitment")}`;
    const activePredicate = `calendar."projectionStatus"::text = 'ACTIVE'`;
    const canceledPredicate = `calendar."projectionStatus"::text = 'CANCELED'`;
    const stableResult = await query(
      findingQuery(`
        SELECT
          commitment."id" AS entity_id,
          commitment."status"::text AS commitment_status,
          COUNT(calendar."id")::text AS total_projection_count,
          COUNT(calendar."id") FILTER (WHERE ${activePredicate})::text AS active_projection_count,
          COUNT(calendar."id") FILTER (WHERE ${canceledPredicate})::text AS canceled_projection_count,
          COUNT(DISTINCT calendar."userId")::text AS distinct_users,
          COALESCE(BOOL_OR(
            calendar."userId" NOT IN (
              commitment."participantAId", commitment."participantBId"
            )
          ), false) AS participant_mismatch,
          COALESCE(BOOL_OR(
            (
              calendar."title" IS DISTINCT FROM revision."title"
              OR calendar."location" IS DISTINCT FROM revision."location"
              OR calendar."startAt" IS DISTINCT FROM revision."startTime"
              OR calendar."endAt" IS DISTINCT FROM revision."endTime"
            )
          ), false) AS shared_fact_mismatch
        FROM ${commitment} commitment
        LEFT JOIN ${plan} revision
          ON revision."id" = commitment."currentAcceptedRevisionId"
        LEFT JOIN ${calendar} calendar
          ON calendar."planCommitmentId" = commitment."id"
        WHERE commitment."status"::text IN ('CONFIRMED', 'CANCELED')
        GROUP BY commitment."id", commitment."participantAId", commitment."participantBId",
          revision."id", revision."title", revision."location", revision."startTime", revision."endTime"
        HAVING revision."id" IS NULL
          OR COUNT(calendar."id") <> 2
          OR COUNT(DISTINCT calendar."userId") <> 2
          OR (
            commitment."status"::text = 'CONFIRMED'
            AND COUNT(calendar."id") FILTER (WHERE ${activePredicate}) <> 2
          )
          OR (
            commitment."status"::text = 'CANCELED'
            AND (
              COUNT(calendar."id") FILTER (WHERE ${activePredicate}) <> 0
              OR COUNT(calendar."id") FILTER (WHERE ${canceledPredicate}) <> 2
            )
          )
          OR COALESCE(BOOL_OR(
            calendar."userId" NOT IN (
              commitment."participantAId", commitment."participantBId"
            )
          ), false)
          OR COALESCE(BOOL_OR(
            (
              calendar."title" IS DISTINCT FROM revision."title"
              OR calendar."location" IS DISTINCT FROM revision."location"
              OR calendar."startAt" IS DISTINCT FROM revision."startTime"
              OR calendar."endAt" IS DISTINCT FROM revision."endTime"
            )
          ), false)
      `),
    );
    resultSets.push(stableResult.rows.map((row) => ({ ...row, ownership_model: "STABLE" })));
    models.push("PlanCommitment");
  }
  if (supportsLegacy) {
    const legacyOnly = hasColumns(catalog, "PlanRequest", ["commitmentId"])
      ? `AND request."commitmentId" IS NULL`
      : "";
    const legacyResult = await query(
      findingQuery(`
        SELECT
          request."id" AS entity_id,
          COUNT(calendar."id")::text AS projection_count,
          COUNT(DISTINCT calendar."userId")::text AS distinct_users,
          COALESCE(BOOL_OR(
            calendar."userId" NOT IN (request."proposerUserId", request."receiverUserId")
          ), false) AS participant_mismatch,
          COALESCE(BOOL_OR(
            calendar."title" IS DISTINCT FROM request."title"
            OR calendar."location" IS DISTINCT FROM request."location"
            OR calendar."startAt" IS DISTINCT FROM request."startTime"
            OR calendar."endAt" IS DISTINCT FROM request."endTime"
          ), false) AS shared_fact_mismatch
        FROM ${plan} request
        LEFT JOIN ${calendar} calendar ON calendar."planRequestId" = request."id"
        WHERE request."status"::text = 'ACCEPTED'
          ${legacyOnly}
        GROUP BY request."id", request."proposerUserId", request."receiverUserId",
          request."title", request."location", request."startTime", request."endTime"
        HAVING COUNT(calendar."id") <> 2
          OR COUNT(DISTINCT calendar."userId") <> 2
          OR COALESCE(BOOL_OR(
            calendar."userId" NOT IN (request."proposerUserId", request."receiverUserId")
          ), false)
          OR COALESCE(BOOL_OR(
            calendar."title" IS DISTINCT FROM request."title"
            OR calendar."location" IS DISTINCT FROM request."location"
            OR calendar."startAt" IS DISTINCT FROM request."startTime"
            OR calendar."endAt" IS DISTINCT FROM request."endTime"
          ), false)
      `),
    );
    resultSets.push(legacyResult.rows.map((row) => ({ ...row, ownership_model: "LEGACY" })));
    models.push("PlanRequest");
  }

  const findingCount = resultSets.reduce(
    (total, rows) => total + countWindowTotal(rows),
    0n,
  );
  const findings = resultSets
    .flat()
    .sort((left, right) =>
      `${left.ownership_model}:${left.entity_id}`.localeCompare(
        `${right.ownership_model}:${right.entity_id}`,
      ),
    )
    .slice(0, 100)
    .map((row) => {
      const finding = { ...row };
      delete finding.total_findings;
      return finding;
    });
  return {
    id,
    label,
    status: findingCount === 0n ? "PASS" : "FAIL",
    findingCount: findingCount.toString(),
    truncated: findingCount > BigInt(findings.length),
    findings,
    model: models.join("+"),
    models,
  };
}

async function stableOutcomeOwnership(query, schema, catalog) {
  const id = "stable_outcome_ownership";
  const label = "Invalid stable Plan Outcome ownership";
  const stableSurfaceDetected =
    catalog.has("PlanCommitment") ||
    hasColumns(catalog, "PlanOutcomeResponse", ["planCommitmentId"]);
  const supportsStableOwnership =
    hasColumns(catalog, "PlanCommitment", [
      "id",
      "participantAId",
      "participantBId",
    ]) &&
    hasColumns(catalog, "PlanRequest", ["id", "commitmentId"]) &&
    hasColumns(catalog, "PlanOutcomeResponse", [
      "id",
      "userId",
      "planId",
      "planCommitmentId",
    ]);
  if (stableSurfaceDetected && !supportsStableOwnership) {
    return skippedCheck(
      id,
      label,
      "Stable Outcome ownership columns are only partially deployed.",
    );
  }
  if (!supportsStableOwnership) {
    return skippedCheck(id, label, "Stable Outcome ownership is not deployed.");
  }

  const commitment = `${quoteIdentifier(schema)}.${quoteIdentifier("PlanCommitment")}`;
  const revision = `${quoteIdentifier(schema)}.${quoteIdentifier("PlanRequest")}`;
  const outcome = `${quoteIdentifier(schema)}.${quoteIdentifier("PlanOutcomeResponse")}`;
  const result = await query(
    findingQuery(`
      WITH outcome_identity AS (
        SELECT
          outcome."id" AS outcome_id,
          outcome."userId" AS user_id,
          outcome."planId" AS revision_id,
          revision."commitmentId" AS revision_commitment_id,
          outcome."planCommitmentId" AS outcome_commitment_id,
          commitment."id" AS resolved_commitment_id,
          commitment."participantAId" AS participant_a_id,
          commitment."participantBId" AS participant_b_id
        FROM ${outcome} outcome
        LEFT JOIN ${revision} revision ON revision."id" = outcome."planId"
        LEFT JOIN ${commitment} commitment
          ON commitment."id" = outcome."planCommitmentId"
      ), ownership_issues AS (
        SELECT
          'outcome:' || outcome_id AS entity_id,
          CASE
            WHEN revision_commitment_id IS NOT NULL
              AND outcome_commitment_id IS NULL
            THEN 'MISSING_STABLE_COMMITMENT'
            WHEN outcome_commitment_id IS NOT NULL
              AND revision_commitment_id IS DISTINCT FROM outcome_commitment_id
            THEN 'REVISION_COMMITMENT_MISMATCH'
            WHEN outcome_commitment_id IS NOT NULL
              AND resolved_commitment_id IS NULL
            THEN 'UNRESOLVED_STABLE_COMMITMENT'
            WHEN resolved_commitment_id IS NOT NULL
              AND user_id NOT IN (participant_a_id, participant_b_id)
            THEN 'NONPARTICIPANT_OUTCOME'
          END::text AS issue,
          revision_id,
          revision_commitment_id,
          outcome_commitment_id,
          user_id
        FROM outcome_identity
        WHERE (
            revision_commitment_id IS NOT NULL
            AND outcome_commitment_id IS NULL
          )
          OR (
            outcome_commitment_id IS NOT NULL
            AND revision_commitment_id IS DISTINCT FROM outcome_commitment_id
          )
          OR (
            outcome_commitment_id IS NOT NULL
            AND resolved_commitment_id IS NULL
          )
          OR (
            resolved_commitment_id IS NOT NULL
            AND user_id NOT IN (participant_a_id, participant_b_id)
          )
      )
      SELECT *
      FROM ownership_issues
    `),
  );
  return checkFromRows(id, label, result.rows, {
    identityColumns: ["planCommitmentId", "userId"],
  });
}

async function duplicateOutcomeResponses(query, schema, catalog) {
  const id = "duplicate_outcome_responses";
  const label = "Duplicate participant Outcome responses";
  const hasStableIdentity = hasColumns(catalog, "PlanOutcomeResponse", ["planCommitmentId"]);
  const hasLegacyIdentity = hasColumns(catalog, "PlanOutcomeResponse", ["planId"]);
  if (
    (!hasStableIdentity && !hasLegacyIdentity) ||
    !hasColumns(catalog, "PlanOutcomeResponse", ["id", "userId", "createdAt"])
  ) {
    return skippedCheck(id, label, "Outcome ownership columns are not deployed.");
  }
  const table = `${quoteIdentifier(schema)}.${quoteIdentifier("PlanOutcomeResponse")}`;
  const scopes = [];
  if (hasStableIdentity) {
    scopes.push(`
      SELECT
        'planCommitmentId'::text AS identity_scope,
        "planCommitmentId"::text AS identity_id,
        "id",
        "userId",
        "createdAt"
      FROM ${table}
      WHERE "planCommitmentId" IS NOT NULL
    `);
  }
  if (hasLegacyIdentity) {
    const legacyOnly = hasStableIdentity ? `AND "planCommitmentId" IS NULL` : "";
    scopes.push(`
      SELECT
        'planId'::text AS identity_scope,
        "planId"::text AS identity_id,
        "id",
        "userId",
        "createdAt"
      FROM ${table}
      WHERE "planId" IS NOT NULL
        ${legacyOnly}
    `);
  }
  const result = await query(
    findingQuery(`
      WITH scoped_responses AS (
        ${scopes.join("\nUNION ALL\n")}
      )
      SELECT
        identity_scope || ':' || identity_id || ':' || "userId" AS entity_id,
        identity_scope,
        COUNT(*)::text AS response_count,
        ARRAY_AGG("id" ORDER BY "createdAt", "id") AS response_ids
      FROM scoped_responses
      GROUP BY identity_scope, identity_id, "userId"
      HAVING COUNT(*) > 1
    `),
  );
  return checkFromRows(id, label, result.rows, {
    identityColumns: [
      ...(hasStableIdentity ? ["planCommitmentId"] : []),
      ...(hasLegacyIdentity ? ["planId"] : []),
    ],
  });
}

function renderHuman(document) {
  const lines = [
    "B-light invariant audit",
    `Generated: ${document.generatedAt}`,
    "Mode: READ ONLY / dry-run (all database transactions are rolled back)",
  ];
  for (const report of document.targets) {
    lines.push("", `Target: ${report.environment} (${report.databaseUrlEnv})`);
    if (report.status === "ERROR" || report.status === "NOT_CONFIGURED") {
      lines.push(`  Result: ${report.status}`, `  Error: ${report.error}`);
      continue;
    }
    for (const check of report.checks) {
      const suffix = check.status === "SKIPPED" ? ` — ${check.reason}` : ` (${check.findingCount})`;
      lines.push(`  [${check.status}] ${check.label}${suffix}`);
      for (const finding of check.findings.slice(0, 5)) {
        lines.push(`    - ${JSON.stringify(finding)}`);
      }
      if (check.truncated || check.findings.length > 5) {
        lines.push(`    - … ${check.findingCount} total; JSON output contains up to 100 samples`);
      }
    }
    lines.push(`  Result: ${report.status}`);
  }
  return lines.join("\n");
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  let options;
  try {
    options = parseAuditArgs(argv, env);
  } catch (error) {
    process.stderr.write(`B-light invariant audit: ${sanitizeError(error)}\n`);
    return 2;
  }
  if (options.help) {
    process.stdout.write(
      commonHelp(
        "audit-b-light-invariants.mjs",
        "Audit B-light data invariants without repairing or modifying data.",
      ),
    );
    return 0;
  }
  const reports = await runReadOnlyTargets({
    targets: options.targets,
    auditName: "b-light-invariants",
    collect: collectInvariantAudit,
    strict: options.strict,
  });
  const document = {
    audit: "b-light-invariants",
    version: 1,
    generatedAt: new Date().toISOString(),
    readOnly: true,
    dryRun: true,
    targets: reports,
  };
  printReport(document, options.format, renderHuman);
  return reportsExitCode(reports, options.strict);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`B-light invariant audit: ${sanitizeError(error)}\n`);
      process.exitCode = 2;
    },
  );
}
