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
import { pairSafetyLock } from "../../lib/v2/action-coordination/db-locks";
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
const planFirstContent = {
  type: "PLAN",
  planType: "MEAL",
  title: "Lunch together",
  location: "Mensa",
  message: "Meet by the entrance",
  startTime: "2026-09-02T12:00:00.000Z",
  endTime: "2026-09-02T13:00:00.000Z",
} as const;
const capableClient = evaluateActionCoordinationCapability(
  new Headers({
    "x-sideseat-platform": "ios",
    "x-sideseat-app-version": "2.0",
    "x-sideseat-build": "200",
    "x-sideseat-capabilities": "action-coordination-v2",
  }),
  { minimumAppVersion: "1.0", minimumBuild: "1" },
);

test("BL-API-04 PostgreSQL tests refuse non-local database targets", () => {
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
  "MESSAGE activation atomically creates one ordered source card, message, OPEN Context, event, outbox, and replay",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const activationApi = await import(
      "../../lib/v2/action-coordination/activation-service"
    );
    const chatDto = await import("../../lib/api/v1/chat-dto");
    await withFixture(async (fixture) => {
      const shell = await createReservedShell(fixture, "ordered");
      const activated = await fixture.track(
        activationApi.activateCreatorGatedActionCoordination({
          actorId: fixture.creatorId,
          reservationId: shell.reservationId,
          idempotencyKey: "api04-activate-ordered",
          capability: capableClient,
          firstContent: { type: "MESSAGE", body: "  Shall we meet at 16:00?  " },
          dependencies: fixture.forwardDependencies(fixture.db[0], baseNow),
        }),
      );
      assert.equal(activated.status, 201);
      const result = successfulActivation(activated);
      const graph = await fixture.db[0].actionInterest.findUniqueOrThrow({
        where: { id: shell.interestId },
        select: {
          connectionId: true,
          coordinationContext: {
            select: {
              id: true,
              state: true,
              reservationId: true,
              leaseExpiresAt: true,
              activatedAt: true,
              currentActivation: {
                select: { connectedAt: true, firstContentType: true },
              },
            },
          },
        },
      });
      assert.equal(graph.connectionId, result.connectionId);
      assert.deepEqual(
        {
          id: graph.coordinationContext?.id,
          state: graph.coordinationContext?.state,
          reservationId: graph.coordinationContext?.reservationId,
          leaseExpiresAt: graph.coordinationContext?.leaseExpiresAt,
          firstContentType:
            graph.coordinationContext?.currentActivation?.firstContentType,
        },
        {
          id: result.contextId,
          state: "OPEN",
          reservationId: null,
          leaseExpiresAt: null,
          firstContentType: "MESSAGE",
        },
      );

      const messages = await fixture.db[0].message.findMany({
        where: { connectionId: result.connectionId },
        include: chatDto.directMessageV1Include,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      assert.equal(messages.length, 2);
      assert.deepEqual(
        messages.map((message) => [
          message.id,
          message.type,
          message.senderId,
          message.actionInterestId,
          message.actionContextId,
          message.body,
        ]),
        [
          [
            result.sourceCardMessageId,
            "ACTION_INTEREST_CARD",
            fixture.responderId,
            shell.interestId,
            result.contextId,
            "",
          ],
          [
            result.firstMessageId,
            "TEXT",
            fixture.creatorId,
            null,
            result.contextId,
            "Shall we meet at 16:00?",
          ],
        ],
      );
      assert.ok(messages[0]!.createdAt < messages[1]!.createdAt);
      assert.equal(chatDto.directMessageV1(messages[0]!).actionInterest !== null, true);

      const connection = await fixture.db[0].connection.findUniqueOrThrow({
        where: { id: result.connectionId },
        select: { replyLimitUnlockedAt: true },
      });
      assert.equal(connection.replyLimitUnlockedAt, null);
      assert.equal(
        await fixture.db[0].productFunnelEvent.count({
          where: {
            name: "ACTION_CONNECTED",
            actionContextId: result.contextId,
            firstContentType: "MESSAGE",
          },
        }),
        1,
      );
      assert.equal(
        await fixture.db[0].notificationOutbox.count({
          where: { kind: "ACTION_CONNECTED", recipientId: fixture.responderId },
        }),
        1,
      );
      assert.equal(
        await fixture.db[0].chatRealtimeEvent.count({
          where: {
            conversationKind: "DIRECT",
            conversationId: result.connectionId,
          },
        }),
        2,
      );

      const replayed = await fixture.track(
        activationApi.activateCreatorGatedActionCoordination({
          actorId: fixture.creatorId,
          reservationId: shell.reservationId,
          idempotencyKey: "api04-activate-ordered",
          capability: capableClient,
          firstContent: { type: "MESSAGE", body: "Shall we meet at 16:00?" },
          dependencies: fixture.forwardDependencies(fixture.db[1], baseNow),
        }),
      );
      assert.equal(replayed.kind, "replayed");
      assert.equal(replayed.status, 201);
      assert.deepEqual(replayed.body, activated.body);
      assert.equal(
        await fixture.db[0].message.count({
          where: { connectionId: result.connectionId },
        }),
        2,
      );
    });
  },
);

test(
  "PLAN activation atomically creates source and Plan cards, one Plan notification, exact focus, and replay",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const activationApi = await import(
      "../../lib/v2/action-coordination/activation-service"
    );
    await withFixture(async (fixture) => {
      const shell = await createReservedShell(fixture, "plan-ordered");
      const activate = (db: PrismaClient) =>
        activationApi.activateCreatorGatedActionCoordination({
          actorId: fixture.creatorId,
          reservationId: shell.reservationId,
          idempotencyKey: "api04-activate-plan-ordered",
          capability: capableClient,
          firstContent: planFirstContent,
          dependencies: fixture.forwardDependencies(db, baseNow),
        });
      const activated = await fixture.track(activate(fixture.db[0]));
      assert.equal(activated.status, 201);
      const result = successfulPlanActivation(activated);
      assert.deepEqual(result.focus, {
        type: "PLAN",
        connectionId: result.connectionId,
        commitmentId: result.commitmentId,
        revisionId: result.revisionId,
      });

      const graph = await fixture.db[0].actionInterest.findUniqueOrThrow({
        where: { id: shell.interestId },
        select: {
          connectionId: true,
          coordinationContext: {
            select: {
              state: true,
              reservationId: true,
              connectionId: true,
              currentActivation: {
                select: { connectedAt: true, firstContentType: true },
              },
            },
          },
        },
      });
      assert.equal(graph.connectionId, result.connectionId);
      assert.deepEqual(
        {
          state: graph.coordinationContext?.state,
          reservationId: graph.coordinationContext?.reservationId,
          connectionId: graph.coordinationContext?.connectionId,
          firstContentType:
            graph.coordinationContext?.currentActivation?.firstContentType,
        },
        {
          state: "OPEN",
          reservationId: null,
          connectionId: result.connectionId,
          firstContentType: "PLAN",
        },
      );

      const messages = await fixture.db[0].message.findMany({
        where: { connectionId: result.connectionId },
        select: {
          id: true,
          type: true,
          actionInterestId: true,
          actionContextId: true,
          planRequestId: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      assert.deepEqual(
        messages.map((message) => [
          message.id,
          message.type,
          message.actionInterestId,
          message.actionContextId,
          message.planRequestId,
        ]),
        [
          [
            result.sourceCardMessageId,
            "ACTION_INTEREST_CARD",
            shell.interestId,
            result.contextId,
            null,
          ],
          [
            result.planCardMessageId,
            "PLAN_REQUEST_CARD",
            shell.interestId,
            result.contextId,
            result.revisionId,
          ],
        ],
      );
      assert.ok(messages[0]!.createdAt < messages[1]!.createdAt);

      const commitment = await fixture.db[0].planCommitment.findUniqueOrThrow({
        where: { id: result.commitmentId },
        select: {
          status: true,
          originActionId: true,
          originContextId: true,
          currentPendingRevisionId: true,
        },
      });
      assert.deepEqual(commitment, {
        status: "NEGOTIATING",
        originActionId: fixture.actionId,
        originContextId: result.contextId,
        currentPendingRevisionId: result.revisionId,
      });
      assert.equal(
        await fixture.db[0].productFunnelEvent.count({
          where: {
            name: "ACTION_CONNECTED",
            actionContextId: result.contextId,
            firstContentType: "PLAN",
          },
        }),
        1,
      );
      assert.equal(
        await fixture.db[0].productFunnelEvent.count({
          where: { name: "PLAN_PROPOSED", planRevisionId: result.revisionId },
        }),
        1,
      );
      assert.deepEqual(
        await fixture.db[0].notificationOutbox.groupBy({
          by: ["kind"],
          where: { recipientId: fixture.responderId },
          _count: { _all: true },
          orderBy: { kind: "asc" },
        }),
        [{ kind: "PLAN_PROPOSED", _count: { _all: 1 } }],
      );

      const replayed = await fixture.track(activate(fixture.db[1]));
      assert.equal(replayed.kind, "replayed");
      assert.equal(replayed.status, 201);
      assert.deepEqual(replayed.body, activated.body);
      assert.equal(
        await fixture.db[0].planCommitment.count({
          where: { originContextId: result.contextId },
        }),
        1,
      );
      assert.equal(
        await fixture.db[0].message.count({
          where: { actionContextId: result.contextId },
        }),
        2,
      );
    });
  },
);

test(
  "different MESSAGE/PLAN activation keys serialize to one first-content winner",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const activationApi = await import(
      "../../lib/v2/action-coordination/activation-service"
    );
    await withFixture(async (fixture) => {
      const shell = await createReservedShell(fixture, "concurrent");
      const attempts = await Promise.all(
        [0, 1].map((index) =>
          activationApi.activateCreatorGatedActionCoordination({
            actorId: fixture.creatorId,
            reservationId: shell.reservationId,
            idempotencyKey: `api04-activate-race-${index}`,
            capability: capableClient,
            firstContent:
              index === 0
                ? { type: "MESSAGE", body: "First message" }
                : planFirstContent,
            dependencies: fixture.forwardDependencies(fixture.db[index]!, baseNow),
          }),
        ),
      );
      attempts.forEach((result) => fixture.receiptIds.add(result.identity.recordId));
      assert.deepEqual(
        attempts.map((result) => result.status).sort((left, right) => left - right),
        [201, 409],
      );
      const winner = attempts.find((result) => result.status === 201);
      assert.ok(winner && "body" in winner);
      const activation = (winner.body as { activation: { firstContentType: string } })
        .activation;
      assert.ok(
        activation.firstContentType === "MESSAGE" ||
          activation.firstContentType === "PLAN",
      );
      assert.equal(
        await fixture.db[0].connection.count({
          where: {
            OR: [
              { userAId: fixture.creatorId, userBId: fixture.responderId },
              { userAId: fixture.responderId, userBId: fixture.creatorId },
            ],
          },
        }),
        1,
      );
      assert.equal(
        await fixture.db[0].message.count({
          where: { actionContextId: shell.contextId },
        }),
        2,
      );
      assert.equal(
        await fixture.db[0].productFunnelEvent.count({
          where: { name: "ACTION_CONNECTED", actionContextId: shell.contextId },
        }),
        1,
      );
      assert.equal(
        await fixture.db[0].notificationOutbox.count({
          where: { kind: "ACTION_CONNECTED", recipientId: fixture.responderId },
        }),
        activation.firstContentType === "MESSAGE" ? 1 : 0,
      );
      assert.equal(
        await fixture.db[0].notificationOutbox.count({
          where: { kind: "PLAN_PROPOSED", recipientId: fixture.responderId },
        }),
        activation.firstContentType === "PLAN" ? 1 : 0,
      );
      assert.equal(
        await fixture.db[0].planCommitment.count({
          where: { originContextId: shell.contextId },
        }),
        activation.firstContentType === "PLAN" ? 1 : 0,
      );
    });
  },
);

test(
  "reply-gated PLAN-first activation returns cached PEER_REPLY_REQUIRED without partial cards or Commitment",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const activationApi = await import(
      "../../lib/v2/action-coordination/activation-service"
    );
    await withFixture(async (fixture) => {
      const connection = await fixture.db[0].connection.create({
        data: {
          userAId: fixture.creatorId,
          userBId: fixture.responderId,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      await fixture.db[0].message.createMany({
        data: [
          {
            connectionId: connection.id,
            senderId: fixture.creatorId,
            type: "TEXT",
            body: "Unanswered message one",
            createdAt: new Date(baseNow.getTime() - 2_000),
          },
          {
            connectionId: connection.id,
            senderId: fixture.creatorId,
            type: "TEXT",
            body: "Unanswered message two",
            createdAt: new Date(baseNow.getTime() - 1_000),
          },
        ],
      });
      const shell = await createReservedShell(fixture, "reply-gated");
      const activate = () =>
        activationApi.activateCreatorGatedActionCoordination({
          actorId: fixture.creatorId,
          reservationId: shell.reservationId,
          idempotencyKey: "api04-activate-reply-gated",
          capability: capableClient,
          firstContent: planFirstContent,
          dependencies: fixture.forwardDependencies(fixture.db[0], baseNow),
        });

      const rejected = await fixture.track(activate());
      assert.equal(rejected.kind, "executed");
      assert.equal(rejected.status, 403);
      assert.equal(errorCode(rejected), "PEER_REPLY_REQUIRED");
      assert.equal(
        await fixture.db[0].message.count({
          where: { connectionId: connection.id },
        }),
        2,
      );
      assert.equal(
        await fixture.db[0].message.count({
          where: {
            connectionId: connection.id,
            OR: [
              { actionContextId: shell.contextId },
              { type: "ACTION_INTEREST_CARD" },
            ],
          },
        }),
        0,
      );

      const graph = await fixture.db[0].actionInterest.findUniqueOrThrow({
        where: { id: shell.interestId },
        select: {
          connectionId: true,
          coordinationContext: {
            select: {
              state: true,
              reservationId: true,
              leaseExpiresAt: true,
              connectionId: true,
              currentActivation: {
                select: { connectedAt: true, firstContentType: true },
              },
            },
          },
        },
      });
      assert.equal(graph.connectionId, null);
      assert.deepEqual(
        {
          state: graph.coordinationContext?.state,
          reservationId: graph.coordinationContext?.reservationId,
          hasLease: graph.coordinationContext?.leaseExpiresAt !== null,
          connectionId: graph.coordinationContext?.connectionId,
          connectedAt:
            graph.coordinationContext?.currentActivation?.connectedAt ?? null,
          firstContentType:
            graph.coordinationContext?.currentActivation?.firstContentType ?? null,
        },
        {
          state: "INITIATING",
          reservationId: shell.reservationId,
          hasLease: true,
          connectionId: null,
          connectedAt: null,
          firstContentType: null,
        },
      );
      assert.equal(
        await fixture.db[0].productFunnelEvent.count({
          where: { name: "ACTION_CONNECTED", actionContextId: shell.contextId },
        }),
        0,
      );
      assert.equal(
        await fixture.db[0].notificationOutbox.count({
          where: {
            kind: { in: ["ACTION_CONNECTED", "PLAN_PROPOSED"] },
            recipientId: fixture.responderId,
          },
        }),
        0,
      );
      assert.equal(
        await fixture.db[0].planCommitment.count({
          where: { originContextId: shell.contextId },
        }),
        0,
      );
      assert.deepEqual(
        await fixture.db[0].apiIdempotencyRecord.findUniqueOrThrow({
          where: { id: rejected.identity.recordId },
          select: { responseStatus: true },
        }),
        { responseStatus: 403 },
      );

      const replayed = await fixture.track(activate());
      assert.equal(replayed.kind, "replayed");
      assert.equal(replayed.status, 403);
      assert.equal(errorCode(replayed), "PEER_REPLY_REQUIRED");
      assert.deepEqual(replayed.body, rejected.body);
      assert.equal(
        await fixture.db[0].message.count({
          where: { connectionId: connection.id },
        }),
        2,
      );
    });
  },
);

test(
  "generic replies are not guessed while focused responder messages emit FIRST_HUMAN_RESPONSE exactly once",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const activationApi = await import(
      "../../lib/v2/action-coordination/activation-service"
    );
    const directMessages = await import("../../lib/chat/direct-message-service");
    await withFixture(async (fixture) => {
      const shell = await createReservedShell(fixture, "response");
      const activated = await fixture.track(
        activationApi.activateCreatorGatedActionCoordination({
          actorId: fixture.creatorId,
          reservationId: shell.reservationId,
          idempotencyKey: "api04-activate-response",
          capability: capableClient,
          firstContent: { type: "MESSAGE", body: "Hi" },
          dependencies: fixture.forwardDependencies(fixture.db[0], baseNow),
        }),
      );
      const result = successfulActivation(activated);

      const generic = await fixture.db[0].$transaction(async (tx) => {
        await pairSafetyLock(tx, fixture.creatorId, fixture.responderId);
        return directMessages.createDirectMessageRecord(tx, {
          connectionId: result.connectionId,
          senderId: fixture.responderId,
          input: { type: "TEXT", body: "A generic reply" },
        });
      });
      assert.equal(generic.message.actionContextId, null);
      assert.equal(
        (
          await fixture.db[0].actionCoordinationContext.findUniqueOrThrow({
            where: { id: result.contextId },
            select: { firstCounterpartResponseAt: true },
          })
        ).firstCounterpartResponseAt,
        null,
      );

      async function focused(body: string) {
        return fixture.db[0].$transaction(async (tx) => {
          await pairSafetyLock(tx, fixture.creatorId, fixture.responderId);
          const context =
            await directMessages.lockFocusedDirectMessageActionContext(tx, {
              actionContextId: result.contextId,
              connectionId: result.connectionId,
              actorId: fixture.responderId,
              participantIds: [fixture.creatorId, fixture.responderId],
            });
          const created = await directMessages.createDirectMessageRecord(tx, {
            connectionId: result.connectionId,
            senderId: fixture.responderId,
            input: { type: "TEXT", body, actionContextId: result.contextId },
          });
          const transitioned =
            await directMessages.recordFirstFocusedCounterpartResponse(tx, {
              context,
              actorId: fixture.responderId,
              connectionId: result.connectionId,
              occurredAt: created.message.createdAt,
            });
          return { created, transitioned };
        });
      }

      const first = await focused("Yes, 16:00 works");
      const second = await focused("See you there");
      assert.equal(first.created.message.actionContextId, result.contextId);
      assert.equal(first.transitioned, true);
      assert.equal(second.transitioned, false);
      assert.equal(
        await fixture.db[0].productFunnelEvent.count({
          where: {
            name: "FIRST_HUMAN_RESPONSE",
            actionContextId: result.contextId,
          },
        }),
        1,
      );
      assert.ok(
        (
          await fixture.db[0].actionCoordinationContext.findUniqueOrThrow({
            where: { id: result.contextId },
            select: { firstCounterpartResponseAt: true },
          })
        ).firstCounterpartResponseAt,
      );
      assert.ok(
        (
          await fixture.db[0].connection.findUniqueOrThrow({
            where: { id: result.connectionId },
            select: { replyLimitUnlockedAt: true },
          })
        ).replyLimitUnlockedAt,
      );
    });
  },
);

test(
  "Block tombstones a connected source card and same-key activation replay becomes non-revealing",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const activationApi = await import(
      "../../lib/v2/action-coordination/activation-service"
    );
    const chatDto = await import("../../lib/api/v1/chat-dto");
    const blockApi = await import("../../lib/api/v1/pair-block-transaction");
    await withFixture(async (fixture) => {
      const shell = await createReservedShell(fixture, "block");
      const activated = await fixture.track(
        activationApi.activateCreatorGatedActionCoordination({
          actorId: fixture.creatorId,
          reservationId: shell.reservationId,
          idempotencyKey: "api04-activate-block",
          capability: capableClient,
          firstContent: { type: "MESSAGE", body: "Hi" },
          dependencies: fixture.forwardDependencies(fixture.db[0], baseNow),
        }),
      );
      const result = successfulActivation(activated);
      const blockedAt = new Date(baseNow.getTime() + 60_000);
      const blocked = await fixture.db[0].$transaction((tx) =>
        blockApi.installPairPeerBlock(tx, {
          userId: fixture.creatorId,
          blockedId: fixture.responderId,
          connectionId: result.connectionId,
          endedAt: blockedAt,
        }),
      );
      assert.equal(blocked.kind, "blocked");

      const replayed = await fixture.track(
        activationApi.activateCreatorGatedActionCoordination({
          actorId: fixture.creatorId,
          reservationId: shell.reservationId,
          idempotencyKey: "api04-activate-block",
          capability: capableClient,
          firstContent: { type: "MESSAGE", body: "Hi" },
          dependencies: fixture.forwardDependencies(fixture.db[1], blockedAt),
        }),
      );
      assert.equal(replayed.kind, "replayed");
      assert.equal(replayed.status, 404);
      assert.equal(errorCode(replayed), "SAFETY_UNAVAILABLE");

      const card = await fixture.db[0].message.findUniqueOrThrow({
        where: { id: result.sourceCardMessageId },
        include: chatDto.directMessageV1Include,
      });
      const wire = chatDto.directMessageV1(card);
      assert.equal(wire.actionInterestId, shell.interestId);
      assert.equal(wire.actionInterest, null);
    });
  },
);

test(
  "Block racing PLAN activation linearizes and leaves no actionable Commitment",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const activationApi = await import(
      "../../lib/v2/action-coordination/activation-service"
    );
    const blockApi = await import("../../lib/api/v1/pair-block-transaction");
    await withFixture(async (fixture) => {
      const shell = await createReservedShell(fixture, "block-race");
      const blockedAt = new Date(baseNow.getTime() + 1);
      const [activated, blocked] = await Promise.all([
        activationApi.activateCreatorGatedActionCoordination({
          actorId: fixture.creatorId,
          reservationId: shell.reservationId,
          idempotencyKey: "api04-activate-block-race",
          capability: capableClient,
          firstContent: planFirstContent,
          dependencies: fixture.forwardDependencies(fixture.db[0], baseNow),
        }),
        fixture.db[1].$transaction((tx) =>
          blockApi.installPairPeerBlock(tx, {
            userId: fixture.creatorId,
            blockedId: fixture.responderId,
            endedAt: blockedAt,
          }),
        ),
      ]);
      fixture.receiptIds.add(activated.identity.recordId);
      assert.equal(blocked.kind, "blocked");
      assert.ok(activated.status === 201 || activated.status === 404);
      assert.equal(
        await fixture.db[0].block.count({
          where: {
            blockerId: fixture.creatorId,
            blockedId: fixture.responderId,
          },
        }),
        1,
      );
      assert.equal(
        await fixture.db[0].connection.count({
          where: {
            status: "ACTIVE",
            OR: [
              { userAId: fixture.creatorId, userBId: fixture.responderId },
              { userAId: fixture.responderId, userBId: fixture.creatorId },
            ],
          },
        }),
        0,
      );
      assert.equal(
        await fixture.db[0].planCommitment.count({
          where: {
            originContextId: shell.contextId,
            OR: [
              { status: "NEGOTIATING" },
              { currentPendingRevisionId: { not: null } },
            ],
          },
        }),
        0,
      );
      const replayed = await fixture.track(
        activationApi.activateCreatorGatedActionCoordination({
          actorId: fixture.creatorId,
          reservationId: shell.reservationId,
          idempotencyKey: "api04-activate-block-race",
          capability: capableClient,
          firstContent: planFirstContent,
          dependencies: fixture.forwardDependencies(fixture.db[2], blockedAt),
        }),
      );
      assert.equal(replayed.kind, "replayed");
      assert.equal(replayed.status, 404);
      assert.equal(errorCode(replayed), "SAFETY_UNAVAILABLE");
    });
  },
);

type Fixture = Readonly<{
  db: PrismaClient[];
  creatorId: string;
  responderId: string;
  actionId: string;
  receiptIds: Set<string>;
  track: <T extends { identity: { recordId: string } }>(promise: Promise<T>) => Promise<T>;
  forwardDependencies: (db: PrismaClient, now: Date) => {
    db: PrismaClient;
    clock: ReturnType<typeof fixedActionCoordinationClock>;
    transactionOptions: typeof transactionOptions;
    enrollmentAllowed: () => true;
    resolveAssignment: () => Promise<{
      key: typeof CREATOR_GATED_ACTION_EXPERIMENT_KEY;
      eligible: true;
      variant: "TREATMENT";
    }>;
  };
}>;

async function withFixture(run: (fixture: Fixture) => Promise<void>): Promise<void> {
  assert.ok(localDatabaseUrl);
  const db = Array.from(
    { length: 3 },
    () => new PrismaClient({ datasourceUrl: localDatabaseUrl }),
  );
  const suffix = randomUUID().replaceAll("-", "");
  const creatorId = `api04-creator-${suffix}`;
  const responderId = `api04-responder-${suffix}`;
  const actionId = `api04-action-${suffix}`;
  const receiptIds = new Set<string>();
  const fixture: Fixture = {
    db,
    creatorId,
    responderId,
    actionId,
    receiptIds,
    track: async (promise) => {
      const result = await promise;
      receiptIds.add(result.identity.recordId);
      return result;
    },
    forwardDependencies: (client, now) => ({
      db: client,
      clock: fixedActionCoordinationClock(now),
      transactionOptions,
      enrollmentAllowed: () => true,
      resolveAssignment: async () => ({
        key: CREATOR_GATED_ACTION_EXPERIMENT_KEY,
        eligible: true,
        variant: "TREATMENT",
      }),
    }),
  };
  try {
    await db[0].user.createMany({
      data: [
        {
          id: creatorId,
          username: `api04_creator_${suffix}`,
          nickname: "Creator",
          hashedPassword: "x",
          school: "TUM",
          onboardingComplete: true,
          verifiedStudent: true,
        },
        {
          id: responderId,
          username: `api04_responder_${suffix}`,
          nickname: "Responder",
          hashedPassword: "x",
          school: "TUM",
          onboardingComplete: true,
          verifiedStudent: true,
        },
      ],
    });
    await seedAction(db[0], creatorId, actionId);
    await run(fixture);
  } finally {
    await db[0].apiIdempotencyRecord
      .deleteMany({ where: { id: { in: [...receiptIds] } } })
      .catch(() => undefined);
    await db[0].user
      .deleteMany({ where: { id: { in: [creatorId, responderId] } } })
      .catch(() => undefined);
    await Promise.all(db.map((client) => client.$disconnect()));
  }
}

async function createReservedShell(fixture: Fixture, suffix: string) {
  const interests = await import("../../lib/v2/action-coordination/interest-service");
  const reservations = await import(
    "../../lib/v2/action-coordination/reservation-service"
  );
  const interest = await fixture.track(
    interests.createCreatorGatedInterest({
      actorId: fixture.responderId,
      actionId: fixture.actionId,
      interestSurface: "ACTION_DETAIL",
      idempotencyKey: `api04-interest-${suffix}`,
      capability: capableClient,
      dependencies: fixture.forwardDependencies(fixture.db[0], baseNow),
    }),
  );
  const interestId = successfulInterestId(interest);
  const reservationId = randomUUID();
  const reserved = await fixture.track(
    reservations.reserveCreatorGatedActionCoordination({
      actorId: fixture.creatorId,
      interestId,
      idempotencyKey: `api04-reserve-${suffix}`,
      capability: capableClient,
      dependencies: {
        ...fixture.forwardDependencies(fixture.db[0], baseNow),
        reservationIdFactory: () => reservationId,
      },
    }),
  );
  assert.equal(reserved.status, 201);
  return {
    interestId,
    reservationId,
    contextId: successfulReservation(reserved).contextId,
  };
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
  assert.ok(body && typeof body === "object" && "interest" in body);
  const interest = body.interest;
  assert.ok(interest && typeof interest === "object" && "id" in interest);
  assert.equal(typeof interest.id, "string");
  return interest.id as string;
}

function successfulReservation(result: { status: number }): {
  contextId: string;
} {
  assert.ok("body" in result);
  const body = (result as { body: unknown }).body;
  assert.ok(body && typeof body === "object" && "reservation" in body);
  return body.reservation as { contextId: string };
}

function successfulActivation(result: { status: number }): {
  connectionId: string;
  contextId: string;
  sourceCardMessageId: string;
  firstMessageId: string;
} {
  assert.ok("body" in result);
  const body = (result as { body: unknown }).body;
  assert.ok(body && typeof body === "object" && "activation" in body);
  return body.activation as {
    connectionId: string;
    contextId: string;
    sourceCardMessageId: string;
    firstMessageId: string;
  };
}

function successfulPlanActivation(result: { status: number }): {
  connectionId: string;
  contextId: string;
  sourceCardMessageId: string;
  planCardMessageId: string;
  commitmentId: string;
  revisionId: string;
  focus: {
    type: "PLAN";
    connectionId: string;
    commitmentId: string;
    revisionId: string;
  };
} {
  assert.ok("body" in result);
  const body = (result as { body: unknown }).body;
  assert.ok(body && typeof body === "object" && "activation" in body);
  const activation = body.activation as {
    firstContentType?: string;
    connectionId: string;
    contextId: string;
    sourceCardMessageId: string;
    planCardMessageId: string;
    commitmentId: string;
    revisionId: string;
    focus: {
      type: "PLAN";
      connectionId: string;
      commitmentId: string;
      revisionId: string;
    };
  };
  assert.equal(activation.firstContentType, "PLAN");
  return activation;
}

function errorCode(result: { status: number }): string | null {
  if (!("body" in result)) return null;
  const body = (result as { body: unknown }).body;
  if (!body || typeof body !== "object" || !("error" in body)) return null;
  const error = body.error;
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
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
