#!/usr/bin/env node

import { fileURLToPath, pathToFileURL } from "node:url";

import {
  TARGET_MIGRATION,
  compareMigrationHistory,
  commonHelp,
  decimalString,
  hasColumns,
  loadLocalMigrationHistory,
  loadTableCatalog,
  parseAuditArgs,
  printReport,
  quoteIdentifier,
  reportsExitCode,
  runReadOnlyTargets,
  sanitizeError,
} from "./lib/b-light-audit-core.mjs";

const REPOSITORY_MIGRATIONS_DIRECTORY = fileURLToPath(
  new URL("../prisma/migrations/", import.meta.url),
);

const TABLES = [
  "_prisma_migrations",
  "ClassmatePost",
  "ActionInterest",
  "PlanCommitment",
  "PlanRequest",
  "CalendarEntry",
  "PlanOutcomeResponse",
];

export async function collectDeploymentAudit({
  query,
  schema,
  strict = false,
  localMigrationHistory = null,
}) {
  const catalog = await loadTableCatalog(query, schema, TABLES);
  const identityResult = await query(`
    SELECT
      current_database() AS database_name,
      current_schema() AS active_schema,
      current_setting('server_version') AS server_version,
      current_setting('transaction_read_only') AS transaction_read_only
  `);
  const identity = identityResult.rows[0] ?? {};

  const localHistory =
    localMigrationHistory ?? loadLocalMigrationHistory(REPOSITORY_MIGRATIONS_DIRECTORY);
  const migrations = await collectMigrationStatus(query, schema, catalog, localHistory);
  const counts = {
    actions: await collectCount(query, schema, catalog, {
      table: "ClassmatePost",
      stateColumn: "status",
    }),
    interests: await collectCount(query, schema, catalog, {
      table: "ActionInterest",
      stateColumn: "status",
    }),
    plans: hasColumns(catalog, "PlanCommitment", ["id", "status"])
      ? await collectCount(query, schema, catalog, {
          table: "PlanCommitment",
          stateColumn: "status",
        })
      : await collectCount(query, schema, catalog, {
          table: "PlanRequest",
          stateColumn: "status",
        }),
    planRevisions: await collectCount(query, schema, catalog, {
      table: "PlanRequest",
      stateColumn: "status",
    }),
    calendarPlanProjections: await collectCalendarProjectionCount(query, schema, catalog),
    outcomes: await collectCount(query, schema, catalog, {
      table: "PlanOutcomeResponse",
      stateColumn: "value",
    }),
  };

  const missingCoreTables = ["ClassmatePost", "PlanRequest", "CalendarEntry"].filter(
    (table) => !catalog.has(table),
  );
  const missingObservedTables = Object.entries(counts)
    .filter(([, count]) => count.status !== "AVAILABLE")
    .map(([name]) => name);
  const incompleteMigrationRecords = migrations.summary
    ? decimalString(migrations.summary.incomplete)
    : null;
  const incomplete =
    migrations.target.status !== "APPLIED" ||
    migrations.history.hasDrift ||
    (incompleteMigrationRecords !== null && incompleteMigrationRecords !== "0") ||
    missingCoreTables.length > 0 ||
    missingObservedTables.length > 0;

  return {
    status: strict && incomplete ? "FAIL" : incomplete ? "INCOMPLETE" : "PASS",
    database: {
      name: identity.database_name ?? null,
      activeSchema: identity.active_schema ?? schema,
      serverVersion: identity.server_version ?? null,
      transactionReadOnly: identity.transaction_read_only === "on",
    },
    targetMigration: TARGET_MIGRATION,
    migrations,
    counts,
    completeness: {
      complete: !incomplete,
      missingCoreTables,
      missingObservedTables,
      incompleteMigrationRecords,
      strict,
    },
  };
}

async function collectMigrationStatus(query, schema, catalog, localHistory) {
  const requiredColumns = [
    "id",
    "checksum",
    "migration_name",
    "started_at",
    "finished_at",
    "rolled_back_at",
    "applied_steps_count",
    "logs",
  ];
  if (!catalog.has("_prisma_migrations")) {
    return {
      tableStatus: "MISSING",
      summary: null,
      target: { name: TARGET_MIGRATION, status: "MIGRATION_TABLE_MISSING", attempts: [] },
      history: compareMigrationHistory(localHistory, []),
    };
  }
  if (!hasColumns(catalog, "_prisma_migrations", requiredColumns)) {
    const available = catalog.get("_prisma_migrations") ?? new Set();
    return {
      tableStatus: "MISSING_COLUMNS",
      missingColumns: requiredColumns.filter((column) => !available.has(column)),
      summary: null,
      target: {
        name: TARGET_MIGRATION,
        status: "MIGRATION_TABLE_INCOMPATIBLE",
        attempts: [],
      },
      history: compareMigrationHistory(localHistory, []),
    };
  }

  const table = `${quoteIdentifier(schema)}.${quoteIdentifier("_prisma_migrations")}`;
  const recordsResult = await query(`
    SELECT
      id,
      migration_name,
      checksum,
      started_at,
      finished_at,
      rolled_back_at,
      applied_steps_count,
      CASE WHEN COALESCE(logs, '') = '' THEN false ELSE true END AS has_logs
    FROM ${table}
    ORDER BY started_at ASC, migration_name ASC
  `);
  const records = recordsResult.rows;
  const attempts = records.filter((record) => record.migration_name === TARGET_MIGRATION);
  let status = "NOT_APPLIED";
  if (attempts.some((attempt) => attempt.finished_at && !attempt.rolled_back_at)) {
    status = "APPLIED";
  } else if (attempts.some((attempt) => !attempt.finished_at && !attempt.rolled_back_at)) {
    status = "FAILED_OR_INCOMPLETE";
  } else if (attempts.some((attempt) => attempt.rolled_back_at)) {
    status = "ROLLED_BACK";
  }
  return {
    tableStatus: "AVAILABLE",
    summary: migrationSummary(records),
    target: { name: TARGET_MIGRATION, status, attempts },
    history: compareMigrationHistory(localHistory, records),
  };
}

function migrationSummary(records) {
  const applied = records.filter((record) => record.finished_at && !record.rolled_back_at);
  const incomplete = records.filter(
    (record) => !record.finished_at && !record.rolled_back_at,
  );
  const rolledBack = records.filter((record) => record.rolled_back_at);
  const latestFinished = applied.reduce((latest, record) => {
    if (!latest) return record.finished_at;
    return new Date(record.finished_at).getTime() > new Date(latest).getTime()
      ? record.finished_at
      : latest;
  }, null);
  return {
    records: String(records.length),
    applied: String(applied.length),
    incomplete: String(incomplete.length),
    rolled_back: String(rolledBack.length),
    latest_finished_at: latestFinished,
  };
}

async function collectCount(query, schema, catalog, { table, stateColumn }) {
  if (!catalog.has(table)) {
    return { status: "MISSING_TABLE", sourceTable: table, total: null, byState: null };
  }
  const qualified = `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
  const totalResult = await query(`SELECT COUNT(*)::text AS total FROM ${qualified}`);
  let byState = null;
  if (stateColumn && hasColumns(catalog, table, [stateColumn])) {
    const stateResult = await query(`
      SELECT COALESCE(${quoteIdentifier(stateColumn)}::text, '<NULL>') AS state, COUNT(*)::text AS count
      FROM ${qualified}
      GROUP BY ${quoteIdentifier(stateColumn)}
      ORDER BY state
    `);
    byState = Object.fromEntries(stateResult.rows.map((row) => [row.state, decimalString(row.count)]));
  }
  return {
    status: "AVAILABLE",
    sourceTable: table,
    total: decimalString(totalResult.rows[0]?.total),
    byState,
  };
}

async function collectCalendarProjectionCount(query, schema, catalog) {
  const table = "CalendarEntry";
  if (!catalog.has(table)) {
    return { status: "MISSING_TABLE", sourceTable: table, total: null, byState: null };
  }
  const qualified = `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
  const hasCommitment = hasColumns(catalog, table, ["planCommitmentId"]);
  const hasRequest = hasColumns(catalog, table, ["planRequestId"]);
  if (!hasCommitment && !hasRequest) {
    return {
      status: "MISSING_COLUMNS",
      sourceTable: table,
      total: null,
      byState: null,
      reason: "Neither planCommitmentId nor planRequestId is deployed.",
    };
  }
  const predicate = [
    hasCommitment ? `${quoteIdentifier("planCommitmentId")} IS NOT NULL` : null,
    hasRequest ? `${quoteIdentifier("planRequestId")} IS NOT NULL` : null,
  ]
    .filter(Boolean)
    .join(" OR ");
  const result = await query(`
    SELECT
      COUNT(*) FILTER (WHERE ${predicate})::text AS linked_total,
      ${
        hasCommitment
          ? `COUNT(*) FILTER (WHERE ${quoteIdentifier("planCommitmentId")} IS NOT NULL)::text`
          : `'0'::text`
      } AS stable_commitment,
      ${
        hasRequest
          ? `COUNT(*) FILTER (WHERE ${quoteIdentifier("planRequestId")} IS NOT NULL)::text`
          : `'0'::text`
      } AS legacy_request
    FROM ${qualified}
  `);
  const row = result.rows[0] ?? {};
  return {
    status: "AVAILABLE",
    sourceTable: table,
    total: decimalString(row.linked_total),
    byState: {
      stableCommitment: decimalString(row.stable_commitment),
      legacyRequest: decimalString(row.legacy_request),
    },
  };
}

function renderHuman(document) {
  const lines = [
    "B-light deployment and data inventory",
    `Generated: ${document.generatedAt}`,
    "Mode: READ ONLY / dry-run (all database transactions are rolled back)",
  ];
  for (const report of document.targets) {
    lines.push("", `Target: ${report.environment} (${report.databaseUrlEnv})`);
    if (report.status === "ERROR" || report.status === "NOT_CONFIGURED") {
      lines.push(`  Result: ${report.status}`, `  Error: ${report.error}`);
      continue;
    }
    lines.push(
      `  Database: ${report.database.name ?? "unknown"}/${report.schema}`,
      `  Transaction read-only: ${report.database.transactionReadOnly ? "yes" : "NO"}`,
      `  Canonical migration: ${report.targetMigration} [${report.migrations.target.status}]`,
      `  Migration history: ${report.migrations.history.status}`,
      `    - applied missing locally: ${report.migrations.history.totals.appliedMissingLocally}`,
      `    - local pending/unapplied: ${report.migrations.history.totals.localPending}`,
      `    - checksum mismatches: ${report.migrations.history.totals.checksumMismatches}`,
      `    - applied checksum/name collisions: ${report.migrations.history.totals.checksumNameCollisions}`,
      `    - unfinished records: ${report.migrations.history.totals.unfinishedRecords}`,
      "  Counts:",
    );
    for (const [name, count] of Object.entries(report.counts)) {
      const value = count.total ?? count.status;
      const states = count.byState
        ? ` (${Object.entries(count.byState)
            .map(([state, amount]) => `${state}=${amount}`)
            .join(", ")})`
        : "";
      lines.push(`    - ${name}: ${value}${states} [${count.sourceTable}]`);
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
    process.stderr.write(`B-light deployment audit: ${sanitizeError(error)}\n`);
    return 2;
  }
  if (options.help) {
    process.stdout.write(
      commonHelp(
        "audit-b-light-deployment.mjs",
        "Inspect B-light migration state and critical row counts without modifying data.",
      ),
    );
    return 0;
  }
  const reports = await runReadOnlyTargets({
    targets: options.targets,
    auditName: "b-light-deployment",
    collect: collectDeploymentAudit,
    strict: options.strict,
  });
  const document = {
    audit: "b-light-deployment",
    version: 1,
    generatedAt: new Date().toISOString(),
    targetMigration: TARGET_MIGRATION,
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
      process.stderr.write(`B-light deployment audit: ${sanitizeError(error)}\n`);
      process.exitCode = 2;
    },
  );
}
