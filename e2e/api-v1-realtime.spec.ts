import { expect, test, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { assertLocalTestDatabase } from "./helpers/local-test-database";
import { messageBody, openSse as openSseAt } from "./helpers/sse-client";

assertLocalTestDatabase();
const prisma = new PrismaClient();
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const E2E_USER = process.env.E2E_USER ?? "test_001";
const E2E_PEER = process.env.E2E_PEER ?? "test_002";
const E2E_OUTSIDER = "test_004";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "Password123";
const E2E_CRON_SECRET = process.env.CRON_SECRET ?? "playwright-cron-secret";
// Keep this suite isolated from the auth/inbox rate-limit subjects even when
// Playwright runs every API spec in the same worker and database window.
const TEST_IP = `198.18.${(process.pid % 200) + 1}.${(Date.now() % 200) + 1}`;
const device = {
  id: "playwright-ios-realtime-device",
  name: "Playwright Realtime iPhone",
  appVersion: "1.0.0",
  platformVersion: "17.0",
};

let userId = "";
let peerId = "";
let connectionId = "";
let createdConnectionId = "";
let courseId = "";
let groupChatId = "";
let createdBlockId = "";
const directMessageIds: string[] = [];

async function accessToken(request: APIRequestContext, identifier = E2E_USER) {
  const response = await request.post("/api/v1/auth/login", {
    headers: { "x-forwarded-for": TEST_IP },
    data: {
      identifier,
      password: E2E_PASSWORD,
      device: { ...device, id: `${device.id}-${identifier}` },
    },
  });
  expect(response.status()).toBe(200);
  const payload = (await response.json()) as { data: { tokens: { accessToken: string } } };
  return payload.data.tokens.accessToken;
}

async function openSse(path: string, token: string, cursor?: string) {
  return openSseAt(BASE_URL, path, token, cursor);
}

test.beforeAll(async () => {
  const users = await prisma.user.findMany({
    where: { username: { in: [E2E_USER, E2E_PEER, E2E_OUTSIDER] } },
    select: { id: true, username: true },
  });
  const byUsername = new Map(users.map((user) => [user.username, user.id]));
  userId = byUsername.get(E2E_USER) ?? "";
  peerId = byUsername.get(E2E_PEER) ?? "";
  if (!userId || !peerId || !byUsername.get(E2E_OUTSIDER)) {
    throw new Error("Seeded realtime users are missing.");
  }

  const connection = await prisma.connection.create({
    data: {
      userAId: userId,
      userBId: peerId,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  connectionId = connection.id;
  createdConnectionId = connection.id;

  const marker = `${Date.now()}-${process.pid}`;
  const course = await prisma.course.create({
    data: {
      name: `Realtime Course ${marker}`,
      code: `RT-${marker}`,
      school: "TUM",
      semesterLabel: `RT-${marker}`,
      members: { create: [{ userId, intentions: [] }, { userId: peerId, intentions: [] }] },
    },
  });
  courseId = course.id;

  const group = await prisma.groupChat.create({
    data: {
      title: `Realtime Group ${marker}`,
      createdById: userId,
      participants: { create: [{ userId }, { userId: peerId }] },
    },
  });
  groupChatId = group.id;
});

test.afterAll(async () => {
  if (directMessageIds.length > 0) {
    await prisma.message.deleteMany({ where: { id: { in: directMessageIds } } });
    await prisma.chatRealtimeEvent.deleteMany({ where: { messageId: { in: directMessageIds } } });
  }
  if (createdBlockId) {
    await prisma.block.deleteMany({ where: { id: createdBlockId } });
  }
  if (courseId) {
    await prisma.course.deleteMany({ where: { id: courseId } });
    await prisma.chatRealtimeRetention.deleteMany({
      where: { conversationKind: "COURSE", conversationId: courseId },
    });
    await prisma.chatRealtimeEvent.deleteMany({
      where: { conversationKind: "COURSE", conversationId: courseId },
    });
    await prisma.apiIdempotencyRecord.deleteMany({
      where: { scope: `native-course-message:${courseId}` },
    });
  }
  if (groupChatId) {
    await prisma.groupChat.deleteMany({ where: { id: groupChatId } });
    await prisma.chatRealtimeRetention.deleteMany({
      where: { conversationKind: "GROUP", conversationId: groupChatId },
    });
    await prisma.chatRealtimeEvent.deleteMany({
      where: { conversationKind: "GROUP", conversationId: groupChatId },
    });
    await prisma.apiIdempotencyRecord.deleteMany({
      where: { scope: `native-group-message:${groupChatId}` },
    });
  }
  if (connectionId) {
    await prisma.chatRealtimeRetention.deleteMany({
      where: { conversationKind: "DIRECT", conversationId: connectionId },
    });
    await prisma.apiIdempotencyRecord.deleteMany({
      where: { scope: `native-direct-message:${connectionId}` },
    });
  }
  if (createdConnectionId) {
    await prisma.connection.deleteMany({ where: { id: createdConnectionId } });
  }
  await prisma.$disconnect();
});

test.describe.serial("API v1 resumable realtime chat", () => {
  test("rejects unauthenticated, unauthorized and cross-conversation cursors", async ({
    request,
  }) => {
    const unauthorized = await request.get(`/api/v1/connections/${connectionId}/events`);
    expect(unauthorized.status()).toBe(401);

    const token = await accessToken(request);
    const directHistory = await request.get(
      `/api/v1/connections/${connectionId}/messages?limit=1`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const directPayload = (await directHistory.json()) as { meta: { realtimeCursor: string } };
    expect(directPayload.meta.realtimeCursor).toBeTruthy();

    const futurePayload = JSON.parse(
      Buffer.from(directPayload.meta.realtimeCursor, "base64url").toString("utf8"),
    ) as { s: string };
    futurePayload.s = "999999999999999999999999999999";
    const futureCursor = Buffer.from(JSON.stringify(futurePayload), "utf8").toString("base64url");
    const future = await request.get(`/api/v1/connections/${connectionId}/events`, {
      headers: { Authorization: `Bearer ${token}`, "Last-Event-ID": futureCursor },
    });
    expect(future.status()).toBe(422);

    const mismatched = await request.get(`/api/v1/courses/${courseId}/events`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Last-Event-ID": directPayload.meta.realtimeCursor,
      },
    });
    expect(mismatched.status()).toBe(422);
    await expect(mismatched.json()).resolves.toMatchObject({
      error: { code: "INVALID_REQUEST", field: "Last-Event-ID" },
    });

    const outsiderToken = await accessToken(request, E2E_OUTSIDER);
    const outsideCourse = await request.get(`/api/v1/courses/${courseId}/events`, {
      headers: { Authorization: `Bearer ${outsiderToken}` },
    });
    expect(outsideCourse.status()).toBe(404);
  });

  test("prunes expired events and requires history reload for an old cursor", async ({
    request,
  }) => {
    const token = await accessToken(request);
    const history = await request.get(`/api/v1/connections/${connectionId}/messages?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(history.status()).toBe(200);
    const historyPayload = (await history.json()) as { meta: { realtimeCursor: string } };

    const expiredEvent = await prisma.chatRealtimeEvent.create({
      data: {
        conversationKind: "DIRECT",
        conversationId: connectionId,
        messageId: `retention-${Date.now()}`,
        senderId: userId,
        eventType: "UPSERT",
        occurredAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000),
      },
      select: { sequence: true },
    });

    const cleanup = await request.get("/api/cron/chat-realtime-retention", {
      headers: { Authorization: `Bearer ${E2E_CRON_SECRET}` },
    });
    expect(cleanup.status()).toBe(200);
    await expect(cleanup.json()).resolves.toMatchObject({
      data: { retentionDays: 14 },
    });

    const expired = await request.get(`/api/v1/connections/${connectionId}/events`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Last-Event-ID": historyPayload.meta.realtimeCursor,
      },
    });
    expect(expired.status()).toBe(409);
    expect(expired.headers()["x-realtime-reset"]).toBe("history");
    await expect(expired.json()).resolves.toMatchObject({
      error: {
        code: "REALTIME_CURSOR_EXPIRED",
        field: "Last-Event-ID",
        retryable: false,
      },
    });

    const refreshedHistory = await request.get(
      `/api/v1/connections/${connectionId}/messages?limit=1`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const refreshedPayload = (await refreshedHistory.json()) as {
      meta: { realtimeCursor: string };
    };
    const refreshedCursor = JSON.parse(
      Buffer.from(refreshedPayload.meta.realtimeCursor, "base64url").toString("utf8"),
    ) as { s: string };
    expect(BigInt(refreshedCursor.s)).toBeGreaterThanOrEqual(expiredEvent.sequence);

    const stream = await openSse(
      `/api/v1/connections/${connectionId}/events`,
      token,
      refreshedPayload.meta.realtimeCursor,
    );
    await stream.next((event) => event.event === "stream.ready");
    stream.close();
  });

  test("resets an active stream when retention overtakes its cursor", async ({ request }) => {
    const token = await accessToken(request);
    const history = await request.get(`/api/v1/connections/${connectionId}/messages?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const historyPayload = (await history.json()) as { meta: { realtimeCursor: string } };
    const stream = await openSse(
      `/api/v1/connections/${connectionId}/events`,
      token,
      historyPayload.meta.realtimeCursor,
    );
    await stream.next((event) => event.event === "stream.ready");

    const boundaryEvent = await prisma.$transaction(async (tx) => {
      const event = await tx.chatRealtimeEvent.create({
        data: {
          conversationKind: "DIRECT",
          conversationId: connectionId,
          messageId: `active-retention-${Date.now()}`,
          senderId: userId,
          eventType: "UPSERT",
        },
        select: { sequence: true },
      });
      await tx.chatRealtimeRetention.upsert({
        where: {
          conversationKind_conversationId: {
            conversationKind: "DIRECT",
            conversationId: connectionId,
          },
        },
        create: {
          conversationKind: "DIRECT",
          conversationId: connectionId,
          retainedAfterSequence: event.sequence,
        },
        update: { retainedAfterSequence: event.sequence },
      });
      return event;
    });

    const reset = await stream.next((event) => event.event === "stream.reset");
    expect(reset.id).toBeNull();
    expect(reset.data).toMatchObject({
      schemaVersion: 1,
      type: "STREAM_RESET",
      conversation: { kind: "DIRECT", id: connectionId },
      reason: "EVENT_HISTORY_EXPIRED",
      reloadHistory: true,
    });
    const resetCursor = JSON.parse(
      Buffer.from(String(reset.data.cursor), "base64url").toString("utf8"),
    ) as { s: string };
    expect(BigInt(resetCursor.s)).toBeGreaterThanOrEqual(boundaryEvent.sequence);
    stream.close();
  });

  test("streams direct upserts, tombstones and reconnect catch-up without gaps", async ({
    request,
  }) => {
    const token = await accessToken(request);
    const history = await request.get(`/api/v1/connections/${connectionId}/messages?limit=10`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(history.status()).toBe(200);
    const historyPayload = (await history.json()) as { meta: { realtimeCursor: string } };

    const firstStream = await openSse(
      `/api/v1/connections/${connectionId}/events`,
      token,
      historyPayload.meta.realtimeCursor,
    );
    const ready = await firstStream.next((event) => event.event === "stream.ready");
    expect(ready.data).toMatchObject({
      schemaVersion: 1,
      type: "STREAM_READY",
      conversation: { kind: "DIRECT", id: connectionId },
      resumed: true,
    });

    const firstBody = `realtime direct first ${Date.now()}`;
    const firstSend = await request.post(`/api/v1/connections/${connectionId}/messages`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": `realtime-direct-first-${Date.now()}`,
      },
      data: { type: "TEXT", body: firstBody },
    });
    expect(firstSend.status()).toBe(201);
    const firstMessage = (await firstSend.json()) as { data: { id: string } };
    directMessageIds.push(firstMessage.data.id);
    const firstEvent = await firstStream.next(
      (event) => event.event === "chat.message.upserted" && messageBody(event) === firstBody,
    );
    expect(firstEvent.id).toBeTruthy();
    expect(firstEvent.data).toMatchObject({
      type: "CHAT_MESSAGE_UPSERTED",
      conversation: { kind: "DIRECT", id: connectionId },
      message: { id: firstMessage.data.id, body: firstBody },
    });
    firstStream.close();

    const secondBody = `realtime direct disconnected ${Date.now()}`;
    const secondSend = await request.post(`/api/v1/connections/${connectionId}/messages`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": `realtime-direct-second-${Date.now()}`,
      },
      data: { type: "TEXT", body: secondBody },
    });
    expect(secondSend.status()).toBe(201);
    const secondMessage = (await secondSend.json()) as { data: { id: string } };
    directMessageIds.push(secondMessage.data.id);

    const resumed = await openSse(
      `/api/v1/connections/${connectionId}/events`,
      token,
      firstEvent.id!,
    );
    await resumed.next((event) => event.event === "stream.ready");
    const caughtUp = await resumed.next(
      (event) => event.event === "chat.message.upserted" && messageBody(event) === secondBody,
    );
    expect(caughtUp.data).toMatchObject({ message: { id: secondMessage.data.id } });

    const deleted = await request.delete(
      `/api/connections/${connectionId}/messages/${secondMessage.data.id}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(deleted.status()).toBe(200);
    const tombstone = await resumed.next(
      (event) =>
        event.event === "chat.message.upserted" &&
        (event.data.message as { id?: unknown } | undefined)?.id === secondMessage.data.id &&
        (event.data.message as { deletedAt?: unknown } | undefined)?.deletedAt !== null,
    );
    expect(tombstone.data).toMatchObject({
      message: { id: secondMessage.data.id, body: null },
    });
    resumed.close();

    const eventRows = await prisma.chatRealtimeEvent.findMany({
      where: { messageId: secondMessage.data.id },
      select: { eventType: true, messageId: true },
      orderBy: { sequence: "asc" },
    });
    expect(eventRows.map((row) => row.eventType)).toEqual(["UPSERT", "UPSERT"]);
  });

  test("streams complete course and group DTOs from their history cursors", async ({ request }) => {
    const token = await accessToken(request);
    const cases = [
      {
        kind: "COURSE",
        id: courseId,
        history: `/api/v1/courses/${courseId}/messages?limit=10`,
        events: `/api/v1/courses/${courseId}/events`,
        send: `/api/v1/courses/${courseId}/messages`,
        body: `realtime course ${Date.now()}`,
      },
      {
        kind: "GROUP",
        id: groupChatId,
        history: `/api/v1/group-chats/${groupChatId}/messages?limit=10`,
        events: `/api/v1/group-chats/${groupChatId}/events`,
        send: `/api/v1/group-chats/${groupChatId}/messages`,
        body: `realtime group ${Date.now()}`,
      },
    ] as const;

    for (const item of cases) {
      const history = await request.get(item.history, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(history.status()).toBe(200);
      const payload = (await history.json()) as { meta: { realtimeCursor: string } };
      const stream = await openSse(item.events, token, payload.meta.realtimeCursor);
      await stream.next((event) => event.event === "stream.ready");

      const send = await request.post(item.send, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": `realtime-${item.kind.toLowerCase()}-${Date.now()}`,
        },
        data: { body: item.body },
      });
      expect(send.status()).toBe(201);
      const sent = (await send.json()) as { data: { id: string } };
      const event = await stream.next(
        (candidate) =>
          candidate.event === "chat.message.upserted" && messageBody(candidate) === item.body,
      );
      expect(event.data).toMatchObject({
        type: "CHAT_MESSAGE_UPSERTED",
        conversation: { kind: item.kind, id: item.id },
        message: { id: sent.data.id, body: item.body, type: "TEXT" },
      });
      stream.close();
    }
  });

  test("advances the cursor without leaking messages from a blocked community sender", async ({
    request,
  }) => {
    const viewerToken = await accessToken(request);
    const peerToken = await accessToken(request, E2E_PEER);
    const existingBlock = await prisma.block.findUnique({
      where: { blockerId_blockedId: { blockerId: userId, blockedId: peerId } },
      select: { id: true },
    });
    if (!existingBlock) {
      const block = await prisma.block.create({
        data: { blockerId: userId, blockedId: peerId, reason: "realtime privacy test" },
        select: { id: true },
      });
      createdBlockId = block.id;
    }

    const history = await request.get(`/api/v1/group-chats/${groupChatId}/messages?limit=100`, {
      headers: { Authorization: `Bearer ${viewerToken}` },
    });
    expect(history.status()).toBe(200);
    const historyPayload = (await history.json()) as {
      data: { messages: Array<{ id: string }> };
      meta: { realtimeCursor: string };
    };
    const stream = await openSse(
      `/api/v1/group-chats/${groupChatId}/events`,
      viewerToken,
      historyPayload.meta.realtimeCursor,
    );
    await stream.next((event) => event.event === "stream.ready");

    const hiddenBody = `blocked group message ${Date.now()}`;
    const send = await request.post(`/api/v1/group-chats/${groupChatId}/messages`, {
      headers: {
        Authorization: `Bearer ${peerToken}`,
        "Idempotency-Key": `blocked-group-${Date.now()}`,
      },
      data: { body: hiddenBody },
    });
    expect(send.status()).toBe(201);
    const sent = (await send.json()) as { data: { id: string } };

    const cursorEvent = await stream.next((event) => event.event === "stream.cursor");
    expect(cursorEvent.data).toMatchObject({
      type: "STREAM_CURSOR",
      conversation: { kind: "GROUP", id: groupChatId },
    });
    expect(cursorEvent.data).not.toHaveProperty("message");
    expect(cursorEvent.data).not.toHaveProperty("messageId");
    stream.close();

    const refreshed = await request.get(`/api/v1/group-chats/${groupChatId}/messages?limit=100`, {
      headers: { Authorization: `Bearer ${viewerToken}` },
    });
    const refreshedPayload = (await refreshed.json()) as {
      data: { messages: Array<{ id: string }> };
    };
    expect(refreshedPayload.data.messages.some((message) => message.id === sent.data.id)).toBe(
      false,
    );

    // Keep later two-account delivery gates unblocked.
    if (createdBlockId) {
      await prisma.block.deleteMany({ where: { id: createdBlockId } });
      createdBlockId = "";
    } else {
      await prisma.block.deleteMany({
        where: { blockerId: userId, blockedId: peerId },
      });
    }
  });
});

test.describe.serial("API v1 two-account live realtime gates", () => {
  test("delivers peer direct/course/group messages on the viewer SSE stream", async ({
    request,
  }) => {
    const viewerToken = await accessToken(request);
    const peerToken = await accessToken(request, E2E_PEER);
    const cases = [
      {
        kind: "DIRECT" as const,
        history: `/api/v1/connections/${connectionId}/messages?limit=1`,
        events: `/api/v1/connections/${connectionId}/events`,
        send: `/api/v1/connections/${connectionId}/messages`,
        conversationId: connectionId,
        body: `peer direct live ${Date.now()}`,
        payload: (body: string) => ({ type: "TEXT", body }),
        trackDirect: true,
      },
      {
        kind: "COURSE" as const,
        history: `/api/v1/courses/${courseId}/messages?limit=1`,
        events: `/api/v1/courses/${courseId}/events`,
        send: `/api/v1/courses/${courseId}/messages`,
        conversationId: courseId,
        body: `peer course live ${Date.now()}`,
        payload: (body: string) => ({ body }),
        trackDirect: false,
      },
      {
        kind: "GROUP" as const,
        history: `/api/v1/group-chats/${groupChatId}/messages?limit=1`,
        events: `/api/v1/group-chats/${groupChatId}/events`,
        send: `/api/v1/group-chats/${groupChatId}/messages`,
        conversationId: groupChatId,
        body: `peer group live ${Date.now()}`,
        payload: (body: string) => ({ body }),
        trackDirect: false,
      },
    ];

    for (const item of cases) {
      const history = await request.get(item.history, {
        headers: { Authorization: `Bearer ${viewerToken}` },
      });
      expect(history.status()).toBe(200);
      const historyPayload = (await history.json()) as { meta: { realtimeCursor: string } };
      const stream = await openSse(item.events, viewerToken, historyPayload.meta.realtimeCursor);
      await stream.next((event) => event.event === "stream.ready");

      const sent = await request.post(item.send, {
        headers: {
          Authorization: `Bearer ${peerToken}`,
          "Idempotency-Key": `two-account-${item.kind.toLowerCase()}-${Date.now()}`,
        },
        data: item.payload(item.body),
      });
      expect(sent.status()).toBe(201);
      const sentPayload = (await sent.json()) as {
        data: { id: string; sender: { username: string } };
      };
      if (item.trackDirect) directMessageIds.push(sentPayload.data.id);

      const upsert = await stream.next(
        (event) => event.event === "chat.message.upserted" && messageBody(event) === item.body,
      );
      expect(upsert.data).toMatchObject({
        type: "CHAT_MESSAGE_UPSERTED",
        conversation: { kind: item.kind, id: item.conversationId },
        message: {
          id: sentPayload.data.id,
          body: item.body,
          sender: { username: E2E_PEER },
        },
      });
      stream.close();
    }
  });

  test("mirrors peer direct and course deletes as tombstones on the viewer SSE stream", async ({
    request,
  }) => {
    const viewerToken = await accessToken(request);
    const peerToken = await accessToken(request, E2E_PEER);

    const directHistory = await request.get(
      `/api/v1/connections/${connectionId}/messages?limit=1`,
      { headers: { Authorization: `Bearer ${viewerToken}` } },
    );
    const directCursor = ((await directHistory.json()) as { meta: { realtimeCursor: string } })
      .meta.realtimeCursor;
    const directStream = await openSse(
      `/api/v1/connections/${connectionId}/events`,
      viewerToken,
      directCursor,
    );
    await directStream.next((event) => event.event === "stream.ready");

    const directBody = `peer direct delete ${Date.now()}`;
    const directSend = await request.post(`/api/v1/connections/${connectionId}/messages`, {
      headers: {
        Authorization: `Bearer ${peerToken}`,
        "Idempotency-Key": `two-account-direct-delete-${Date.now()}`,
      },
      data: { type: "TEXT", body: directBody },
    });
    expect(directSend.status()).toBe(201);
    const directMessage = (await directSend.json()) as { data: { id: string } };
    directMessageIds.push(directMessage.data.id);
    await directStream.next(
      (event) => event.event === "chat.message.upserted" && messageBody(event) === directBody,
    );

    const directDeleted = await request.delete(
      `/api/connections/${connectionId}/messages/${directMessage.data.id}`,
      { headers: { Authorization: `Bearer ${peerToken}` } },
    );
    expect(directDeleted.status()).toBe(200);
    const directTombstone = await directStream.next(
      (event) =>
        event.event === "chat.message.upserted" &&
        (event.data.message as { id?: unknown } | undefined)?.id === directMessage.data.id &&
        (event.data.message as { deletedAt?: unknown } | undefined)?.deletedAt != null,
    );
    expect(directTombstone.data).toMatchObject({
      conversation: { kind: "DIRECT", id: connectionId },
      message: { id: directMessage.data.id, body: null },
    });
    directStream.close();

    const courseHistory = await request.get(`/api/v1/courses/${courseId}/messages?limit=1`, {
      headers: { Authorization: `Bearer ${viewerToken}` },
    });
    const courseCursor = ((await courseHistory.json()) as { meta: { realtimeCursor: string } }).meta
      .realtimeCursor;
    const courseStream = await openSse(
      `/api/v1/courses/${courseId}/events`,
      viewerToken,
      courseCursor,
    );
    await courseStream.next((event) => event.event === "stream.ready");

    const courseBody = `peer course delete ${Date.now()}`;
    const courseSend = await request.post(`/api/v1/courses/${courseId}/messages`, {
      headers: {
        Authorization: `Bearer ${peerToken}`,
        "Idempotency-Key": `two-account-course-delete-${Date.now()}`,
      },
      data: { body: courseBody },
    });
    expect(courseSend.status()).toBe(201);
    const courseMessage = (await courseSend.json()) as { data: { id: string } };
    await courseStream.next(
      (event) => event.event === "chat.message.upserted" && messageBody(event) === courseBody,
    );

    const courseDeleted = await request.delete(
      `/api/courses/${courseId}/chat/messages/${courseMessage.data.id}`,
      { headers: { Authorization: `Bearer ${peerToken}` } },
    );
    expect(courseDeleted.status()).toBe(200);
    const courseTombstone = await courseStream.next(
      (event) =>
        event.event === "chat.message.upserted" &&
        (event.data.message as { id?: unknown } | undefined)?.id === courseMessage.data.id &&
        (event.data.message as { deletedAt?: unknown } | undefined)?.deletedAt != null,
    );
    expect(courseTombstone.data).toMatchObject({
      conversation: { kind: "COURSE", id: courseId },
      message: { id: courseMessage.data.id, body: null },
    });
    courseStream.close();
  });

  test("increments inbox unread after live peer sends and clears on viewer mark-read", async ({
    request,
  }) => {
    const viewerToken = await accessToken(request);
    const peerToken = await accessToken(request, E2E_PEER);

    const connection = await prisma.connection.findUniqueOrThrow({
      where: { id: connectionId },
      select: { userAId: true },
    });
    const viewerIsUserA = connection.userAId === userId;
    await prisma.connection.update({
      where: { id: connectionId },
      data: viewerIsUserA
        ? { readByAAt: new Date(0) }
        : { readByBAt: new Date(0) },
    });
    await prisma.userCourse.update({
      where: { userId_courseId: { userId, courseId } },
      data: { courseChatReadAt: new Date(0) },
    });
    await prisma.groupChatParticipant.update({
      where: {
        groupChatId_userId: { groupChatId, userId },
      },
      data: { lastReadAt: new Date(0) },
    });
    await prisma.message.deleteMany({ where: { connectionId } });
    await prisma.chatRealtimeEvent.deleteMany({
      where: { conversationKind: "DIRECT", conversationId: connectionId },
    });
    await prisma.chatRealtimeRetention.deleteMany({
      where: { conversationKind: "DIRECT", conversationId: connectionId },
    });

    const nonce = Date.now();
    const directBody = `two-account inbox direct ${nonce}`;
    const courseBody = `two-account inbox course ${nonce}`;
    const groupBody = `two-account inbox group ${nonce}`;

    const directSend = await request.post(`/api/v1/connections/${connectionId}/messages`, {
      headers: {
        Authorization: `Bearer ${peerToken}`,
        "Idempotency-Key": `two-account-inbox-direct-${nonce}`,
      },
      data: { type: "TEXT", body: directBody },
    });
    expect(directSend.status()).toBe(201);
    const directId = ((await directSend.json()) as { data: { id: string } }).data.id;
    directMessageIds.push(directId);

    const courseSend = await request.post(`/api/v1/courses/${courseId}/messages`, {
      headers: {
        Authorization: `Bearer ${peerToken}`,
        "Idempotency-Key": `two-account-inbox-course-${nonce}`,
      },
      data: { body: courseBody },
    });
    expect(courseSend.status()).toBe(201);
    const courseMessageId = ((await courseSend.json()) as { data: { id: string } }).data.id;

    const groupSend = await request.post(`/api/v1/group-chats/${groupChatId}/messages`, {
      headers: {
        Authorization: `Bearer ${peerToken}`,
        "Idempotency-Key": `two-account-inbox-group-${nonce}`,
      },
      data: { body: groupBody },
    });
    expect(groupSend.status()).toBe(201);
    const groupMessageId = ((await groupSend.json()) as { data: { id: string } }).data.id;

    const unreadInbox = await request.get("/api/v1/inbox", {
      headers: { Authorization: `Bearer ${viewerToken}` },
    });
    expect(unreadInbox.status()).toBe(200);
    const unreadPayload = (await unreadInbox.json()) as {
      data: {
        conversations: Array<{
          kind: string;
          id: string;
          unreadCount: number;
          lastMessage: { id: string } | null;
        }>;
      };
    };
    const directRow = unreadPayload.data.conversations.find(
      (row) => row.kind === "DIRECT" && row.id === connectionId,
    );
    const courseRow = unreadPayload.data.conversations.find(
      (row) => row.kind === "COURSE" && row.id === courseId,
    );
    const groupRow = unreadPayload.data.conversations.find(
      (row) => row.kind === "GROUP" && row.id === groupChatId,
    );
    expect(directRow?.unreadCount).toBeGreaterThan(0);
    expect(directRow?.lastMessage?.id).toBe(directId);
    expect(courseRow?.unreadCount).toBeGreaterThan(0);
    expect(courseRow?.lastMessage?.id).toBe(courseMessageId);
    expect(groupRow?.unreadCount).toBeGreaterThan(0);
    expect(groupRow?.lastMessage?.id).toBe(groupMessageId);

    expect(
      (
        await request.post(`/api/v1/connections/${connectionId}/read`, {
          headers: { Authorization: `Bearer ${viewerToken}` },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await request.post(`/api/v1/courses/${courseId}/read`, {
          headers: { Authorization: `Bearer ${viewerToken}` },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await request.post(`/api/v1/group-chats/${groupChatId}/read`, {
          headers: { Authorization: `Bearer ${viewerToken}` },
        })
      ).status(),
    ).toBe(200);

    const clearedInbox = await request.get("/api/v1/inbox", {
      headers: { Authorization: `Bearer ${viewerToken}` },
    });
    expect(clearedInbox.status()).toBe(200);
    const clearedPayload = (await clearedInbox.json()) as {
      data: { conversations: Array<{ kind: string; id: string; unreadCount: number }> };
    };
    expect(
      clearedPayload.data.conversations.find(
        (row) => row.kind === "DIRECT" && row.id === connectionId,
      )?.unreadCount,
    ).toBe(0);
    expect(
      clearedPayload.data.conversations.find(
        (row) => row.kind === "COURSE" && row.id === courseId,
      )?.unreadCount,
    ).toBe(0);
    expect(
      clearedPayload.data.conversations.find(
        (row) => row.kind === "GROUP" && row.id === groupChatId,
      )?.unreadCount,
    ).toBe(0);
  });
});
