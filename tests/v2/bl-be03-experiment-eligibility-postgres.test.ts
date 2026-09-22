import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { PrismaClient } from "@prisma/client";

type CommonJsModuleResolver = typeof Module & {
  _resolveFilename: (
    request: string,
    parent: unknown,
    isMain: boolean,
    options?: unknown,
  ) => string;
};

const commonJsModule = Module as CommonJsModuleResolver;
const resolveFilename = commonJsModule._resolveFilename;
const serverOnlyStub = fileURLToPath(
  new URL("./server-only-test-stub.cjs", import.meta.url),
);
commonJsModule._resolveFilename = function resolveForServerContractTest(
  request,
  parent,
  isMain,
  options,
) {
  if (request === "server-only") return serverOnlyStub;
  return resolveFilename.call(this, request, parent, isMain, options);
};

const localDatabaseUrl = localPostgresUrl(process.env.DATABASE_URL);

test(
  "creator-gated eligibility history is immutable, transition-only, and concurrency-safe",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    const { getCreatorGatedActionToPlanAssignment } = await import(
      "../../lib/v2/experiments"
    );
    const db = new PrismaClient({ datasourceUrl: localDatabaseUrl! });
    const suffix = randomUUID().replaceAll("-", "");
    const assignedUserId = `blbe03assigned-${suffix}`;
    const unassignedUserId = `blbe03unassigned-${suffix}`;
    const env = preserveEnvironment([
      "V2_GLOBAL_KILL_SWITCH",
      "V2_ACTION_TO_PLAN_EXPERIMENT_ENABLED",
      "V2_ACTION_INTEREST_ENABLED",
      "V2_CREATOR_GATED_EXPERIMENT_ENABLED",
      "V2_TESTFLIGHT_ALLOW_ALL",
      "V2_TESTFLIGHT_ALLOWLIST",
    ]);
    const capable = {
      supported: true,
      snapshot: {
        schemaVersion: 1 as const,
        capability: "action-coordination-v2" as const,
        declared: true,
        platform: "ios",
        appVersion: "2.4.0",
        build: "240",
        minimumAppVersion: "2.3.0",
        minimumBuild: "230",
        supported: true,
        reason: "CAPABLE" as const,
      },
    };
    const unsupported = {
      supported: false,
      snapshot: {
        ...capable.snapshot,
        declared: false,
        supported: false,
        reason: "CAPABILITY_NOT_DECLARED" as const,
      },
    };

    try {
      Object.assign(process.env, {
        V2_GLOBAL_KILL_SWITCH: "0",
        V2_ACTION_TO_PLAN_EXPERIMENT_ENABLED: "1",
        V2_ACTION_INTEREST_ENABLED: "1",
        V2_CREATOR_GATED_EXPERIMENT_ENABLED: "1",
        V2_TESTFLIGHT_ALLOW_ALL: "0",
        V2_TESTFLIGHT_ALLOWLIST: `${assignedUserId},${unassignedUserId}`,
      });
      await db.user.createMany({
        data: [
          {
            id: assignedUserId,
            username: `blbe03_assigned_${suffix}`,
            hashedPassword: "not-used",
            onboardingComplete: true,
          },
          {
            id: unassignedUserId,
            username: `blbe03_unassigned_${suffix}`,
            hashedPassword: "not-used",
            onboardingComplete: true,
          },
        ],
      });
      const assignedUser = {
        id: assignedUserId,
        email: null,
        username: `blbe03_assigned_${suffix}`,
      };
      const unassignedUser = {
        id: unassignedUserId,
        email: null,
        username: `blbe03_unassigned_${suffix}`,
      };

      const initial = await getCreatorGatedActionToPlanAssignment(
        assignedUser,
        capable,
        db,
      );
      assert.equal(initial.persisted, true);
      assert.equal(initial.eligible, true);
      const assignment = await db.experimentAssignment.findUniqueOrThrow({
        where: {
          userId_experimentKey: {
            userId: assignedUserId,
            experimentKey: "action_to_plan_creator_gated_v2",
          },
        },
      });
      assert.equal(assignment.eligible, true);
      assert.equal(
        await db.experimentEligibilityTransition.count({
          where: { assignmentId: assignment.id },
        }),
        1,
      );

      await Promise.all(
        Array.from({ length: 6 }, () =>
          getCreatorGatedActionToPlanAssignment(assignedUser, capable, db),
        ),
      );
      assert.equal(
        await db.experimentEligibilityTransition.count({
          where: { assignmentId: assignment.id },
        }),
        1,
        "same eligible observation must not append read noise",
      );

      process.env.V2_GLOBAL_KILL_SWITCH = "1";
      await Promise.all(
        Array.from({ length: 8 }, () =>
          getCreatorGatedActionToPlanAssignment(assignedUser, capable, db),
        ),
      );
      let transitions = await db.experimentEligibilityTransition.findMany({
        where: { assignmentId: assignment.id },
        orderBy: { version: "asc" },
      });
      assert.deepEqual(
        transitions.map(({ version, eligible, reason }) => ({
          version,
          eligible,
          reason,
        })),
        [
          { version: 1, eligible: true, reason: "ELIGIBLE" },
          {
            version: 2,
            eligible: false,
            reason: "ENROLLMENT_DISABLED",
          },
        ],
      );
      await getCreatorGatedActionToPlanAssignment(
        assignedUser,
        unsupported,
        db,
      );
      assert.equal(
        await db.experimentEligibilityTransition.count({
          where: { assignmentId: assignment.id },
        }),
        2,
        "a different reason for the same false state is not a transition",
      );

      process.env.V2_GLOBAL_KILL_SWITCH = "0";
      const restored = await db.$transaction((tx) =>
        getCreatorGatedActionToPlanAssignment(assignedUser, capable, tx),
      );
      assert.equal(restored.eligible, true);
      assert.equal(restored.variant, initial.variant);
      transitions = await db.experimentEligibilityTransition.findMany({
        where: { assignmentId: assignment.id },
        orderBy: { version: "asc" },
      });
      assert.deepEqual(
        transitions.map(({ version, eligible, reason }) => ({
          version,
          eligible,
          reason,
        })),
        [
          { version: 1, eligible: true, reason: "ELIGIBLE" },
          {
            version: 2,
            eligible: false,
            reason: "ENROLLMENT_DISABLED",
          },
          { version: 3, eligible: true, reason: "ELIGIBLE" },
        ],
      );
      const unchangedAssignment =
        await db.experimentAssignment.findUniqueOrThrow({
          where: { id: assignment.id },
        });
      assert.equal(unchangedAssignment.variant, assignment.variant);
      assert.equal(unchangedAssignment.eligible, assignment.eligible);
      assert.equal(
        unchangedAssignment.assignedAt.getTime(),
        assignment.assignedAt.getTime(),
      );

      const noEnrollment = await getCreatorGatedActionToPlanAssignment(
        unassignedUser,
        unsupported,
        db,
      );
      assert.equal(noEnrollment.persisted, false);
      assert.equal(noEnrollment.eligible, false);
      assert.equal(
        await db.experimentAssignment.count({
          where: {
            userId: unassignedUserId,
            experimentKey: "action_to_plan_creator_gated_v2",
          },
        }),
        0,
      );
      assert.equal(
        await db.experimentEligibilityTransition.count({
          where: { assignment: { userId: unassignedUserId } },
        }),
        0,
      );

      await db.user.delete({ where: { id: assignedUserId } });
      assert.equal(
        await db.experimentEligibilityState.count({
          where: { assignmentId: assignment.id },
        }),
        0,
      );
      assert.equal(
        await db.experimentEligibilityTransition.count({
          where: { assignmentId: assignment.id },
        }),
        0,
      );
    } finally {
      env.restore();
      await db.user.deleteMany({
        where: { id: { in: [assignedUserId, unassignedUserId] } },
      });
      await db.$disconnect();
    }
  },
);

function preserveEnvironment(keys: readonly string[]) {
  const values = new Map(keys.map((key) => [key, process.env[key]]));
  return {
    restore() {
      for (const [key, value] of values) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    },
  };
}

function localPostgresUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
      return undefined;
    }
    if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
      return undefined;
    }
    return value;
  } catch {
    return undefined;
  }
}
