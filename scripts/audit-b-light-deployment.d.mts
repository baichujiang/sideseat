import type {
  AuditQuery,
  AuditRow,
  AuditStatus,
  LocalMigrationSnapshot,
  MigrationHistoryReport,
} from "./lib/b-light-audit-core.mjs";

export interface DeploymentCountReport {
  status: string;
  sourceTable: string;
  total: string | null;
  byState: Record<string, string> | null;
  reason?: string;
}

export interface DeploymentAuditReport {
  status: AuditStatus;
  database: {
    name: unknown;
    activeSchema: unknown;
    serverVersion: unknown;
    transactionReadOnly: boolean;
  };
  targetMigration: string;
  migrations: {
    target: {
      status: string;
      [key: string]: unknown;
    };
    history: MigrationHistoryReport;
    [key: string]: unknown;
  };
  counts: {
    actions: DeploymentCountReport;
    interests: DeploymentCountReport;
    plans: DeploymentCountReport;
    planRevisions: DeploymentCountReport;
    calendarPlanProjections: DeploymentCountReport;
    outcomes: DeploymentCountReport;
  };
  completeness: AuditRow;
}

export function collectDeploymentAudit(options: {
  query: AuditQuery;
  schema: string;
  strict?: boolean;
  localMigrationHistory?: LocalMigrationSnapshot | null;
}): Promise<DeploymentAuditReport>;

export function main(
  argv?: readonly string[],
  env?: Record<string, string | undefined>,
): Promise<0 | 1 | 2>;
