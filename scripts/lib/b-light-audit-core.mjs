import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import pg from "pg";

const { Client } = pg;

export const TARGET_MIGRATION = "20260829193000_action_to_plan_v2";
export const AUDIT_DETAIL_LIMIT = 100;

const MUTATION_FLAGS = new Set([
  "--apply",
  "--execute",
  "--fix",
  "--migrate",
  "--write",
]);

export function parseAuditArgs(argv, env = process.env) {
  const options = {
    format: "human",
    strict: false,
    environment: undefined,
    databaseUrlEnv: undefined,
    targets: [],
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (MUTATION_FLAGS.has(argument)) {
      throw new Error(
        `${argument} is not supported. B-light audit commands are permanently read-only.`,
      );
    }
    if (argument === "--json") {
      options.format = "json";
      continue;
    }
    if (argument === "--strict") {
      options.strict = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (argument === "--environment") {
      options.environment = requireOptionValue(argv, ++index, argument);
      continue;
    }
    if (argument.startsWith("--environment=")) {
      options.environment = requireInlineValue(argument);
      continue;
    }
    if (argument === "--database-url-env") {
      options.databaseUrlEnv = requireOptionValue(argv, ++index, argument);
      continue;
    }
    if (argument.startsWith("--database-url-env=")) {
      options.databaseUrlEnv = requireInlineValue(argument);
      continue;
    }
    if (argument === "--target") {
      options.targets.push(parseTargetSpec(requireOptionValue(argv, ++index, argument)));
      continue;
    }
    if (argument.startsWith("--target=")) {
      options.targets.push(parseTargetSpec(requireInlineValue(argument)));
      continue;
    }
    throw new Error(`Unknown option: ${argument}`);
  }

  if (options.targets.length > 0 && (options.environment || options.databaseUrlEnv)) {
    throw new Error(
      "--target cannot be combined with --environment or --database-url-env.",
    );
  }

  const resolvedTargets =
    options.targets.length > 0
      ? options.targets
      : [
          {
            label:
              options.environment ||
              env.B_LIGHT_AUDIT_ENVIRONMENT?.trim() ||
              env.VERCEL_ENV?.trim() ||
              env.NODE_ENV?.trim() ||
              "database",
            envName:
              options.databaseUrlEnv ||
              (env.DATABASE_URL_UNPOOLED?.trim()
                ? "DATABASE_URL_UNPOOLED"
                : "DATABASE_URL"),
          },
        ];

  return {
    ...options,
    targets: resolvedTargets.map((target) => ({
      ...target,
      connectionString: env[target.envName]?.trim() || null,
    })),
  };
}

function requireOptionValue(argv, index, option) {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

function requireInlineValue(argument) {
  const value = argument.slice(argument.indexOf("=") + 1).trim();
  if (!value) throw new Error(`${argument.split("=")[0]} requires a value.`);
  return value;
}

function parseTargetSpec(specification) {
  const separator = specification.indexOf("=");
  if (separator <= 0 || separator === specification.length - 1) {
    throw new Error("--target must use LABEL=ENV_VAR, for example staging=STAGING_DATABASE_URL.");
  }
  const label = specification.slice(0, separator).trim();
  const envName = specification.slice(separator + 1).trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(label)) {
    throw new Error(`Invalid target label: ${label}`);
  }
  if (!/^[A-Z_][A-Z0-9_]*$/.test(envName)) {
    throw new Error(`Invalid target environment variable: ${envName}`);
  }
  return { label, envName };
}

export function schemaFromConnectionString(connectionString) {
  try {
    const parsed = new URL(connectionString);
    const requested = parsed.searchParams.get("schema")?.trim() || "public";
    return /^[A-Za-z_][A-Za-z0-9_$]*$/.test(requested) ? requested : "public";
  } catch {
    return "public";
  }
}

export function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

export async function loadTableCatalog(query, schema, tableNames) {
  const result = await query(
    `
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = ANY($2::text[])
      ORDER BY table_name, ordinal_position
    `,
    [schema, tableNames],
  );
  const catalog = new Map();
  for (const row of result.rows) {
    const columns = catalog.get(row.table_name) ?? new Set();
    columns.add(row.column_name);
    catalog.set(row.table_name, columns);
  }
  return catalog;
}

export function hasColumns(catalog, tableName, columns) {
  const available = catalog.get(tableName);
  return Boolean(available && columns.every((column) => available.has(column)));
}

export function decimalString(value) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return String(value);
  return typeof value === "string" ? value : "0";
}

export function loadLocalMigrationHistory(directory) {
  try {
    const migrations = [];
    const invalidDirectories = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const sqlPath = join(directory, entry.name, "migration.sql");
      try {
        const sql = readFileSync(sqlPath);
        migrations.push({
          migrationName: entry.name,
          checksum: createHash("sha256").update(sql).digest("hex"),
        });
      } catch {
        invalidDirectories.push({
          migrationName: entry.name,
          issue: "MISSING_OR_UNREADABLE_MIGRATION_SQL",
        });
      }
    }
    migrations.sort((left, right) => left.migrationName.localeCompare(right.migrationName));
    invalidDirectories.sort((left, right) =>
      left.migrationName.localeCompare(right.migrationName),
    );
    return {
      status: invalidDirectories.length > 0 ? "INCOMPLETE" : "AVAILABLE",
      directory,
      migrations,
      invalidDirectories,
      error: null,
    };
  } catch (error) {
    return {
      status: "ERROR",
      directory,
      migrations: [],
      invalidDirectories: [],
      error: sanitizeError(error),
    };
  }
}

export function compareMigrationHistory(localSnapshot, databaseRows) {
  const localMigrations = localSnapshot?.migrations ?? [];
  const localByName = new Map(
    localMigrations.map((migration) => [migration.migrationName, migration]),
  );
  const appliedRows = databaseRows.filter(isAppliedMigrationRow);
  const appliedNames = new Set(appliedRows.map((row) => row.migration_name));

  const appliedMissingLocally = uniqueBy(
    appliedRows
      .filter((row) => !localByName.has(row.migration_name))
      .map((row) => ({
        migrationName: row.migration_name,
        checksum: normalizedChecksum(row.checksum),
        finishedAt: row.finished_at ?? null,
      })),
    (row) => row.migrationName,
  );
  const localPending = localMigrations
    .filter((migration) => !appliedNames.has(migration.migrationName))
    .map((migration) => ({ ...migration }));
  const checksumMismatches = uniqueBy(
    appliedRows.flatMap((row) => {
      const local = localByName.get(row.migration_name);
      const appliedChecksum = normalizedChecksum(row.checksum);
      if (!local || local.checksum === appliedChecksum) return [];
      return [
        {
          migrationName: row.migration_name,
          localChecksum: local.checksum,
          appliedChecksum,
        },
      ];
    }),
    (row) => `${row.migrationName}:${row.appliedChecksum}`,
  );

  const namesByChecksum = new Map();
  for (const row of appliedRows) {
    const checksum = normalizedChecksum(row.checksum);
    if (!checksum) continue;
    const names = namesByChecksum.get(checksum) ?? new Set();
    names.add(row.migration_name);
    namesByChecksum.set(checksum, names);
  }
  const checksumNameCollisions = [...namesByChecksum.entries()]
    .filter(([, names]) => names.size > 1)
    .map(([checksum, names]) => ({ checksum, migrationNames: [...names].sort() }))
    .sort((left, right) => left.checksum.localeCompare(right.checksum));
  const unfinishedRecords = databaseRows
    .filter((row) => !row.finished_at && !row.rolled_back_at)
    .map((row) => ({
      id: row.id ?? null,
      migrationName: row.migration_name,
      checksum: normalizedChecksum(row.checksum),
      startedAt: row.started_at ?? null,
      appliedStepsCount: decimalString(row.applied_steps_count),
      hasLogs: Boolean(row.has_logs),
    }));
  const invalidLocalDirectories = localSnapshot?.invalidDirectories ?? [];
  const localReadError = localSnapshot?.status === "ERROR" ? localSnapshot.error : null;

  const totals = {
    appliedMissingLocally: appliedMissingLocally.length,
    localPending: localPending.length,
    checksumMismatches: checksumMismatches.length,
    checksumNameCollisions: checksumNameCollisions.length,
    unfinishedRecords: unfinishedRecords.length,
    invalidLocalDirectories: invalidLocalDirectories.length,
    localReadErrors: localReadError ? 1 : 0,
  };
  const driftCount = Object.values(totals).reduce((total, value) => total + value, 0);

  return {
    status: driftCount === 0 ? "PASS" : "INCOMPLETE",
    hasDrift: driftCount > 0,
    driftCount,
    localStatus: localSnapshot?.status ?? "ERROR",
    localDirectory: localSnapshot?.directory ?? null,
    localMigrationCount: localMigrations.length,
    appliedMigrationCount: appliedRows.length,
    totals,
    appliedMissingLocally: appliedMissingLocally.slice(0, AUDIT_DETAIL_LIMIT),
    localPending: localPending.slice(0, AUDIT_DETAIL_LIMIT),
    checksumMismatches: checksumMismatches.slice(0, AUDIT_DETAIL_LIMIT),
    checksumNameCollisions: checksumNameCollisions.slice(0, AUDIT_DETAIL_LIMIT),
    unfinishedRecords: unfinishedRecords.slice(0, AUDIT_DETAIL_LIMIT),
    invalidLocalDirectories: invalidLocalDirectories.slice(0, AUDIT_DETAIL_LIMIT),
    localReadError,
    truncated: Object.values(totals).some((value) => value > AUDIT_DETAIL_LIMIT),
  };
}

function isAppliedMigrationRow(row) {
  return Boolean(row.finished_at && !row.rolled_back_at);
}

function normalizedChecksum(value) {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

function uniqueBy(values, keyForValue) {
  const unique = new Map();
  for (const value of values) unique.set(keyForValue(value), value);
  return [...unique.values()];
}

export function findingQuery(sql, idColumn = "entity_id") {
  return `
    WITH findings AS (
      ${sql}
    )
    SELECT findings.*, COUNT(*) OVER()::text AS total_findings
    FROM findings
    ORDER BY ${quoteIdentifier(idColumn)}
    LIMIT ${AUDIT_DETAIL_LIMIT}
  `;
}

export function checkFromRows(id, label, rows, details = {}) {
  const findingCount = rows.length > 0 ? decimalString(rows[0].total_findings) : "0";
  return {
    id,
    label,
    status: findingCount === "0" ? "PASS" : "FAIL",
    findingCount,
    truncated: BigInt(findingCount) > BigInt(rows.length),
    findings: rows.map((row) => {
      const finding = { ...row };
      delete finding.total_findings;
      return finding;
    }),
    ...details,
  };
}

export function skippedCheck(id, label, reason) {
  return {
    id,
    label,
    status: "SKIPPED",
    findingCount: "0",
    truncated: false,
    findings: [],
    reason,
  };
}

export function summarizeChecks(checks, strict = false) {
  const failed = checks.filter((check) => check.status === "FAIL").length;
  const skipped = checks.filter((check) => check.status === "SKIPPED").length;
  return {
    status: failed > 0 || (strict && skipped > 0) ? "FAIL" : skipped > 0 ? "INCOMPLETE" : "PASS",
    failed,
    skipped,
    passed: checks.length - failed - skipped,
    strict,
  };
}

export async function runReadOnlyTargets({ targets, auditName, collect, strict = false }) {
  const reports = [];
  for (const target of targets) {
    if (!target.connectionString) {
      reports.push({
        environment: target.label,
        databaseUrlEnv: target.envName,
        audit: auditName,
        readOnly: true,
        dryRun: true,
        status: "NOT_CONFIGURED",
        error: `${target.envName} is not set.`,
      });
      continue;
    }

    const schema = schemaFromConnectionString(target.connectionString);
    const client = new Client({
      connectionString: target.connectionString,
      application_name: `sideseat-${auditName}`.slice(0, 63),
      connectionTimeoutMillis: boundedTimeout(process.env.B_LIGHT_AUDIT_CONNECT_TIMEOUT_MS, 10_000),
      query_timeout: boundedTimeout(process.env.B_LIGHT_AUDIT_QUERY_TIMEOUT_MS, 30_000),
      statement_timeout: boundedTimeout(process.env.B_LIGHT_AUDIT_QUERY_TIMEOUT_MS, 30_000),
    });
    let transactionStarted = false;
    try {
      await client.connect();
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      transactionStarted = true;
      const query = (text, values = []) => client.query(text, values);
      const report = await collect({ query, schema, strict });
      reports.push({
        environment: target.label,
        databaseUrlEnv: target.envName,
        audit: auditName,
        readOnly: true,
        dryRun: true,
        schema,
        ...report,
      });
    } catch (error) {
      reports.push({
        environment: target.label,
        databaseUrlEnv: target.envName,
        audit: auditName,
        readOnly: true,
        dryRun: true,
        schema,
        status: "ERROR",
        error: sanitizeError(error),
      });
    } finally {
      if (transactionStarted) await client.query("ROLLBACK").catch(() => {});
      await client.end().catch(() => {});
    }
  }
  return reports;
}

function boundedTimeout(raw, fallback) {
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 1_000 && parsed <= 120_000 ? parsed : fallback;
}

export function sanitizeError(error) {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/password\s*=\s*[^\s]+/gi, "password=[REDACTED]")
    .slice(0, 1_000);
}

export function reportsExitCode(reports, strict = false) {
  if (reports.some((report) => report.status === "ERROR" || report.status === "NOT_CONFIGURED")) {
    return 2;
  }
  if (reports.some((report) => report.status === "FAIL")) return 1;
  if (strict && reports.some((report) => report.status === "INCOMPLETE")) return 1;
  return 0;
}

export function printReport(document, format, renderHuman) {
  if (format === "json") {
    process.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${renderHuman(document)}\n`);
}

export function commonHelp(command, description) {
  return `${description}

Usage:
  node scripts/${command} [options]

Options:
  --json                         Emit one machine-readable JSON document.
  --strict                       Treat skipped/incomplete checks as failure.
  --environment NAME             Label the default database target.
  --database-url-env ENV_VAR     Read the default URL from this variable.
  --target LABEL=ENV_VAR         Audit a target; repeat for multiple environments.
  --help                         Show this help.

The command is permanently read-only. It opens a REPEATABLE READ, READ ONLY
transaction and always rolls it back. Database URLs are accepted only through
environment variables so credentials are not exposed in shell history.
`;
}
