import assert from "node:assert/strict";
import test from "node:test";

import {
  TARGET_MIGRATION,
  checkFromRows,
  compareMigrationHistory,
  parseAuditArgs,
  reportsExitCode,
  sanitizeError,
  summarizeChecks,
} from "../../scripts/lib/b-light-audit-core.mjs";
import { collectDeploymentAudit } from "../../scripts/audit-b-light-deployment.mjs";
import { collectInvariantAudit } from "../../scripts/audit-b-light-invariants.mjs";

test("audit CLI defaults to an environment-only, read-only database target", () => {
  const options = parseAuditArgs([], {
    DATABASE_URL: "postgresql://user:secret@localhost/sideseat?schema=public",
    NODE_ENV: "test",
  });
  assert.equal(options.format, "human");
  assert.equal(options.strict, false);
  assert.deepEqual(
    options.targets.map(({ label, envName }) => ({ label, envName })),
    [{ label: "test", envName: "DATABASE_URL" }],
  );
});

test("audit CLI supports multiple named targets without accepting URLs as arguments", () => {
  const options = parseAuditArgs(
    ["--json", "--strict", "--target", "staging=STAGING_DB", "--target=prod=PROD_DB"],
    {
      STAGING_DB: "postgresql://staging",
      PROD_DB: "postgresql://prod",
    },
  );
  assert.equal(options.format, "json");
  assert.equal(options.strict, true);
  assert.deepEqual(
    options.targets.map(({ label, envName }) => ({ label, envName })),
    [
      { label: "staging", envName: "STAGING_DB" },
      { label: "prod", envName: "PROD_DB" },
    ],
  );
  assert.throws(() => parseAuditArgs(["--write"], {}), /permanently read-only/);
  assert.throws(() => parseAuditArgs(["postgresql:\/\/secret"], {}), /Unknown option/);
});

test("deployment audit safely reports an undeployed schema", async () => {
  const queries: string[] = [];
  const report = await collectDeploymentAudit({
    schema: "public",
    query: async (sql: string) => {
      queries.push(sql);
      if (sql.includes("information_schema.columns")) return { rows: [] };
      if (sql.includes("current_database()")) {
        return {
          rows: [
            {
              database_name: "empty",
              active_schema: "public",
              server_version: "16",
              transaction_read_only: "on",
            },
          ],
        };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  });
  assert.equal(report.status, "INCOMPLETE");
  assert.equal(report.migrations.target.status, "MIGRATION_TABLE_MISSING");
  assert.equal(report.counts.actions.status, "MISSING_TABLE");
  assert.ok(queries.every(isReadOnlyStatement));
});

test("migration history comparison reports every repository/database drift class", () => {
  const history = compareMigrationHistory(
    {
      status: "AVAILABLE",
      directory: "/repo/prisma/migrations",
      invalidDirectories: [],
      migrations: [
        { migrationName: "001_alpha", checksum: "aaaa" },
        { migrationName: "002_beta", checksum: "bbbb" },
        { migrationName: "004_pending", checksum: "dddd" },
      ],
    },
    [
      appliedMigration("001_alpha", "aaaa"),
      appliedMigration("002_beta", "xxxx"),
      appliedMigration("003_renamed_alpha", "aaaa"),
      {
        id: "unfinished",
        migration_name: "005_unfinished",
        checksum: "eeee",
        started_at: new Date("2026-08-30T12:00:00Z"),
        finished_at: null,
        rolled_back_at: null,
        applied_steps_count: 0,
        has_logs: true,
      },
    ],
  );

  assert.equal(history.status, "INCOMPLETE");
  assert.equal(history.hasDrift, true);
  assert.deepEqual(
    history.appliedMissingLocally.map((row) => row.migrationName),
    ["003_renamed_alpha"],
  );
  assert.deepEqual(
    history.localPending.map((row) => row.migrationName),
    ["004_pending"],
  );
  assert.deepEqual(
    history.checksumMismatches.map((row) => row.migrationName),
    ["002_beta"],
  );
  assert.deepEqual(history.checksumNameCollisions, [
    { checksum: "aaaa", migrationNames: ["001_alpha", "003_renamed_alpha"] },
  ]);
  assert.deepEqual(
    history.unfinishedRecords.map((row) => row.migrationName),
    ["005_unfinished"],
  );
});

test("pending B-light migration remains readable before deployment and fails strict mode", async () => {
  const catalogRows = {
    _prisma_migrations: [
      "id",
      "migration_name",
      "checksum",
      "started_at",
      "finished_at",
      "rolled_back_at",
      "applied_steps_count",
      "logs",
    ],
    ClassmatePost: ["id", "status"],
    ActionInterest: ["id", "status"],
    PlanRequest: ["id", "status"],
    CalendarEntry: ["id", "planRequestId"],
    PlanOutcomeResponse: ["id", "value"],
  };
  const prerequisiteMigration = "20260829191500_calendar_subscription_links";
  const databaseRows = [appliedMigration(prerequisiteMigration, "calendar-checksum")];
  const localMigrationHistory = {
    status: "AVAILABLE",
    directory: "/repo/prisma/migrations",
    invalidDirectories: [],
    migrations: [
      { migrationName: prerequisiteMigration, checksum: "calendar-checksum" },
      { migrationName: TARGET_MIGRATION, checksum: "b-light-checksum" },
    ],
  };
  const query = migrationAwareQuery(catalogRows, databaseRows);

  const observational = await collectDeploymentAudit({
    schema: "public",
    query,
    strict: false,
    localMigrationHistory,
  });
  const strict = await collectDeploymentAudit({
    schema: "public",
    query,
    strict: true,
    localMigrationHistory,
  });

  assert.equal(TARGET_MIGRATION, "20260829193000_action_to_plan_v2");
  assert.equal(observational.migrations.target.status, "NOT_APPLIED");
  assert.equal(observational.status, "INCOMPLETE");
  assert.equal(observational.migrations.history.appliedMissingLocally.length, 0);
  assert.equal(observational.migrations.history.checksumMismatches.length, 0);
  assert.deepEqual(
    observational.migrations.history.localPending.map((row) => row.migrationName),
    [TARGET_MIGRATION],
  );
  assert.equal(strict.status, "FAIL");
});

test("invariant audit skips absent tables instead of throwing", async () => {
  const queries: string[] = [];
  const report = await collectInvariantAudit({
    schema: "public",
    query: async (sql: string) => {
      queries.push(sql);
      if (sql.includes("information_schema.columns")) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    },
  });
  assert.equal(report.status, "INCOMPLETE");
  assert.ok(report.checks.every((check) => check.status === "SKIPPED"));
  assert.ok(queries.every(isReadOnlyStatement));
});

test("Activation shape audit reports all contract 6.4 violations with read-only SQL", async () => {
  const queries: string[] = [];
  const activationColumns = [
    "id",
    "connectedAt",
    "firstContentType",
    "terminalReason",
    "terminalAt",
  ];
  const report = await collectInvariantAudit({
    schema: "public",
    query: async (sql: string) => {
      queries.push(sql);
      if (sql.includes("information_schema.columns")) {
        return {
          rows: activationColumns.map((column_name) => ({
            table_name: "ActionInterestActivation",
            column_name,
          })),
        };
      }
      if (sql.includes("CONNECTED_CONTENT_MISMATCH")) {
        return {
          rows: [
            {
              entity_id: "activation-invalid",
              violation_codes: [
                "CONNECTED_CONTENT_MISMATCH",
                "CONNECTED_AND_TERMINAL",
                "TERMINAL_PAIR_MISMATCH",
              ],
              total_findings: "1",
            },
          ],
        };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  });

  const activation = report.checks.find(
    (check) => check.id === "invalid_action_interest_activation_shapes",
  );
  assert.equal(activation?.status, "FAIL");
  assert.equal(activation?.findingCount, "1");
  assert.deepEqual(activation?.findings, [
    {
      entity_id: "activation-invalid",
      violation_codes: [
        "CONNECTED_CONTENT_MISMATCH",
        "CONNECTED_AND_TERMINAL",
        "TERMINAL_PAIR_MISMATCH",
      ],
    },
  ]);
  const activationSql =
    queries.find((sql) => sql.includes("CONNECTED_CONTENT_MISMATCH")) ?? "";
  assert.match(
    activationSql,
    /\("connectedAt" IS NULL\) <> \("firstContentType" IS NULL\)/,
  );
  assert.match(
    activationSql,
    /"connectedAt" IS NOT NULL AND "terminalReason" IS NOT NULL/,
  );
  assert.match(
    activationSql,
    /\("terminalReason" IS NULL\) <> \("terminalAt" IS NULL\)/,
  );
  assert.ok(queries.every(isReadOnlyStatement));
});

test("Activation shape audit skips a partially deployed lifecycle schema", async () => {
  const queries: string[] = [];
  const report = await collectInvariantAudit({
    schema: "public",
    query: async (sql: string) => {
      queries.push(sql);
      if (sql.includes("information_schema.columns")) {
        return {
          rows: [
            "id",
            "connectedAt",
            "firstContentType",
            "terminalReason",
          ].map((column_name) => ({
            table_name: "ActionInterestActivation",
            column_name,
          })),
        };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  });

  const activation = report.checks.find(
    (check) => check.id === "invalid_action_interest_activation_shapes",
  );
  assert.equal(activation?.status, "SKIPPED");
  assert.match(activation?.reason ?? "", /lifecycle columns are not deployed/);
  assert.equal(
    queries.some((sql) => sql.includes("CONNECTED_CONTENT_MISMATCH")),
    false,
  );
  assert.ok(queries.every(isReadOnlyStatement));
});

test("DB05 audit uses stable Action and Commitment identities and verifies pointers", async () => {
  const queries: string[] = [];
  const catalogRows = {
    PlanCommitment: [
      "id",
      "status",
      "currentAcceptedRevisionId",
      "currentPendingRevisionId",
    ],
    PlanRequest: [
      "id",
      "status",
      "originActionId",
      "commitmentId",
      "revisionKind",
      "createdAt",
    ],
  };
  const report = await collectInvariantAudit({
    schema: "public",
    query: async (sql: string) => {
      queries.push(sql);
      if (sql.includes("information_schema.columns")) {
        return {
          rows: Object.entries(catalogRows).flatMap(([table_name, columns]) =>
            columns.map((column_name) => ({ table_name, column_name })),
          ),
        };
      }
      if (sql.includes('GROUP BY "originActionId"')) {
        return {
          rows: [
            {
              entity_id: "action-1",
              origin_action_id: "action-1",
              pending_count: "2",
              revision_ids: ["revision-1", "revision-2"],
              total_findings: "1",
            },
          ],
        };
      }
      if (sql.includes('GROUP BY "commitmentId"')) {
        return {
          rows: [
            {
              entity_id: "commitment-1",
              pending_count: "2",
              revision_ids: ["revision-1", "revision-2"],
              total_findings: "1",
            },
          ],
        };
      }
      if (sql.includes("NONCONFIRMED_ACCEPTED_POINTER")) {
        return {
          rows: [
            {
              entity_id: "commitment-1",
              commitment_status: "CONFIRMED",
              accepted_revision_id: "revision-foreign",
              accepted_revision_status: "PENDING",
              accepted_revision_commitment_id: "commitment-2",
              pending_revision_id: "revision-resolved",
              pending_revision_status: "ACCEPTED",
              pending_revision_kind: "INITIAL",
              pending_revision_commitment_id: "commitment-1",
              violation_codes: [
                "ACCEPTED_REVISION_WRONG_COMMITMENT",
                "ACCEPTED_POINTER_WRONG_STATUS",
                "PENDING_POINTER_WRONG_STATUS",
              ],
              total_findings: "1",
            },
          ],
        };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  });

  const pendingAction = report.checks.find(
    (check) => check.id === "multiple_pending_origins",
  );
  assert.equal(pendingAction?.status, "FAIL");
  assert.equal(pendingAction?.model, "STABLE");
  assert.deepEqual(pendingAction?.identityColumns, ["originActionId"]);

  const pendingCommitment = report.checks.find(
    (check) => check.id === "multiple_pending_commitment_revisions",
  );
  assert.equal(pendingCommitment?.status, "FAIL");
  assert.deepEqual(pendingCommitment?.identityColumns, ["commitmentId"]);

  const pointers = report.checks.find(
    (check) => check.id === "invalid_commitment_revision_pointers",
  );
  assert.equal(pointers?.status, "FAIL");
  assert.deepEqual(pointers?.findings[0]?.violation_codes, [
    "ACCEPTED_REVISION_WRONG_COMMITMENT",
    "ACCEPTED_POINTER_WRONG_STATUS",
    "PENDING_POINTER_WRONG_STATUS",
  ]);

  const actionSql = queries.find((sql) => sql.includes('GROUP BY "originActionId"'));
  assert.match(actionSql ?? "", /"status"::text = 'PENDING'/);
  assert.match(actionSql ?? "", /"originActionId" IS NOT NULL/);
  assert.doesNotMatch(actionSql ?? "", /"originKind"|"originId"/);
  const commitmentSql = queries.find((sql) =>
    sql.includes("NONCONFIRMED_ACCEPTED_POINTER"),
  );
  assert.match(
    commitmentSql ?? "",
    /accepted\."commitmentId" IS DISTINCT FROM commitment\."id"/,
  );
  assert.match(commitmentSql ?? "", /accepted\."status"::text <> 'ACCEPTED'/);
  assert.match(commitmentSql ?? "", /pending\."status"::text <> 'PENDING'/);
  assert.match(commitmentSql ?? "", /IN \('CLOSED', 'CANCELED'\)/);
  assert.match(commitmentSql ?? "", /'MISSING_PENDING_POINTER'/);
  assert.match(commitmentSql ?? "", /'NEGOTIATING_PENDING_NOT_INITIAL'/);
  assert.match(commitmentSql ?? "", /'CONFIRMED_PENDING_NOT_RESCHEDULE'/);
  assert.match(
    commitmentSql ?? "",
    /commitment\."status"::text = 'NEGOTIATING'\s+AND commitment\."currentAcceptedRevisionId" IS NOT NULL/,
  );
  assert.match(commitmentSql ?? "", /'PENDING_REVISION_NOT_CURRENT'/);
  assert.match(
    commitmentSql ?? "",
    /actionable\."id" IS DISTINCT FROM\s+commitment\."currentPendingRevisionId"/,
  );
  assert.ok(queries.every(isReadOnlyStatement));
});

test("DB05 audit verifies stable Calendar and Outcome identity plus uniqueness", async () => {
  const queries: string[] = [];
  const catalogRows = {
    PlanCommitment: [
      "id",
      "status",
      "participantAId",
      "participantBId",
      "currentAcceptedRevisionId",
    ],
    PlanRequest: [
      "id",
      "status",
      "commitmentId",
      "proposerUserId",
      "receiverUserId",
      "title",
      "location",
      "startTime",
      "endTime",
    ],
    CalendarEntry: [
      "id",
      "userId",
      "planRequestId",
      "planCommitmentId",
      "projectionStatus",
      "title",
      "location",
      "startAt",
      "endAt",
    ],
    PlanOutcomeResponse: [
      "id",
      "userId",
      "createdAt",
      "planId",
      "planCommitmentId",
    ],
  };
  const report = await collectInvariantAudit({
    schema: "public",
    query: async (sql: string) => {
      queries.push(sql);
      if (sql.includes("information_schema.columns")) {
        return {
          rows: Object.entries(catalogRows).flatMap(([table_name, columns]) =>
            columns.map((column_name) => ({ table_name, column_name })),
          ),
        };
      }
      if (sql.includes("WITH projection_identity AS")) {
        return {
          rows: [
            {
              entity_id: "projection:commitment-1:user-a",
              issue: "DUPLICATE_STABLE_PROJECTION",
              revision_id: null,
              revision_commitment_id: null,
              projection_commitment_id: "commitment-1",
              user_id: "user-a",
              projection_count: "2",
              calendar_ids: ["calendar-1", "calendar-2"],
              total_findings: "1",
            },
          ],
        };
      }
      if (sql.includes('FROM "public"."PlanCommitment" commitment')) {
        return { rows: [] };
      }
      if (sql.includes('FROM "public"."PlanRequest" request')) {
        return { rows: [] };
      }
      if (sql.includes("WITH outcome_identity AS")) {
        return {
          rows: [
            {
              entity_id: "outcome:outcome-1",
              issue: "REVISION_COMMITMENT_MISMATCH",
              revision_id: "revision-1",
              revision_commitment_id: "commitment-2",
              outcome_commitment_id: "commitment-1",
              user_id: "user-a",
              total_findings: "1",
            },
          ],
        };
      }
      if (sql.includes("WITH scoped_responses AS")) {
        return {
          rows: [
            {
              entity_id: "planCommitmentId:commitment-1:user-a",
              identity_scope: "planCommitmentId",
              response_count: "2",
              response_ids: ["outcome-1", "outcome-2"],
              total_findings: "1",
            },
          ],
        };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  });

  const calendar = report.checks.find(
    (check) => check.id === "stable_calendar_ownership",
  );
  assert.equal(calendar?.status, "FAIL");
  assert.equal(calendar?.findings[0]?.issue, "DUPLICATE_STABLE_PROJECTION");
  assert.deepEqual(calendar?.identityColumns, ["userId", "planCommitmentId"]);

  const outcome = report.checks.find(
    (check) => check.id === "stable_outcome_ownership",
  );
  assert.equal(outcome?.status, "FAIL");
  assert.equal(outcome?.findings[0]?.issue, "REVISION_COMMITMENT_MISMATCH");
  const duplicates = report.checks.find(
    (check) => check.id === "duplicate_outcome_responses",
  );
  assert.equal(duplicates?.status, "FAIL");
  assert.deepEqual(duplicates?.identityColumns, ["planCommitmentId", "planId"]);

  const calendarSql = queries.find((sql) => sql.includes("WITH projection_identity AS"));
  assert.match(calendarSql ?? "", /'MISSING_STABLE_COMMITMENT'/);
  assert.match(calendarSql ?? "", /'REVISION_COMMITMENT_MISMATCH'/);
  assert.match(calendarSql ?? "", /'NONPARTICIPANT_PROJECTION'/);
  assert.match(calendarSql ?? "", /'DUPLICATE_STABLE_PROJECTION'/);
  const outcomeSql = queries.find((sql) => sql.includes("WITH outcome_identity AS"));
  assert.match(outcomeSql ?? "", /'MISSING_STABLE_COMMITMENT'/);
  assert.match(outcomeSql ?? "", /'REVISION_COMMITMENT_MISMATCH'/);
  assert.match(outcomeSql ?? "", /'NONPARTICIPANT_OUTCOME'/);
  assert.ok(queries.every(isReadOnlyStatement));
});

test("DB05 stable audits skip incomplete expand surfaces without issuing unsafe SQL", async () => {
  const queries: string[] = [];
  const report = await collectInvariantAudit({
    schema: "public",
    query: async (sql: string) => {
      queries.push(sql);
      if (sql.includes("information_schema.columns")) {
        return {
          rows: [
            { table_name: "PlanCommitment", column_name: "id" },
            { table_name: "CalendarEntry", column_name: "planCommitmentId" },
            { table_name: "PlanOutcomeResponse", column_name: "planCommitmentId" },
          ],
        };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  });

  for (const id of [
    "invalid_commitment_revision_pointers",
    "stable_calendar_ownership",
    "missing_or_divergent_calendar_projections",
    "stable_outcome_ownership",
  ]) {
    const check = report.checks.find((candidate) => candidate.id === id);
    assert.equal(check?.status, "SKIPPED", id);
    assert.match(check?.reason ?? "", /partial|incomplete/i, id);
  }
  assert.equal(
    queries.some(
      (sql) =>
        sql.includes("WITH projection_identity AS") ||
        sql.includes("WITH outcome_identity AS") ||
        sql.includes("NONCONFIRMED_ACCEPTED_POINTER"),
    ),
    false,
  );
  assert.ok(queries.every(isReadOnlyStatement));
});

test("source-card audit covers mixed B-light and legacy attribution columns", async () => {
  const queries: string[] = [];
  const report = await collectInvariantAudit({
    schema: "public",
    query: async (sql: string) => {
      queries.push(sql);
      if (sql.includes("information_schema.columns")) {
        return {
          rows: ["id", "type", "createdAt", "actionContextId", "actionInterestId"].map(
            (column_name) => ({ table_name: "Message", column_name }),
          ),
        };
      }
      if (sql.includes("WITH scoped_cards AS")) {
        return {
          rows: [
            {
              entity_id: "actionContextId:context-1",
              attribution_scope: "actionContextId",
              attribution_id: "context-1",
              card_count: "2",
              message_ids: ["context-message-1", "context-message-2"],
              total_findings: "2",
            },
            {
              entity_id: "actionInterestId:interest-legacy",
              attribution_scope: "actionInterestId",
              attribution_id: "interest-legacy",
              card_count: "2",
              message_ids: ["legacy-message-1", "legacy-message-2"],
              total_findings: "2",
            },
          ],
        };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  });

  const duplicateCards = report.checks.find(
    (check) => check.id === "duplicate_source_cards",
  );
  assert.equal(duplicateCards?.status, "FAIL");
  assert.equal(duplicateCards?.findingCount, "2");
  assert.deepEqual(duplicateCards?.groupingColumns, ["actionContextId", "actionInterestId"]);
  assert.deepEqual(
    duplicateCards?.findings.map((finding) => finding.entity_id),
    ["actionContextId:context-1", "actionInterestId:interest-legacy"],
  );

  const sourceCardSql = queries.find((sql) => sql.includes("WITH scoped_cards AS")) ?? "";
  assert.match(sourceCardSql, /"actionContextId" IS NOT NULL/);
  assert.match(sourceCardSql, /"actionInterestId" IS NOT NULL/);
  assert.match(sourceCardSql, /'actionContextId'::text AS attribution_scope/);
  assert.match(sourceCardSql, /'actionInterestId'::text AS attribution_scope/);
  assert.match(sourceCardSql, /attribution_scope \|\| ':' \|\| attribution_id AS entity_id/);
});

test("source-card audit uses effective Interest and reports unattributed or inconsistent cards", async () => {
  const queries: string[] = [];
  const report = await collectInvariantAudit({
    schema: "public",
    query: async (sql: string) => {
      queries.push(sql);
      if (sql.includes("information_schema.columns")) {
        return {
          rows: [
            ...[
              "id",
              "type",
              "createdAt",
              "connectionId",
              "actionContextId",
              "actionInterestId",
            ].map(
              (column_name) => ({ table_name: "Message", column_name }),
            ),
            ...["id", "interestId", "connectionId"].map((column_name) => ({
              table_name: "ActionCoordinationContext",
              column_name,
            })),
            ...["id", "connectionId"].map((column_name) => ({
              table_name: "ActionInterest",
              column_name,
            })),
          ],
        };
      }
      if (sql.includes("WITH source_cards AS")) {
        return {
          rows: [
            {
              entity_id: "message:unattributed",
              issue: "UNATTRIBUTED_CARD",
              action_interest_id: null,
              action_context_id: null,
              context_interest_id: null,
              effective_interest_id: null,
              card_count: "1",
              message_ids: ["unattributed"],
              total_findings: "7",
            },
            {
              entity_id: "message:context-only",
              issue: "CONTEXT_ONLY_CANONICAL",
              action_interest_id: null,
              action_context_id: "context-1",
              context_interest_id: "interest-1",
              effective_interest_id: "interest-1",
              card_count: "1",
              message_ids: ["context-only"],
              total_findings: "7",
            },
            {
              entity_id: "message:mismatch",
              issue: "CONTEXT_INTEREST_MISMATCH",
              action_interest_id: "interest-2",
              action_context_id: "context-1",
              context_interest_id: "interest-1",
              effective_interest_id: "interest-2",
              card_count: "1",
              message_ids: ["mismatch"],
              total_findings: "7",
            },
            {
              entity_id: "message:interest-connection-mismatch",
              issue: "MESSAGE_INTEREST_CONNECTION_MISMATCH",
              action_interest_id: "interest-3",
              action_context_id: null,
              context_interest_id: null,
              effective_interest_id: "interest-3",
              card_count: "1",
              message_ids: ["interest-connection-mismatch"],
              total_findings: "7",
            },
            {
              entity_id: "message:context-connection-mismatch",
              issue: "MESSAGE_CONTEXT_CONNECTION_MISMATCH",
              action_interest_id: "interest-4",
              action_context_id: null,
              context_interest_id: null,
              effective_interest_id: "interest-4",
              card_count: "1",
              message_ids: ["context-connection-mismatch"],
              total_findings: "7",
            },
            {
              entity_id: "message:source-connection-mismatch",
              issue: "INTEREST_CONTEXT_CONNECTION_MISMATCH",
              action_interest_id: "interest-5",
              action_context_id: "context-5",
              context_interest_id: "interest-5",
              effective_interest_id: "interest-5",
              card_count: "1",
              message_ids: ["source-connection-mismatch"],
              total_findings: "7",
            },
            {
              entity_id: "interest:interest-1",
              issue: "DUPLICATE_EFFECTIVE_INTEREST",
              action_interest_id: null,
              action_context_id: null,
              context_interest_id: null,
              effective_interest_id: "interest-1",
              card_count: "2",
              message_ids: ["context-only", "interest-only"],
              total_findings: "7",
            },
          ],
        };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  });

  const sourceCards = report.checks.find(
    (check) => check.id === "duplicate_source_cards",
  );
  assert.equal(sourceCards?.status, "FAIL");
  assert.equal(sourceCards?.findingCount, "7");
  assert.equal(sourceCards?.effectiveGrouping, true);
  assert.equal(sourceCards?.connectionIdentityChecked, true);
  assert.deepEqual(
    sourceCards?.findings.map((finding) => finding.issue),
    [
      "UNATTRIBUTED_CARD",
      "CONTEXT_ONLY_CANONICAL",
      "CONTEXT_INTEREST_MISMATCH",
      "MESSAGE_INTEREST_CONNECTION_MISMATCH",
      "MESSAGE_CONTEXT_CONNECTION_MISMATCH",
      "INTEREST_CONTEXT_CONNECTION_MISMATCH",
      "DUPLICATE_EFFECTIVE_INTEREST",
    ],
  );

  const sql = queries.find((query) => query.includes("WITH source_cards AS")) ?? "";
  assert.match(
    sql,
    /COALESCE\(message\."actionInterestId", explicit_context\."interestId"\)/,
  );
  assert.match(sql, /'UNATTRIBUTED_CARD'/);
  assert.match(sql, /'CONTEXT_ONLY_CANONICAL'/);
  assert.match(sql, /'CONTEXT_INTEREST_MISMATCH'/);
  assert.match(sql, /'MESSAGE_INTEREST_CONNECTION_MISMATCH'/);
  assert.match(sql, /'MESSAGE_CONTEXT_CONNECTION_MISMATCH'/);
  assert.match(sql, /'INTEREST_CONTEXT_CONNECTION_MISMATCH'/);
  assert.match(
    sql,
    /effective_context\."interestId" = interest\."id"/,
  );
  assert.match(sql, /'DUPLICATE_EFFECTIVE_INTEREST'/);
  assert.ok(queries.every(isReadOnlyStatement));
});

test("source-card audit uses the sole attribution column on partial schemas", async () => {
  for (const groupingColumn of ["actionContextId", "actionInterestId"]) {
    let sourceCardSql = "";
    const report = await collectInvariantAudit({
      schema: "public",
      query: async (sql: string) => {
        if (sql.includes("information_schema.columns")) {
          return {
            rows: ["id", "type", "createdAt", groupingColumn].map((column_name) => ({
              table_name: "Message",
              column_name,
            })),
          };
        }
        if (sql.includes("WITH scoped_cards AS")) {
          sourceCardSql = sql;
          return { rows: [] };
        }
        throw new Error(`Unexpected query: ${sql}`);
      },
    });

    const duplicateCards = report.checks.find(
      (check) => check.id === "duplicate_source_cards",
    );
    assert.equal(duplicateCards?.status, "PASS");
    assert.deepEqual(duplicateCards?.groupingColumns, [groupingColumn]);
    assert.match(sourceCardSql, new RegExp(`"${groupingColumn}" IS NOT NULL`));
    const absentColumn =
      groupingColumn === "actionContextId" ? "actionInterestId" : "actionContextId";
    assert.doesNotMatch(sourceCardSql, new RegExp(`"${absentColumn}"`));
  }
});

test("stable projection audit rejects ACTIVE projections on canceled commitments", async () => {
  const queries: string[] = [];
  const catalogRows = {
    PlanCommitment: [
      "id",
      "status",
      "participantAId",
      "participantBId",
      "currentAcceptedRevisionId",
    ],
    PlanRequest: ["id", "title", "location", "startTime", "endTime"],
    CalendarEntry: [
      "id",
      "userId",
      "planCommitmentId",
      "projectionStatus",
      "title",
      "location",
      "startAt",
      "endAt",
    ],
  };
  const report = await collectInvariantAudit({
    schema: "public",
    query: async (sql: string) => {
      queries.push(sql);
      if (sql.includes("information_schema.columns")) {
        return {
          rows: Object.entries(catalogRows).flatMap(([table_name, columns]) =>
            columns.map((column_name) => ({ table_name, column_name })),
          ),
        };
      }
      return { rows: [] };
    },
  });
  const projection = report.checks.find(
    (check) => check.id === "missing_or_divergent_calendar_projections",
  );
  assert.equal(projection?.status, "PASS");
  assert.equal(projection?.model, "PlanCommitment");
  const projectionSql = queries.find((sql) => sql.includes('FROM "public"."PlanCommitment"'));
  assert.match(projectionSql ?? "", /IN \('CONFIRMED', 'CANCELED'\)/);
  assert.match(projectionSql ?? "", /commitment\."status"::text = 'CANCELED'/);
  assert.match(projectionSql ?? "", /calendar\."projectionStatus"::text = 'ACTIVE'/);
  assert.match(projectionSql ?? "", /calendar\."projectionStatus"::text = 'CANCELED'/);
});

test("mixed Plan expand audits stable and unbackfilled legacy ownership together", async () => {
  const queries: string[] = [];
  const catalogRows = {
    PlanCommitment: [
      "id",
      "status",
      "participantAId",
      "participantBId",
      "currentAcceptedRevisionId",
    ],
    PlanRequest: [
      "id",
      "status",
      "commitmentId",
      "proposerUserId",
      "receiverUserId",
      "title",
      "location",
      "startTime",
      "endTime",
    ],
    CalendarEntry: [
      "id",
      "userId",
      "planRequestId",
      "planCommitmentId",
      "projectionStatus",
      "title",
      "location",
      "startAt",
      "endAt",
    ],
    PlanOutcomeResponse: [
      "id",
      "userId",
      "createdAt",
      "planId",
      "planCommitmentId",
    ],
  };
  const report = await collectInvariantAudit({
    schema: "public",
    query: async (sql: string) => {
      queries.push(sql);
      if (sql.includes("information_schema.columns")) {
        return {
          rows: Object.entries(catalogRows).flatMap(([table_name, columns]) =>
            columns.map((column_name) => ({ table_name, column_name })),
          ),
        };
      }
      if (sql.includes('FROM "public"."PlanRequest" request')) {
        return {
          rows: [
            {
              entity_id: "legacy-plan",
              projection_count: "1",
              distinct_users: "1",
              participant_mismatch: false,
              shared_fact_mismatch: false,
              total_findings: "1",
            },
          ],
        };
      }
      return { rows: [] };
    },
  });

  const projection = report.checks.find(
    (check) => check.id === "missing_or_divergent_calendar_projections",
  );
  assert.equal(projection?.status, "FAIL");
  assert.equal(projection?.findingCount, "1");
  assert.equal(projection?.model, "PlanCommitment+PlanRequest");
  assert.deepEqual(projection?.models, ["PlanCommitment", "PlanRequest"]);
  assert.equal(projection?.findings[0]?.ownership_model, "LEGACY");

  const stableSql = queries.find((sql) =>
    sql.includes('FROM "public"."PlanCommitment" commitment'),
  );
  const legacySql = queries.find((sql) =>
    sql.includes('FROM "public"."PlanRequest" request'),
  );
  assert.ok(stableSql);
  assert.match(legacySql ?? "", /request\."commitmentId" IS NULL/);

  const outcomeSql = queries.find((sql) => sql.includes("WITH scoped_responses AS"));
  assert.match(outcomeSql ?? "", /'planCommitmentId'::text AS identity_scope/);
  assert.match(outcomeSql ?? "", /'planId'::text AS identity_scope/);
  assert.match(outcomeSql ?? "", /"planCommitmentId" IS NULL/);
});

test("check summaries distinguish findings from incomplete audits", () => {
  const pass = checkFromRows("one", "One", []);
  const fail = checkFromRows("two", "Two", [
    { entity_id: "id", total_findings: "3", count: "2" },
  ]);
  assert.equal(pass.status, "PASS");
  assert.equal(fail.status, "FAIL");
  assert.equal(fail.findingCount, "3");
  assert.equal(summarizeChecks([pass, fail]).status, "FAIL");
  assert.equal(
    reportsExitCode([{ status: "INCOMPLETE" }], false),
    0,
    "observational audits can run before the migration",
  );
  assert.equal(reportsExitCode([{ status: "INCOMPLETE" }], true), 1);
});

test("database errors redact connection strings", () => {
  const message = sanitizeError(
    new Error("connect postgresql://user:very-secret@example.test/db failed password=oops"),
  );
  assert.doesNotMatch(message, /very-secret|password=oops/);
  assert.match(message, /REDACTED/);
});

function isReadOnlyStatement(sql: string) {
  const statement = sql.trimStart().toUpperCase();
  return statement.startsWith("SELECT") || statement.startsWith("WITH");
}

function appliedMigration(migrationName: string, checksum: string) {
  return {
    id: `id-${migrationName}`,
    migration_name: migrationName,
    checksum,
    started_at: new Date("2026-08-30T10:00:00Z"),
    finished_at: new Date("2026-08-30T10:01:00Z"),
    rolled_back_at: null,
    applied_steps_count: 1,
    has_logs: false,
  };
}

function migrationAwareQuery(
  catalogRows: Record<string, string[]>,
  migrationRows: ReturnType<typeof appliedMigration>[],
) {
  return async (sql: string) => {
    if (sql.includes("information_schema.columns")) {
      return {
        rows: Object.entries(catalogRows).flatMap(([table_name, columns]) =>
          columns.map((column_name) => ({ table_name, column_name })),
        ),
      };
    }
    if (sql.includes("current_database()")) {
      return {
        rows: [
          {
            database_name: "test",
            active_schema: "public",
            server_version: "16",
            transaction_read_only: "on",
          },
        ],
      };
    }
    if (sql.includes('FROM "public"."_prisma_migrations"')) {
      return { rows: migrationRows };
    }
    if (sql.includes("linked_total")) {
      return { rows: [{ linked_total: "0", stable_commitment: "0", legacy_request: "0" }] };
    }
    if (sql.includes("GROUP BY")) return { rows: [] };
    if (sql.includes("COUNT(*)::text AS total")) return { rows: [{ total: "0" }] };
    throw new Error(`Unexpected query: ${sql}`);
  };
}
