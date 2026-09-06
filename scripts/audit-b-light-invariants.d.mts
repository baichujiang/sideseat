import type {
  AuditCheck,
  AuditCheckSummary,
  AuditQuery,
} from "./lib/b-light-audit-core.mjs";

export interface InvariantAuditReport {
  status: "PASS" | "FAIL" | "INCOMPLETE";
  summary: AuditCheckSummary;
  checks: AuditCheck[];
}

export function collectInvariantAudit(options: {
  query: AuditQuery;
  schema: string;
  strict?: boolean;
}): Promise<InvariantAuditReport>;

export function main(
  argv?: readonly string[],
  env?: Record<string, string | undefined>,
): Promise<0 | 1 | 2>;
