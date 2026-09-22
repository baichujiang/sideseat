import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { ConnectionStatus, PrismaClient, type User } from "@prisma/client";

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

test("BL-DB-04 PostgreSQL tests refuse non-local database targets", () => {
  assert.equal(
    localPostgresUrl("postgresql://user:password@example.invalid/db"),
    undefined,
  );
  assert.equal(
    localPostgresUrl(
      "postgresql://user:password@localhost:5433/db?host=production.example",
    ),
    undefined,
  );
  assert.equal(
    localPostgresUrl("postgresql://user:password@127.0.0.1:5433/db?schema=public"),
    "postgresql://user:password@127.0.0.1:5433/db?schema=public",
  );
});

test(
  "reverse contacts, schedule-share and open writers converge on one canonical Connection",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const { addContact } = await import("../../lib/api/v1/contacts-service");
    const { openConversationForUser } = await import(
      "../../lib/connections/open-conversation"
    );
    const { ensureActiveConnectionForScheduleShare } = await import(
      "../../lib/schedule-share/ensure-connection-for-schedule-share"
    );
    const clients = makeClients(3);
    const suffix = randomUUID().replaceAll("-", "");
    const firstId = `db04-a-${suffix}`;
    const secondId = `db04-b-${suffix}`;
    try {
      await seedUsers(clients[0], [firstId, secondId], suffix);
      const second = (await clients[0].user.findUniqueOrThrow({
        where: { id: secondId },
      })) as User;

      const [contact, schedule, opened] = await Promise.all([
        addContact({ userId: firstId, peerId: secondId, db: clients[0] }),
        ensureActiveConnectionForScheduleShare(clients[1], secondId, firstId),
        openConversationForUser(second, { peerId: firstId }, clients[2]),
      ]);
      assert.equal(schedule.ok, true);
      assert.equal(
        [contact.created, schedule.created, opened.created].filter(Boolean).length,
        1,
      );
      assert.equal(
        new Set([contact.connectionId, schedule.connectionId, opened.connectionId])
          .size,
        1,
      );

      const rows = await clients[0].connection.findMany({
        where: {
          OR: [
            { userAId: firstId, userBId: secondId },
            { userAId: secondId, userBId: firstId },
          ],
        },
      });
      assert.equal(rows.length, 1);
      assert.equal(rows[0].userAId, firstId);
      assert.equal(rows[0].userBId, secondId);
      assert.equal(rows[0].status, ConnectionStatus.ACTIVE);
    } finally {
      await cleanupUsers(clients[0], [firstId, secondId]);
      await disconnectAll(clients);
    }
  },
);

test(
  "canonical writer re-reads an uncommitted rolling-deploy legacy winner without aborting",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const { openConversationForUser } = await import(
      "../../lib/connections/open-conversation"
    );
    const [legacyDb, canonicalDb] = makeClients(2);
    const suffix = randomUUID().replaceAll("-", "");
    const firstId = `db04-overlap-a-${suffix}`;
    const secondId = `db04-overlap-b-${suffix}`;
    try {
      await seedUsers(legacyDb, [firstId, secondId], suffix);
      const actor = (await legacyDb.user.findUniqueOrThrow({
        where: { id: firstId },
      })) as User;
      const legacyInserted = deferred<string>();
      const releaseLegacy = deferred<void>();
      const legacyWriter = legacyDb.$transaction(
        async (tx) => {
          // Deliberately model a rolling-deploy writer that knows the unique
          // index but not the new advisory-lock/canonical-order primitive.
          const row = await tx.connection.create({
            data: {
              userAId: secondId,
              userBId: firstId,
              status: "ACTIVE",
            },
            select: { id: true },
          });
          legacyInserted.resolve(row.id);
          await releaseLegacy.promise;
          return row.id;
        },
        transactionOptions,
      );
      const winnerId = await legacyInserted.promise;

      let canonicalFinished = false;
      const canonicalWriter = openConversationForUser(
        actor,
        { peerId: secondId },
        canonicalDb,
      ).then((result) => {
        canonicalFinished = true;
        return result;
      });
      await delay(75);
      assert.equal(canonicalFinished, false);
      releaseLegacy.resolve();
      const [, canonical] = await Promise.all([legacyWriter, canonicalWriter]);
      assert.equal(canonical.connectionId, winnerId);
      assert.equal(canonical.created, false);
      assert.equal(
        await legacyDb.connection.count({
          where: {
            OR: [
              { userAId: firstId, userBId: secondId },
              { userAId: secondId, userBId: firstId },
            ],
          },
        }),
        1,
      );
    } finally {
      await cleanupUsers(legacyDb, [firstId, secondId]);
      await disconnectAll([legacyDb, canonicalDb]);
    }
  },
);

test(
  "terminal pairs never revive and an outer contact transaction rolls creation back",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const { addContact, ContactsServiceError } = await import(
      "../../lib/api/v1/contacts-service"
    );
    const { openConversationForUser, OpenConversationError } = await import(
      "../../lib/connections/open-conversation"
    );
    const { ensureActiveConnectionForScheduleShare } = await import(
      "../../lib/schedule-share/ensure-connection-for-schedule-share"
    );
    const db = new PrismaClient({ datasourceUrl: localDatabaseUrl! });
    const suffix = randomUUID().replaceAll("-", "");
    const firstId = `db04-terminal-a-${suffix}`;
    const secondId = `db04-terminal-b-${suffix}`;
    const rollbackA = `db04-rollback-a-${suffix}`;
    const rollbackB = `db04-rollback-b-${suffix}`;
    try {
      await seedUsers(db, [firstId, secondId, rollbackA, rollbackB], suffix);
      await db.connection.create({
        data: {
          userAId: firstId,
          userBId: secondId,
          status: ConnectionStatus.ENDED,
          endedAt: new Date(),
        },
      });
      const first = (await db.user.findUniqueOrThrow({
        where: { id: firstId },
      })) as User;

      await assert.rejects(
        openConversationForUser(first, { peerId: secondId }, db),
        (cause) =>
          cause instanceof OpenConversationError &&
          cause.code === "CONVERSATION_ENDED",
      );
      await assert.rejects(
        addContact({ userId: firstId, peerId: secondId, db }),
        (cause) =>
          cause instanceof ContactsServiceError && cause.code === "CONFLICT",
      );
      const schedule = await ensureActiveConnectionForScheduleShare(
        db,
        firstId,
        secondId,
      );
      assert.deepEqual(schedule, {
        ok: false,
        reason: "conversation_unavailable",
      });
      assert.equal(
        await db.connection.count({
          where: {
            OR: [
              { userAId: firstId, userBId: secondId },
              { userAId: secondId, userBId: firstId },
            ],
          },
        }),
        1,
      );

      await assert.rejects(
        db.$transaction(
          async (tx) => {
            await addContact({ userId: rollbackA, peerId: rollbackB, db: tx });
            throw new Error("rollback after canonical create");
          },
          transactionOptions,
        ),
        /rollback after canonical create/,
      );
      assert.equal(
        await db.connection.count({
          where: {
            OR: [
              { userAId: rollbackA, userBId: rollbackB },
              { userAId: rollbackB, userBId: rollbackA },
            ],
          },
        }),
        0,
      );
    } finally {
      await cleanupUsers(db, [firstId, secondId, rollbackA, rollbackB]);
      await db.$disconnect();
    }
  },
);

test(
  "self-notes concurrent writers create one row through their separate lock domain",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const { findOrCreateSelfNotesConnection } = await import(
      "../../lib/queries/self-notes-connection"
    );
    const db = new PrismaClient({ datasourceUrl: localDatabaseUrl! });
    const suffix = randomUUID().replaceAll("-", "");
    const userId = `db04-self-${suffix}`;
    try {
      await seedUsers(db, [userId], suffix);
      const results = await Promise.all(
        Array.from({ length: 4 }, () => findOrCreateSelfNotesConnection(userId)),
      );
      assert.equal(results.filter((result) => result.created).length, 1);
      assert.equal(new Set(results.map((result) => result.connectionId)).size, 1);
      assert.equal(
        await db.connection.count({ where: { userAId: userId, userBId: userId } }),
        1,
      );
    } finally {
      await cleanupUsers(db, [userId]);
      await db.$disconnect();
    }
  },
);

test(
  "schedule-share accepted precheck rolls back a just-created Connection",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const { submitScheduleSharePlanProposal } = await import(
      "../../lib/schedule-share/create-plan-from-guest-proposal"
    );
    const db = new PrismaClient({ datasourceUrl: localDatabaseUrl! });
    const suffix = randomUUID().replaceAll("-", "");
    const ownerId = `db04-share-owner-${suffix}`;
    const proposerId = `db04-share-proposer-${suffix}`;
    const linkId = `db04-share-link-${suffix}`;
    const startTime = new Date(Date.now() + 86_400_000);
    const endTime = new Date(startTime.getTime() + 3_600_000);
    try {
      await seedUsers(db, [ownerId, proposerId], suffix);
      await db.scheduleShareLink.create({
        data: {
          id: linkId,
          ownerUserId: ownerId,
          tokenHash: `db04-token-${suffix}`,
          rangeStart: startTime,
          rangeEnd: new Date(endTime.getTime() + 86_400_000),
          revealConfig: {},
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
      await db.scheduleShareGuestProposal.create({
        data: {
          scheduleShareLinkId: linkId,
          proposerUserId: proposerId,
          guestDisplayName: "Already accepted",
          title: "Existing",
          startTime,
          endTime,
          status: "ACCEPTED",
        },
      });

      const result = await submitScheduleSharePlanProposal(db, {
        scheduleShareLinkId: linkId,
        ownerUserId: ownerId,
        proposerUserId: proposerId,
        title: "Should roll back",
        note: null,
        location: null,
        startTime,
        endTime,
        guestDisplayName: "Proposer",
        createdFromIp: "127.0.0.1",
        userAgent: "BL-DB-04 test",
      });
      assert.deepEqual(result, { ok: false, reason: "already_accepted" });
      assert.equal(
        await db.connection.count({
          where: {
            OR: [
              { userAId: ownerId, userBId: proposerId },
              { userAId: proposerId, userBId: ownerId },
            ],
          },
        }),
        0,
      );
    } finally {
      await cleanupUsers(db, [ownerId, proposerId]);
      await db.$disconnect();
    }
  },
);

test(
  "Block and canonical create are linearizable in both commit orders",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const { installPairPeerBlock } = await import(
      "../../lib/api/v1/pair-block-transaction"
    );
    const { withCanonicalConnectionScope } = await import(
      "../../lib/connections/canonical-connection"
    );
    const { openConversationForUser, OpenConversationError } = await import(
      "../../lib/connections/open-conversation"
    );
    const [firstDb, secondDb] = makeClients(2);
    const suffix = randomUUID().replaceAll("-", "");
    const createFirstA = `db04-create-first-a-${suffix}`;
    const createFirstB = `db04-create-first-b-${suffix}`;
    const blockFirstA = `db04-block-first-a-${suffix}`;
    const blockFirstB = `db04-block-first-b-${suffix}`;
    const allIds = [createFirstA, createFirstB, blockFirstA, blockFirstB];
    try {
      await seedUsers(firstDb, allIds, suffix);

      const createdInside = deferred<void>();
      const releaseCreate = deferred<void>();
      const createFirst = firstDb.$transaction(
        (tx) =>
          withCanonicalConnectionScope(
            tx,
            createFirstA,
            createFirstB,
            async (scope) => {
              await scope.createActive();
              createdInside.resolve();
              await releaseCreate.promise;
            },
          ),
        transactionOptions,
      );
      await createdInside.promise;
      let createFirstBlockFinished = false;
      const blockAfterCreate = secondDb
        .$transaction(
          (tx) =>
            installPairPeerBlock(tx, {
              userId: createFirstA,
              blockedId: createFirstB,
              endedAt: new Date(),
            }),
          transactionOptions,
        )
        .then((result) => {
          createFirstBlockFinished = true;
          return result;
        });
      await delay(75);
      assert.equal(createFirstBlockFinished, false);
      releaseCreate.resolve();
      const [, blockResult] = await Promise.all([createFirst, blockAfterCreate]);
      assert.equal(blockResult.kind, "blocked");
      const terminal = await firstDb.connection.findFirstOrThrow({
        where: {
          OR: [
            { userAId: createFirstA, userBId: createFirstB },
            { userAId: createFirstB, userBId: createFirstA },
          ],
        },
      });
      assert.equal(terminal.status, ConnectionStatus.BLOCKED);

      const blockedInside = deferred<void>();
      const releaseBlock = deferred<void>();
      const blockFirst = firstDb.$transaction(
        async (tx) => {
          const result = await installPairPeerBlock(tx, {
            userId: blockFirstA,
            blockedId: blockFirstB,
            endedAt: new Date(),
          });
          blockedInside.resolve();
          await releaseBlock.promise;
          return result;
        },
        transactionOptions,
      );
      await blockedInside.promise;
      const actor = (await firstDb.user.findUniqueOrThrow({
        where: { id: blockFirstA },
      })) as User;
      let openFinished = false;
      const openAfterBlock = openConversationForUser(
        actor,
        { peerId: blockFirstB },
        secondDb,
      ).then(
        (value) => {
          openFinished = true;
          return { value } as const;
        },
        (cause: unknown) => {
          openFinished = true;
          return { cause } as const;
        },
      );
      await delay(75);
      assert.equal(openFinished, false);
      releaseBlock.resolve();
      const [, openResult] = await Promise.all([blockFirst, openAfterBlock]);
      assert.ok("cause" in openResult);
      assert.ok(openResult.cause instanceof OpenConversationError);
      assert.equal(openResult.cause.code, "CONTENT_RESTRICTED");
      assert.equal(
        await firstDb.connection.count({
          where: {
            OR: [
              { userAId: blockFirstA, userBId: blockFirstB },
              { userAId: blockFirstB, userBId: blockFirstA },
            ],
          },
        }),
        0,
      );
    } finally {
      await cleanupUsers(firstDb, allIds);
      await disconnectAll([firstDb, secondDb]);
    }
  },
);

test(
  "user-global moderation and canonical create are linearizable in both commit orders",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const { withCanonicalConnectionScope } = await import(
      "../../lib/connections/canonical-connection"
    );
    const { installUserModerationBlock } = await import(
      "../../lib/connections/moderation-block-transaction"
    );
    const { openConversationForUser, OpenConversationError } = await import(
      "../../lib/connections/open-conversation"
    );
    const [firstDb, secondDb] = makeClients(2);
    const suffix = randomUUID().replaceAll("-", "");
    const createFirstA = `db04-mod-create-a-${suffix}`;
    const createFirstB = `db04-mod-create-b-${suffix}`;
    const blockFirstA = `db04-mod-block-a-${suffix}`;
    const blockFirstB = `db04-mod-block-b-${suffix}`;
    const allIds = [createFirstA, createFirstB, blockFirstA, blockFirstB];
    const createFirstReportId = `db04-mod-report-create-${suffix}`;
    const blockFirstReportId = `db04-mod-report-block-${suffix}`;
    try {
      await seedUsers(firstDb, allIds, suffix);
      await firstDb.report.createMany({
        data: [
          {
            id: createFirstReportId,
            reporterId: createFirstA,
            reportedUserId: createFirstB,
            reason: "SPAM",
          },
          {
            id: blockFirstReportId,
            reporterId: blockFirstA,
            reportedUserId: blockFirstB,
            reason: "SPAM",
          },
        ],
      });

      const createdInside = deferred<void>();
      const releaseCreate = deferred<void>();
      const createFirst = firstDb.$transaction(
        (tx) =>
          withCanonicalConnectionScope(
            tx,
            createFirstA,
            createFirstB,
            async (scope) => {
              await scope.createActive();
              createdInside.resolve();
              await releaseCreate.promise;
            },
          ),
        transactionOptions,
      );
      await createdInside.promise;
      let moderationFinished = false;
      const moderateAfterCreate = secondDb
        .$transaction(
          (tx) =>
            installUserModerationBlock(tx, {
              userId: createFirstB,
              reportId: createFirstReportId,
              reason: "test",
              createdByEmail: "test@sideseat.invalid",
              endedAt: new Date(),
            }),
          transactionOptions,
        )
        .then((result) => {
          moderationFinished = true;
          return result;
        });
      await delay(75);
      assert.equal(moderationFinished, false);
      releaseCreate.resolve();
      await Promise.all([createFirst, moderateAfterCreate]);
      const terminal = await firstDb.connection.findFirstOrThrow({
        where: {
          OR: [
            { userAId: createFirstA, userBId: createFirstB },
            { userAId: createFirstB, userBId: createFirstA },
          ],
        },
      });
      assert.equal(terminal.status, ConnectionStatus.BLOCKED);
      assert.equal(
        await firstDb.moderationBlock.count({
          where: { userId: createFirstB, isActive: true },
        }),
        1,
      );
      // A pre-existing barrier still performs convergence; it is not an early
      // return that could leave a legacy/raced ACTIVE row behind.
      await firstDb.connection.update({
        where: { id: terminal.id },
        data: { status: "ACTIVE", endedAt: null, endedById: null },
      });
      const converged = await firstDb.$transaction((tx) =>
        installUserModerationBlock(tx, {
          userId: createFirstB,
          reportId: createFirstReportId,
          reason: "test",
          createdByEmail: "test@sideseat.invalid",
          endedAt: new Date(),
        }),
      );
      assert.equal(converged.created, false);
      assert.equal(
        (
          await firstDb.connection.findUniqueOrThrow({
            where: { id: terminal.id },
            select: { status: true },
          })
        ).status,
        ConnectionStatus.BLOCKED,
      );

      const moderatedInside = deferred<void>();
      const releaseModeration = deferred<void>();
      const moderateFirst = firstDb.$transaction(
        async (tx) => {
          const result = await installUserModerationBlock(tx, {
            userId: blockFirstB,
            reportId: blockFirstReportId,
            reason: "test",
            createdByEmail: "test@sideseat.invalid",
            endedAt: new Date(),
          });
          moderatedInside.resolve();
          await releaseModeration.promise;
          return result;
        },
        transactionOptions,
      );
      await moderatedInside.promise;
      const actor = (await firstDb.user.findUniqueOrThrow({
        where: { id: blockFirstA },
      })) as User;
      let openFinished = false;
      const openAfterModeration = openConversationForUser(
        actor,
        { peerId: blockFirstB },
        secondDb,
      ).then(
        (value) => {
          openFinished = true;
          return { value } as const;
        },
        (cause: unknown) => {
          openFinished = true;
          return { cause } as const;
        },
      );
      await delay(75);
      assert.equal(openFinished, false);
      releaseModeration.resolve();
      const [, openResult] = await Promise.all([
        moderateFirst,
        openAfterModeration,
      ]);
      assert.ok("cause" in openResult);
      assert.ok(openResult.cause instanceof OpenConversationError);
      assert.equal(openResult.cause.code, "CONTENT_RESTRICTED");
      assert.equal(
        await firstDb.connection.count({
          where: {
            OR: [
              { userAId: blockFirstA, userBId: blockFirstB },
              { userAId: blockFirstB, userBId: blockFirstA },
            ],
          },
        }),
        0,
      );
      assert.equal(
        await firstDb.moderationBlock.count({
          where: { userId: blockFirstB, isActive: true },
        }),
        1,
      );
    } finally {
      await cleanupUsers(firstDb, allIds);
      await disconnectAll([firstDb, secondDb]);
    }
  },
);

function makeClients(count: number): PrismaClient[] {
  return Array.from(
    { length: count },
    () => new PrismaClient({ datasourceUrl: localDatabaseUrl! }),
  );
}

async function seedUsers(
  db: PrismaClient,
  ids: readonly string[],
  suffix: string,
): Promise<void> {
  await db.user.createMany({
    data: ids.map((id, index) => ({
      id,
      username: `db04_${index}_${suffix}_${id.slice(-6)}`,
      hashedPassword: "not-used",
      school: "TUM",
      onboardingComplete: true,
      verifiedStudent: true,
    })),
  });
}

async function cleanupUsers(
  db: PrismaClient,
  ids: readonly string[],
): Promise<void> {
  await db.user.deleteMany({ where: { id: { in: [...ids] } } });
}

async function disconnectAll(clients: readonly PrismaClient[]): Promise<void> {
  await Promise.all(clients.map((client) => client.$disconnect()));
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    if (parsed.searchParams.has("host") || parsed.searchParams.has("port")) {
      return undefined;
    }
    return value;
  } catch {
    return undefined;
  }
}
