import type {
  DirectV1BackfillBatchReport,
  DirectV1BackfillFinding,
  DirectV1BackfillMode,
  DirectV1BackfillPhase,
  DirectV1VerificationReport,
} from "../../lib/v2/direct-v1-coordination-backfill";

import {
  encodeDirectV1BackfillCheckpoint,
  type DirectV1BackfillCheckpoint,
} from "./direct-v1-backfill-cli";

type BatchCursor = Readonly<{ createdAt: Date | string; id: string }>;

type BatchRequest = Readonly<{
  phase: DirectV1BackfillPhase;
  batchSize: number;
  through: Date;
  cursor: BatchCursor | null;
  maxFindings: number;
}>;

export type DirectV1BackfillRunOptions = Readonly<{
  mode: DirectV1BackfillMode;
  phase: DirectV1BackfillPhase | "all";
  batchSize: number;
  maxFindings: number;
  through: Date | null;
  checkpoint: DirectV1BackfillCheckpoint | null;
}>;

export type DirectV1VerifyRunOptions = Omit<
  DirectV1BackfillRunOptions,
  "mode" | "phase" | "checkpoint"
> &
  Readonly<{
    phase: "all";
    checkpoint: null;
  }>;

export type DirectV1BackfillRunnerDependencies = Readonly<{
  readDatabaseClock: () => Promise<Date>;
  backfillBatch: (
    request: BatchRequest & Readonly<{ mode: DirectV1BackfillMode }>,
  ) => Promise<DirectV1BackfillBatchReport>;
  verifyBatch: (request: BatchRequest) => Promise<DirectV1VerificationReport>;
  writeCheckpoint?: (encodedCheckpoint: string) => void;
}>;

type Totals = {
  pages: number;
  scannedActions: number;
  snapshottedActions: number;
  noOpActions: number;
  skippedNonDirectActions: number;
  scannedInterests: number;
  createdContexts: number;
  noOpContexts: number;
  skippedNonDirectInterests: number;
  verifiedActions: number;
  verifiedContexts: number;
  quarantined: number;
  violations: number;
};

export type DirectV1BackfillRunReport = Readonly<{
  operation: "direct-v1-coordination-backfill";
  mode: DirectV1BackfillMode;
  through: string;
  phases: readonly DirectV1BackfillPhase[];
  complete: boolean;
  totals: Readonly<Totals>;
  findingsTruncated: boolean;
  findings: readonly DirectV1BackfillFinding[];
  exitCode: 0 | 1;
}>;

export type DirectV1VerificationRunReport = Readonly<{
  operation: "direct-v1-coordination-verifier";
  mode: "read-only";
  through: string;
  phases: readonly DirectV1BackfillPhase[];
  complete: true;
  totals: Readonly<Totals>;
  findingsTruncated: boolean;
  findings: readonly DirectV1BackfillFinding[];
  passed: boolean;
  exitCode: 0 | 1;
}>;

const EMPTY_TOTALS: Readonly<Totals> = Object.freeze({
  pages: 0,
  scannedActions: 0,
  snapshottedActions: 0,
  noOpActions: 0,
  skippedNonDirectActions: 0,
  scannedInterests: 0,
  createdContexts: 0,
  noOpContexts: 0,
  skippedNonDirectInterests: 0,
  verifiedActions: 0,
  verifiedContexts: 0,
  quarantined: 0,
  violations: 0,
});

function selectedPhases(
  phase: DirectV1BackfillPhase | "all",
  checkpoint: DirectV1BackfillCheckpoint | null,
): readonly DirectV1BackfillPhase[] {
  const phases: readonly DirectV1BackfillPhase[] =
    phase === "all" ? ["actions", "interests"] : [phase];
  if (!checkpoint) return phases;
  const start = phases.indexOf(checkpoint.phase);
  if (start === -1) {
    throw new Error("Checkpoint phase is outside the selected scan scope.");
  }
  return phases.slice(start);
}

async function resolveThrough(
  explicit: Date | null,
  readDatabaseClock: () => Promise<Date>,
): Promise<Date> {
  const through = explicit ? new Date(explicit) : await readDatabaseClock();
  if (Number.isNaN(through.getTime())) {
    throw new Error("Database clock did not return a valid timestamp.");
  }
  return through;
}

function checkpointCursor(
  checkpoint: DirectV1BackfillCheckpoint | null,
  phase: DirectV1BackfillPhase,
): BatchCursor | null {
  if (!checkpoint || checkpoint.phase !== phase) return null;
  return { createdAt: new Date(checkpoint.createdAt), id: checkpoint.id };
}

function addFindings(
  target: DirectV1BackfillFinding[],
  source: readonly DirectV1BackfillFinding[],
  limit: number,
): void {
  const remaining = Math.max(0, limit - target.length);
  if (remaining > 0) target.push(...source.slice(0, remaining));
}

function freezeTotals(totals: Totals): Readonly<Totals> {
  return Object.freeze({ ...totals });
}

export async function runDirectV1Backfill(
  options: DirectV1BackfillRunOptions,
  dependencies: DirectV1BackfillRunnerDependencies,
): Promise<DirectV1BackfillRunReport> {
  if (options.mode === "apply" && !options.through) {
    throw new Error("Apply mode requires an explicit reviewed cutoff.");
  }
  const through = await resolveThrough(options.through, dependencies.readDatabaseClock);
  const phases = selectedPhases(options.phase, options.checkpoint);
  const totals: Totals = { ...EMPTY_TOTALS };
  const findings: DirectV1BackfillFinding[] = [];
  let findingsTruncated = false;
  let complete = true;

  scan:
  for (const phase of phases) {
    let cursor = checkpointCursor(options.checkpoint, phase);
    for (;;) {
      const page = await dependencies.backfillBatch({
        mode: options.mode,
        phase,
        batchSize: options.batchSize,
        through,
        cursor,
        maxFindings: options.maxFindings,
      });
      totals.pages += 1;
      totals.scannedActions += page.scannedActions;
      totals.snapshottedActions += page.snapshottedActions;
      totals.noOpActions += page.noOpActions;
      totals.skippedNonDirectActions += page.skippedNonDirectActions;
      totals.scannedInterests += page.scannedInterests;
      totals.createdContexts += page.createdContexts;
      totals.noOpContexts += page.noOpContexts;
      totals.skippedNonDirectInterests += page.skippedNonDirectInterests;
      totals.quarantined += page.quarantined;
      addFindings(findings, page.findings, options.maxFindings);
      findingsTruncated ||= page.findingsTruncated;
      findingsTruncated ||= totals.quarantined > findings.length;

      // A checkpoint may only certify a finding-free scanned prefix. If this
      // page contains quarantine evidence, stop before emitting its cursor or
      // scanning later pages/phases. The previous checkpoint (if any) remains
      // safe: resuming from it deterministically revisits this page and cannot
      // turn a failed prefix into an apparently green run.
      if (page.quarantined > 0) {
        complete = false;
        break scan;
      }

      const scanned = page.scannedActions + page.scannedInterests;
      if (options.mode === "apply" && scanned > 0 && page.nextCursor) {
        dependencies.writeCheckpoint?.(
          encodeDirectV1BackfillCheckpoint({
            version: 1,
            phase,
            through: through.toISOString(),
            createdAt: page.nextCursor.createdAt.toISOString(),
            id: page.nextCursor.id,
          }),
        );
      }
      if (!page.hasMore) break;
      if (!page.nextCursor) {
        throw new Error("Backfill page reported more rows without a keyset cursor.");
      }
      cursor = page.nextCursor;
    }
  }

  const exitCode = totals.quarantined > 0 ? 1 : 0;
  return Object.freeze({
    operation: "direct-v1-coordination-backfill",
    mode: options.mode,
    through: through.toISOString(),
    phases: Object.freeze([...phases]),
    complete,
    totals: freezeTotals(totals),
    findingsTruncated,
    findings: Object.freeze([...findings]),
    exitCode,
  });
}

export async function runDirectV1Verification(
  options: DirectV1VerifyRunOptions,
  dependencies: DirectV1BackfillRunnerDependencies,
): Promise<DirectV1VerificationRunReport> {
  if (options.phase !== "all" || options.checkpoint !== null) {
    throw new Error(
      "Release verification must start at the beginning and scan actions then interests in full.",
    );
  }
  const through = await resolveThrough(options.through, dependencies.readDatabaseClock);
  const phases = ["actions", "interests"] as const;
  const totals: Totals = { ...EMPTY_TOTALS };
  const findings: DirectV1BackfillFinding[] = [];
  let findingsTruncated = false;

  for (const phase of phases) {
    let cursor: BatchCursor | null = null;
    for (;;) {
      const page = await dependencies.verifyBatch({
        phase,
        batchSize: options.batchSize,
        through,
        cursor,
        maxFindings: options.maxFindings,
      });
      totals.pages += 1;
      totals.scannedActions += page.scannedActions;
      totals.scannedInterests += page.scannedInterests;
      totals.verifiedActions += page.verifiedActions;
      totals.verifiedContexts += page.verifiedContexts;
      totals.skippedNonDirectActions += page.skippedNonDirectActions;
      totals.skippedNonDirectInterests += page.skippedNonDirectInterests;
      totals.quarantined += page.quarantined;
      totals.violations += page.violations;
      addFindings(findings, page.findings, options.maxFindings);
      findingsTruncated ||= page.findingsTruncated;
      findingsTruncated ||= totals.quarantined + totals.violations > findings.length;

      if (!page.hasMore) break;
      if (!page.nextCursor) {
        throw new Error("Verification page reported more rows without a keyset cursor.");
      }
      cursor = page.nextCursor;
    }
  }

  const passed = totals.quarantined === 0 && totals.violations === 0;
  return Object.freeze({
    operation: "direct-v1-coordination-verifier",
    mode: "read-only",
    through: through.toISOString(),
    phases: Object.freeze([...phases]),
    complete: true,
    totals: freezeTotals(totals),
    findingsTruncated,
    findings: Object.freeze([...findings]),
    passed,
    exitCode: passed ? 0 : 1,
  });
}

export function formatDirectV1RunReport(
  report: DirectV1BackfillRunReport | DirectV1VerificationRunReport,
  format: "human" | "json",
): string {
  if (format === "json") return JSON.stringify(report, null, 2);
  const lines = [
    report.operation === "direct-v1-coordination-backfill"
      ? "BL-DB-03 DIRECT_V1 coordination backfill"
      : "BL-DB-03 DIRECT_V1 coordination verifier",
    `Mode: ${report.mode}`,
    `Through: ${report.through}`,
    `Phases: ${report.phases.join(" -> ")}`,
    `Complete: ${report.complete ? "yes" : "no (stopped at first finding page)"}`,
    `Pages: ${report.totals.pages}`,
    `Actions: scanned=${report.totals.scannedActions}, snapshotted=${report.totals.snapshottedActions}, verified=${report.totals.verifiedActions}, skipped-non-direct=${report.totals.skippedNonDirectActions}`,
    `Interests: scanned=${report.totals.scannedInterests}, contexts-created=${report.totals.createdContexts}, contexts-verified=${report.totals.verifiedContexts}, skipped-non-direct=${report.totals.skippedNonDirectInterests}`,
    `Quarantined: ${report.totals.quarantined}`,
    `Violations: ${report.totals.violations}`,
  ];
  for (const finding of report.findings) {
    lines.push(
      `- ${finding.severity} ${finding.code} ${finding.entityKind}:${finding.entityId}`,
    );
  }
  if (report.findingsTruncated) lines.push("Findings: truncated");
  lines.push(`Result: ${report.exitCode === 0 ? "PASS" : "ATTENTION_REQUIRED"}`);
  return lines.join("\n");
}
