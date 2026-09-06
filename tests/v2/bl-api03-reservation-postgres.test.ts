import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { PrismaClient } from "@prisma/client";

import {
  creatorGatedPolicySnapshot,
  evaluateActionCoordinationCapability,
} from "../../lib/v2/action-coordination/capability";
import { fixedActionCoordinationClock } from "../../lib/v2/action-coordination/command";
import { CREATOR_GATED_ACTION_EXPERIMENT_KEY } from "../../lib/v2/action-coordination/policy-snapshot";

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
const transactionOptions = { maxWait: 10_000, timeout: 25_000 } as const;
const baseNow = new Date("2026-09-01T10:00:00.000Z");
const capableClient = evaluateActionCoordinationCapability(
  new Headers({
    "x-sideseat-platform": "ios",
    "x-sideseat-app-version": "2.0",
    "x-sideseat-build": "200",
    "x-sideseat-capabilities": "action-coordination-v2",
  }),
  { minimumAppVersion: "1.0", minimumBuild: "1" },
);

test("BL-API-03 PostgreSQL tests refuse non-local database targets", () => {
  assert.equal(
    localPostgresUrl("postgresql://user:password@example.invalid/database"),
    undefined,
  );
  assert.equal(
    localPostgresUrl("postgresql://user:password@127.0.0.1:5433/database"),
    "postgresql://user:password@127.0.0.1:5433/database",
  );
});

test(
  "reservation cap is atomic and existing INITIATING shells stay resumable",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const interests = await import("../../lib/v2/action-coordination/interest-service");
    const reservations = await import(
      "../../lib/v2/action-coordination/reservation-service"
    );
    const responses = await import("../../lib/v2/action-coordination/response-service");
    await withFixture(async (fixture) => {
      await seedAction(fixture.db[0], fixture.creatorId, fixture.actionId);
      const interestIds: string[] = [];
      for (const [index, responderId] of fixture.responderIds.entries()) {
        const result = await fixture.track(
          interests.createCreatorGatedInterest({
            actorId: responderId,
            actionId: fixture.actionId,
            interestSurface: "ACTION_DETAIL",
            idempotencyKey: `api03-interest-${index}`,
            capability: capableClient,
            dependencies: fixture.forwardDependencies(fixture.db[0], baseNow),
          }),
        );
        interestIds.push(successfulInterestId(result));
      }

      const before = await responses.listCreatorActionResponses({
        actorId: fixture.creatorId,
        actionId: fixture.actionId,
        dependencies: fixture.responseDependencies(fixture.db[0], baseNow),
      });
      assert.deepEqual(
        before.groups[0]?.responses.map((item) => [
          item.coordinationState,
          item.canStartCoordination,
          item.startCoordinationUnavailableReason,
        ]),
        [
          ["WAITING", true, null],
          ["WAITING", true, null],
          ["WAITING", true, null],
        ],
      );

      const reservationIds = [randomUUID(), randomUUID(), randomUUID()];
      const attempts = await Promise.all(
        interestIds.map((interestId, index) =>
          fixture.track(
            reservations.reserveCreatorGatedActionCoordination({
              actorId: fixture.creatorId,
              interestId,
              idempotencyKey: `api03-cap-reserve-${index}`,
              capability: capableClient,
              dependencies: fixture.forwardDependencies(
                fixture.db[index % fixture.db.length]!,
                baseNow,
                () => reservationIds[index]!,
              ),
            }),
          ),
        ),
      );
      assert.deepEqual(
        attempts.map((result) => result.status).sort((a, b) => a - b),
        [201, 201, 409],
      );
      assert.equal(
        await fixture.db[0].actionCoordinationContext.count({
          where: {
            interest: { classmatePostId: fixture.actionId },
            state: "INITIATING",
          },
        }),
        2,
      );
      assert.equal(
        await fixture.db[0].productFunnelEvent.count({
          where: { sourceId: fixture.actionId, name: "COORDINATION_RESERVED" },
        }),
        2,
      );

      const after = await responses.listCreatorActionResponses({
        actorId: fixture.creatorId,
        actionId: fixture.actionId,
        dependencies: fixture.responseDependencies(fixture.db[0], baseNow),
      });
      const initiating = after.groups[0]?.responses.filter(
        (item) => item.coordinationState === "INITIATING",
      );
      const waiting = after.groups[0]?.responses.find(
        (item) => item.coordinationState === "WAITING",
      );
      assert.equal(initiating?.length, 2);
      assert.equal(
        initiating?.every(
          (item) =>
            item.canStartCoordination &&
            item.startCoordinationUnavailableReason === null,
        ),
        true,
      );
      assert.equal(waiting?.canStartCoordination, false);
      assert.equal(
        waiting?.startCoordinationUnavailableReason,
        "COORDINATION_LIMIT_REACHED",
      );

      const resumable = attempts.find((result) => result.status === 201)!;
      const shell = successfulReservation(resumable);
      const resumedAt = new Date(baseNow.getTime() + 60_000);
      const resumed = await fixture.track(
        reservations.reserveCreatorGatedActionCoordination({
          actorId: fixture.creatorId,
          interestId: shell.focus.interestId,
          idempotencyKey: "api03-cap-resume",
          capability: capableClient,
          dependencies: fixture.forwardDependencies(
            fixture.db[0],
            resumedAt,
            () => randomUUID(),
          ),
        }),
      );
      assert.equal(resumed.status, 200);
      assert.equal(successfulReservation(resumed).id, shell.id);
      assert.equal(successfulReservation(resumed).generation, shell.generation);
      assert.equal(
        await fixture.db[0].productFunnelEvent.count({
          where: { sourceId: fixture.actionId, name: "COORDINATION_RESERVED" },
        }),
        2,
      );
      await assertNoChatArtifacts(fixture.db[0], fixture);
    });
  },
);

test(
  "expired shells rotate generation and release remains a kill-switch safe drain",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const interests = await import("../../lib/v2/action-coordination/interest-service");
    const reservations = await import(
      "../../lib/v2/action-coordination/reservation-service"
    );
    const responses = await import("../../lib/v2/action-coordination/response-service");
    await withFixture(async (fixture) => {
      await seedAction(fixture.db[0], fixture.creatorId, fixture.actionId);
      const interestId = successfulInterestId(
        await fixture.track(
          interests.createCreatorGatedInterest({
            actorId: fixture.responderIds[0]!,
            actionId: fixture.actionId,
            interestSurface: "FEED_CARD",
            idempotencyKey: "api03-expired-interest",
            capability: capableClient,
            dependencies: fixture.forwardDependencies(fixture.db[0], baseNow),
          }),
        ),
      );
      const firstId = randomUUID();
      const first = await fixture.track(
        reservations.reserveCreatorGatedActionCoordination({
          actorId: fixture.creatorId,
          interestId,
          idempotencyKey: "api03-expired-first",
          capability: capableClient,
          dependencies: fixture.forwardDependencies(
            fixture.db[0],
            baseNow,
            () => firstId,
          ),
        }),
      );
      assert.equal(first.status, 201);

      const afterExpiry = new Date(baseNow.getTime() + 6 * 60_000);
      const staleList = await responses.listCreatorActionResponses({
        actorId: fixture.creatorId,
        actionId: fixture.actionId,
        dependencies: fixture.responseDependencies(fixture.db[0], afterExpiry),
      });
      assert.equal(staleList.groups[0]?.responses[0]?.coordinationState, "INITIATING");
      assert.equal(staleList.groups[0]?.responses[0]?.canStartCoordination, true);

      const secondId = randomUUID();
      const rotated = await fixture.track(
        reservations.reserveCreatorGatedActionCoordination({
          actorId: fixture.creatorId,
          interestId,
          idempotencyKey: "api03-expired-rotate",
          capability: capableClient,
          dependencies: fixture.forwardDependencies(
            fixture.db[0],
            afterExpiry,
            () => secondId,
          ),
        }),
      );
      assert.equal(rotated.status, 201);
      assert.equal(successfulReservation(rotated).id, secondId);
      assert.equal(successfulReservation(rotated).generation, 2);
      const eventCounts = await fixture.db[0].productFunnelEvent.groupBy({
          by: ["name"],
          where: {
            sourceId: fixture.actionId,
            name: { in: ["COORDINATION_RESERVED", "COORDINATION_RELEASED"] },
          },
          _count: { _all: true },
        });
      assert.deepEqual(
        Object.fromEntries(
          eventCounts.map((row) => [row.name, row._count._all]),
        ),
        { COORDINATION_RESERVED: 2, COORDINATION_RELEASED: 1 },
      );

      const released = await fixture.track(
        reservations.releaseCreatorGatedActionCoordinationReservation({
          actorId: fixture.creatorId,
          reservationId: secondId,
          idempotencyKey: "api03-safe-release",
          dependencies: {
            db: fixture.db[0],
            clock: fixedActionCoordinationClock(afterExpiry),
            transactionOptions,
            enrollmentAllowed: () => false,
          },
        }),
      );
      assert.equal(released.status, 200);
      assert.equal(
        (
          await fixture.db[0].actionCoordinationContext.findUniqueOrThrow({
            where: { interestId },
            select: { state: true, reservationId: true, leaseExpiresAt: true },
          })
        ).state,
        "WAITING",
      );
      const replay = await fixture.track(
        reservations.releaseCreatorGatedActionCoordinationReservation({
          actorId: fixture.creatorId,
          reservationId: secondId,
          idempotencyKey: "api03-safe-release",
          dependencies: {
            db: fixture.db[0],
            clock: fixedActionCoordinationClock(afterExpiry),
            transactionOptions,
            enrollmentAllowed: () => false,
          },
        }),
      );
      assert.equal(replay.kind, "replayed");
      assert.deepEqual(replay.body, released.body);
      assert.equal(
        await fixture.db[0].productFunnelEvent.count({
          where: { sourceId: fixture.actionId, name: "COORDINATION_RELEASED" },
        }),
        2,
      );
    });
  },
);

test(
  "heartbeat extends only while enrolled and atomically drains an expired lease",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const interests = await import("../../lib/v2/action-coordination/interest-service");
    const reservations = await import(
      "../../lib/v2/action-coordination/reservation-service"
    );
    await withFixture(async (fixture) => {
      await seedAction(fixture.db[0], fixture.creatorId, fixture.actionId);
      const interestId = successfulInterestId(
        await fixture.track(
          interests.createCreatorGatedInterest({
            actorId: fixture.responderIds[0]!,
            actionId: fixture.actionId,
            interestSurface: "ACTION_DETAIL",
            idempotencyKey: "api03-heartbeat-interest",
            capability: capableClient,
            dependencies: fixture.forwardDependencies(fixture.db[0], baseNow),
          }),
        ),
      );
      const id = randomUUID();
      const reserved = await fixture.track(
        reservations.reserveCreatorGatedActionCoordination({
          actorId: fixture.creatorId,
          interestId,
          idempotencyKey: "api03-heartbeat-reserve",
          capability: capableClient,
          dependencies: fixture.forwardDependencies(
            fixture.db[0],
            baseNow,
            () => id,
          ),
        }),
      );
      const originalLease = successfulReservation(reserved).leaseExpiresAt;
      const heartbeatAt = new Date(baseNow.getTime() + 60_000);
      const heartbeat = await fixture.track(
        reservations.heartbeatCreatorGatedActionCoordinationReservation({
          actorId: fixture.creatorId,
          reservationId: id,
          idempotencyKey: "api03-heartbeat-live",
          capability: capableClient,
          dependencies: fixture.forwardDependencies(fixture.db[0], heartbeatAt),
        }),
      );
      assert.equal(heartbeat.status, 200);
      const extendedLease = successfulReservation(heartbeat).leaseExpiresAt;
      assert.ok(extendedLease > originalLease);

      const disabledAt = new Date(baseNow.getTime() + 2 * 60_000);
      const disabled = await fixture.track(
        reservations.heartbeatCreatorGatedActionCoordinationReservation({
          actorId: fixture.creatorId,
          reservationId: id,
          idempotencyKey: "api03-heartbeat-disabled",
          capability: capableClient,
          dependencies: fixture.forwardDependencies(
            fixture.db[0],
            disabledAt,
            undefined,
            false,
          ),
        }),
      );
      assert.equal(disabled.status, 404);
      assert.equal(errorCode(disabled), "SAFETY_UNAVAILABLE");
      assert.equal(
        (
          await fixture.db[0].actionCoordinationContext.findUniqueOrThrow({
            where: { interestId },
            select: { leaseExpiresAt: true },
          })
        ).leaseExpiresAt?.toISOString(),
        extendedLease,
      );

      const expiredAt = new Date(new Date(extendedLease).getTime() + 1);
      const expired = await fixture.track(
        reservations.heartbeatCreatorGatedActionCoordinationReservation({
          actorId: fixture.creatorId,
          reservationId: id,
          idempotencyKey: "api03-heartbeat-expired",
          capability: capableClient,
          dependencies: fixture.forwardDependencies(fixture.db[0], expiredAt),
        }),
      );
      assert.equal(expired.status, 409);
      assert.equal(errorCode(expired), "RESERVATION_EXPIRED");
      assert.deepEqual(
        await fixture.db[0].actionCoordinationContext.findUniqueOrThrow({
          where: { interestId },
          select: { state: true, reservationId: true, leaseExpiresAt: true },
        }),
        { state: "WAITING", reservationId: null, leaseExpiresAt: null },
      );
      assert.equal(
        await fixture.db[0].productFunnelEvent.count({
          where: { sourceId: fixture.actionId, name: "COORDINATION_RELEASED" },
        }),
        1,
      );
    });
  },
);

type Fixture = Readonly<{
  db: PrismaClient[];
  creatorId: string;
  responderIds: readonly string[];
  actionId: string;
  receiptIds: Set<string>;
  track: <T extends { identity: { recordId: string } }>(promise: Promise<T>) => Promise<T>;
  forwardDependencies: (
    db: PrismaClient,
    now: Date,
    reservationIdFactory?: () => string,
    enrollmentAllowed?: boolean,
  ) => {
    db: PrismaClient;
    clock: ReturnType<typeof fixedActionCoordinationClock>;
    transactionOptions: typeof transactionOptions;
    enrollmentAllowed: () => boolean;
    resolveAssignment: () => Promise<{
      key: typeof CREATOR_GATED_ACTION_EXPERIMENT_KEY;
      eligible: true;
      variant: "TREATMENT";
    }>;
    reservationIdFactory?: () => string;
  };
  responseDependencies: (db: PrismaClient, now: Date) => {
    db: PrismaClient;
    clock: ReturnType<typeof fixedActionCoordinationClock>;
    transactionOptions: typeof transactionOptions;
    reservationEnrollmentAllowed: () => true;
    reservationCreatorEligible: () => Promise<true>;
  };
}>;

async function withFixture(run: (fixture: Fixture) => Promise<void>): Promise<void> {
  assert.ok(localDatabaseUrl);
  const db = Array.from(
    { length: 3 },
    () => new PrismaClient({ datasourceUrl: localDatabaseUrl }),
  );
  const suffix = randomUUID().replaceAll("-", "");
  const creatorId = `api03-creator-${suffix}`;
  const responderIds = [0, 1, 2].map(
    (index) => `api03-responder-${index}-${suffix}`,
  );
  const receiptIds = new Set<string>();
  const actionId = `api03-action-${suffix}`;
  const fixture: Fixture = {
    db,
    creatorId,
    responderIds,
    actionId,
    receiptIds,
    track: async (promise) => {
      const result = await promise;
      receiptIds.add(result.identity.recordId);
      return result;
    },
    forwardDependencies: (
      client,
      now,
      reservationIdFactory,
      enrollmentAllowed = true,
    ) => ({
      db: client,
      clock: fixedActionCoordinationClock(now),
      transactionOptions,
      enrollmentAllowed: () => enrollmentAllowed,
      resolveAssignment: async () => ({
        key: CREATOR_GATED_ACTION_EXPERIMENT_KEY,
        eligible: true,
        variant: "TREATMENT",
      }),
      ...(reservationIdFactory ? { reservationIdFactory } : {}),
    }),
    responseDependencies: (client, now) => ({
      db: client,
      clock: fixedActionCoordinationClock(now),
      transactionOptions,
      reservationEnrollmentAllowed: () => true,
      reservationCreatorEligible: async () => true,
    }),
  };
  try {
    await db[0].user.createMany({
      data: [
        {
          id: creatorId,
          username: `api03_creator_${suffix}`,
          nickname: "Creator",
          hashedPassword: "x",
          school: "TUM",
          onboardingComplete: true,
          verifiedStudent: true,
        },
        ...responderIds.map((id, index) => ({
          id,
          username: `api03_responder_${index}_${suffix}`,
          nickname: `Responder ${index + 1}`,
          hashedPassword: "x",
          school: "TUM",
          onboardingComplete: true,
          verifiedStudent: true,
        })),
      ],
    });
    await run(fixture);
  } finally {
    await db[0].apiIdempotencyRecord
      .deleteMany({ where: { id: { in: [...receiptIds] } } })
      .catch(() => undefined);
    await db[0].user
      .deleteMany({ where: { id: { in: [creatorId, ...responderIds] } } })
      .catch(() => undefined);
    await Promise.all(db.map((client) => client.$disconnect()));
  }
}

async function seedAction(
  db: PrismaClient,
  creatorId: string,
  actionId: string,
): Promise<void> {
  const snapshot = creatorGatedPolicySnapshot({
    capability: capableClient,
    experiment: {
      key: CREATOR_GATED_ACTION_EXPERIMENT_KEY,
      variant: "TREATMENT",
    },
    now: baseNow,
  });
  await db.classmatePost.create({
    data: {
      id: actionId,
      userId: creatorId,
      city: "Munich",
      category: "MEALS",
      title: "Lunch together",
      body: "Private body",
      visibility: "SCHOOL_ONLY",
      status: "ACTIVE",
      startsAt: new Date("2026-09-02T12:00:00.000Z"),
      endsAt: new Date("2026-09-02T13:00:00.000Z"),
      location: "Mensa",
      expiresAt: new Date("2026-09-05T00:00:00.000Z"),
      ...snapshot,
      clientCapabilitySnapshot: snapshot.clientCapabilitySnapshot!,
    },
  });
}

function successfulInterestId(result: { status: number }): string {
  assert.ok("body" in result);
  const body = (result as { body: unknown }).body;
  assert.ok(body && typeof body === "object");
  assert.ok("interest" in body);
  const interest = body.interest;
  assert.ok(interest && typeof interest === "object" && "id" in interest);
  assert.equal(typeof interest.id, "string");
  return interest.id as string;
}

function successfulReservation(result: { status: number }): {
  id: string;
  generation: number;
  leaseExpiresAt: string;
  focus: { interestId: string };
} {
  assert.ok("body" in result);
  const body = (result as { body: unknown }).body;
  assert.ok(body && typeof body === "object");
  assert.ok("reservation" in body);
  return body.reservation as {
    id: string;
    generation: number;
    leaseExpiresAt: string;
    focus: { interestId: string };
  };
}

function errorCode(result: { status: number }): string | null {
  if (!("body" in result)) return null;
  const body = (result as { body: unknown }).body;
  if (!body || typeof body !== "object" || !("error" in body)) {
    return null;
  }
  const error = body.error;
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

async function assertNoChatArtifacts(db: PrismaClient, fixture: Fixture) {
  const ids = [fixture.creatorId, ...fixture.responderIds];
  assert.deepEqual(
    await Promise.all([
      db.connection.count({
        where: { OR: [{ userAId: { in: ids } }, { userBId: { in: ids } }] },
      }),
      db.message.count({ where: { senderId: { in: ids } } }),
      db.chatRealtimeEvent.count({ where: { senderId: { in: ids } } }),
    ]),
    [0, 0, 0],
  );
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
