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
const nextServerStub = fileURLToPath(
  new URL("./next-server-after-test-stub.cjs", import.meta.url),
);
commonJsModule._resolveFilename = function resolveForServerIntegrationTest(
  request,
  parent,
  isMain,
  options,
) {
  if (request === "server-only") return serverOnlyStub;
  if (request === "next/server") return nextServerStub;
  return resolveFilename.call(this, request, parent, isMain, options);
};


const local = process.env.DATABASE_URL;
const isLocal = local && ["127.0.0.1", "localhost", "::1"].includes(new URL(local).hostname);

test("bookmark → first message → recipient reply preserves context and opens one chat", { skip: !isLocal }, async () => {
  const service = await import("../../lib/v2/mutual-opportunities");
  const db = new PrismaClient();
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const users = [`request-${suffix}-a`, `request-${suffix}-b`, `request-${suffix}-c`];
  const detailCourseId = `details-${suffix}`;
  try {
    await db.user.createMany({ data: users.map((id, index) => ({ id, username: id, nickname: ["Alex", "Mia", "Lee"][index], hashedPassword: "fixture" })) });
    const start = new Date(Date.now() + 24 * 3600000);
    const end = new Date(start.getTime() + 3600000);
    const intents = await Promise.all(users.map(userId => db.weeklyIntent.create({ data: {
      userId, topic: "COFFEE", activityText: `Coffee with ${userId}`, note: "PRIVATE_NOTE",
      timeWindows: [{ startAt: start.toISOString(), endAt: end.toISOString() }],
    } })));
    async function opportunity(i: number, j: number) {
      return db.mutualOpportunity.create({ data: {
        userAId: users[i], userBId: users[j], intentAId: intents[i].id, intentBId: intents[j].id,
        topic: "COFFEE", activityText: "Coffee", startsAt: start, endsAt: end, expiresAt: start, contextSnapshot: {},
      } });
    }
    const row = await opportunity(0, 1);
    const act = (userId: string, action: "BOOKMARK" | "UNBOOKMARK" | "SEND" | "REPLY" | "IGNORE", body?: string) =>
      service.interactWithOpportunity({ userId, opportunityId: row.id, action, body });
    assert.equal((await act(users[0], "BOOKMARK")).isBookmarked, true);
    // Detail projection follows the peer, including a course not shared by the pair.
    await db.user.update({ where: { id: users[1] }, data: { school: "TUM" } });
    await db.userLanguage.create({ data: { userId: users[1], tag: "GERMAN", proficiency: "FLUENT" } });
    await db.course.create({ data: { id: detailCourseId, name: "Algorithms", code: "IN0007", school: "TUM", semesterLabel: "WS26" } });
    await db.weeklyIntent.update({ where: { id: intents[1].id }, data: {
      courseId: detailCourseId, exploreVisible: true, note: "  Public activity description " + "x".repeat(100),
    } });
    const details = (await service.listMutualOpportunities(users[0], false)).opportunities.find(item => item.id === row.id)!;
    assert.equal(details.peer.campus, "TUM");
    assert.deepEqual(details.peer.languages, ["GERMAN"]);
    assert.deepEqual(details.peer.sharedLanguages, []);
    assert.equal(details.course, null);
    assert.deepEqual(details.peerIntention?.course, { code: "IN0007", name: "Algorithms" });
    assert.equal(details.peerIntention?.descriptionPreview, ("Public activity description " + "x".repeat(100)).slice(0, 96));
    await db.weeklyIntent.update({ where: { id: intents[1].id }, data: { exploreVisible: false, note: "PRIVATE_NOTE" } });
    const privateDetails = (await service.listMutualOpportunities(users[0], false)).opportunities.find(item => item.id === row.id)!;
    assert.equal(privateDetails.peerIntention?.descriptionPreview, null);
    const peerList = await service.listMutualOpportunities(users[1], false);
    const reverse = peerList.opportunities.find(item => item.id === row.id)!;
    assert.equal(reverse.peer.campus, null);
    assert.deepEqual(reverse.peer.languages, []);
    assert.equal(reverse.peerIntention?.course, null);
    assert.equal(reverse.peerIntention?.descriptionPreview, null);
    assert.equal(peerList.opportunities.find(item => item.id === row.id)?.isBookmarked, false);
    assert.equal(await db.connection.count({ where: { userAId: { in: users } } }), 0);
    await assert.rejects(act(users[2], "SEND", "Unauthorized"), { code: "NOT_FOUND" });
    const results = await Promise.allSettled([act(users[0], "SEND", "Hi, tomorrow afternoon?"), act(users[0], "SEND", "Duplicate")]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    const pending = await service.listOpportunityMessageRequests(users[1]);
    assert.equal(pending.length, 1);
    const original = pending[0].messageRequest!;
    assert.equal((await service.getOpportunityConversation(users[0], row.id)).messageRequest?.body, original.body);
    assert.equal((await service.listOpportunityMessageRequests(users[0])).some(item => item.id === row.id), true);
    await assert.rejects(service.getOpportunityConversation(users[2], row.id), { code: "NOT_FOUND" });
    assert.equal(original.direction, "INCOMING");
    assert.equal((original.intention as { activity: { activityText: string } }).activity.activityText, intents[1].activityText);
    assert.ok(!JSON.stringify(pending).includes("PRIVATE_NOTE"));
    assert.equal(await db.connection.count({ where: { OR: [{ userAId: users[0] }, { userBId: users[0] }] } }), 0);
    await assert.rejects(act(users[0], "REPLY", "Self acceptance"), { code: "DECISION_FINAL" });
    await assert.rejects(service.decideMutualOpportunity({ userId: users[1], opportunityId: row.id, decision: "YES" }), { code: "DECISION_FINAL" });
    const reply = await act(users[1], "REPLY", "Yes, 3 pm works!");
    assert.equal(reply.state, "READY_TO_COORDINATE");
    assert.ok(reply.coordination);
    assert.equal((await service.getOpportunityConversation(users[0], row.id)).coordination?.connectionId, reply.coordination.connectionId);
    const messages = await db.message.findMany({ where: { connectionId: reply.coordination.connectionId }, orderBy: { createdAt: "asc" } });
    assert.deepEqual(messages.map(message => message.type), ["MUTUAL_OPPORTUNITY_CARD", "TEXT", "TEXT"]);
    assert.deepEqual(messages.map(message => message.body), ["", original.body, "Yes, 3 pm works!"]);
    assert.deepEqual(messages.map(message => message.senderId), [users[0], users[0], users[1]]);
    assert.ok((await db.connection.findUniqueOrThrow({ where: { id: reply.coordination.connectionId } })).replyLimitUnlockedAt);
    assert.equal((await service.listOpportunityMessageRequests(users[1])).length, 0);
    await assert.rejects(act(users[1], "REPLY", "Duplicate reply"), { code: "NO_LONGER_AVAILABLE" });

    const ignored = await opportunity(0, 2);
    await service.interactWithOpportunity({ userId: users[0], opportunityId: ignored.id, action: "SEND", body: "Hello" });
    await service.interactWithOpportunity({ userId: users[2], opportunityId: ignored.id, action: "IGNORE" });
    assert.equal((await service.listOpportunityMessageRequests(users[2])).length, 0);
    const sentHistory = (await service.listOpportunityMessageRequests(users[0])).find(item => item.id === ignored.id);
    assert.equal(sentHistory?.messageRequest?.body, "Hello");
    assert.equal(sentHistory?.messageRequest?.status, "PENDING", "ignoring remains private to the recipient");
    await assert.rejects(service.interactWithOpportunity({ userId: users[0], opportunityId: ignored.id, action: "SEND", body: "Again" }), { code: "NO_LONGER_AVAILABLE" });
    assert.equal(await db.connection.count({ where: { OR: [{ userAId: users[2] }, { userBId: users[2] }] } }), 0);
    await act(users[0], "UNBOOKMARK");
    assert.equal(await db.mutualOpportunityBookmark.count({ where: { userId: users[0] } }), 0);
    const expiring = await opportunity(1, 2);
    await service.interactWithOpportunity({ userId: users[1], opportunityId: expiring.id, action: "BOOKMARK" });
    await db.block.create({ data: { blockerId: users[2], blockedId: users[1] } });
    await assert.rejects(service.interactWithOpportunity({ userId: users[1], opportunityId: expiring.id, action: "SEND", body: "Blocked" }), { code: "NO_LONGER_AVAILABLE" });
    await db.block.deleteMany({ where: { blockerId: users[2], blockedId: users[1] } });
    await db.mutualOpportunity.update({ where: { id: expiring.id }, data: { status: "EXPIRED", expiresAt: new Date(0), terminalAt: new Date() } });
    const saved = (await service.listMutualOpportunities(users[1], false)).opportunities.find(item => item.id === expiring.id);
    assert.equal(saved?.isBookmarked, true);
    assert.equal(saved?.state, "UNAVAILABLE");
    await assert.rejects(service.interactWithOpportunity({ userId: users[2], opportunityId: expiring.id, action: "REPLY", body: "Too late" }), { code: "NO_LONGER_AVAILABLE" });
    // An expired original invitation never removes an established chat or its messages.
    await db.weeklyIntent.updateMany({ where: { id: { in: [row.intentAId, row.intentBId] } },
      data: { status: "EXPIRED", expiresAt: new Date(0), endedAt: new Date() } });
    const afterExpiry = await service.getOpportunityConversation(users[0], row.id);
    assert.equal(afterExpiry.coordination?.connectionId, reply.coordination.connectionId);
    assert.equal(afterExpiry.state, "READY_TO_COORDINATE");
    assert.equal(afterExpiry.isExpired, true);
    assert.equal(await db.message.count({ where: { connectionId: reply.coordination.connectionId } }), 3);

  } finally {
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.course.deleteMany({ where: { id: detailCourseId } });
    await db.$disconnect();
    const { prisma } = await import("../../lib/db/prisma");
    await prisma.$disconnect();
  }
});
