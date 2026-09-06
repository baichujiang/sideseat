export type AuditStatus =
  | "PASS"
  | "FAIL"
  | "INCOMPLETE"
  | "ERROR"
  | "NOT_CONFIGURED";

export type CheckStatus = "PASS" | "FAIL" | "SKIPPED";

export interface AuditRow {
  [column: string]: unknown;
}

export interface AuditQueryResult {
  rows: AuditRow[];
}

export type AuditQuery = (
  sql: string,
  values?: readonly unknown[],
) => Promise<AuditQueryResult>;

export interface AuditTargetSpec {
  label: string;
  envName: string;
  connectionString: string | null;
}

export interface AuditCliOptions {
  format: "human" | "json";
  strict: boolean;
  environment?: string;
  databaseUrlEnv?: string;
  targets: AuditTargetSpec[];
  help: boolean;
}

export interface LocalMigration {
  migrationName: string;
  checksum: string;
}

export interface InvalidLocalMigrationDirectory {
  migrationName: string;
  issue: string;
}

export interface LocalMigrationSnapshot {
  status: string;
  directory: string;
  migrations: LocalMigration[];
  invalidDirectories: InvalidLocalMigrationDirectory[];
  error?: string | null;
}

export interface DatabaseMigrationRow extends AuditRow {
  migration_name: string;
  checksum?: unknown;
  finished_at?: unknown;
  rolled_back_at?: unknown;
}

export interface MigrationHistoryItem extends AuditRow {
  migrationName: string;
}

export interface MigrationHistoryReport {
  status: "PASS" | "INCOMPLETE";
  hasDrift: boolean;
  driftCount: number;
  localStatus: string;
  localDirectory: string | null;
  localMigrationCount: number;
  appliedMigrationCount: number;
  totals: {
    appliedMissingLocally: number;
    localPending: number;
    checksumMismatches: number;
    checksumNameCollisions: number;
    unfinishedRecords: number;
    invalidLocalDirectories: number;
    localReadErrors: number;
  };
  appliedMissingLocally: MigrationHistoryItem[];
  localPending: MigrationHistoryItem[];
  checksumMismatches: MigrationHistoryItem[];
  checksumNameCollisions: Array<{
    checksum: string;
    migrationNames: string[];
  }>;
  unfinishedRecords: MigrationHistoryItem[];
  invalidLocalDirectories: InvalidLocalMigrationDirectory[];
  localReadError: string | null;
  truncated: boolean;
}

export interface AuditCheck {
  id: string;
  label: string;
  status: CheckStatus;
  findingCount: string;
  truncated: boolean;
  findings: AuditRow[];
  reason?: string;
  groupingColumns?: string[];
  effectiveGrouping?: boolean;
  connectionIdentityChecked?: boolean;
  identityColumns?: string[];
  model?: string;
  models?: string[];
}

export interface AuditCheckSummary {
  status: "PASS" | "FAIL" | "INCOMPLETE";
  failed: number;
  skipped: number;
  passed: number;
  strict: boolean;
}

export const TARGET_MIGRATION: "20260829193000_action_to_plan_v2";
export const AUDIT_DETAIL_LIMIT: 100;

export function parseAuditArgs(
  argv: readonly string[],
  env?: Record<string, string | undefined>,
): AuditCliOptions;

export function schemaFromConnectionString(connectionString: string): string;
export function quoteIdentifier(identifier: unknown): string;
export function loadTableCatalog(
  query: AuditQuery,
  schema: string,
  tableNames: readonly string[],
): Promise<Map<string, Set<string>>>;
export function hasColumns(
  catalog: ReadonlyMap<string, ReadonlySet<string>>,
  tableName: string,
  columns: readonly string[],
): boolean;
export function decimalString(value: unknown): string;
export function loadLocalMigrationHistory(directory: string): LocalMigrationSnapshot;
export function compareMigrationHistory(
  localSnapshot: LocalMigrationSnapshot | null | undefined,
  databaseRows: readonly DatabaseMigrationRow[],
): MigrationHistoryReport;
export function findingQuery(sql: string, idColumn?: string): string;
export function checkFromRows<
  TDetails extends Record<string, unknown> = Record<never, never>,
>(
  id: string,
  label: string,
  rows: readonly AuditRow[],
  details?: TDetails,
): AuditCheck & TDetails;
export function skippedCheck(id: string, label: string, reason: string): AuditCheck;
export function summarizeChecks(
  checks: readonly Pick<AuditCheck, "status">[],
  strict?: boolean,
): AuditCheckSummary;
export function runReadOnlyTargets<TReport extends { status: AuditStatus }>(options: {
  targets: readonly AuditTargetSpec[];
  auditName: string;
  collect: (options: {
    query: AuditQuery;
    schema: string;
    strict: boolean;
  }) => Promise<TReport>;
  strict?: boolean;
}): Promise<Array<TReport & AuditRow>>;
export function sanitizeError(error: unknown): string;
export function reportsExitCode(
  reports: readonly Array<{ status: AuditStatus }>,
  strict?: boolean,
): 0 | 1 | 2;
export function printReport<TDocument>(
  document: TDocument,
  format: "human" | "json",
  renderHuman: (document: TDocument) => string,
): void;
export function commonHelp(command: string, description: string): string;
