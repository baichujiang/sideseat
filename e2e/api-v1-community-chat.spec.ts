import { expect, test, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { assertLocalTestDatabase } from "./helpers/local-test-database";

assertLocalTestDatabase();
const prisma = new PrismaClient();
const E2E_USER = process.env.E2E_USER ?? "test_001";
const E2E_PEER = process.env.E2E_PEER ?? "test_002";
const E2E_OUTSIDER = "test_004";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "Password123";
const CHAT_TEST_IP = `203.0.113.${(process.pid % 200) + 1}`;
const device = {
  id: "playwright-ios-community-chat-device",
  name: "Playwright Community Chat iPhone",
  appVersion: "1.0.0",
  platformVersion: "17.0",
};

let userId = "";
let peerId = "";
let courseId = "";
let groupChatId = "";
let initialCourseMessageId = "";
let initialGroupMessageId = "";

async function accessToken(request: APIRequestContext, identifier = E2E_USER) {
  const response = await request.post("/api/v1/auth/login", {
    headers: { "x-forwarded-for": CHAT_TEST_IP },
    data: { identifier, password: E2E_PASSWORD, device: { ...device, id: `${device.id}-${identifier}` } },
  });
  expect(response.status()).toBe(200);
  const payload = (await response.json()) as { data: { tokens: { accessToken: string } } };
  return payload.data.tokens.accessToken;
}

test.beforeAll(async () => {
  const users = await prisma.user.findMany({
    where: { username: { in: [E2E_USER, E2E_PEER, E2E_OUTSIDER] } },
    select: { id: true, username: true },
  });
  const byUsername = new Map(users.map((user) => [user.username, user.id]));
  userId = byUsername.get(E2E_USER) ?? "";
  peerId = byUsername.get(E2E_PEER) ?? "";
  const outsiderId = byUsername.get(E2E_OUTSIDER) ?? "";
  if (!userId || !peerId || !outsiderId) throw new Error("Seeded community-chat users are missing.");

  const marker = `${Date.now()}-${process.pid}`;
  const course = await prisma.course.create({
    data: {
      name: `API v1 Community Chat ${marker}`,
      code: `E2E-${marker}`,
      school: "TUM",
      semesterLabel: `E2E-${marker}`,
      members: {
        create: [
          { userId, intentions: [] },
          { userId: peerId, intentions: [] },
        ],
      },
    },
  });
  courseId = course.id;
  const initialCourse = await prisma.courseRoomMessage.create({
    data: { courseId, senderId: peerId, body: `initial course ${marker}` },
  });
  initialCourseMessageId = initialCourse.id;

  const group = await prisma.groupChat.create({
    data: {
      title: `API v1 Group ${marker}`,
      createdById: userId,
      participants: {
        create: [
          { userId },
          { userId: peerId },
          { userId: outsiderId },
        ],
      },
    },
  });
  groupChatId = group.id;
  const initialGroup = await prisma.groupChatMessage.create({
    data: { groupChatId, senderId: peerId, body: `initial group ${marker}` },
  });
  initialGroupMessageId = initialGroup.id;
});

test.afterAll(async () => {
  if (courseId) {
    await prisma.apiIdempotencyRecord.deleteMany({
      where: { scope: `native-course-message:${courseId}` },
    });
    await prisma.course.deleteMany({ where: { id: courseId } });
  }
  if (groupChatId) {
    await prisma.apiIdempotencyRecord.deleteMany({
      where: { scope: `native-group-message:${groupChatId}` },
    });
    await prisma.groupChat.deleteMany({ where: { id: groupChatId } });
  }
  await prisma.$disconnect();
});

test.describe.serial("API v1 course and group chat", () => {
  test("enforces authentication and course membership", async ({ request }) => {
    const unauthorized = await request.get(`/api/v1/courses/${courseId}/messages`);
    expect(unauthorized.status()).toBe(401);

    const outsiderToken = await accessToken(request, E2E_OUTSIDER);
    const outsideCourse = await request.get(`/api/v1/courses/${courseId}/messages`, {
      headers: { Authorization: `Bearer ${outsiderToken}` },
    });
    expect(outsideCourse.status()).toBe(404);
    await expect(outsideCourse.json()).resolves.toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  test("sends one idempotent course reply, pages history and marks it read", async ({ request }) => {
    const token = await accessToken(request);
    const key = `course-${Date.now()}-concurrent`;
    const body = `idempotent course reply ${Date.now()}`;
    const headers = { Authorization: `Bearer ${token}`, "Idempotency-Key": key };
    const responses = await Promise.all([
      request.post(`/api/v1/courses/${courseId}/messages`, {
        headers,
        data: { body, replyToId: initialCourseMessageId },
      }),
      request.post(`/api/v1/courses/${courseId}/messages`, {
        headers,
        data: { body, replyToId: initialCourseMessageId },
      }),
    ]);
    expect(responses.map((response) => response.status())).toEqual([201, 201]);
    const payloads = await Promise.all(
      responses.map((response) => response.json() as Promise<{ data: { id: string; replyTo: { id: string } | null } }>),
    );
    expect(payloads[0].data.id).toBe(payloads[1].data.id);
    expect(payloads[0].data.replyTo?.id).toBe(initialCourseMessageId);
    expect(await prisma.courseRoomMessage.count({ where: { courseId, body } })).toBe(1);
    expect(responses.some((response) => response.headers()["idempotency-replayed"] === "true")).toBe(true);

    const conflict = await request.post(`/api/v1/courses/${courseId}/messages`, {
      headers,
      data: { body: `${body} changed` },
    });
    expect(conflict.status()).toBe(409);

    const firstPage = await request.get(`/api/v1/courses/${courseId}/messages?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(firstPage.status()).toBe(200);
    const page = (await firstPage.json()) as {
      data: { conversation: { kind: string; memberCount: number }; messages: Array<{ id: string }> };
      meta: { hasMore: boolean; nextCursor: string | null };
    };
    expect(page.data.conversation).toMatchObject({ kind: "COURSE", memberCount: 2 });
    expect(page.data.messages[0]?.id).toBe(payloads[0].data.id);
    expect(page.meta.hasMore).toBe(true);

    const older = await request.get(
      `/api/v1/courses/${courseId}/messages?limit=100&cursor=${page.meta.nextCursor}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(older.status()).toBe(200);
    const olderPayload = (await older.json()) as { data: { messages: Array<{ id: string }> } };
    expect(olderPayload.data.messages.some((message) => message.id === initialCourseMessageId)).toBe(true);

    const read = await request.post(`/api/v1/courses/${courseId}/read`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(read.status()).toBe(200);
    const membership = await prisma.userCourse.findUnique({
      where: { userId_courseId: { userId, courseId } },
      select: { courseChatReadAt: true },
    });
    expect(membership?.courseChatReadAt).toBeTruthy();
  });

  test("sends one idempotent group message, returns members and marks it read", async ({ request }) => {
    const token = await accessToken(request);
    const key = `group-${Date.now()}-concurrent`;
    const body = `idempotent group message ${Date.now()}`;
    const headers = { Authorization: `Bearer ${token}`, "Idempotency-Key": key };
    const responses = await Promise.all([
      request.post(`/api/v1/group-chats/${groupChatId}/messages`, { headers, data: { body } }),
      request.post(`/api/v1/group-chats/${groupChatId}/messages`, { headers, data: { body } }),
    ]);
    expect(responses.map((response) => response.status())).toEqual([201, 201]);
    const payloads = await Promise.all(
      responses.map((response) => response.json() as Promise<{ data: { id: string; body: string } }>),
    );
    expect(payloads[0].data.id).toBe(payloads[1].data.id);
    expect(payloads[0].data.body).toBe(body);
    expect(await prisma.groupChatMessage.count({ where: { groupChatId, body } })).toBe(1);

    const firstPage = await request.get(`/api/v1/group-chats/${groupChatId}/messages?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(firstPage.status()).toBe(200);
    const page = (await firstPage.json()) as {
      data: { conversation: { kind: string; participants: Array<{ id: string }> }; messages: Array<{ id: string }> };
      meta: { nextCursor: string | null };
    };
    expect(page.data.conversation.kind).toBe("GROUP");
    expect(page.data.conversation.participants).toHaveLength(3);
    expect(page.data.messages[0]?.id).toBe(payloads[0].data.id);

    const older = await request.get(
      `/api/v1/group-chats/${groupChatId}/messages?limit=100&cursor=${page.meta.nextCursor}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(older.status()).toBe(200);
    const olderPayload = (await older.json()) as { data: { messages: Array<{ id: string }> } };
    expect(olderPayload.data.messages.some((message) => message.id === initialGroupMessageId)).toBe(true);

    const read = await request.post(`/api/v1/group-chats/${groupChatId}/read`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(read.status()).toBe(200);
    const membership = await prisma.groupChatParticipant.findUnique({
      where: { groupChatId_userId: { groupChatId, userId } },
      select: { lastReadAt: true },
    });
    expect(membership?.lastReadAt).toBeTruthy();
  });

  test("keeps the legacy Web course and group send contracts working", async ({ request }) => {
    // Production cookies are Secure and intentionally are not sent to this
    // local HTTP test server. Existing JSON routes also accept the same Bearer
    // access token, which lets production-runtime CI verify their contracts.
    const token = await accessToken(request);
    const headers = { Authorization: `Bearer ${token}` };

    const courseBody = `legacy Web course ${Date.now()}`;
    const course = await request.post(`/api/courses/${courseId}/chat/messages`, {
      headers,
      data: { body: courseBody, replyToId: initialCourseMessageId },
    });
    expect(course.status()).toBe(201);
    await expect(course.json()).resolves.toMatchObject({
      success: true,
      data: { courseId, senderId: userId, body: courseBody, replyToId: initialCourseMessageId },
    });

    const groupBody = `legacy Web group ${Date.now()}`;
    const group = await request.post(`/api/group-chats/${groupChatId}/messages`, {
      headers,
      data: { body: groupBody },
    });
    expect(group.status()).toBe(201);
    await expect(group.json()).resolves.toMatchObject({
      success: true,
      data: { groupChatId, senderId: userId, body: groupBody },
    });
  });
});
