import { expect, test, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { assertLocalTestDatabase } from "./helpers/local-test-database";

assertLocalTestDatabase();
const prisma = new PrismaClient();
const E2E_USER = process.env.E2E_USER ?? "test_001";
const E2E_PEER = process.env.E2E_PEER ?? "test_002";
const E2E_THIRD = "test_004";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "Password123";
const IP = `198.51.100.${(process.pid % 200) + 40}`;
const device = {
  id: "playwright-ios-group-manage-device",
  name: "Playwright Group Manage iPhone",
  appVersion: "1.0.0",
  platformVersion: "17.0",
};

let userId = "";
let peerId = "";
let thirdId = "";
let createdGroupId = "";
let createdReportId = "";

async function accessToken(request: APIRequestContext) {
  const response = await request.post("/api/v1/auth/login", {
    headers: { "x-forwarded-for": IP },
    data: { identifier: E2E_USER, password: E2E_PASSWORD, device },
  });
  expect(response.status()).toBe(200);
  const payload = (await response.json()) as { data: { tokens: { accessToken: string } } };
  return payload.data.tokens.accessToken;
}

test.beforeAll(async () => {
  const users = await prisma.user.findMany({
    where: { username: { in: [E2E_USER, E2E_PEER, E2E_THIRD] } },
    select: { id: true, username: true },
  });
  const byUsername = new Map(users.map((user) => [user.username, user.id]));
  userId = byUsername.get(E2E_USER) ?? "";
  peerId = byUsername.get(E2E_PEER) ?? "";
  thirdId = byUsername.get(E2E_THIRD) ?? "";
  if (!userId || !peerId || !thirdId) throw new Error("Seeded group-manage users missing.");

  for (const otherId of [peerId, thirdId]) {
    const existing = await prisma.connection.findFirst({
      where: {
        OR: [
          { userAId: userId, userBId: otherId },
          { userAId: otherId, userBId: userId },
        ],
      },
      select: { id: true, status: true },
    });
    if (!existing) {
      await prisma.connection.create({
        data: { userAId: userId, userBId: otherId, status: "ACTIVE" },
      });
    } else if (existing.status !== "ACTIVE") {
      await prisma.connection.update({
        where: { id: existing.id },
        data: { status: "ACTIVE", endedAt: null, endedById: null },
      });
    }
  }
});

test.afterAll(async () => {
  if (createdReportId) {
    await prisma.report.deleteMany({ where: { id: createdReportId } });
  }
  if (createdGroupId) {
    await prisma.groupChat.deleteMany({ where: { id: createdGroupId } });
  }
  await prisma.$disconnect();
});

test.describe.serial("API v1 group manage", () => {
  test("creates a group, renames it, and adds a member", async ({ request }) => {
    const token = await accessToken(request);
    const headers = {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": `group-create-${Date.now()}`,
    };

    const created = await request.post("/api/v1/group-chats", {
      headers,
      data: {
        title: `API v1 Group Manage ${Date.now()}`,
        participantIds: [peerId, thirdId],
      },
    });
    expect(created.status()).toBe(201);
    const createdPayload = (await created.json()) as { data: { groupChatId: string } };
    createdGroupId = createdPayload.data.groupChatId;
    expect(createdGroupId).toBeTruthy();

    const renamed = await request.patch(`/api/v1/group-chats/${createdGroupId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": `group-title-${Date.now()}`,
      },
      data: { title: "Renamed study crew" },
    });
    expect(renamed.status()).toBe(200);
    expect(((await renamed.json()) as { data: { title: string } }).data.title).toBe(
      "Renamed study crew",
    );

    // Remove third from group then re-add via participants endpoint.
    await prisma.groupChatParticipant.deleteMany({
      where: { groupChatId: createdGroupId, userId: thirdId },
    });

    const added = await request.post(`/api/v1/group-chats/${createdGroupId}/participants`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": `group-members-${Date.now()}`,
      },
      data: { participantIds: [thirdId] },
    });
    expect(added.status()).toBe(200);
    const addedPayload = (await added.json()) as {
      data: { addedUserIds: string[]; memberCount: number };
    };
    expect(addedPayload.data.addedUserIds).toEqual([thirdId]);
    expect(addedPayload.data.memberCount).toBe(3);
  });

  test("replies to, reports, and soft-deletes group messages", async ({ request }) => {
    const token = await accessToken(request);
    const peerMessage = await prisma.groupChatMessage.create({
      data: {
        groupChatId: createdGroupId,
        senderId: peerId,
        body: `group report target ${Date.now()}`,
      },
      select: { id: true },
    });

    const reply = await request.post(`/api/v1/group-chats/${createdGroupId}/messages`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": `group-reply-${Date.now()}`,
      },
      data: { body: "Reply from the group test", replyToId: peerMessage.id },
    });
    expect(reply.status()).toBe(201);
    const replyPayload = (await reply.json()) as {
      data: { id: string; replyTo: { id: string } | null };
    };
    expect(replyPayload.data.replyTo?.id).toBe(peerMessage.id);

    const reported = await request.post("/api/reports", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        reportedUserId: peerId,
        groupChatMessageId: peerMessage.id,
        reason: "SPAM",
        details: "group message report",
      },
    });
    expect(reported.status()).toBe(201);
    const reportPayload = (await reported.json()) as {
      data: { id: string; reportedUserId: string; groupChatMessageId: string | null };
    };
    createdReportId = reportPayload.data.id;
    expect(reportPayload.data.reportedUserId).toBe(peerId);
    expect(reportPayload.data.groupChatMessageId).toBe(peerMessage.id);

    const deleted = await request.delete(
      `/api/group-chats/${createdGroupId}/messages/${replyPayload.data.id}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(deleted.status()).toBe(200);
    expect(
      await prisma.groupChatMessage.findUnique({
        where: { id: replyPayload.data.id },
        select: { deletedAt: true, body: true },
      }),
    ).toEqual({ deletedAt: expect.any(Date), body: "" });
  });
});
