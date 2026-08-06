import { expect, test, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { assertLocalTestDatabase } from "./helpers/local-test-database";

assertLocalTestDatabase();
const prisma = new PrismaClient();
const E2E_USER = process.env.E2E_USER ?? "test_001";
const E2E_PEER = process.env.E2E_PEER ?? "test_002";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "Password123";
const INBOX_TEST_IP = `198.18.1.${(process.pid % 200) + 1}`;
const device = {
  id: "playwright-ios-inbox-device",
  name: "Playwright Inbox iPhone",
  appVersion: "1.0.0",
  platformVersion: "17.0",
};

let userId = "";
let peerId = "";
let connectionId = "";
let createdMessageId = "";
let originalReadAt: Date | null = null;
let viewerIsUserA = false;

async function accessToken(request: APIRequestContext) {
  const response = await request.post("/api/v1/auth/login", {
    headers: { "x-forwarded-for": INBOX_TEST_IP },
    data: { identifier: E2E_USER, password: E2E_PASSWORD, device },
  });
  expect(response.status()).toBe(200);
  const payload = (await response.json()) as { data: { tokens: { accessToken: string } } };
  return payload.data.tokens.accessToken;
}

test.beforeAll(async () => {
  const users = await prisma.user.findMany({
    where: { username: { in: [E2E_USER, E2E_PEER] } },
    select: { id: true, username: true },
  });
  const byUsername = new Map(users.map((user) => [user.username, user.id]));
  userId = byUsername.get(E2E_USER) ?? "";
  peerId = byUsername.get(E2E_PEER) ?? "";
  if (!userId || !peerId) throw new Error("Seeded inbox users are missing.");

  const connection = await prisma.connection.findFirst({
    where: {
      status: "ACTIVE",
      OR: [
        { userAId: userId, userBId: peerId },
        { userAId: peerId, userBId: userId },
      ],
    },
    select: { id: true, userAId: true, readByAAt: true, readByBAt: true },
  });
  if (!connection) throw new Error("The seeded inbox connection is missing.");

  connectionId = connection.id;
  viewerIsUserA = connection.userAId === userId;
  originalReadAt = viewerIsUserA ? connection.readByAAt : connection.readByBAt;
  await prisma.connection.update({
    where: { id: connectionId },
    data: viewerIsUserA ? { readByAAt: new Date(0) } : { readByBAt: new Date(0) },
  });
  const message = await prisma.message.create({
    data: {
      connectionId,
      senderId: peerId,
      type: "TEXT",
      body: `api v1 inbox unread ${Date.now()}`,
    },
  });
  createdMessageId = message.id;
});

test.afterAll(async () => {
  if (createdMessageId) {
    await prisma.message.deleteMany({ where: { id: createdMessageId } });
  }
  if (connectionId) {
    await prisma.connection.update({
      where: { id: connectionId },
      data: viewerIsUserA ? { readByAAt: originalReadAt } : { readByBAt: originalReadAt },
    });
  }
  await prisma.$disconnect();
});

test.describe.serial("API v1 inbox", () => {
  test("requires authentication and returns the merged conversation DTO", async ({ request }) => {
    const unauthorized = await request.get("/api/v1/inbox");
    expect(unauthorized.status()).toBe(401);

    const token = await accessToken(request);
    const response = await request.get("/api/v1/inbox", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status()).toBe(200);
    const payload = (await response.json()) as {
      data: {
        conversations: Array<{
          kind: string;
          id: string;
          unreadCount: number;
          peer: { username: string } | null;
          lastMessage: { id: string } | null;
        }>;
        unreadTotal: number;
        plansNeedingYourAction: number;
      };
    };
    const direct = payload.data.conversations.find(
      (conversation) => conversation.kind === "DIRECT" && conversation.id === connectionId,
    );
    expect(direct).toBeTruthy();
    expect(direct?.peer?.username).toBe(E2E_PEER);
    expect(direct?.lastMessage?.id).toBe(createdMessageId);
    expect(direct?.unreadCount).toBeGreaterThan(0);
    expect(payload.data.unreadTotal).toBeGreaterThanOrEqual(direct?.unreadCount ?? 1);
    expect(payload.data.plansNeedingYourAction).toBeGreaterThanOrEqual(0);
  });

  test("marks a direct conversation as read and clears its unread count", async ({ request }) => {
    const token = await accessToken(request);
    const marked = await request.post(`/api/v1/connections/${connectionId}/read`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(marked.status()).toBe(200);
    const markedPayload = (await marked.json()) as { data: { readAt: string } };
    expect(Number.isNaN(Date.parse(markedPayload.data.readAt))).toBe(false);

    const inbox = await request.get("/api/v1/inbox", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(inbox.status()).toBe(200);
    const payload = (await inbox.json()) as {
      data: { conversations: Array<{ id: string; unreadCount: number }> };
    };
    expect(
      payload.data.conversations.find((conversation) => conversation.id === connectionId)
        ?.unreadCount,
    ).toBe(0);
  });

  test("toggles direct pin preference", async ({ request }) => {
    await prisma.connection.update({
      where: { id: connectionId },
      data: viewerIsUserA ? { pinnedByAAt: null } : { pinnedByBAt: null },
    });

    const token = await accessToken(request);
    const headers = { Authorization: `Bearer ${token}` };
    const pinned = await request.post(`/api/v1/connections/${connectionId}/pin`, { headers });
    expect(pinned.status()).toBe(200);
    expect(((await pinned.json()) as { data: { pinned: boolean; hidden: boolean } }).data).toEqual({
      pinned: true,
      hidden: false,
    });

    const inboxPinned = await request.get("/api/v1/inbox", { headers });
    expect(inboxPinned.status()).toBe(200);
    const pinnedPayload = (await inboxPinned.json()) as {
      data: { conversations: Array<{ id: string; pinned: boolean }> };
    };
    expect(
      pinnedPayload.data.conversations.find((conversation) => conversation.id === connectionId)
        ?.pinned,
    ).toBe(true);

    const unpinned = await request.post(`/api/v1/connections/${connectionId}/pin`, { headers });
    expect(unpinned.status()).toBe(200);
    expect(((await unpinned.json()) as { data: { pinned: boolean } }).data.pinned).toBe(false);
  });
});

test.describe.serial("API v1 inbox preferences for course and group", () => {
  let courseId = "";
  let groupChatId = "";

  test.beforeAll(async () => {
    const marker = `${Date.now()}-${process.pid}`;
    const course = await prisma.course.create({
      data: {
        name: `API v1 Inbox Pref ${marker}`,
        code: `INB-${marker}`,
        school: "TUM",
        semesterLabel: `INB-${marker}`,
        members: {
          create: [
            { userId, intentions: [] },
            { userId: peerId, intentions: [] },
          ],
        },
      },
    });
    courseId = course.id;
    await prisma.courseRoomMessage.create({
      data: { courseId, senderId: peerId, body: `inbox pref course ${marker}` },
    });

    const group = await prisma.groupChat.create({
      data: {
        title: `API v1 Inbox Pref Group ${marker}`,
        createdById: userId,
        participants: {
          create: [{ userId }, { userId: peerId }],
        },
      },
    });
    groupChatId = group.id;
    await prisma.groupChatMessage.create({
      data: { groupChatId, senderId: peerId, body: `inbox pref group ${marker}` },
    });
  });

  test.afterAll(async () => {
    if (courseId) await prisma.course.deleteMany({ where: { id: courseId } });
    if (groupChatId) await prisma.groupChat.deleteMany({ where: { id: groupChatId } });
  });

  test("pins, hides, and restores course and group inbox rows", async ({ request }) => {
    const token = await accessToken(request);
    const headers = { Authorization: `Bearer ${token}` };

    for (const target of [
      {
        kind: "COURSE",
        id: courseId,
        pin: `/api/v1/courses/${courseId}/inbox-pin`,
        hide: `/api/v1/courses/${courseId}/inbox-hide`,
        restore: `/api/v1/courses/${courseId}/inbox-restore`,
        messages: `/api/v1/courses/${courseId}/messages?limit=1`,
      },
      {
        kind: "GROUP",
        id: groupChatId,
        pin: `/api/v1/group-chats/${groupChatId}/inbox-pin`,
        hide: `/api/v1/group-chats/${groupChatId}/inbox-hide`,
        restore: `/api/v1/group-chats/${groupChatId}/inbox-restore`,
        messages: `/api/v1/group-chats/${groupChatId}/messages?limit=1`,
      },
    ] as const) {
      const pin = await request.post(target.pin, { headers });
      expect(pin.status()).toBe(200);
      expect(((await pin.json()) as { data: { pinned: boolean; hidden: boolean } }).data).toEqual({
        pinned: true,
        hidden: false,
      });

      let inbox = await request.get("/api/v1/inbox", { headers });
      expect(inbox.status()).toBe(200);
      let rows = (
        (await inbox.json()) as {
          data: { conversations: Array<{ kind: string; id: string; pinned: boolean }> };
        }
      ).data.conversations;
      expect(rows.find((row) => row.kind === target.kind && row.id === target.id)?.pinned).toBe(
        true,
      );

      const hide = await request.post(target.hide, { headers });
      expect(hide.status()).toBe(200);
      expect(((await hide.json()) as { data: { hidden: boolean } }).data.hidden).toBe(true);

      inbox = await request.get("/api/v1/inbox", { headers });
      rows = (
        (await inbox.json()) as {
          data: { conversations: Array<{ kind: string; id: string; pinned: boolean }> };
        }
      ).data.conversations;
      expect(rows.some((row) => row.kind === target.kind && row.id === target.id)).toBe(false);

      const history = await request.get(target.messages, { headers });
      expect(history.status()).toBe(200);
      const historyPayload = (await history.json()) as {
        data: { conversation: { inboxHidden?: boolean } };
      };
      expect(historyPayload.data.conversation.inboxHidden).toBe(true);

      const restore = await request.post(target.restore, { headers });
      expect(restore.status()).toBe(200);
      expect(((await restore.json()) as { data: { hidden: boolean } }).data.hidden).toBe(false);

      inbox = await request.get("/api/v1/inbox", { headers });
      rows = (
        (await inbox.json()) as {
          data: { conversations: Array<{ kind: string; id: string; pinned: boolean }> };
        }
      ).data.conversations;
      expect(rows.some((row) => row.kind === target.kind && row.id === target.id)).toBe(true);
    }
  });
});
