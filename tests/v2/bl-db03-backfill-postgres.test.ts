import assert from "node:assert/strict";
import test from "node:test";

import { PrismaClient } from "@prisma/client";
import pg from "pg";

import {
  backfillDirectV1CoordinationBatch,
  verifyDirectV1CoordinationBackfill,
  type DirectV1BackfillCursor,
  type DirectV1BackfillPhase,
} from "../../lib/v2/direct-v1-coordination-backfill";

const { Client } = pg;
const localDatabaseUrl = localPostgresUrl(process.env.DATABASE_URL);
const through = new Date("2026-08-30T18:00:00.000Z");
const transactionOptions = { maxWait: 5_000, timeout: 10_000 } as const;
const capableCreatorGatedSnapshot = {
  schemaVersion: 1,
  capability: "action-coordination-v2",
  declared: true,
  platform: "ios",
  appVersion: "2.0.0",
  build: "200",
  minimumAppVersion: "2.0.0",
  minimumBuild: "200",
  supported: true,
  reason: "CAPABLE",
} as const;

type ContextMappingRow = {
  interestId: string;
  currentActivationId: string | null;
  state: string;
  connectionId: string;
  activatedMatchesCreated: boolean;
  updatedAt: Date;
  endedAt: Date | null;
  endedById: string | null;
  endReason: string | null;
};

test("BL-DB-03 refuses non-local PostgreSQL test targets", () => {
  assert.equal(
    localPostgresUrl("postgresql://user:password@example.invalid:5432/prod"),
    undefined,
  );
  assert.equal(localPostgresUrl("mysql://localhost/test"), undefined);
  assert.equal(
    localPostgresUrl(
      "postgresql://user:password@localhost:5433/test?host=prod.example",
    ),
    undefined,
  );
  assert.equal(
    localPostgresUrl("postgresql://user:password@127.0.0.1:5433/test"),
    "postgresql://user:password@127.0.0.1:5433/test",
  );
});

test(
  "dry-run predicts both phases without changing policy, Interest, Connection, or Context",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    await withFixtureSchema(1, async ({ admin, prisma: [db] }) => {
      await seedAction(admin, { id: "action-dry" });
      await seedInterest(admin, {
        id: "interest-dry",
        actionId: "action-dry",
        responderId: "responder-dry",
        connectionId: "connection-dry",
        connectionStatus: "ACTIVE",
      });

      const actionReport = await backfillDirectV1CoordinationBatch({
        db,
        phase: "actions",
        through,
        transactionOptions,
      });
      const interestReport = await backfillDirectV1CoordinationBatch({
        db,
        phase: "interests",
        through,
        transactionOptions,
      });

      assert.equal(actionReport.mode, "dry-run");
      assert.equal(actionReport.snapshottedActions, 1);
      assert.equal(actionReport.nextPhase, "interests");
      assert.equal(interestReport.createdContexts, 1);
      assert.equal(interestReport.nextPhase, "complete");
      assert.equal(
        await scalar(admin, `SELECT COUNT(*) FROM "ActionCoordinationContext"`),
        0,
      );
      assert.equal(
        (await one(admin, `SELECT "coordinationPolicy" FROM "ClassmatePost"`))
          .coordinationPolicy,
        null,
      );
      assert.deepEqual(
        await one(
          admin,
          `SELECT "status", "connectionId" FROM "ActionInterest" WHERE "id" = 'interest-dry'`,
        ),
        { status: "ACTIVE", connectionId: "connection-dry" },
      );
      assert.equal(
        (await one(admin, `SELECT "status" FROM "Connection"`)).status,
        "ACTIVE",
      );
    });
  },
);

test(
  "apply snapshots Actions and maps ACTIVE, ENDED, BLOCKED, and withdrawn legacy Interests without Activations",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    await withFixtureSchema(1, async ({ admin, prisma: [db] }) => {
      await seedAction(admin, { id: "action-map" });
      await seedInterest(admin, {
        id: "interest-active",
        actionId: "action-map",
        responderId: "responder-active",
        connectionId: "connection-active",
        connectionStatus: "ACTIVE",
      });
      await seedInterest(admin, {
        id: "interest-ended",
        actionId: "action-map",
        responderId: "responder-ended",
        connectionId: "connection-ended",
        connectionStatus: "ENDED",
        endedAt: "2026-08-30 15:00:00.000",
        endedById: "responder-ended",
      });
      await seedInterest(admin, {
        id: "interest-blocked",
        actionId: "action-map",
        responderId: "responder-blocked",
        connectionId: "connection-blocked",
        connectionStatus: "BLOCKED",
        endedAt: "2026-08-30 15:30:00.000",
        endedById: "creator-1",
      });
      await seedInterest(admin, {
        id: "interest-withdrawn",
        actionId: "action-map",
        responderId: "responder-withdrawn",
        connectionId: "connection-withdrawn",
        connectionStatus: "ACTIVE",
        interestStatus: "WITHDRAWN",
      });

      const actionReport = await backfillDirectV1CoordinationBatch({
        db,
        mode: "apply",
        phase: "actions",
        through,
        transactionOptions,
      });
      const interestReport = await backfillDirectV1CoordinationBatch({
        db,
        mode: "apply",
        phase: "interests",
        through,
        transactionOptions,
      });
      assert.equal(actionReport.snapshottedActions, 1);
      assert.equal(interestReport.createdContexts, 4);
      assert.equal(interestReport.quarantined, 0);

      assert.deepEqual(
        await one(
          admin,
          `
            SELECT "coordinationPolicy", "policySchemaVersion",
              "policyParametersSnapshot", "experimentKeySnapshot",
              "experimentVariantSnapshot", "clientCapabilitySnapshot",
              "policySnapshottedAt" = "createdAt" AS "sameTimestamp"
            FROM "ClassmatePost" WHERE "id" = 'action-map'
          `,
        ),
        {
          coordinationPolicy: "DIRECT_CONVERSATION_V1",
          policySchemaVersion: 1,
          policyParametersSnapshot: {},
          experimentKeySnapshot: null,
          experimentVariantSnapshot: null,
          clientCapabilitySnapshot: null,
          sameTimestamp: true,
        },
      );

      const contexts = await admin.query<ContextMappingRow>(`
        SELECT context."interestId", context."currentActivationId", context."state",
          context."connectionId",
          context."activatedAt" = interest."createdAt" AS "activatedMatchesCreated",
          context."endedAt", context."endedById", context."endReason", context."updatedAt"
        FROM "ActionCoordinationContext" context
        INNER JOIN "ActionInterest" interest ON interest."id" = context."interestId"
        ORDER BY context."interestId"
      `);
      assert.deepEqual(
        contexts.rows.map((row: ContextMappingRow) => ({
          ...row,
          endedAt: row.endedAt ? wallIso(row.endedAt) : null,
          updatedAt: wallIso(row.updatedAt),
        })),
        [
          {
            interestId: "interest-active",
            currentActivationId: null,
            state: "OPEN",
            connectionId: "connection-active",
            activatedMatchesCreated: true,
            endedAt: null,
            endedById: null,
            endReason: null,
            updatedAt: "2026-08-30T11:00:00.000Z",
          },
          {
            interestId: "interest-blocked",
            currentActivationId: null,
            state: "ENDED",
            connectionId: "connection-blocked",
            activatedMatchesCreated: true,
            endedAt: "2026-08-30T15:30:00.000Z",
            endedById: null,
            endReason: "SAFETY_UNAVAILABLE",
            updatedAt: "2026-08-30T15:30:00.000Z",
          },
          {
            interestId: "interest-ended",
            currentActivationId: null,
            state: "ENDED",
            connectionId: "connection-ended",
            activatedMatchesCreated: true,
            endedAt: "2026-08-30T15:00:00.000Z",
            endedById: "responder-ended",
            endReason: "USER_ENDED",
            updatedAt: "2026-08-30T15:00:00.000Z",
          },
          {
            interestId: "interest-withdrawn",
            currentActivationId: null,
            state: "OPEN",
            connectionId: "connection-withdrawn",
            activatedMatchesCreated: true,
            endedAt: null,
            endedById: null,
            endReason: null,
            updatedAt: "2026-08-30T11:00:00.000Z",
          },
        ],
      );
      assert.equal(
        await scalar(admin, `SELECT COUNT(*) FROM "ActionInterestActivation"`),
        0,
      );
      assert.deepEqual(
        await one(
          admin,
          `SELECT "status", "withdrawnAt" IS NOT NULL AS "withdrawn" FROM "ActionInterest" WHERE "id" = 'interest-withdrawn'`,
        ),
        { status: "WITHDRAWN", withdrawn: true },
      );
    });
  },
);

test(
  "verifier accepts a legitimate post-apply withdrawal timestamp but still rejects OPEN Context drift",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    await withFixtureSchema(1, async ({ admin, prisma: [db] }) => {
      await seedAction(admin, { id: "action-withdraw-after-apply" });
      await seedInterest(admin, {
        id: "interest-withdraw-after-apply",
        actionId: "action-withdraw-after-apply",
        responderId: "responder-withdraw-after-apply",
        connectionId: "connection-withdraw-after-apply",
        connectionStatus: "ACTIVE",
      });

      await backfillDirectV1CoordinationBatch({
        db,
        mode: "apply",
        phase: "actions",
        through,
        transactionOptions,
      });
      await backfillDirectV1CoordinationBatch({
        db,
        mode: "apply",
        phase: "interests",
        through,
        transactionOptions,
      });
      await admin.query(`
        UPDATE "ActionInterest"
        SET
          "status" = 'WITHDRAWN',
          "withdrawnAt" = '2026-08-30 12:00:00.000',
          "updatedAt" = '2026-08-30 12:00:00.000'
        WHERE "id" = 'interest-withdraw-after-apply'
      `);

      const legitimateWithdrawal =
        await verifyDirectV1CoordinationBackfill({
          db,
          phase: "interests",
          through,
          transactionOptions,
        });
      assert.equal(legitimateWithdrawal.verifiedContexts, 1);
      assert.equal(legitimateWithdrawal.quarantined, 0);
      assert.equal(legitimateWithdrawal.violations, 0);

      await admin.query(`
        UPDATE "ActionCoordinationContext"
        SET "updatedAt" = '2026-08-30 12:00:00.001'
        WHERE "interestId" = 'interest-withdraw-after-apply'
      `);
      const drifted = await verifyDirectV1CoordinationBackfill({
        db,
        phase: "interests",
        through,
        transactionOptions,
      });
      assert.equal(drifted.verifiedContexts, 0);
      assert.equal(drifted.quarantined, 1);
      assert.deepEqual(drifted.findings, [
        {
          severity: "quarantine",
          code: "INTEREST_CONTEXT_CONFLICT",
          entityKind: "interest",
          entityId: "interest-withdraw-after-apply",
        },
      ]);
    });
  },
);

test(
  "self-interest evidence has identical dry-run and apply classification for every Interest on the Action",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    await withFixtureSchema(1, async ({ admin, prisma: [db] }) => {
      await seedAction(admin, { id: "action-self-evidence" });
      await seedInterest(admin, {
        id: "interest-self",
        actionId: "action-self-evidence",
        responderId: "creator-1",
        connectionId: "connection-self",
        connectionStatus: "ACTIVE",
      });
      await seedInterest(admin, {
        id: "interest-peer-on-self-action",
        actionId: "action-self-evidence",
        responderId: "responder-peer",
        connectionId: "connection-peer",
        connectionStatus: "ACTIVE",
      });

      const actionDryRun = await backfillDirectV1CoordinationBatch({
        db,
        phase: "actions",
        through,
        transactionOptions,
      });
      const interestDryRun = await backfillDirectV1CoordinationBatch({
        db,
        phase: "interests",
        through,
        transactionOptions,
      });
      assert.equal(actionDryRun.snapshottedActions, 0);
      assert.equal(actionDryRun.quarantined, 1);
      assert.equal(
        actionDryRun.findings[0]?.code,
        "ACTION_CREATOR_GATED_EVIDENCE",
      );
      assert.equal(interestDryRun.createdContexts, 0);
      assert.equal(interestDryRun.quarantined, 2);
      assert.deepEqual(
        new Set(interestDryRun.findings.map((item) => item.code)),
        new Set(["INTEREST_SELF_PAIR", "INTEREST_ACTION_NOT_DIRECT"]),
      );

      const actionApply = await backfillDirectV1CoordinationBatch({
        db,
        mode: "apply",
        phase: "actions",
        through,
        transactionOptions,
      });
      assert.equal(actionApply.snapshottedActions, 0);
      assert.equal(actionApply.quarantined, 1);
      assert.equal(
        (await one(admin, `SELECT "coordinationPolicy" FROM "ClassmatePost"`))
          .coordinationPolicy,
        null,
      );
    });
  },
);

test(
  "backfill and verifier reject DIRECT snapshots the production resolver rejects",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    await withFixtureSchema(1, async ({ admin, prisma: [db] }) => {
      for (const id of [
        "action-direct-baseline",
        "action-direct-gated-treatment",
        "action-direct-gated-control",
        "action-direct-partial-experiment",
        "action-direct-invalid-experiment-key",
        "action-direct-invalid-capability",
        "action-direct-unknown-experiment",
      ]) {
        await seedAction(admin, { id, policy: "direct" });
      }
      await admin.query(`
        UPDATE "ClassmatePost"
        SET
          "experimentKeySnapshot" = 'action_to_plan_creator_gated_v2',
          "experimentVariantSnapshot" = 'TREATMENT',
          "clientCapabilitySnapshot" = '{"supported":true}'::jsonb
        WHERE "id" = 'action-direct-gated-treatment';

        UPDATE "ClassmatePost"
        SET
          "experimentKeySnapshot" = 'action_to_plan_creator_gated_v2',
          "experimentVariantSnapshot" = 'CONTROL',
          "clientCapabilitySnapshot" = '{"supported":true}'::jsonb
        WHERE "id" = 'action-direct-gated-control';

        UPDATE "ClassmatePost"
        SET "experimentKeySnapshot" = 'action_to_plan_v2'
        WHERE "id" = 'action-direct-partial-experiment';

        UPDATE "ClassmatePost"
        SET
          "experimentKeySnapshot" = 'invalid experiment key',
          "experimentVariantSnapshot" = 'CONTROL'
        WHERE "id" = 'action-direct-invalid-experiment-key';

        UPDATE "ClassmatePost"
        SET "clientCapabilitySnapshot" = '[]'::jsonb
        WHERE "id" = 'action-direct-invalid-capability';

        UPDATE "ClassmatePost"
        SET
          "experimentKeySnapshot" = 'future_direct_experiment',
          "experimentVariantSnapshot" = 'TREATMENT',
          "clientCapabilitySnapshot" = '{"schemaVersion":99}'::jsonb
        WHERE "id" = 'action-direct-unknown-experiment';
      `);

      const backfill = await backfillDirectV1CoordinationBatch({
        db,
        mode: "apply",
        phase: "actions",
        through,
        maxFindings: 20,
        transactionOptions,
      });
      assert.equal(backfill.noOpActions, 3);
      assert.equal(backfill.snapshottedActions, 0);
      assert.equal(backfill.quarantined, 4);
      assert.deepEqual(
        new Set(backfill.findings.map((item) => item.entityId)),
        new Set([
          "action-direct-gated-treatment",
          "action-direct-partial-experiment",
          "action-direct-invalid-experiment-key",
          "action-direct-invalid-capability",
        ]),
      );
      assert.ok(
        backfill.findings.every(
          (item) => item.code === "ACTION_PARTIAL_OR_INVALID_POLICY",
        ),
      );

      const verification = await verifyDirectV1CoordinationBackfill({
        db,
        phase: "actions",
        through,
        maxFindings: 20,
        transactionOptions,
      });
      assert.equal(verification.verifiedActions, 3);
      assert.equal(verification.quarantined, 4);
      assert.equal(verification.violations, 0);
      assert.deepEqual(
        new Set(verification.findings.map((item) => item.entityId)),
        new Set(backfill.findings.map((item) => item.entityId)),
      );
    });
  },
);

test(
  "backfill and verifier skip valid creator-gated Actions and connectionless Interests",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    await withFixtureSchema(1, async ({ admin, prisma: [db] }) => {
      await seedAction(admin, { id: "action-creator-gated-valid" });
      await admin.query(
        `
          UPDATE "ClassmatePost"
          SET
            "coordinationPolicy" = 'CREATOR_GATED_V2',
            "policySchemaVersion" = 1,
            "policyParametersSnapshot" = '{"maxActiveCoordinations":2}'::jsonb,
            "experimentKeySnapshot" = 'action_to_plan_creator_gated_v2',
            "experimentVariantSnapshot" = 'TREATMENT',
            "clientCapabilitySnapshot" = $1::jsonb,
            "policySnapshottedAt" = "createdAt"
          WHERE "id" = 'action-creator-gated-valid'
        `,
        [JSON.stringify(capableCreatorGatedSnapshot)],
      );
      await seedInterest(admin, {
        id: "interest-creator-gated-valid",
        actionId: "action-creator-gated-valid",
        responderId: "responder-creator-gated-valid",
        connectionId: null,
      });

      const actionBackfill = await backfillDirectV1CoordinationBatch({
        db,
        mode: "apply",
        phase: "actions",
        through,
        transactionOptions,
      });
      const interestBackfill = await backfillDirectV1CoordinationBatch({
        db,
        mode: "apply",
        phase: "interests",
        through,
        transactionOptions,
      });
      assert.equal(actionBackfill.noOpActions, 0);
      assert.equal(actionBackfill.skippedNonDirectActions, 1);
      assert.equal(actionBackfill.quarantined, 0);
      assert.equal(interestBackfill.noOpContexts, 0);
      assert.equal(interestBackfill.skippedNonDirectInterests, 1);
      assert.equal(interestBackfill.createdContexts, 0);
      assert.equal(interestBackfill.quarantined, 0);

      const actionVerification = await verifyDirectV1CoordinationBackfill({
        db,
        phase: "actions",
        through,
        transactionOptions,
      });
      const interestVerification = await verifyDirectV1CoordinationBackfill({
        db,
        phase: "interests",
        through,
        transactionOptions,
      });
      assert.equal(actionVerification.verifiedActions, 0);
      assert.equal(actionVerification.skippedNonDirectActions, 1);
      assert.equal(actionVerification.quarantined, 0);
      assert.equal(actionVerification.violations, 0);
      assert.equal(interestVerification.verifiedContexts, 0);
      assert.equal(interestVerification.skippedNonDirectInterests, 1);
      assert.equal(interestVerification.quarantined, 0);
      assert.equal(interestVerification.violations, 0);
      assert.equal(
        await scalar(admin, `SELECT COUNT(*) FROM "ActionCoordinationContext"`),
        0,
      );
    });
  },
);

test(
  "apply and verifier quarantine a Connection that ended before its Interest existed",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    await withFixtureSchema(1, async ({ admin, prisma: [db] }) => {
      await seedAction(admin, {
        id: "action-terminal-before-interest",
        policy: "direct",
      });
      await seedInterest(admin, {
        id: "interest-terminal-before-interest",
        actionId: "action-terminal-before-interest",
        responderId: "responder-terminal-before-interest",
        connectionId: "connection-terminal-before-interest",
        connectionStatus: "ENDED",
        createdAt: "2026-08-30 11:00:00.000",
        endedAt: "2026-08-30 10:59:59.999",
        endedById: "responder-terminal-before-interest",
      });

      const backfill = await backfillDirectV1CoordinationBatch({
        db,
        mode: "apply",
        phase: "interests",
        through,
        transactionOptions,
      });
      assert.equal(backfill.createdContexts, 0);
      assert.equal(backfill.quarantined, 1);
      assert.equal(
        backfill.findings[0]?.code,
        "INTEREST_TERMINAL_CONNECTION_ENDS_BEFORE_INTEREST",
      );

      const verification = await verifyDirectV1CoordinationBackfill({
        db,
        phase: "interests",
        through,
        transactionOptions,
      });
      assert.equal(verification.verifiedContexts, 0);
      assert.equal(verification.violations, 0);
      assert.equal(verification.quarantined, 1);
      assert.deepEqual(verification.findings, backfill.findings);
      assert.equal(
        await scalar(admin, `SELECT COUNT(*) FROM "ActionCoordinationContext"`),
        0,
      );
    });
  },
);

test(
  "backfill and verifier quarantine incomplete or malformed Action origin snapshots",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    await withFixtureSchema(1, async ({ admin, prisma: [db] }) => {
      await seedAction(admin, {
        id: "action-invalid-origin-shapes",
        policy: "direct",
      });
      const invalidSnapshots = [
        {
          version: 1,
          sourceKind: "BUDDY_POST",
          sourceId: "action-invalid-origin-shapes",
          startsAt: null,
          endsAt: null,
          location: null,
          planType: "CUSTOM",
          author: { id: "creator-1", displayName: "Creator" },
          course: null,
        },
        { startsAt: "not-an-iso-date" },
        { planType: "DINNER" },
        { course: { id: "course-1", code: null } },
      ];

      for (const [index, corruption] of invalidSnapshots.entries()) {
        const responderId = `responder-invalid-origin-${index}`;
        const interestId = `interest-invalid-origin-${index}`;
        await seedInterest(admin, {
          id: interestId,
          actionId: "action-invalid-origin-shapes",
          responderId,
          connectionId: `connection-invalid-origin-${index}`,
          connectionStatus: "ACTIVE",
        });
        const valid = {
          version: 1,
          sourceKind: "BUDDY_POST",
          sourceId: "action-invalid-origin-shapes",
          title: "Coffee",
          startsAt: null,
          endsAt: null,
          location: null,
          planType: "CUSTOM",
          participantIds: [responderId, "creator-1"],
          author: { id: "creator-1", displayName: "Creator" },
          course: null,
        };
        await admin.query(
          `UPDATE "ActionInterest" SET "originSnapshot" = $1::jsonb WHERE "id" = $2`,
          [
            JSON.stringify(
              index === 0
                ? { ...corruption, participantIds: valid.participantIds }
                : { ...valid, ...corruption },
            ),
            interestId,
          ],
        );
      }

      const backfill = await backfillDirectV1CoordinationBatch({
        db,
        mode: "apply",
        phase: "interests",
        through,
        maxFindings: 10,
        transactionOptions,
      });
      assert.equal(backfill.createdContexts, 0);
      assert.equal(backfill.quarantined, invalidSnapshots.length);
      assert.ok(
        backfill.findings.every(
          (item) => item.code === "INTEREST_ORIGIN_SNAPSHOT_INVALID",
        ),
      );

      const verification = await verifyDirectV1CoordinationBackfill({
        db,
        phase: "interests",
        through,
        maxFindings: 10,
        transactionOptions,
      });
      assert.equal(verification.verifiedContexts, 0);
      assert.equal(verification.violations, 0);
      assert.equal(verification.quarantined, invalidSnapshots.length);
      assert.deepEqual(verification.findings, backfill.findings);
      assert.equal(
        await scalar(admin, `SELECT COUNT(*) FROM "ActionCoordinationContext"`),
        0,
      );
    });
  },
);

test(
  "ambiguous policy, creator-gated evidence, terminal Actions, invalid snapshots, and conflicting Contexts are quarantined",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    await withFixtureSchema(1, async ({ admin, prisma: [db] }) => {
      await seedAction(admin, {
        id: "action-terminal",
        status: "FULFILLED",
      });
      await seedAction(admin, {
        id: "action-terminal-with-interest",
        status: "REMOVED",
      });
      await seedInterest(admin, {
        id: "interest-terminal",
        actionId: "action-terminal-with-interest",
        responderId: "responder-terminal",
        connectionId: "connection-terminal",
        connectionStatus: "ACTIVE",
      });
      await seedAction(admin, {
        id: "action-terminal-direct",
        status: "FULFILLED",
        policy: "direct",
      });
      await seedInterest(admin, {
        id: "interest-terminal-direct",
        actionId: "action-terminal-direct",
        responderId: "responder-terminal-direct",
        connectionId: "connection-terminal-direct",
        connectionStatus: "ACTIVE",
      });
      await seedAction(admin, { id: "action-partial", policy: "partial" });
      await seedAction(admin, { id: "action-evidence" });
      await seedInterest(admin, {
        id: "interest-evidence",
        actionId: "action-evidence",
        responderId: "responder-evidence",
        connectionId: null,
      });
      await seedAction(admin, { id: "action-invalid", policy: "direct" });
      await seedInterest(admin, {
        id: "interest-origin",
        actionId: "action-invalid",
        responderId: "responder-origin",
        connectionId: "connection-origin",
        connectionStatus: "ACTIVE",
        invalidOrigin: true,
      });
      await seedInterest(admin, {
        id: "interest-mismatch",
        actionId: "action-invalid",
        responderId: "responder-mismatch",
        connectionId: "connection-mismatch",
        connectionStatus: "ACTIVE",
        connectionPeerOverride: "someone-else",
      });
      await seedInterest(admin, {
        id: "interest-conflict",
        actionId: "action-invalid",
        responderId: "responder-conflict",
        connectionId: "connection-conflict",
        connectionStatus: "ACTIVE",
      });
      await seedContext(admin, {
        id: "context-conflict",
        interestId: "interest-conflict",
        connectionId: "connection-conflict",
        state: "WAITING",
      });

      const actionReport = await backfillDirectV1CoordinationBatch({
        db,
        mode: "apply",
        phase: "actions",
        through,
        maxFindings: 2,
        transactionOptions,
      });
      assert.equal(actionReport.quarantined, 3);
      assert.equal(actionReport.snapshottedActions, 1);
      assert.equal(actionReport.noOpActions, 2);
      assert.equal(actionReport.findings.length, 2);
      assert.equal(actionReport.findingsTruncated, true);
      assert.deepEqual(
        actionReport.findings.map((item) => [item.entityId, item.code]),
        [
          ["action-evidence", "ACTION_CREATOR_GATED_EVIDENCE"],
          ["action-partial", "ACTION_PARTIAL_OR_INVALID_POLICY"],
        ],
      );
      assert.deepEqual(
        await one(
          admin,
          `
            SELECT
              (SELECT "coordinationPolicy" FROM "ClassmatePost"
                WHERE "id" = 'action-terminal') AS "withoutInterest",
              (SELECT "coordinationPolicy" FROM "ClassmatePost"
                WHERE "id" = 'action-terminal-with-interest') AS "withInterest"
          `,
        ),
        {
          withoutInterest: "DIRECT_CONVERSATION_V1",
          withInterest: null,
        },
      );

      const interestReport = await backfillDirectV1CoordinationBatch({
        db,
        mode: "apply",
        phase: "interests",
        through,
        maxFindings: 10,
        transactionOptions,
      });
      assert.equal(interestReport.quarantined, 6);
      assert.deepEqual(
        new Set(interestReport.findings.map((item) => item.code)),
        new Set([
          "INTEREST_ACTION_NOT_DIRECT",
          "INTEREST_ORIGIN_SNAPSHOT_INVALID",
          "INTEREST_CONNECTION_PAIR_MISMATCH",
          "INTEREST_CONTEXT_CONFLICT",
        ]),
      );
      assert.equal(
        await scalar(admin, `SELECT COUNT(*) FROM "ActionCoordinationContext"`),
        1,
      );
      assert.equal(
        (await one(admin, `SELECT "state" FROM "ActionCoordinationContext"`))
          .state,
        "WAITING",
      );
    });
  },
);

test(
  "phase-scoped keyset cursors resume without omissions and never cross table cursors",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    await withFixtureSchema(1, async ({ admin, prisma: [db] }) => {
      for (const suffix of ["a", "b", "c"]) {
        await seedAction(admin, {
          id: `action-page-${suffix}`,
          createdAt: "2026-08-30 10:00:00.000",
        });
        await seedInterest(admin, {
          id: `interest-page-${suffix}`,
          actionId: `action-page-${suffix}`,
          responderId: `responder-page-${suffix}`,
          connectionId: `connection-page-${suffix}`,
          connectionStatus: "ACTIVE",
          createdAt: "2026-08-30 11:00:00.000",
        });
      }

      const actions = await runPhaseToCompletion(db, "actions", 1);
      assert.equal(actions.totalSnapshots, 3);
      assert.equal(actions.pages, 3);
      assert.equal(actions.nextPhase, "interests");
      const interests = await runPhaseToCompletion(db, "interests", 1);
      assert.equal(interests.totalContexts, 3);
      assert.equal(interests.pages, 3);
      assert.equal(interests.nextPhase, "complete");
      assert.equal(
        await scalar(admin, `SELECT COUNT(*) FROM "ActionCoordinationContext"`),
        3,
      );
    });
  },
);

test(
  "repeated and concurrent apply converges to one exact compatibility Context",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    await withFixtureSchema(2, async ({ admin, prisma: [first, second] }) => {
      await seedAction(admin, { id: "action-race" });
      await seedInterest(admin, {
        id: "interest-race",
        actionId: "action-race",
        responderId: "responder-race",
        connectionId: "connection-race",
        connectionStatus: "ACTIVE",
      });
      const options = {
        mode: "apply" as const,
        phase: "interests" as const,
        through,
        transactionOptions,
      };
      const [actionLeft, actionRight] = await Promise.all([
        backfillDirectV1CoordinationBatch({
          ...options,
          db: first,
          phase: "actions",
        }),
        backfillDirectV1CoordinationBatch({
          ...options,
          db: second,
          phase: "actions",
        }),
      ]);
      assert.deepEqual(
        [actionLeft.snapshottedActions, actionRight.snapshottedActions].sort(),
        [0, 1],
      );
      assert.deepEqual(
        [actionLeft.noOpActions, actionRight.noOpActions].sort(),
        [0, 1],
      );
      const [left, right] = await Promise.all([
        backfillDirectV1CoordinationBatch({ ...options, db: first }),
        backfillDirectV1CoordinationBatch({ ...options, db: second }),
      ]);
      assert.deepEqual(
        [left.createdContexts, right.createdContexts].sort(),
        [0, 1],
      );
      assert.deepEqual(
        [left.noOpContexts, right.noOpContexts].sort(),
        [0, 1],
      );
      const repeated = await backfillDirectV1CoordinationBatch({
        ...options,
        db: first,
      });
      assert.equal(repeated.createdContexts, 0);
      assert.equal(repeated.noOpContexts, 1);
      assert.equal(
        await scalar(admin, `SELECT COUNT(*) FROM "ActionCoordinationContext"`),
        1,
      );
    });
  },
);

test(
  "database failures roll back policy and Context writes and leave the resumable cursor uncommitted",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    await withFixtureSchema(1, async ({ admin, prisma: [db] }) => {
      await seedAction(admin, { id: "action-rollback" });
      await admin.query(`
        CREATE FUNCTION reject_policy_backfill() RETURNS trigger AS $$
        BEGIN
          IF NEW."coordinationPolicy" = 'DIRECT_CONVERSATION_V1' THEN
            RAISE EXCEPTION 'injected action failure';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER reject_policy_backfill_trigger
          BEFORE UPDATE ON "ClassmatePost"
          FOR EACH ROW EXECUTE FUNCTION reject_policy_backfill();
      `);
      await assert.rejects(
        backfillDirectV1CoordinationBatch({
          db,
          mode: "apply",
          phase: "actions",
          through,
          transactionOptions,
        }),
        /injected action failure/,
      );
      assert.equal(
        (await one(admin, `SELECT "coordinationPolicy" FROM "ClassmatePost"`))
          .coordinationPolicy,
        null,
      );
      await admin.query(`DROP TRIGGER reject_policy_backfill_trigger ON "ClassmatePost"`);
      await admin.query(`DROP FUNCTION reject_policy_backfill()`);

      await admin.query(`
        UPDATE "ClassmatePost" SET
          "coordinationPolicy" = 'DIRECT_CONVERSATION_V1',
          "policySchemaVersion" = 1,
          "policyParametersSnapshot" = '{}'::jsonb,
          "policySnapshottedAt" = "createdAt"
        WHERE "id" = 'action-rollback'
      `);
      await seedInterest(admin, {
        id: "interest-rollback",
        actionId: "action-rollback",
        responderId: "responder-rollback",
        connectionId: "connection-rollback",
        connectionStatus: "ACTIVE",
      });
      await admin.query(`
        CREATE FUNCTION reject_context_backfill() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'injected context failure';
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER reject_context_backfill_trigger
          BEFORE INSERT ON "ActionCoordinationContext"
          FOR EACH ROW EXECUTE FUNCTION reject_context_backfill();
      `);
      await assert.rejects(
        backfillDirectV1CoordinationBatch({
          db,
          mode: "apply",
          phase: "interests",
          through,
          transactionOptions,
        }),
        /injected context failure/,
      );
      assert.equal(
        await scalar(admin, `SELECT COUNT(*) FROM "ActionCoordinationContext"`),
        0,
      );
      assert.equal(
        (await one(admin, `SELECT "status" FROM "ActionInterest"`)).status,
        "ACTIVE",
      );
    });
  },
);

test(
  "verifier distinguishes safe missing writes from stable quarantine findings",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    await withFixtureSchema(1, async ({ admin, prisma: [db] }) => {
      await seedAction(admin, { id: "action-verify-missing" });
      await seedAction(admin, { id: "action-verify-direct", policy: "direct" });
      await seedInterest(admin, {
        id: "interest-verify-missing",
        actionId: "action-verify-direct",
        responderId: "responder-verify-missing",
        connectionId: "connection-verify-missing",
        connectionStatus: "ACTIVE",
      });
      await seedInterest(admin, {
        id: "interest-verify-invalid",
        actionId: "action-verify-direct",
        responderId: "responder-verify-invalid",
        connectionId: "connection-verify-invalid",
        connectionStatus: "ENDED",
        endedAt: null,
      });

      const actionVerification = await verifyDirectV1CoordinationBackfill({
        db,
        phase: "actions",
        through,
        transactionOptions,
      });
      assert.equal(actionVerification.verifiedActions, 1);
      assert.equal(actionVerification.violations, 1);
      assert.deepEqual(actionVerification.findings, [
        {
          severity: "violation",
          code: "ACTION_POLICY_MISSING",
          entityKind: "action",
          entityId: "action-verify-missing",
        },
      ]);

      const interestVerification = await verifyDirectV1CoordinationBackfill({
        db,
        phase: "interests",
        through,
        transactionOptions,
      });
      assert.equal(interestVerification.violations, 1);
      assert.equal(interestVerification.quarantined, 1);
      assert.deepEqual(
        new Set(interestVerification.findings.map((item) => item.code)),
        new Set([
          "INTEREST_CONTEXT_MISSING",
          "INTEREST_TERMINAL_CONNECTION_MISSING_ENDED_AT",
        ]),
      );
      assert.equal(
        await scalar(admin, `SELECT COUNT(*) FROM "ActionCoordinationContext"`),
        0,
      );
    });
  },
);

async function runPhaseToCompletion(
  db: PrismaClient,
  phase: DirectV1BackfillPhase,
  batchSize: number,
): Promise<{
  pages: number;
  totalSnapshots: number;
  totalContexts: number;
  nextPhase: string;
}> {
  let cursor: DirectV1BackfillCursor | null = null;
  let pages = 0;
  let totalSnapshots = 0;
  let totalContexts = 0;
  let nextPhase: string = phase;
  do {
    const report = await backfillDirectV1CoordinationBatch({
      db,
      mode: "apply",
      phase,
      through,
      cursor,
      batchSize,
      transactionOptions,
    });
    pages += 1;
    totalSnapshots += report.snapshottedActions;
    totalContexts += report.createdContexts;
    cursor = report.nextCursor;
    nextPhase = report.nextPhase;
    if (!report.hasMore) break;
  } while (true);
  return { pages, totalSnapshots, totalContexts, nextPhase };
}

async function seedAction(
  client: InstanceType<typeof Client>,
  input: {
    id: string;
    status?: "ACTIVE" | "CLOSED" | "FULFILLED" | "REMOVED";
    policy?: "empty" | "direct" | "partial";
    createdAt?: string;
  },
): Promise<void> {
  const policy = input.policy ?? "empty";
  await client.query(
    `
      INSERT INTO "ClassmatePost" (
        "id", "userId", "category", "status", "coordinationPolicy",
        "policySchemaVersion", "policyParametersSnapshot", "policySnapshottedAt",
        "expiresAt", "createdAt", "updatedAt"
      ) VALUES (
        $1, 'creator-1', 'OTHER', $2,
        $3::"ActionCoordinationPolicy", $4, $5::jsonb,
        CASE WHEN $6::boolean THEN $7::timestamp ELSE NULL END,
        '2026-08-31 18:00:00.000', $7, $7
      )
    `,
    [
      input.id,
      input.status ?? "ACTIVE",
      policy === "direct" ? "DIRECT_CONVERSATION_V1" : null,
      policy === "direct" ? 1 : policy === "partial" ? 1 : null,
      policy === "direct" ? "{}" : null,
      policy === "direct",
      input.createdAt ?? "2026-08-30 10:00:00.000",
    ],
  );
}

async function seedInterest(
  client: InstanceType<typeof Client>,
  input: {
    id: string;
    actionId: string;
    responderId: string;
    connectionId: string | null;
    connectionStatus?: "ACTIVE" | "ENDED" | "BLOCKED";
    interestStatus?: "ACTIVE" | "WITHDRAWN";
    endedAt?: string | null;
    endedById?: string | null;
    connectionPeerOverride?: string;
    invalidOrigin?: boolean;
    createdAt?: string;
  },
): Promise<void> {
  const createdAt = input.createdAt ?? "2026-08-30 11:00:00.000";
  const snapshot = input.invalidOrigin
    ? { version: 1, sourceKind: "BUDDY_POST", sourceId: "wrong" }
    : {
        version: 1,
        sourceKind: "BUDDY_POST",
        sourceId: input.actionId,
        title: "Coffee",
        startsAt: null,
        endsAt: null,
        location: null,
        planType: "CUSTOM",
        participantIds: [input.responderId, "creator-1"],
        author: { id: "creator-1", displayName: "Creator" },
        course: null,
      };
  if (input.connectionId) {
    await client.query(
      `
        INSERT INTO "Connection" (
          "id", "userAId", "userBId", "status", "endedById", "endedAt",
          "createdAt", "updatedAt"
        ) VALUES ($1, 'creator-1', $2, $3, $4, $5, $6, $6)
      `,
      [
        input.connectionId,
        input.connectionPeerOverride ?? input.responderId,
        input.connectionStatus ?? "ACTIVE",
        input.endedById ?? null,
        input.endedAt ?? null,
        createdAt,
      ],
    );
  }
  await client.query(
    `
      INSERT INTO "ActionInterest" (
        "id", "userId", "classmatePostId", "connectionId", "status",
        "originSnapshot", "withdrawnAt", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5::"ActionInterestStatus", $6::jsonb,
        CASE WHEN $5::text = 'WITHDRAWN' THEN $7::timestamp ELSE NULL END, $7, $7)
    `,
    [
      input.id,
      input.responderId,
      input.actionId,
      input.connectionId,
      input.interestStatus ?? "ACTIVE",
      JSON.stringify(snapshot),
      createdAt,
    ],
  );
}

async function seedContext(
  client: InstanceType<typeof Client>,
  input: {
    id: string;
    interestId: string;
    connectionId: string;
    state: "WAITING" | "OPEN" | "ENDED";
  },
): Promise<void> {
  await client.query(
    `
      INSERT INTO "ActionCoordinationContext" (
        "id", "interestId", "currentActivationId", "state",
        "reservationGeneration", "connectionId", "activatedAt", "createdAt", "updatedAt"
      ) VALUES ($1, $2, NULL, $3, 0, $4,
        '2026-08-30 11:00:00.000', '2026-08-30 11:00:00.000',
        '2026-08-30 11:00:00.000')
    `,
    [input.id, input.interestId, input.state, input.connectionId],
  );
}

function wallIso(value: Date): string {
  return `${value.getFullYear().toString().padStart(4, "0")}-${(
    value.getMonth() + 1
  )
    .toString()
    .padStart(2, "0")}-${value.getDate().toString().padStart(2, "0")}T${value
    .getHours()
    .toString()
    .padStart(2, "0")}:${value.getMinutes().toString().padStart(2, "0")}:${value
    .getSeconds()
    .toString()
    .padStart(2, "0")}.${value.getMilliseconds().toString().padStart(3, "0")}Z`;
}

function localPostgresUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    return undefined;
  }
  if (!new Set(["127.0.0.1", "localhost", "::1"]).has(parsed.hostname)) {
    return undefined;
  }
  const targetOverrides = new Set([
    "database",
    "dbname",
    "host",
    "hostaddr",
    "password",
    "port",
    "service",
    "user",
  ]);
  if (
    [...parsed.searchParams.keys()].some((key) =>
      targetOverrides.has(key.toLowerCase()),
    )
  ) {
    return undefined;
  }
  return value;
}

function prismaUrlForSchema(value: string, schema: string): string {
  const parsed = new URL(value);
  parsed.searchParams.set("schema", schema);
  return parsed.toString();
}

function pgUrl(value: string): string {
  const parsed = new URL(value);
  parsed.searchParams.delete("schema");
  return parsed.toString();
}

async function withFixtureSchema(
  clientCount: number,
  run: (fixture: {
    admin: InstanceType<typeof Client>;
    prisma: PrismaClient[];
  }) => Promise<void>,
): Promise<void> {
  assert.ok(localDatabaseUrl);
  const schema = `bl_db03_${process.pid}_${Math.random().toString(36).slice(2, 10)}`;
  assert.match(schema, /^[a-z0-9_]+$/);
  const admin = new Client({ connectionString: pgUrl(localDatabaseUrl) });
  const clients = Array.from(
    { length: clientCount },
    () =>
      new PrismaClient({
        datasources: {
          db: { url: prismaUrlForSchema(localDatabaseUrl, schema) },
        },
      }),
  );
  await admin.connect();
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`SET search_path TO "${schema}"`);
    await createFixtureTables(admin);
    await Promise.all(clients.map((client) => client.$connect()));
    await run({ admin, prisma: clients });
  } finally {
    await Promise.all(
      clients.map((client) => client.$disconnect().catch(() => undefined)),
    );
    await admin.query("ROLLBACK").catch(() => undefined);
    await admin.query("RESET search_path").catch(() => undefined);
    await admin
      .query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      .catch(() => undefined);
    await admin.end();
  }
}

async function createFixtureTables(
  client: InstanceType<typeof Client>,
): Promise<void> {
  await client.query(`
    CREATE TYPE "ClassmatePostCategory" AS ENUM (
      'STUDY', 'MEALS', 'LANGUAGE', 'SPORTS', 'SHARED_COURSES', 'OTHER'
    );
    CREATE TYPE "ClassmatePostStatus" AS ENUM (
      'ACTIVE', 'CLOSED', 'EXPIRED', 'FULFILLED', 'REMOVED'
    );
    CREATE TYPE "ActionCoordinationPolicy" AS ENUM (
      'DIRECT_CONVERSATION_V1', 'CREATOR_GATED_V2'
    );
    CREATE TYPE "ExperimentVariant" AS ENUM ('CONTROL', 'TREATMENT');
    CREATE TYPE "ActionInterestStatus" AS ENUM ('ACTIVE', 'WITHDRAWN');
    CREATE TYPE "ConnectionStatus" AS ENUM ('ACTIVE', 'ENDED', 'BLOCKED');
    CREATE TYPE "ActionCoordinationState" AS ENUM (
      'WAITING', 'INITIATING', 'OPEN', 'ENDED', 'UNAVAILABLE'
    );
    CREATE TYPE "ActionCoordinationEndReason" AS ENUM (
      'USER_ENDED', 'PLAN_CONFIRMED', 'SOURCE_FULFILLED', 'SOURCE_REMOVED',
      'SAFETY_UNAVAILABLE'
    );

    CREATE TABLE "ClassmatePost" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "category" "ClassmatePostCategory" NOT NULL,
      "status" "ClassmatePostStatus" NOT NULL,
      "coordinationPolicy" "ActionCoordinationPolicy",
      "policySchemaVersion" INTEGER,
      "policyParametersSnapshot" JSONB,
      "experimentKeySnapshot" TEXT,
      "experimentVariantSnapshot" "ExperimentVariant",
      "clientCapabilitySnapshot" JSONB,
      "policySnapshottedAt" TIMESTAMP(3),
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL,
      "updatedAt" TIMESTAMP(3) NOT NULL
    );

    CREATE TABLE "Connection" (
      "id" TEXT PRIMARY KEY,
      "userAId" TEXT NOT NULL,
      "userBId" TEXT NOT NULL,
      "status" "ConnectionStatus" NOT NULL,
      "endedById" TEXT,
      "endedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL,
      "updatedAt" TIMESTAMP(3) NOT NULL
    );

    CREATE TABLE "ActionInterest" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "classmatePostId" TEXT NOT NULL,
      "connectionId" TEXT,
      "status" "ActionInterestStatus" NOT NULL,
      "originSnapshot" JSONB NOT NULL,
      "withdrawnAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL,
      "updatedAt" TIMESTAMP(3) NOT NULL
    );

    CREATE TABLE "ActionInterestActivation" (
      "id" TEXT PRIMARY KEY,
      "interestId" TEXT NOT NULL
    );

    CREATE TABLE "ActionCoordinationContext" (
      "id" TEXT PRIMARY KEY,
      "interestId" TEXT NOT NULL UNIQUE,
      "currentActivationId" TEXT UNIQUE,
      "state" "ActionCoordinationState" NOT NULL,
      "reservationId" UUID UNIQUE,
      "reservationGeneration" INTEGER NOT NULL DEFAULT 0,
      "leaseExpiresAt" TIMESTAMP(3),
      "connectionId" TEXT,
      "activatedAt" TIMESTAMP(3),
      "firstCounterpartResponseAt" TIMESTAMP(3),
      "endedAt" TIMESTAMP(3),
      "endedById" TEXT,
      "endReason" "ActionCoordinationEndReason",
      "createdAt" TIMESTAMP(3) NOT NULL,
      "updatedAt" TIMESTAMP(3) NOT NULL
    );
  `);
}

async function scalar(
  client: InstanceType<typeof Client>,
  query: string,
): Promise<number> {
  const result = await client.query<{ count: string }>(query);
  return Number(result.rows[0].count);
}

async function one(
  client: InstanceType<typeof Client>,
  query: string,
): Promise<Record<string, unknown>> {
  const result = await client.query(query);
  assert.equal(result.rows.length, 1);
  return result.rows[0];
}
