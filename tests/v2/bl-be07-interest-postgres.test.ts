import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { PrismaClient } from "@prisma/client";

import {
  creatorGatedPolicySnapshot,
  directConversationPolicySnapshot,
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
const transactionOptions = { maxWait: 10_000, timeout: 20_000 } as const;
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
const incapableClient = evaluateActionCoordinationCapability(
  new Headers({
    "x-sideseat-platform": "ios",
    "x-sideseat-app-version": "2.0",
    "x-sideseat-build": "200",
  }),
  { minimumAppVersion: "1.0", minimumBuild: "1" },
);

test("BL-BE-07 PostgreSQL tests refuse non-local database targets", () => {
  assert.equal(
    localPostgresUrl("postgresql://user:password@example.invalid/database"),
    undefined,
  );
  assert.equal(
    localPostgresUrl(
      "postgresql://user:password@localhost:5433/database?host=prod.example",
    ),
    undefined,
  );
  assert.equal(
    localPostgresUrl("postgresql://user:password@127.0.0.1:5433/database"),
    "postgresql://user:password@127.0.0.1:5433/database",
  );
});

test(
  "creator-gated Interest creates one WAITING graph and zero chat artifacts",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const api = await import("../../lib/v2/action-coordination/interest-service");
    await withFixture(1, async (fixture) => {
      const actionId = fixture.actionId("waiting");
      await seedAction(fixture.db[0], fixture.creatorId, actionId);

      const first = await fixture.track(
        api.createCreatorGatedInterest({
          actorId: fixture.responderId,
          actionId,
          interestSurface: "ACTION_DETAIL",
          idempotencyKey: "be07-first-create",
          capability: capableClient,
          dependencies: fixture.dependencies(fixture.db[0]),
        }),
      );
      const firstInterest = successfulInterest(first, 201);
      assert.equal(first.kind, "executed");
      assert.equal(firstInterest.interestState, "ACTIVE");
      assert.equal(firstInterest.coordinationState, "WAITING");
      assert.equal(firstInterest.context.title, "Lunch together");
      assert.equal(firstInterest.planDraft.planType, "MEAL");
      assert.equal("connectionId" in firstInterest, false);
      assert.equal("messageId" in firstInterest, false);

      const replay = await fixture.track(
        api.createCreatorGatedInterest({
          actorId: fixture.responderId,
          actionId,
          interestSurface: "ACTION_DETAIL",
          idempotencyKey: "be07-first-create",
          capability: capableClient,
          dependencies: fixture.dependencies(fixture.db[0]),
        }),
      );
      assert.equal(replay.kind, "replayed");
      assert.equal(replay.status, 201);
      assert.deepEqual(replay.body, first.body);

      const converged = await fixture.track(
        api.createCreatorGatedInterest({
          actorId: fixture.responderId,
          actionId,
          interestSurface: "FEED_CARD",
          idempotencyKey: "be07-second-key",
          capability: capableClient,
          dependencies: fixture.dependencies(fixture.db[0]),
        }),
      );
      assert.equal(converged.kind, "executed");
      assert.equal(converged.status, 200);
      assert.equal(successfulInterest(converged, 200).activationId, firstInterest.activationId);

      await fixture.db[0].classmatePost.update({
        where: { id: actionId },
        data: { title: "Edited after response" },
      });
      const recovered = await api.getCreatorGatedInterest({
        actorId: fixture.responderId,
        interestId: firstInterest.id,
        dependencies: {
          db: fixture.db[0],
          clock: fixedActionCoordinationClock(baseNow),
        },
      });
      assert.equal(recovered?.context.title, "Lunch together");

      const [interestCount, activationCount, contextCount, presentationCount] =
        await Promise.all([
          fixture.db[0].actionInterest.count({ where: { classmatePostId: actionId } }),
          fixture.db[0].actionInterestActivation.count({
            where: { interestId: firstInterest.id },
          }),
          fixture.db[0].actionCoordinationContext.count({
            where: { interestId: firstInterest.id, state: "WAITING" },
          }),
          fixture.db[0].actionInterestPresentation.count({
            where: { interestId: firstInterest.id, creatorId: fixture.creatorId },
          }),
        ]);
      assert.deepEqual(
        { interestCount, activationCount, contextCount, presentationCount },
        { interestCount: 1, activationCount: 1, contextCount: 1, presentationCount: 1 },
      );
      await assertNoChatArtifacts(fixture.db[0], fixture);
      assert.equal(
        await fixture.db[0].productFunnelEvent.count({
          where: { actionInterestId: firstInterest.id, name: "ACTION_INTERESTED" },
        }),
        1,
      );
      assert.equal(
        await fixture.db[0].notificationOutbox.count({
          where: { recipientId: fixture.creatorId, kind: "ACTION_INTERESTED" },
        }),
        1,
      );
    });
  },
);

test(
  "different-key concurrent creates converge without duplicate activation or Context",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const api = await import("../../lib/v2/action-coordination/interest-service");
    await withFixture(2, async (fixture) => {
      const actionId = fixture.actionId("race");
      await seedAction(fixture.db[0], fixture.creatorId, actionId);
      const create = (db: PrismaClient, key: string) =>
        fixture.track(
          api.createCreatorGatedInterest({
            actorId: fixture.responderId,
            actionId,
            interestSurface: "FEED_CARD",
            idempotencyKey: key,
            capability: capableClient,
            dependencies: fixture.dependencies(db),
          }),
        );
      const results = await Promise.all([
        create(fixture.db[0], "be07-race-key-a"),
        create(fixture.db[1], "be07-race-key-b"),
      ]);
      assert.deepEqual(
        results.map((result) => result.status).sort(),
        [200, 201],
      );
      const ids = results.map((result) => successfulInterest(result).id);
      assert.equal(new Set(ids).size, 1);
      const interestId = ids[0]!;
      assert.equal(
        await fixture.db[0].actionInterestActivation.count({ where: { interestId } }),
        1,
      );
      assert.equal(
        await fixture.db[0].actionCoordinationContext.count({ where: { interestId } }),
        1,
      );
      assert.equal(
        await fixture.db[0].productFunnelEvent.count({
          where: { actionInterestId: interestId, name: "ACTION_INTERESTED" },
        }),
        1,
      );
      await assertNoChatArtifacts(fixture.db[0], fixture);
    });
  },
);

test(
  "withdraw is a safe drain and explicit reactivation creates only a new activation",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const api = await import("../../lib/v2/action-coordination/interest-service");
    await withFixture(2, async (fixture) => {
      const actionId = fixture.actionId("reactivate");
      await seedAction(fixture.db[0], fixture.creatorId, actionId);
      const created = await fixture.track(
        api.createCreatorGatedInterest({
          actorId: fixture.responderId,
          actionId,
          interestSurface: "ACTION_DETAIL",
          idempotencyKey: "be07-react-create",
          capability: capableClient,
          dependencies: fixture.dependencies(fixture.db[0]),
        }),
      );
      const initial = successfulInterest(created, 201);

      const withdrawn = await fixture.track(
        api.withdrawCreatorGatedInterest({
          actorId: fixture.responderId,
          interestId: initial.id,
          idempotencyKey: "be07-withdraw-key",
          dependencies: fixture.dependencies(fixture.db[0], false),
        }),
      );
      const terminal = successfulInterest(withdrawn, 200);
      assert.equal(terminal.interestState, "WITHDRAWN");
      assert.equal(terminal.coordinationState, "UNAVAILABLE");
      assert.equal(terminal.terminalReason, "INTEREST_WITHDRAWN_BEFORE_CONNECT");

      const implicitRevive = await fixture.track(
        api.createCreatorGatedInterest({
          actorId: fixture.responderId,
          actionId,
          interestSurface: "ACTION_DETAIL",
          idempotencyKey: "be07-no-implicit-revive",
          capability: capableClient,
          dependencies: fixture.dependencies(fixture.db[0]),
        }),
      );
      assert.equal(implicitRevive.status, 409);
      assert.equal(errorCode(implicitRevive), "INTEREST_NOT_ACTIVE");
      assert.deepEqual(
        "body" in implicitRevive && "recovery" in implicitRevive.body
          ? implicitRevive.body.recovery
          : null,
        {
          action: "REACTIVATE_INTEREST",
          focus: { type: "INTEREST", interestId: initial.id },
        },
      );

      const before = await fixture.db[0].actionCoordinationContext.findUniqueOrThrow({
        where: { interestId: initial.id },
        select: { reservationGeneration: true },
      });
      const reactivations = await Promise.all([
        fixture.track(
          api.reactivateCreatorGatedInterest({
            actorId: fixture.responderId,
            interestId: initial.id,
            interestSurface: "FEED_CARD",
            idempotencyKey: "be07-reactivate-key-a",
            capability: capableClient,
            dependencies: fixture.dependencies(fixture.db[0]),
          }),
        ),
        fixture.track(
          api.reactivateCreatorGatedInterest({
            actorId: fixture.responderId,
            interestId: initial.id,
            interestSurface: "ACTION_DETAIL",
            idempotencyKey: "be07-reactivate-key-b",
            capability: capableClient,
            dependencies: fixture.dependencies(fixture.db[1]),
          }),
        ),
      ]);
      assert.deepEqual(
        reactivations.map((result) => result.status).sort(),
        [200, 201],
      );
      const activeAgain = successfulInterest(
        reactivations.find((result) => result.status === 201)!,
        201,
      );
      assert.equal(activeAgain.interestState, "ACTIVE");
      assert.equal(activeAgain.coordinationState, "WAITING");
      assert.notEqual(activeAgain.activationId, initial.activationId);
      const graph = await fixture.db[0].actionCoordinationContext.findUniqueOrThrow({
        where: { interestId: initial.id },
        include: { currentActivation: true },
      });
      assert.equal(graph.reservationGeneration, before.reservationGeneration);
      assert.equal(graph.currentActivation?.ordinal, 2);
      assert.equal(
        await fixture.db[0].actionInterestActivation.count({
          where: { interestId: initial.id },
        }),
        2,
      );
      await assertNoChatArtifacts(fixture.db[0], fixture);
    });
  },
);

test(
  "policy, visibility, expiry, Block and kill gates fail closed without chat writes",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const api = await import("../../lib/v2/action-coordination/interest-service");
    await withFixture(1, async (fixture) => {
      const directId = fixture.actionId("direct");
      await seedAction(fixture.db[0], fixture.creatorId, directId, { direct: true });
      const direct = await fixture.track(
        api.createCreatorGatedInterest({
          actorId: fixture.responderId,
          actionId: directId,
          interestSurface: "ACTION_DETAIL",
          idempotencyKey: "be07-direct-reject",
          capability: capableClient,
          dependencies: fixture.dependencies(fixture.db[0]),
        }),
      );
      assert.equal(direct.status, 409);
      assert.equal(errorCode(direct), "COORDINATION_POLICY_UNSUPPORTED");

      const unsupportedId = fixture.actionId("unsupported-client");
      await seedAction(fixture.db[0], fixture.creatorId, unsupportedId);
      const unsupported = await fixture.track(
        api.createCreatorGatedInterest({
          actorId: fixture.responderId,
          actionId: unsupportedId,
          interestSurface: "FEED_CARD",
          idempotencyKey: "be07-client-reject",
          capability: incapableClient,
          dependencies: fixture.dependencies(fixture.db[0]),
        }),
      );
      assert.equal(unsupported.status, 426);
      assert.equal(errorCode(unsupported), "CLIENT_CAPABILITY_REQUIRED");

      const killedId = fixture.actionId("killed");
      await seedAction(fixture.db[0], fixture.creatorId, killedId);
      const killed = await fixture.track(
        api.createCreatorGatedInterest({
          actorId: fixture.responderId,
          actionId: killedId,
          interestSurface: "FEED_CARD",
          idempotencyKey: "be07-kill-reject",
          capability: capableClient,
          dependencies: fixture.dependencies(fixture.db[0], false),
        }),
      );
      assert.equal(killed.status, 404);
      assert.equal(errorCode(killed), "SAFETY_UNAVAILABLE");

      const blockedId = fixture.actionId("blocked");
      await seedAction(fixture.db[0], fixture.creatorId, blockedId);
      await fixture.db[0].block.create({
        data: { blockerId: fixture.creatorId, blockedId: fixture.responderId },
      });
      const blocked = await fixture.track(
        api.createCreatorGatedInterest({
          actorId: fixture.responderId,
          actionId: blockedId,
          interestSurface: "FEED_CARD",
          idempotencyKey: "be07-block-reject",
          capability: capableClient,
          dependencies: fixture.dependencies(fixture.db[0]),
        }),
      );
      assert.equal(blocked.status, 404);
      assert.equal(errorCode(blocked), "SAFETY_UNAVAILABLE");
      await fixture.db[0].block.deleteMany({
        where: { blockerId: fixture.creatorId, blockedId: fixture.responderId },
      });

      const expiredId = fixture.actionId("expired");
      await seedAction(fixture.db[0], fixture.creatorId, expiredId, {
        expiresAt: new Date(baseNow.getTime() - 1_000),
      });
      const expired = await fixture.track(
        api.createCreatorGatedInterest({
          actorId: fixture.responderId,
          actionId: expiredId,
          interestSurface: "FEED_CARD",
          idempotencyKey: "be07-expired-reject",
          capability: capableClient,
          dependencies: fixture.dependencies(fixture.db[0]),
        }),
      );
      assert.equal(expired.status, 409);
      assert.equal(errorCode(expired), "ACTION_EXPIRED");

      const privateId = fixture.actionId("school");
      await seedAction(fixture.db[0], fixture.creatorId, privateId);
      await fixture.db[0].user.update({
        where: { id: fixture.responderId },
        data: { school: "LMU" },
      });
      const privateResult = await fixture.track(
        api.createCreatorGatedInterest({
          actorId: fixture.responderId,
          actionId: privateId,
          interestSurface: "FEED_CARD",
          idempotencyKey: "be07-school-reject",
          capability: capableClient,
          dependencies: fixture.dependencies(fixture.db[0]),
        }),
      );
      assert.equal(privateResult.status, 404);
      assert.equal(errorCode(privateResult), "SAFETY_UNAVAILABLE");

      assert.equal(
        await fixture.db[0].actionInterest.count({
          where: { userId: fixture.responderId },
        }),
        0,
      );
      await assertNoChatArtifacts(fixture.db[0], fixture);
    });
  },
);

test(
  "My responses uses participant-bound latest-activation keyset cursors",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const api = await import("../../lib/v2/action-coordination/interest-service");
    await withFixture(1, async (fixture) => {
      const actionIds = ["old", "middle", "new"].map((name) => fixture.actionId(name));
      for (let index = 0; index < actionIds.length; index += 1) {
        const actionId = actionIds[index]!;
        await seedAction(fixture.db[0], fixture.creatorId, actionId);
        await fixture.track(
          api.createCreatorGatedInterest({
            actorId: fixture.responderId,
            actionId,
            interestSurface: "ACTION_DETAIL",
            idempotencyKey: `be07-page-${index}-key`,
            capability: capableClient,
            dependencies: fixture.dependencies(
              fixture.db[0],
              true,
              new Date(baseNow.getTime() + index * 60_000),
            ),
          }),
        );
      }

      const first = await api.listMyCreatorGatedInterests({
        actorId: fixture.responderId,
        state: "ALL",
        limit: 1,
        dependencies: { db: fixture.db[0], clock: fixedActionCoordinationClock(baseNow) },
      });
      assert.equal(first.interests[0]?.actionId, actionIds[2]);
      assert.ok(first.nextCursor);
      const second = await api.listMyCreatorGatedInterests({
        actorId: fixture.responderId,
        state: "ALL",
        limit: 1,
        cursor: first.nextCursor,
        dependencies: { db: fixture.db[0], clock: fixedActionCoordinationClock(baseNow) },
      });
      assert.equal(second.interests[0]?.actionId, actionIds[1]);
      assert.ok(second.nextCursor);
      const third = await api.listMyCreatorGatedInterests({
        actorId: fixture.responderId,
        state: "ALL",
        limit: 1,
        cursor: second.nextCursor,
        dependencies: { db: fixture.db[0], clock: fixedActionCoordinationClock(baseNow) },
      });
      assert.equal(third.interests[0]?.actionId, actionIds[0]);
      assert.equal(third.nextCursor, null);

      await assert.rejects(
        api.listMyCreatorGatedInterests({
          actorId: fixture.responderId,
          state: "WAITING",
          cursor: first.nextCursor,
          dependencies: { db: fixture.db[0] },
        }),
        (cause: unknown) => cause instanceof api.CreatorGatedInterestCursorError,
      );
      await assert.rejects(
        api.listMyCreatorGatedInterests({
          actorId: fixture.otherId,
          state: "ALL",
          cursor: first.nextCursor,
          dependencies: { db: fixture.db[0] },
        }),
        (cause: unknown) => cause instanceof api.CreatorGatedInterestCursorError,
      );
      await assert.rejects(
        api.listMyCreatorGatedInterests({
          actorId: fixture.responderId,
          cursor: "not-json",
          dependencies: { db: fixture.db[0] },
        }),
        (cause: unknown) => cause instanceof api.CreatorGatedInterestCursorError,
      );

      const own = first.interests[0]!;
      assert.equal(
        await api.getCreatorGatedInterest({
          actorId: fixture.otherId,
          interestId: own.id,
          dependencies: { db: fixture.db[0] },
        }),
        null,
      );
      const foreignList = await api.listMyCreatorGatedInterests({
        actorId: fixture.otherId,
        dependencies: { db: fixture.db[0] },
      });
      assert.deepEqual(foreignList, { interests: [], nextCursor: null });
    });
  },
);

test(
  "pair Block in either direction terminalizes pre-Connect state and unblock never revives its tombstone",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const api = await import("../../lib/v2/action-coordination/interest-service");
    const { installPairPeerBlock } = await import(
      "../../lib/api/v1/pair-block-transaction"
    );
    const { unblockUserForActor } = await import(
      "../../lib/api/v1/blocks-service"
    );
    await withFixture(1, async (fixture) => {
      for (const [index, direction] of [
        [fixture.creatorId, fixture.responderId],
        [fixture.responderId, fixture.creatorId],
      ].entries()) {
        const actionId = fixture.actionId(`block-direction-${index}`);
        await seedAction(fixture.db[0], fixture.creatorId, actionId);
        const created = await fixture.track(
          api.createCreatorGatedInterest({
            actorId: fixture.responderId,
            actionId,
            interestSurface: "ACTION_DETAIL",
            idempotencyKey: `be07-block-create-${index}`,
            capability: capableClient,
            dependencies: fixture.dependencies(fixture.db[0]),
          }),
        );
        const interest = successfulInterest(created, 201);
        await fixture.db[0].$transaction((tx) =>
          installPairPeerBlock(tx, {
            userId: direction[0],
            blockedId: direction[1],
            endedAt: new Date(baseNow.getTime() + 1_000),
          }),
        );

        const graph = await fixture.db[0].actionInterest.findUniqueOrThrow({
          where: { id: interest.id },
          include: {
            coordinationContext: { include: { currentActivation: true } },
          },
        });
        assert.deepEqual(graph.originSnapshot, {
          version: 2,
          kind: "TOMBSTONE",
          sourceKind: "BUDDY_POST",
          sourceId: actionId,
        });
        assert.equal(graph.coordinationContext?.state, "UNAVAILABLE");
        assert.equal(
          graph.coordinationContext?.currentActivation?.terminalReason,
          "SAFETY_UNAVAILABLE_BEFORE_CONNECT",
        );
        const participant = await api.getCreatorGatedInterest({
          actorId: fixture.responderId,
          interestId: interest.id,
          dependencies: {
            db: fixture.db[0],
            clock: fixedActionCoordinationClock(baseNow),
          },
        });
        assert.deepEqual(participant?.context, { kind: "TOMBSTONE" });
        assert.deepEqual(participant?.planDraft, { kind: "TOMBSTONE" });
        assert.equal(participant?.terminalReason, null);
        assert.deepEqual(participant?.focus, {
          type: "INTEREST",
          interestId: interest.id,
        });

        const cachedAfterBlock = await fixture.db[0].apiIdempotencyRecord.findUniqueOrThrow({
          where: { id: created.identity.recordId },
          select: { responseStatus: true, responseBody: true },
        });
        assert.equal(cachedAfterBlock.responseStatus, 201);
        assert.deepEqual(
          (cachedAfterBlock.responseBody as { interest: { context: unknown } })
            .interest.context,
          { kind: "TOMBSTONE" },
        );
        assert.deepEqual(
          (cachedAfterBlock.responseBody as { interest: { planDraft: unknown } })
            .interest.planDraft,
          { kind: "TOMBSTONE" },
        );
        assert.doesNotMatch(
          JSON.stringify(cachedAfterBlock.responseBody),
          /Lunch together|Mensa/,
        );

        const replayed = await fixture.track(
          api.createCreatorGatedInterest({
            actorId: fixture.responderId,
            actionId,
            interestSurface: "ACTION_DETAIL",
            idempotencyKey: `be07-block-create-${index}`,
            capability: capableClient,
            dependencies: fixture.dependencies(fixture.db[0]),
          }),
        );
        assert.equal(replayed.kind, "replayed");
        const replayedInterest = successfulInterest(replayed, 201);
        assert.deepEqual(replayedInterest.context, { kind: "TOMBSTONE" });
        assert.deepEqual(replayedInterest.planDraft, { kind: "TOMBSTONE" });
        assert.equal(replayedInterest.coordinationState, "UNAVAILABLE");
        assert.equal(replayedInterest.terminalReason, null);

        const unblocked = await unblockUserForActor({
          db: fixture.db[0],
          blockerId: direction[0],
          blockedId: direction[1],
        });
        assert.equal(unblocked?.unblocked, true);
        const afterUnblock = await fixture.db[0].actionCoordinationContext.findUniqueOrThrow({
          where: { interestId: interest.id },
          include: { currentActivation: true },
        });
        assert.equal(afterUnblock.state, "UNAVAILABLE");
        assert.equal(
          afterUnblock.currentActivation?.terminalReason,
          "SAFETY_UNAVAILABLE_BEFORE_CONNECT",
        );
      }
    });
  },
);

test(
  "user moderation removes only owned creator-gated Actions and preserves durable source-scoped tombstones",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const api = await import("../../lib/v2/action-coordination/interest-service");
    const {
      deactivateUserModerationBlock,
      installUserModerationBlock,
    } = await import("../../lib/connections/moderation-block-transaction");
    await withFixture(1, async (fixture) => {
      const ownActionId = fixture.actionId("moderated-owned");
      const foreignActionId = fixture.actionId("moderated-foreign");
      await seedAction(fixture.db[0], fixture.creatorId, ownActionId);
      await seedAction(fixture.db[0], fixture.otherId, foreignActionId);
      const ownCreated = await fixture.track(
        api.createCreatorGatedInterest({
          actorId: fixture.responderId,
          actionId: ownActionId,
          interestSurface: "ACTION_DETAIL",
          idempotencyKey: "be07-moderation-own",
          capability: capableClient,
          dependencies: fixture.dependencies(fixture.db[0]),
        }),
      );
      const initiallyInterested = successfulInterest(ownCreated, 201);
      successfulInterest(
        await fixture.track(
          api.withdrawCreatorGatedInterest({
            actorId: fixture.responderId,
            interestId: initiallyInterested.id,
            idempotencyKey: "be07-moderation-withdraw",
            dependencies: fixture.dependencies(
              fixture.db[0],
              true,
              new Date(baseNow.getTime() + 500),
            ),
          }),
        ),
        200,
      );
      const reactivated = await fixture.track(
        api.reactivateCreatorGatedInterest({
          actorId: fixture.responderId,
          interestId: initiallyInterested.id,
          interestSurface: "ACTION_DETAIL",
          idempotencyKey: "be07-moderation-reactivate",
          capability: capableClient,
          dependencies: fixture.dependencies(
            fixture.db[0],
            true,
            new Date(baseNow.getTime() + 1_000),
          ),
        }),
      );
      const ownInterest = successfulInterest(reactivated, 201);
      const foreignInterest = successfulInterest(
        await fixture.track(
          api.createCreatorGatedInterest({
            actorId: fixture.creatorId,
            actionId: foreignActionId,
            interestSurface: "ACTION_DETAIL",
            idempotencyKey: "be07-moderation-foreign",
            capability: capableClient,
            dependencies: fixture.dependencies(fixture.db[0]),
          }),
        ),
        201,
      );
      const report = await fixture.db[0].report.create({
        data: {
          reporterId: fixture.otherId,
          reportedUserId: fixture.creatorId,
          classmatePostId: ownActionId,
          reason: "SPAM",
        },
        select: { id: true },
      });
      const installed = await fixture.db[0].$transaction((tx) =>
        installUserModerationBlock(tx, {
          userId: fixture.creatorId,
          reportId: report.id,
          reason: "spam",
          createdByEmail: "admin@example.test",
          endedAt: new Date(baseNow.getTime() + 2_000),
        }),
      );
      assert.equal(installed.created, true);
      const [ownAction, foreignAction, interests] = await Promise.all([
        fixture.db[0].classmatePost.findUniqueOrThrow({
          where: { id: ownActionId },
          select: { status: true, removedAt: true },
        }),
        fixture.db[0].classmatePost.findUniqueOrThrow({
          where: { id: foreignActionId },
          select: { status: true, removedAt: true },
        }),
        fixture.db[0].actionInterest.findMany({
          where: { id: { in: [ownInterest.id, foreignInterest.id] } },
          select: {
            id: true,
            originSnapshot: true,
            coordinationContext: { select: { state: true } },
          },
        }),
      ]);
      assert.equal(ownAction.status, "REMOVED");
      assert.ok(ownAction.removedAt);
      assert.deepEqual(foreignAction, { status: "ACTIVE", removedAt: null });
      assert.equal(interests.length, 2);
      for (const interest of interests) {
        assert.equal(
          (interest.originSnapshot as { kind?: string }).kind,
          "TOMBSTONE",
        );
        assert.equal(interest.coordinationContext?.state, "UNAVAILABLE");
      }

      const cachedAfterModeration =
        await fixture.db[0].apiIdempotencyRecord.findUniqueOrThrow({
          where: { id: reactivated.identity.recordId },
          select: { responseStatus: true, responseBody: true },
        });
      assert.equal(cachedAfterModeration.responseStatus, 201);
      assert.doesNotMatch(
        JSON.stringify(cachedAfterModeration.responseBody),
        /Lunch together|Mensa/,
      );
      const replayedReactivation = await fixture.track(
        api.reactivateCreatorGatedInterest({
          actorId: fixture.responderId,
          interestId: ownInterest.id,
          interestSurface: "ACTION_DETAIL",
          idempotencyKey: "be07-moderation-reactivate",
          capability: capableClient,
          dependencies: fixture.dependencies(
            fixture.db[0],
            true,
            new Date(baseNow.getTime() + 3_000),
          ),
        }),
      );
      assert.equal(replayedReactivation.kind, "replayed");
      const privacySafeReplay = successfulInterest(replayedReactivation, 201);
      assert.equal(privacySafeReplay.actionState, "REMOVED");
      assert.equal(privacySafeReplay.coordinationState, "UNAVAILABLE");
      assert.deepEqual(privacySafeReplay.context, { kind: "TOMBSTONE" });
      assert.deepEqual(privacySafeReplay.planDraft, { kind: "TOMBSTONE" });

      assert.equal(
        await deactivateUserModerationBlock(fixture.db[0], {
          userId: fixture.creatorId,
          moderationBlockId: installed.moderationBlockId,
        }),
        true,
      );
      assert.equal(
        (
          await fixture.db[0].classmatePost.findUniqueOrThrow({
            where: { id: ownActionId },
            select: { status: true },
          })
        ).status,
        "REMOVED",
      );
    });
  },
);

test(
  "recovery focus advances from Interest to Context to its exact Plan",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const api = await import("../../lib/v2/action-coordination/interest-service");
    const responses = await import("../../lib/v2/action-coordination/response-service");
    const { installPairPeerBlock } = await import(
      "../../lib/api/v1/pair-block-transaction"
    );
    const { unblockUserForActor } = await import(
      "../../lib/api/v1/blocks-service"
    );
    await withFixture(1, async (fixture) => {
      const actionId = fixture.actionId("focus");
      await seedAction(fixture.db[0], fixture.creatorId, actionId);
      const interest = successfulInterest(
        await fixture.track(
          api.createCreatorGatedInterest({
            actorId: fixture.responderId,
            actionId,
            interestSurface: "ACTION_DETAIL",
            idempotencyKey: "be07-focus-create",
            capability: capableClient,
            dependencies: fixture.dependencies(fixture.db[0]),
          }),
        ),
        201,
      );
      assert.equal(interest.focus.type, "INTEREST");
      const connection = await fixture.db[0].connection.create({
        data: {
          userAId: fixture.creatorId,
          userBId: fixture.responderId,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      const context = await fixture.db[0].actionCoordinationContext.findUniqueOrThrow({
        where: { interestId: interest.id },
        select: { id: true, currentActivationId: true },
      });
      await fixture.db[0].$transaction([
        fixture.db[0].actionInterest.update({
          where: { id: interest.id },
          data: { connectionId: connection.id },
        }),
        fixture.db[0].actionInterestActivation.update({
          where: { id: context.currentActivationId! },
          data: { connectedAt: baseNow, firstContentType: "MESSAGE" },
        }),
        fixture.db[0].actionCoordinationContext.update({
          where: { id: context.id },
          data: {
            state: "OPEN",
            connectionId: connection.id,
            activatedAt: baseNow,
          },
        }),
      ]);
      const contextFocus = await api.getCreatorGatedInterest({
        actorId: fixture.responderId,
        interestId: interest.id,
        dependencies: { db: fixture.db[0], clock: fixedActionCoordinationClock(baseNow) },
      });
      assert.deepEqual(contextFocus?.focus, {
        type: "ACTION_CONTEXT",
        connectionId: connection.id,
        contextId: context.id,
      });

      const { commitment, revision } = await fixture.db[0].$transaction(async (tx) => {
        const commitment = await tx.planCommitment.create({
          data: {
            connectionId: connection.id,
            participantAId: fixture.creatorId,
            participantBId: fixture.responderId,
            originActionId: actionId,
            originContextId: context.id,
            status: "NEGOTIATING",
          },
          select: { id: true },
        });
        const revision = await tx.planRequest.create({
          data: {
            connectionId: connection.id,
            commitmentId: commitment.id,
            revisionKind: "INITIAL",
            originActionId: actionId,
            originContextId: context.id,
            actionInterestId: interest.id,
            proposerUserId: fixture.creatorId,
            receiverUserId: fixture.responderId,
            planType: "MEAL",
            title: "Lunch together",
            location: "Mensa",
            startTime: new Date("2026-09-02T12:00:00.000Z"),
            endTime: new Date("2026-09-02T13:00:00.000Z"),
            status: "PENDING",
          },
          select: { id: true },
        });
        await tx.planCommitment.update({
          where: { id: commitment.id },
          data: { currentPendingRevisionId: revision.id },
        });
        return { commitment, revision };
      });
      const planFocus = await api.getCreatorGatedInterest({
        actorId: fixture.responderId,
        interestId: interest.id,
        dependencies: { db: fixture.db[0], clock: fixedActionCoordinationClock(baseNow) },
      });
      assert.deepEqual(planFocus?.focus, {
        type: "PLAN",
        connectionId: connection.id,
        commitmentId: commitment.id,
        revisionId: revision.id,
      });

      const beforeSafety = await responses.listCreatorActionResponses({
        actorId: fixture.creatorId,
        actionId,
        dependencies: {
          db: fixture.db[0],
          clock: fixedActionCoordinationClock(baseNow),
          transactionOptions,
        },
      });
      assert.equal(beforeSafety.groups[0]?.responses[0]?.interestId, interest.id);

      await fixture.db[0].$transaction((tx) =>
        installPairPeerBlock(tx, {
          userId: fixture.creatorId,
          blockedId: fixture.responderId,
          endedAt: new Date(baseNow.getTime() + 1_000),
        }),
      );
      const safetyEnded = await fixture.db[0].actionInterest.findUniqueOrThrow({
        where: { id: interest.id },
        select: {
          originSnapshot: true,
          coordinationContext: { select: { state: true, endReason: true } },
        },
      });
      assert.deepEqual(safetyEnded.coordinationContext, {
        state: "ENDED",
        endReason: "SAFETY_UNAVAILABLE",
      });
      assert.equal(
        (safetyEnded.originSnapshot as { kind?: string }).kind,
        "TOMBSTONE",
      );
      assert.deepEqual(
        await fixture.db[0].planCommitment.findUniqueOrThrow({
          where: { id: commitment.id },
          select: { status: true, currentPendingRevisionId: true },
        }),
        { status: "CLOSED", currentPendingRevisionId: null },
      );
      assert.deepEqual(
        await fixture.db[0].planRequest.findUniqueOrThrow({
          where: { id: revision.id },
          select: { status: true, resolutionReason: true },
        }),
        { status: "INVALIDATED", resolutionReason: "SAFETY_UNAVAILABLE" },
      );
      assert.equal(
        (
          await unblockUserForActor({
            db: fixture.db[0],
            blockerId: fixture.creatorId,
            blockedId: fixture.responderId,
          })
        )?.unblocked,
        true,
      );

      assert.deepEqual(
        (
          await responses.loadCreatorResponseEntry({
            actorId: fixture.creatorId,
            actionId,
            dependencies: { db: fixture.db[0] },
          })
        )?.counts,
        {
          totalActiveInterestCount: 0,
          visibleInterestCount: 0,
          unseenVisibleInterestCount: 0,
        },
      );
      assert.equal(
        await responses.loadActionResponseSummary({
          actorId: fixture.creatorId,
          dependencies: { db: fixture.db[0] },
        }),
        undefined,
      );
      const afterUnblock = await responses.listCreatorActionResponses({
        actorId: fixture.creatorId,
        actionId,
        dependencies: {
          db: fixture.db[0],
          clock: fixedActionCoordinationClock(
            new Date(baseNow.getTime() + 2_000),
          ),
          transactionOptions,
        },
      });
      assert.deepEqual(afterUnblock.groups, []);

      const staleSeen = await fixture.track(
        responses.markCreatorActionResponsesSeen({
          actorId: fixture.creatorId,
          actionId,
          snapshotToken: beforeSafety.snapshot.token,
          interestIds: [interest.id],
          idempotencyKey: "be07-focus-stale-seen",
          dependencies: {
            db: fixture.db[0],
            clock: fixedActionCoordinationClock(
              new Date(baseNow.getTime() + 2_000),
            ),
            transactionOptions,
          },
        }),
      );
      assert.equal(staleSeen.status, 404);
      assert.equal(
        await fixture.db[0].actionInterestViewReceipt.count({
          where: { interestId: interest.id },
        }),
        0,
      );
    });
  },
);

test(
  "activation notifications are bounded while withdrawal stays a safe drain and replay consumes no quota",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const api = await import("../../lib/v2/action-coordination/interest-service");
    await withFixture(1, async (fixture) => {
      const actionId = fixture.actionId("rate-limit");
      await seedAction(fixture.db[0], fixture.creatorId, actionId);
      await fixture.db[0].apiRateLimitCounter.create({
        data: {
          id: `expired-${randomUUID()}`,
          scope: "creator-gated-interest-activation",
          count: 99,
          windowStartedAt: new Date(baseNow.getTime() - 20 * 60_000),
          expiresAt: new Date(baseNow.getTime() - 1),
        },
      });
      const interest = successfulInterest(
        await fixture.track(
          api.createCreatorGatedInterest({
            actorId: fixture.responderId,
            actionId,
            interestSurface: "ACTION_DETAIL",
            idempotencyKey: "be07-rate-create",
            capability: capableClient,
            dependencies: fixture.dependencies(fixture.db[0]),
          }),
        ),
        201,
      );
      for (let ordinal = 2; ordinal <= 3; ordinal += 1) {
        await fixture.track(
          api.withdrawCreatorGatedInterest({
            actorId: fixture.responderId,
            interestId: interest.id,
            idempotencyKey: `be07-rate-withdraw-${ordinal}`,
            dependencies: fixture.dependencies(fixture.db[0], false),
          }),
        );
        const reactivated = await fixture.track(
          api.reactivateCreatorGatedInterest({
            actorId: fixture.responderId,
            interestId: interest.id,
            interestSurface: "ACTION_DETAIL",
            idempotencyKey: `be07-rate-reactivate-${ordinal}`,
            capability: capableClient,
            dependencies: fixture.dependencies(fixture.db[0]),
          }),
        );
        assert.equal(reactivated.status, 201);
      }
      const safeDrain = await fixture.track(
        api.withdrawCreatorGatedInterest({
          actorId: fixture.responderId,
          interestId: interest.id,
          idempotencyKey: "be07-rate-final-drain",
          dependencies: fixture.dependencies(fixture.db[0], false),
        }),
      );
      assert.equal(safeDrain.status, 200);
      const limited = await fixture.track(
        api.reactivateCreatorGatedInterest({
          actorId: fixture.responderId,
          interestId: interest.id,
          interestSurface: "ACTION_DETAIL",
          idempotencyKey: "be07-rate-limited",
          capability: capableClient,
          dependencies: fixture.dependencies(fixture.db[0]),
        }),
      );
      assert.equal(limited.status, 429);
      assert.equal(errorCode(limited), "INTEREST_RATE_LIMITED");
      assert.equal(errorRetryAfterSeconds(limited), 600);
      const counterBeforeReplay = await fixture.db[0].apiRateLimitCounter.findFirstOrThrow({
        where: { scope: "creator-gated-interest-activation", count: { gte: 4 } },
        orderBy: { updatedAt: "desc" },
        select: { count: true },
      });
      const replay = await fixture.track(
        api.reactivateCreatorGatedInterest({
          actorId: fixture.responderId,
          interestId: interest.id,
          interestSurface: "ACTION_DETAIL",
          idempotencyKey: "be07-rate-limited",
          capability: capableClient,
          dependencies: fixture.dependencies(fixture.db[0]),
        }),
      );
      assert.equal(replay.kind, "replayed");
      assert.equal(replay.status, 429);
      const counterAfterReplay = await fixture.db[0].apiRateLimitCounter.findFirstOrThrow({
        where: { scope: "creator-gated-interest-activation", count: { gte: 4 } },
        orderBy: { updatedAt: "desc" },
        select: { count: true },
      });
      assert.deepEqual(counterAfterReplay, counterBeforeReplay);
      assert.equal(
        await fixture.db[0].notificationOutbox.count({
          where: {
            recipientId: fixture.creatorId,
            kind: "ACTION_INTERESTED",
          },
        }),
        3,
      );
      assert.equal(
        await fixture.db[0].apiRateLimitCounter.count({
          where: {
            scope: "creator-gated-interest-activation",
            expiresAt: { lt: baseNow },
          },
        }),
        0,
      );
    });
  },
);

test(
  "creator Responses snapshot, seen, and private presentation stay outside coordination domain",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const interests = await import("../../lib/v2/action-coordination/interest-service");
    const responses = await import("../../lib/v2/action-coordination/response-service");
    await withFixture(1, async (fixture) => {
      const actionId = fixture.actionId("responses");
      await seedAction(fixture.db[0], fixture.creatorId, actionId);
      const interest = successfulInterest(
        await fixture.track(
          interests.createCreatorGatedInterest({
            actorId: fixture.responderId,
            actionId,
            interestSurface: "ACTION_DETAIL",
            idempotencyKey: "be07-responses-create",
            capability: capableClient,
            dependencies: fixture.dependencies(fixture.db[0]),
          }),
        ),
        201,
      );
      const first = await responses.listCreatorActionResponses({
        actorId: fixture.creatorId,
        actionId,
        limit: 1,
        dependencies: {
          db: fixture.db[0],
          clock: fixedActionCoordinationClock(baseNow),
          transactionOptions,
        },
      });
      assert.equal(first.groups.length, 1);
      assert.deepEqual(first.groups[0]?.counts, {
        totalActiveInterestCount: 1,
        visibleInterestCount: 1,
        unseenVisibleInterestCount: 1,
      });
      assert.equal(first.groups[0]?.responses[0]?.interestId, interest.id);
      assert.equal(first.groups[0]?.responses[0]?.responder.displayName, "Responder");
      assert.equal(first.groups[0]?.responses[0]?.canStartCoordination, false);
      assert.equal(
        first.groups[0]?.responses[0]?.startCoordinationUnavailableReason,
        "COORDINATION_START_UNAVAILABLE",
      );
      assert.deepEqual(
        await responses.loadCreatorResponseEntry({
          actorId: fixture.creatorId,
          actionId,
          dependencies: { db: fixture.db[0] },
        }),
        {
          counts: {
            totalActiveInterestCount: 1,
            visibleInterestCount: 1,
            unseenVisibleInterestCount: 1,
          },
          focus: { type: "ACTION_RESPONSES", actionId },
        },
      );
      assert.equal(
        (
          await responses.loadActionResponseSummary({
            actorId: fixture.creatorId,
            dependencies: { db: fixture.db[0] },
          })
        )?.unseenVisibleInterestCount,
        1,
      );

      const domainBefore = await fixture.db[0].actionCoordinationContext.findUniqueOrThrow({
        where: { interestId: interest.id },
        select: { state: true, reservationId: true, connectionId: true, updatedAt: true },
      });
      const outboxBefore = await fixture.db[0].notificationOutbox.count();
      const seen = await fixture.track(
        responses.markCreatorActionResponsesSeen({
          actorId: fixture.creatorId,
          actionId,
          snapshotToken: first.snapshot.token,
          interestIds: [interest.id],
          idempotencyKey: "be07-responses-seen",
          dependencies: {
            db: fixture.db[0],
            clock: fixedActionCoordinationClock(baseNow),
            transactionOptions,
          },
        }),
      );
      assert.equal(seen.status, 200);
      assert.ok("body" in seen && "viewed" in seen.body);
      assert.equal(
        "body" in seen && "counts" in seen.body
          ? seen.body.counts.unseenVisibleInterestCount
          : -1,
        0,
      );
      const seenReplay = await fixture.track(
        responses.markCreatorActionResponsesSeen({
          actorId: fixture.creatorId,
          actionId,
          snapshotToken: first.snapshot.token,
          interestIds: [interest.id],
          idempotencyKey: "be07-responses-seen",
          dependencies: {
            db: fixture.db[0],
            clock: fixedActionCoordinationClock(baseNow),
            transactionOptions,
          },
        }),
      );
      assert.equal(seenReplay.kind, "replayed");
      assert.equal(
        await responses.loadActionResponseSummary({
          actorId: fixture.creatorId,
          dependencies: { db: fixture.db[0] },
        }),
        undefined,
      );

      const hidden = await fixture.track(
        responses.setCreatorActionInterestPresentation({
          actorId: fixture.creatorId,
          interestId: interest.id,
          presentationState: "HIDDEN",
          idempotencyKey: "be07-responses-hide",
          dependencies: {
            db: fixture.db[0],
            clock: fixedActionCoordinationClock(baseNow),
            transactionOptions,
          },
        }),
      );
      assert.equal(hidden.status, 200);
      assert.equal(
        "body" in hidden && "presentation" in hidden.body
          ? hidden.body.presentation.version
          : -1,
        1,
      );
      const noOp = await fixture.track(
        responses.setCreatorActionInterestPresentation({
          actorId: fixture.creatorId,
          interestId: interest.id,
          presentationState: "HIDDEN",
          idempotencyKey: "be07-responses-hide-noop",
          dependencies: {
            db: fixture.db[0],
            clock: fixedActionCoordinationClock(baseNow),
            transactionOptions,
          },
        }),
      );
      assert.equal(
        "body" in noOp && "presentation" in noOp.body
          ? noOp.body.presentation.version
          : -1,
        1,
      );
      assert.deepEqual(
        await fixture.db[0].actionCoordinationContext.findUniqueOrThrow({
          where: { interestId: interest.id },
          select: { state: true, reservationId: true, connectionId: true, updatedAt: true },
        }),
        domainBefore,
      );
      assert.equal(await fixture.db[0].notificationOutbox.count(), outboxBefore);
      assert.equal(
        await fixture.db[0].productFunnelEvent.count({
          where: {
            actionInterestId: interest.id,
            name: { in: ["ACTION_RESPONSE_VIEWED", "ACTION_RESPONSE_HIDDEN"] },
          },
        }),
        2,
      );
      assert.deepEqual(
        (
          await responses.loadCreatorResponseEntry({
            actorId: fixture.creatorId,
            actionId,
            dependencies: { db: fixture.db[0] },
          })
        )?.counts,
        {
          totalActiveInterestCount: 1,
          visibleInterestCount: 0,
          unseenVisibleInterestCount: 0,
        },
      );
    });
  },
);

test(
  "creator Responses cursor is stable but safety-invalid, expired, and foreign snapshots fail closed",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const interests = await import("../../lib/v2/action-coordination/interest-service");
    const responses = await import("../../lib/v2/action-coordination/response-service");
    const blocks = await import("../../lib/api/v1/pair-block-transaction");
    const { unblockUserForActor } = await import(
      "../../lib/api/v1/blocks-service"
    );
    await withFixture(1, async (fixture) => {
      const actionId = fixture.actionId("cursor");
      const foreignActionId = fixture.actionId("cursor-foreign");
      await seedAction(fixture.db[0], fixture.creatorId, actionId);
      await seedAction(fixture.db[0], fixture.creatorId, foreignActionId);
      const early = successfulInterest(
        await fixture.track(
          interests.createCreatorGatedInterest({
            actorId: fixture.responderId,
            actionId,
            interestSurface: "ACTION_DETAIL",
            idempotencyKey: "be07-cursor-early",
            capability: capableClient,
            dependencies: fixture.dependencies(fixture.db[0], true, baseNow),
          }),
        ),
        201,
      );
      const lateNow = new Date(baseNow.getTime() + 60_000);
      const late = successfulInterest(
        await fixture.track(
          interests.createCreatorGatedInterest({
            actorId: fixture.otherId,
            actionId,
            interestSurface: "ACTION_DETAIL",
            idempotencyKey: "be07-cursor-late",
            capability: capableClient,
            dependencies: fixture.dependencies(fixture.db[0], true, lateNow),
          }),
        ),
        201,
      );
      const foreign = successfulInterest(
        await fixture.track(
          interests.createCreatorGatedInterest({
            actorId: fixture.responderId,
            actionId: foreignActionId,
            interestSurface: "ACTION_DETAIL",
            idempotencyKey: "be07-cursor-foreign",
            capability: capableClient,
            dependencies: fixture.dependencies(fixture.db[0], true, lateNow),
          }),
        ),
        201,
      );

      const first = await responses.listCreatorActionResponses({
        actorId: fixture.creatorId,
        actionId,
        limit: 1,
        dependencies: {
          db: fixture.db[0],
          clock: fixedActionCoordinationClock(lateNow),
          transactionOptions,
        },
      });
      assert.equal(first.groups[0]?.responses[0]?.interestId, early.id);
      assert.ok(first.nextCursor);
      assert.equal(first.groups[0]?.counts.totalActiveInterestCount, 2);

      const foreignSeen = await fixture.track(
        responses.markCreatorActionResponsesSeen({
          actorId: fixture.creatorId,
          actionId,
          snapshotToken: first.snapshot.token,
          interestIds: [early.id, foreign.id],
          idempotencyKey: "be07-cursor-foreign-seen",
          dependencies: {
            db: fixture.db[0],
            clock: fixedActionCoordinationClock(lateNow),
            transactionOptions,
          },
        }),
      );
      assert.equal(foreignSeen.status, 404);
      assert.equal(
        await fixture.db[0].actionInterestViewReceipt.count({
          where: { interestId: { in: [early.id, foreign.id] } },
        }),
        0,
      );

      const firstViewedAt = new Date(lateNow.getTime() + 1_000);
      const seen = await fixture.track(
        responses.markCreatorActionResponsesSeen({
          actorId: fixture.creatorId,
          actionId,
          snapshotToken: first.snapshot.token,
          interestIds: [early.id],
          idempotencyKey: "be07-cursor-seen",
          dependencies: {
            db: fixture.db[0],
            clock: fixedActionCoordinationClock(firstViewedAt),
            transactionOptions,
          },
        }),
      );
      assert.equal(
        "body" in seen && "viewed" in seen.body
          ? seen.body.viewed[0]?.viewedAt
          : null,
        firstViewedAt.toISOString(),
      );
      const seenNoOp = await fixture.track(
        responses.markCreatorActionResponsesSeen({
          actorId: fixture.creatorId,
          actionId,
          snapshotToken: first.snapshot.token,
          interestIds: [early.id],
          idempotencyKey: "be07-cursor-seen-noop",
          dependencies: {
            db: fixture.db[0],
            clock: fixedActionCoordinationClock(
              new Date(firstViewedAt.getTime() + 60_000),
            ),
            transactionOptions,
          },
        }),
      );
      assert.equal(
        "body" in seenNoOp && "viewed" in seenNoOp.body
          ? seenNoOp.body.viewed[0]?.viewedAt
          : null,
        firstViewedAt.toISOString(),
      );
      assert.equal(
        await fixture.db[0].productFunnelEvent.count({
          where: { actionInterestId: early.id, name: "ACTION_RESPONSE_VIEWED" },
        }),
        1,
      );

      await fixture.track(
        responses.setCreatorActionInterestPresentation({
          actorId: fixture.creatorId,
          interestId: late.id,
          presentationState: "HIDDEN",
          idempotencyKey: "be07-cursor-hide-late",
          dependencies: {
            db: fixture.db[0],
            clock: fixedActionCoordinationClock(firstViewedAt),
            transactionOptions,
          },
        }),
      );
      const second = await responses.listCreatorActionResponses({
        actorId: fixture.creatorId,
        actionId,
        presentation: "VISIBLE",
        limit: 1,
        cursor: first.nextCursor,
        dependencies: {
          db: fixture.db[0],
          clock: fixedActionCoordinationClock(firstViewedAt),
          transactionOptions,
        },
      });
      assert.equal(second.groups[0]?.responses[0]?.interestId, late.id);
      assert.equal(second.groups[0]?.responses[0]?.presentationState, "VISIBLE");

      await assert.rejects(
        responses.listCreatorActionResponses({
          actorId: fixture.otherId,
          actionId,
          cursor: first.nextCursor,
          dependencies: {
            db: fixture.db[0],
            clock: fixedActionCoordinationClock(firstViewedAt),
            transactionOptions,
          },
        }),
        /unavailable/i,
      );
      await assert.rejects(
        responses.listCreatorActionResponses({
          actorId: fixture.creatorId,
          actionId,
          cursor: first.nextCursor,
          dependencies: {
            db: fixture.db[0],
            clock: fixedActionCoordinationClock(
              new Date(lateNow.getTime() + 16 * 60_000),
            ),
            transactionOptions,
          },
        }),
        responses.ActionResponsesCursorExpiredError,
      );

      await fixture.db[0].$transaction((tx) =>
        blocks.installPairPeerBlock(tx, {
          userId: fixture.creatorId,
          // `early` is outside the page selected by first.nextCursor. The
          // complete snapshot, not only the late page, must fail closed.
          blockedId: fixture.responderId,
          endedAt: new Date(firstViewedAt.getTime() + 2_000),
        }),
      );
      await assert.rejects(
        responses.listCreatorActionResponses({
          actorId: fixture.creatorId,
          actionId,
          cursor: first.nextCursor,
          dependencies: {
            db: fixture.db[0],
            clock: fixedActionCoordinationClock(firstViewedAt),
            transactionOptions,
          },
        }),
        /unavailable/i,
      );
      assert.equal(
        (
          await unblockUserForActor({
            db: fixture.db[0],
            blockerId: fixture.creatorId,
            blockedId: fixture.responderId,
          })
        )?.unblocked,
        true,
      );
      await assert.rejects(
        responses.listCreatorActionResponses({
          actorId: fixture.creatorId,
          actionId,
          cursor: first.nextCursor,
          dependencies: {
            db: fixture.db[0],
            clock: fixedActionCoordinationClock(firstViewedAt),
            transactionOptions,
          },
        }),
        /unavailable/i,
      );
    });
  },
);

test(
  "creator Responses invalidates the whole snapshot for off-page moderation and never revives it after deactivation",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const interests = await import("../../lib/v2/action-coordination/interest-service");
    const responses = await import("../../lib/v2/action-coordination/response-service");
    const {
      deactivateUserModerationBlock,
      installUserModerationBlock,
    } = await import("../../lib/connections/moderation-block-transaction");
    await withFixture(1, async (fixture) => {
      const actionId = fixture.actionId("responses-off-page-moderation");
      await seedAction(fixture.db[0], fixture.creatorId, actionId);
      const early = successfulInterest(
        await fixture.track(
          interests.createCreatorGatedInterest({
            actorId: fixture.responderId,
            actionId,
            interestSurface: "ACTION_DETAIL",
            idempotencyKey: "be07-moderation-page-early",
            capability: capableClient,
            dependencies: fixture.dependencies(fixture.db[0], true, baseNow),
          }),
        ),
        201,
      );
      const lateNow = new Date(baseNow.getTime() + 60_000);
      const late = successfulInterest(
        await fixture.track(
          interests.createCreatorGatedInterest({
            actorId: fixture.otherId,
            actionId,
            interestSurface: "ACTION_DETAIL",
            idempotencyKey: "be07-moderation-page-late",
            capability: capableClient,
            dependencies: fixture.dependencies(fixture.db[0], true, lateNow),
          }),
        ),
        201,
      );
      const first = await responses.listCreatorActionResponses({
        actorId: fixture.creatorId,
        actionId,
        limit: 1,
        dependencies: {
          db: fixture.db[0],
          clock: fixedActionCoordinationClock(lateNow),
          transactionOptions,
        },
      });
      assert.equal(first.groups[0]?.responses[0]?.interestId, early.id);
      assert.ok(first.nextCursor);

      const report = await fixture.db[0].report.create({
        data: {
          reporterId: fixture.creatorId,
          reportedUserId: fixture.responderId,
          classmatePostId: actionId,
          reason: "SPAM",
        },
        select: { id: true },
      });
      const installed = await fixture.db[0].$transaction((tx) =>
        installUserModerationBlock(tx, {
          userId: fixture.responderId,
          reportId: report.id,
          reason: "spam",
          createdByEmail: "admin@example.test",
          endedAt: new Date(lateNow.getTime() + 1_000),
        }),
      );
      await assert.rejects(
        responses.listCreatorActionResponses({
          actorId: fixture.creatorId,
          actionId,
          cursor: first.nextCursor,
          dependencies: {
            db: fixture.db[0],
            clock: fixedActionCoordinationClock(lateNow),
            transactionOptions,
          },
        }),
        /unavailable/i,
      );

      assert.equal(
        await deactivateUserModerationBlock(fixture.db[0], {
          userId: fixture.responderId,
          moderationBlockId: installed.moderationBlockId,
        }),
        true,
      );
      await assert.rejects(
        responses.listCreatorActionResponses({
          actorId: fixture.creatorId,
          actionId,
          cursor: first.nextCursor,
          dependencies: {
            db: fixture.db[0],
            clock: fixedActionCoordinationClock(lateNow),
            transactionOptions,
          },
        }),
        /unavailable/i,
      );
      const refreshed = await responses.listCreatorActionResponses({
        actorId: fixture.creatorId,
        actionId,
        dependencies: {
          db: fixture.db[0],
          clock: fixedActionCoordinationClock(lateNow),
          transactionOptions,
        },
      });
      assert.equal(refreshed.groups[0]?.responses[0]?.interestId, late.id);
      assert.deepEqual(refreshed.groups[0]?.counts, {
        totalActiveInterestCount: 1,
        visibleInterestCount: 1,
        unseenVisibleInterestCount: 1,
      });
    });
  },
);

type CommandResult = Awaited<
  ReturnType<
    typeof import("../../lib/v2/action-coordination/interest-service").createCreatorGatedInterest
  >
>;

type InterestDTO = import("../../lib/v2/action-coordination/interest-service").CreatorGatedInterestDTO;

function successfulInterest(result: CommandResult, expectedStatus?: number): InterestDTO {
  if (expectedStatus !== undefined) assert.equal(result.status, expectedStatus);
  assert.ok("body" in result, `unexpected command result: ${JSON.stringify(result)}`);
  assert.ok("interest" in result.body, `unexpected command body: ${JSON.stringify(result.body)}`);
  return result.body.interest as InterestDTO;
}

function errorCode(result: CommandResult): string | null {
  if (!("body" in result) || !("error" in result.body)) return null;
  const error = result.body.error;
  if (!error || typeof error !== "object" || Array.isArray(error)) return null;
  return "code" in error && typeof error.code === "string" ? error.code : null;
}

function errorRetryAfterSeconds(result: CommandResult): number | null {
  if (!("body" in result) || !("error" in result.body)) return null;
  const error = result.body.error;
  if (!error || typeof error !== "object" || Array.isArray(error)) return null;
  return "retryAfterSeconds" in error && typeof error.retryAfterSeconds === "number"
    ? error.retryAfterSeconds
    : null;
}

type Fixture = Readonly<{
  db: PrismaClient[];
  creatorId: string;
  responderId: string;
  otherId: string;
  actionId: (name: string) => string;
  dependencies: (
    db: PrismaClient,
    enrollmentAllowed?: boolean,
    now?: Date,
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
  };
  track: <T extends { identity: { recordId: string } }>(promise: Promise<T>) => Promise<T>;
}>;

async function withFixture(
  clientCount: number,
  run: (fixture: Fixture) => Promise<void>,
): Promise<void> {
  assert.ok(localDatabaseUrl);
  const db = Array.from(
    { length: clientCount },
    () => new PrismaClient({ datasourceUrl: localDatabaseUrl }),
  );
  const suffix = randomUUID().replaceAll("-", "");
  const creatorId = `be07-creator-${suffix}`;
  const responderId = `be07-responder-${suffix}`;
  const otherId = `be07-other-${suffix}`;
  const receiptIds = new Set<string>();
  const fixture: Fixture = {
    db,
    creatorId,
    responderId,
    otherId,
    actionId: (name) => `be07-${name}-${suffix}`,
    dependencies: (
      client,
      enrollmentAllowed = true,
      now = baseNow,
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
    }),
    track: async (promise) => {
      const result = await promise;
      receiptIds.add(result.identity.recordId);
      return result;
    },
  };
  try {
    await db[0].user.createMany({
      data: [
        { id: creatorId, username: `be07_creator_${suffix}`, nickname: "Creator", hashedPassword: "x", school: "TUM", onboardingComplete: true, verifiedStudent: true },
        { id: responderId, username: `be07_responder_${suffix}`, nickname: "Responder", hashedPassword: "x", school: "TUM", onboardingComplete: true, verifiedStudent: true },
        { id: otherId, username: `be07_other_${suffix}`, nickname: "Other", hashedPassword: "x", school: "TUM", onboardingComplete: true, verifiedStudent: true },
      ],
    });
    await run(fixture);
  } finally {
    await db[0].apiIdempotencyRecord.deleteMany({
      where: { id: { in: [...receiptIds] } },
    }).catch(() => undefined);
    await db[0].user.deleteMany({
      where: { id: { in: [creatorId, responderId, otherId] } },
    }).catch(() => undefined);
    await Promise.all(db.map((client) => client.$disconnect()));
  }
}

async function seedAction(
  db: PrismaClient,
  creatorId: string,
  actionId: string,
  options: { direct?: boolean; expiresAt?: Date } = {},
): Promise<void> {
  const snapshot = options.direct
    ? directConversationPolicySnapshot({
        capability: capableClient,
        experiment: {
          key: CREATOR_GATED_ACTION_EXPERIMENT_KEY,
          variant: "CONTROL",
        },
        now: baseNow,
      })
    : creatorGatedPolicySnapshot({
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
      body: "This body must never enter the Interest DTO.",
      visibility: "SCHOOL_ONLY",
      status: "ACTIVE",
      startsAt: new Date("2026-09-02T12:00:00.000Z"),
      endsAt: new Date("2026-09-02T13:00:00.000Z"),
      location: "Mensa",
      expiresAt: options.expiresAt ?? new Date("2026-09-05T00:00:00.000Z"),
      ...snapshot,
      clientCapabilitySnapshot: snapshot.clientCapabilitySnapshot!,
    },
  });
}

async function assertNoChatArtifacts(db: PrismaClient, fixture: Fixture) {
  const pair = [fixture.creatorId, fixture.responderId];
  const [connections, messages, realtime] = await Promise.all([
    db.connection.count({
      where: {
        OR: [
          { userAId: pair[0], userBId: pair[1] },
          { userAId: pair[1], userBId: pair[0] },
        ],
      },
    }),
    db.message.count({ where: { senderId: { in: pair } } }),
    db.chatRealtimeEvent.count({ where: { senderId: { in: pair } } }),
  ]);
  assert.deepEqual({ connections, messages, realtime }, { connections: 0, messages: 0, realtime: 0 });
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
