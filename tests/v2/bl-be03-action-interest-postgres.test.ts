import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { PrismaClient, type User } from "@prisma/client";

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
  "concurrent DIRECT create/reactivate owns one transition and preserves origin/Action attribution",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    const { createActionInterest, withdrawActionInterest } = await import(
      "../../lib/v2/action-interest"
    );
    const db = new PrismaClient({ datasourceUrl: localDatabaseUrl! });
    const suffix = randomUUID().replaceAll("-", "");
    const creatorId = `blbe03creator-${suffix}`;
    const responderId = `blbe03responder-${suffix}`;
    const postId = `blbe03post-${suffix}`;
    const transactionOptions = { maxWait: 10_000, timeout: 20_000 } as const;

    try {
      await db.user.createMany({
        data: [
          {
            id: creatorId,
            username: `blbe03_creator_${suffix}`,
            hashedPassword: "not-used",
            nickname: "Creator",
            school: "TUM",
            onboardingComplete: true,
            verifiedStudent: true,
          },
          {
            id: responderId,
            username: `blbe03_responder_${suffix}`,
            hashedPassword: "not-used",
            nickname: "Responder",
            school: "TUM",
            onboardingComplete: true,
            verifiedStudent: true,
          },
        ],
      });
      await db.classmatePost.create({
        data: {
          id: postId,
          userId: creatorId,
          city: "Munich",
          category: "MEALS",
          title: "Original lunch",
          visibility: "CITY_INTERNATIONALS",
          expiresAt: new Date(Date.now() + 86_400_000),
          coordinationPolicy: "DIRECT_CONVERSATION_V1",
          policySchemaVersion: 1,
          policyParametersSnapshot: {},
          experimentKeySnapshot: "action_to_plan_creator_gated_v2",
          experimentVariantSnapshot: "CONTROL",
          clientCapabilitySnapshot: {
            capability: "action-coordination-v2",
            supported: true,
          },
          policySnapshottedAt: new Date(),
        },
      });
      const responder = (await db.user.findUnique({
        where: { id: responderId },
      })) as User;

      const create = () =>
        db.$transaction(
          (tx) =>
            createActionInterest({
              user: responder,
              postId,
              experimentVariant: "TREATMENT",
              tx,
            }),
          transactionOptions,
        );
      const firstRace = await Promise.all([create(), create()]);
      assert.equal(firstRace.filter((result) => result.messageId).length, 1);
      assert.equal(firstRace.filter((result) => result.notification).length, 1);
      const canonicalMessageId = firstRace.find((result) => result.messageId)?.messageId;
      assert.ok(canonicalMessageId);

      await db.classmatePost.update({
        where: { id: postId },
        data: { title: "Edited lunch" },
      });
      await db.$transaction(
        (tx) =>
          withdrawActionInterest({
            userId: responderId,
            postId,
            experimentVariant: "TREATMENT",
            tx,
          }),
        transactionOptions,
      );
      const reactivationRace = await Promise.all([create(), create()]);
      assert.equal(
        reactivationRace.filter((result) => result.messageId).length,
        1,
      );
      assert.equal(
        reactivationRace.filter((result) => result.notification).length,
        1,
      );
      assert.equal(
        reactivationRace.find((result) => result.messageId)?.messageId,
        canonicalMessageId,
      );

      const interest = await db.actionInterest.findUniqueOrThrow({
        where: {
          userId_classmatePostId: {
            userId: responderId,
            classmatePostId: postId,
          },
        },
      });
      assert.equal(
        (interest.originSnapshot as { title: string }).title,
        "Original lunch",
      );
      assert.equal(interest.status, "ACTIVE");
      assert.equal(interest.directTransitionGeneration, 3);
      assert.ok(interest.connectionId);

      const [cards, funnel] = await Promise.all([
        db.message.findMany({
          where: { actionInterestId: interest.id, type: "ACTION_INTEREST_CARD" },
          select: { id: true },
        }),
        db.productFunnelEvent.findMany({
          where: { actionInterestId: interest.id },
          orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
          select: {
            name: true,
            businessEventKey: true,
            occurredAt: true,
            coordinationPolicy: true,
            policySchemaVersion: true,
            experimentKey: true,
            experimentVariant: true,
          },
        }),
      ]);
      assert.equal(cards.length, 1);
      assert.equal(cards[0]?.id, canonicalMessageId);
      assert.equal(
        funnel.filter((event) => event.name === "ACTION_INTERESTED").length,
        2,
      );
      const interestedEvents = funnel.filter(
        (event) => event.name === "ACTION_INTERESTED",
      );
      assert.notEqual(
        interestedEvents[0]?.businessEventKey,
        interestedEvents[1]?.businessEventKey,
      );
      assert.ok(
        interestedEvents[0] &&
          interestedEvents[1] &&
          interestedEvents[1].occurredAt > interestedEvents[0].occurredAt,
      );
      assert.equal(
        funnel.filter((event) => event.name === "ACTION_INTEREST_WITHDRAWN")
          .length,
        1,
      );
      for (const event of funnel) {
        assert.equal(event.coordinationPolicy, "DIRECT_CONVERSATION_V1");
        assert.equal(event.policySchemaVersion, 1);
        assert.equal(
          event.experimentKey,
          "action_to_plan_creator_gated_v2",
        );
        assert.equal(event.experimentVariant, "CONTROL");
      }

      const repeatedActive = await create();
      assert.equal(repeatedActive.messageId, null);
      assert.equal(
        (
          await db.actionInterest.findUniqueOrThrow({
            where: { id: interest.id },
            select: { directTransitionGeneration: true },
          })
        ).directTransitionGeneration,
        3,
      );

      // ProductFunnelEvent has a 180-day retention policy. Purging every prior
      // event must not reset transition identity or suppress the next event.
      await db.productFunnelEvent.deleteMany({
        where: { actionInterestId: interest.id },
      });
      await db.$transaction(
        (tx) =>
          withdrawActionInterest({
            userId: responderId,
            postId,
            experimentVariant: "TREATMENT",
            tx,
          }),
        transactionOptions,
      );
      await db.$transaction(
        (tx) =>
          withdrawActionInterest({
            userId: responderId,
            postId,
            experimentVariant: "TREATMENT",
            tx,
          }),
        transactionOptions,
      );
      assert.equal(
        (
          await db.actionInterest.findUniqueOrThrow({
            where: { id: interest.id },
            select: { directTransitionGeneration: true },
          })
        ).directTransitionGeneration,
        4,
      );
      const postRetentionReactivation = await create();
      assert.equal(postRetentionReactivation.messageId, canonicalMessageId);
      const repeatedPostRetentionActive = await create();
      assert.equal(repeatedPostRetentionActive.messageId, null);

      const [finalInterest, retainedEvents, finalCards] = await Promise.all([
        db.actionInterest.findUniqueOrThrow({
          where: { id: interest.id },
          select: { directTransitionGeneration: true },
        }),
        db.productFunnelEvent.findMany({
          where: { actionInterestId: interest.id },
          orderBy: { businessEventKey: "asc" },
          select: { name: true, businessEventKey: true },
        }),
        db.message.findMany({
          where: { actionInterestId: interest.id, type: "ACTION_INTEREST_CARD" },
          select: { id: true },
        }),
      ]);
      assert.equal(finalInterest.directTransitionGeneration, 5);
      assert.deepEqual(
        retainedEvents.map((event) => event.name).sort(),
        ["ACTION_INTERESTED", "ACTION_INTEREST_WITHDRAWN"],
      );
      assert.equal(new Set(retainedEvents.map((event) => event.businessEventKey)).size, 2);
      assert.ok(
        retainedEvents.every((event) =>
          event.businessEventKey?.startsWith(
            `direct-transition-v2:${interest.id}:generation:`,
          ),
        ),
      );
      assert.ok(
        retainedEvents.some((event) =>
          event.businessEventKey?.includes(":generation:4:withdrawn"),
        ),
      );
      assert.ok(
        retainedEvents.some((event) =>
          event.businessEventKey?.includes(":generation:5:interested"),
        ),
      );
      assert.deepEqual(finalCards, [{ id: canonicalMessageId }]);
    } finally {
      await db.user.deleteMany({
        where: { id: { in: [creatorId, responderId] } },
      });
      await db.$disconnect();
    }
  },
);

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
