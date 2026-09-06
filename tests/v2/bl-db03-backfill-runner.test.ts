import assert from "node:assert/strict";
import test from "node:test";

import type {
  DirectV1BackfillBatchReport,
  DirectV1VerificationReport,
} from "../../lib/v2/direct-v1-coordination-backfill";
import {
  formatDirectV1RunReport,
  runDirectV1Backfill,
  runDirectV1Verification,
  type DirectV1BackfillRunnerDependencies,
  type DirectV1VerifyRunOptions,
} from "../../scripts/lib/direct-v1-backfill-runner";
import { decodeDirectV1BackfillCheckpoint } from "../../scripts/lib/direct-v1-backfill-cli";

const through = new Date("2026-08-30T18:00:00.000Z");

function backfillPage(
  overrides: Partial<DirectV1BackfillBatchReport>,
): DirectV1BackfillBatchReport {
  return {
    mode: "dry-run",
    phase: "actions",
    through,
    cursor: null,
    nextCursor: null,
    nextPhase: "interests",
    hasMore: false,
    scannedActions: 0,
    snapshottedActions: 0,
    noOpActions: 0,
    skippedNonDirectActions: 0,
    scannedInterests: 0,
    createdContexts: 0,
    noOpContexts: 0,
    skippedNonDirectInterests: 0,
    quarantined: 0,
    findingsTruncated: false,
    findings: [],
    ...overrides,
  };
}

function verificationPage(
  overrides: Partial<DirectV1VerificationReport>,
): DirectV1VerificationReport {
  return {
    phase: "actions",
    through,
    cursor: null,
    nextCursor: null,
    nextPhase: "interests",
    hasMore: false,
    scannedActions: 0,
    scannedInterests: 0,
    verifiedActions: 0,
    verifiedContexts: 0,
    skippedNonDirectActions: 0,
    skippedNonDirectInterests: 0,
    quarantined: 0,
    violations: 0,
    findingsTruncated: false,
    findings: [],
    ...overrides,
  };
}

test("runner fixes a DB-clock cutoff and stops at the first quarantined page", async () => {
  const calls: Array<{ phase: string; cursorId: string | null; cutoff: string }> = [];
  let actionPage = 0;
  const dependencies: DirectV1BackfillRunnerDependencies = {
    readDatabaseClock: async () => through,
    backfillBatch: async (request) => {
      calls.push({
        phase: request.phase,
        cursorId: request.cursor?.id ?? null,
        cutoff: request.through.toISOString(),
      });
      if (request.phase === "actions" && actionPage++ === 0) {
        return backfillPage({
          phase: "actions",
          scannedActions: 1,
          snapshottedActions: 1,
          hasMore: true,
          nextCursor: { createdAt: new Date("2026-08-29T10:00:00.000Z"), id: "a-1" },
          nextPhase: "actions",
        });
      }
      if (request.phase === "actions") {
        return backfillPage({
          phase: "actions",
          scannedActions: 1,
          quarantined: 1,
          findings: [
            {
              severity: "quarantine",
              code: "ACTION_PARTIAL_OR_INVALID_POLICY",
              entityKind: "action",
              entityId: "a-2",
            },
          ],
        });
      }
      return backfillPage({
        phase: "interests",
        nextPhase: "complete",
        scannedInterests: 1,
        quarantined: 1,
        findings: [
          {
            severity: "quarantine",
            code: "INTEREST_CONTEXT_CONFLICT",
            entityKind: "interest",
            entityId: "i-1",
          },
        ],
      });
    },
    verifyBatch: async () => verificationPage({}),
  };

  const report = await runDirectV1Backfill(
    {
      mode: "dry-run",
      phase: "all",
      batchSize: 1,
      maxFindings: 1,
      through: null,
      checkpoint: null,
    },
    dependencies,
  );

  assert.deepEqual(calls, [
    { phase: "actions", cursorId: null, cutoff: through.toISOString() },
    { phase: "actions", cursorId: "a-1", cutoff: through.toISOString() },
  ]);
  assert.equal(report.totals.scannedActions, 2);
  assert.equal(report.totals.scannedInterests, 0);
  assert.equal(report.totals.quarantined, 1);
  assert.equal(report.findings.length, 1);
  assert.equal(report.findingsTruncated, false);
  assert.equal(report.complete, false);
  assert.equal(report.exitCode, 1);
});

test("apply requires a reviewed cutoff and emits a resume checkpoint per nonempty page", async () => {
  const emitted: string[] = [];
  let clockReads = 0;
  const dependencies: DirectV1BackfillRunnerDependencies = {
    readDatabaseClock: async () => {
      clockReads += 1;
      return through;
    },
    backfillBatch: async () =>
      backfillPage({
        mode: "apply",
        scannedActions: 1,
        snapshottedActions: 1,
        nextCursor: { createdAt: new Date("2026-08-29T10:00:00.000Z"), id: "a-1" },
      }),
    verifyBatch: async () => verificationPage({}),
    writeCheckpoint: (value) => emitted.push(value),
  };

  await assert.rejects(
    runDirectV1Backfill(
      {
        mode: "apply",
        phase: "actions",
        batchSize: 100,
        maxFindings: 100,
        through: null,
        checkpoint: null,
      },
      dependencies,
    ),
    /explicit reviewed cutoff/,
  );
  const report = await runDirectV1Backfill(
    {
      mode: "apply",
      phase: "actions",
      batchSize: 100,
      maxFindings: 100,
      through,
      checkpoint: null,
    },
    dependencies,
  );
  assert.equal(clockReads, 0);
  assert.equal(emitted.length, 1);
  assert.equal(report.exitCode, 0);
});

test("apply only checkpoints a clean prefix and resuming it cannot skip a later quarantine", async () => {
  const emitted: string[] = [];
  const calls: Array<string | null> = [];
  const dependencies: DirectV1BackfillRunnerDependencies = {
    readDatabaseClock: async () => through,
    backfillBatch: async (request) => {
      calls.push(request.cursor?.id ?? null);
      if (!request.cursor) {
        return backfillPage({
          mode: "apply",
          phase: "actions",
          scannedActions: 1,
          snapshottedActions: 1,
          hasMore: true,
          nextCursor: {
            createdAt: new Date("2026-08-29T10:00:00.000Z"),
            id: "a-clean",
          },
          nextPhase: "actions",
        });
      }
      return backfillPage({
        mode: "apply",
        phase: "actions",
        scannedActions: 1,
        quarantined: 1,
        hasMore: true,
        nextCursor: {
          createdAt: new Date("2026-08-29T11:00:00.000Z"),
          id: "a-quarantined",
        },
        nextPhase: "actions",
        findings: [
          {
            severity: "quarantine",
            code: "ACTION_PARTIAL_OR_INVALID_POLICY",
            entityKind: "action",
            entityId: "a-quarantined",
          },
        ],
      });
    },
    verifyBatch: async () => verificationPage({}),
    writeCheckpoint: (value) => emitted.push(value),
  };

  const first = await runDirectV1Backfill(
    {
      mode: "apply",
      phase: "all",
      batchSize: 1,
      maxFindings: 10,
      through,
      checkpoint: null,
    },
    dependencies,
  );
  assert.deepEqual(calls, [null, "a-clean"]);
  assert.equal(emitted.length, 1);
  assert.equal(first.complete, false);
  assert.equal(first.exitCode, 1);

  const safePrefix = decodeDirectV1BackfillCheckpoint(emitted[0]);
  emitted.length = 0;
  calls.length = 0;
  const resumed = await runDirectV1Backfill(
    {
      mode: "apply",
      phase: "all",
      batchSize: 1,
      maxFindings: 10,
      through,
      checkpoint: safePrefix,
    },
    dependencies,
  );
  assert.deepEqual(calls, ["a-clean"]);
  assert.equal(emitted.length, 0);
  assert.equal(resumed.complete, false);
  assert.equal(resumed.totals.quarantined, 1);
  assert.equal(resumed.exitCode, 1);
});

test("verifier only calls the read path and fails on either violations or quarantines", async () => {
  let mutationCalls = 0;
  const report = await runDirectV1Verification(
    {
      phase: "all",
      batchSize: 100,
      maxFindings: 10,
      through,
      checkpoint: null,
    },
    {
      readDatabaseClock: async () => through,
      backfillBatch: async () => {
        mutationCalls += 1;
        return backfillPage({});
      },
      verifyBatch: async (request) =>
        request.phase === "actions"
          ? verificationPage({ phase: "actions", verifiedActions: 1 })
          : verificationPage({
              phase: "interests",
              nextPhase: "complete",
              scannedInterests: 1,
              violations: 1,
              findings: [
                {
                  severity: "violation",
                  code: "INTEREST_CONTEXT_MISSING",
                  entityKind: "interest",
                  entityId: "i-1",
                },
              ],
            }),
    },
  );
  assert.equal(mutationCalls, 0);
  assert.equal(report.passed, false);
  assert.equal(report.exitCode, 1);
});

test("verifier rejects a suffix or apply checkpoint before reading any page", async () => {
  let verifyCalls = 0;
  const dependencies: DirectV1BackfillRunnerDependencies = {
    readDatabaseClock: async () => through,
    backfillBatch: async () => backfillPage({}),
    verifyBatch: async () => {
      verifyCalls += 1;
      return verificationPage({});
    },
  };
  const unsafeCheckpoint = {
    version: 1 as const,
    phase: "interests" as const,
    through: through.toISOString(),
    createdAt: "2026-08-29T12:00:00.000Z",
    id: "interest-last",
  };

  await assert.rejects(
    runDirectV1Verification(
      {
        phase: "all",
        batchSize: 100,
        maxFindings: 10,
        through,
        checkpoint: unsafeCheckpoint,
      } as unknown as DirectV1VerifyRunOptions,
      dependencies,
    ),
    /start at the beginning.*actions then interests/i,
  );
  await assert.rejects(
    runDirectV1Verification(
      {
        phase: "interests",
        batchSize: 100,
        maxFindings: 10,
        through,
        checkpoint: null,
      } as unknown as DirectV1VerifyRunOptions,
      dependencies,
    ),
    /start at the beginning.*actions then interests/i,
  );
  assert.equal(verifyCalls, 0);
});

test("a clean release verification always scans actions then interests from null cursors", async () => {
  const calls: Array<{ phase: string; cursorId: string | null }> = [];
  let actionPage = 0;
  const report = await runDirectV1Verification(
    {
      phase: "all",
      batchSize: 1,
      maxFindings: 10,
      through,
      checkpoint: null,
    },
    {
      readDatabaseClock: async () => through,
      backfillBatch: async () => backfillPage({}),
      verifyBatch: async (request) => {
        calls.push({
          phase: request.phase,
          cursorId: request.cursor?.id ?? null,
        });
        if (request.phase === "actions" && actionPage++ === 0) {
          return verificationPage({
            phase: "actions",
            scannedActions: 1,
            verifiedActions: 1,
            hasMore: true,
            nextCursor: {
              createdAt: new Date("2026-08-29T10:00:00.000Z"),
              id: "action-1",
            },
            nextPhase: "actions",
          });
        }
        return request.phase === "actions"
          ? verificationPage({
              phase: "actions",
              scannedActions: 1,
              verifiedActions: 1,
            })
          : verificationPage({
              phase: "interests",
              scannedInterests: 1,
              verifiedContexts: 1,
              nextPhase: "complete",
            });
      },
    },
  );

  assert.deepEqual(calls, [
    { phase: "actions", cursorId: null },
    { phase: "actions", cursorId: "action-1" },
    { phase: "interests", cursorId: null },
  ]);
  assert.deepEqual(report.phases, ["actions", "interests"]);
  assert.equal(report.complete, true);
  assert.equal(report.passed, true);
  assert.equal(report.exitCode, 0);
});

test("runner aggregates non-DIRECT skips without failing either release gate", async () => {
  const backfill = await runDirectV1Backfill(
    {
      mode: "dry-run",
      phase: "all",
      batchSize: 100,
      maxFindings: 10,
      through,
      checkpoint: null,
    },
    {
      readDatabaseClock: async () => through,
      backfillBatch: async (request) =>
        request.phase === "actions"
          ? backfillPage({
              phase: "actions",
              scannedActions: 1,
              skippedNonDirectActions: 1,
            })
          : backfillPage({
              phase: "interests",
              nextPhase: "complete",
              scannedInterests: 1,
              skippedNonDirectInterests: 1,
            }),
      verifyBatch: async () => verificationPage({}),
    },
  );
  assert.equal(backfill.totals.skippedNonDirectActions, 1);
  assert.equal(backfill.totals.skippedNonDirectInterests, 1);
  assert.equal(backfill.totals.noOpActions, 0);
  assert.equal(backfill.totals.noOpContexts, 0);
  assert.equal(backfill.exitCode, 0);
  assert.match(
    formatDirectV1RunReport(backfill, "human"),
    /Actions: .*skipped-non-direct=1[\s\S]*Interests: .*skipped-non-direct=1/,
  );

  const verification = await runDirectV1Verification(
    {
      phase: "all",
      batchSize: 100,
      maxFindings: 10,
      through,
      checkpoint: null,
    },
    {
      readDatabaseClock: async () => through,
      backfillBatch: async () => backfillPage({}),
      verifyBatch: async (request) =>
        request.phase === "actions"
          ? verificationPage({
              phase: "actions",
              scannedActions: 1,
              skippedNonDirectActions: 1,
            })
          : verificationPage({
              phase: "interests",
              nextPhase: "complete",
              scannedInterests: 1,
              skippedNonDirectInterests: 1,
            }),
    },
  );
  assert.equal(verification.totals.skippedNonDirectActions, 1);
  assert.equal(verification.totals.skippedNonDirectInterests, 1);
  assert.equal(verification.totals.verifiedActions, 0);
  assert.equal(verification.totals.verifiedContexts, 0);
  assert.equal(verification.passed, true);
  assert.equal(verification.exitCode, 0);
});
