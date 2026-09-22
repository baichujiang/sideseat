import { expect, test, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { assertLocalTestDatabase } from "./helpers/local-test-database";

assertLocalTestDatabase();
const prisma = new PrismaClient();
const E2E_USER = process.env.E2E_USER ?? "test_001";
const E2E_PEER = process.env.E2E_PEER ?? "test_002";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "Password123";
const CHAT_TEST_IP = `192.0.2.${(process.pid % 200) + 1}`;
const device = {
  id: "playwright-ios-chat-device",
  name: "Playwright Chat iPhone",
  appVersion: "1.0.0",
  platformVersion: "17.0",
};

let connectionId = "";
const createdMessageIds: string[] = [];

async function accessToken(request: APIRequestContext, identifier = E2E_USER) {
  const response = await request.post("/api/v1/auth/login", {
    headers: { "x-forwarded-for": CHAT_TEST_IP },
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

test.beforeAll(async () => {
  const users = await prisma.user.findMany({
    where: { username: { in: [E2E_USER, E2E_PEER] } },
    select: { id: true, username: true },
  });
  const byUsername = new Map(users.map((user) => [user.username, user.id]));
  const userId = byUsername.get(E2E_USER);
  const peerId = byUsername.get(E2E_PEER);
  if (!userId || !peerId) throw new Error("Seeded direct-message users are missing.");

  const connection = await prisma.connection.findFirst({
    where: {
      status: "ACTIVE",
      OR: [
        { userAId: userId, userBId: peerId },
        { userAId: peerId, userBId: userId },
      ],
    },
    select: { id: true },
  });
  if (!connection) throw new Error("The seeded direct-message connection is missing.");
  connectionId = connection.id;
});

test.afterAll(async () => {
  if (createdMessageIds.length > 0) {
    await prisma.message.deleteMany({ where: { id: { in: createdMessageIds } } });
  }
  if (connectionId) {
    await prisma.apiIdempotencyRecord.deleteMany({
      where: { scope: `native-direct-message:${connectionId}` },
    });
  }
  await prisma.$disconnect();
});

test.describe.serial("API v1 direct messages", () => {
  test("requires authentication and validates the idempotency key", async ({ request }) => {
    const unauthorized = await request.get(`/api/v1/connections/${connectionId}/messages`);
    expect(unauthorized.status()).toBe(401);

    const token = await accessToken(request);
    const missingKey = await request.post(`/api/v1/connections/${connectionId}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { type: "TEXT", body: "must not be created" },
    });
    expect(missingKey.status()).toBe(422);
    await expect(missingKey.json()).resolves.toMatchObject({
      error: { code: "IDEMPOTENCY_KEY_REQUIRED", field: "Idempotency-Key" },
    });
  });

  test("creates one message for concurrent retries and rejects key reuse with another body", async ({
    request,
  }) => {
    const token = await accessToken(request);
    const key = `chat-${Date.now()}-concurrent`;
    const body = `api v1 idempotent ${Date.now()}`;
    const headers = { Authorization: `Bearer ${token}`, "Idempotency-Key": key };
    const responses = await Promise.all([
      request.post(`/api/v1/connections/${connectionId}/messages`, {
        headers,
        data: { type: "TEXT", body },
      }),
      request.post(`/api/v1/connections/${connectionId}/messages`, {
        headers,
        data: { type: "TEXT", body },
      }),
    ]);
    expect(responses.map((response) => response.status())).toEqual([201, 201]);

    const payloads = await Promise.all(
      responses.map(
        (response) =>
          response.json() as Promise<{ data: { id: string; body: string; sender: { username: string } } }>,
      ),
    );
    expect(payloads[0].data.id).toBe(payloads[1].data.id);
    expect(payloads[0].data.body).toBe(body);
    expect(payloads[0].data.sender.username).toBe(E2E_USER);
    createdMessageIds.push(payloads[0].data.id);
    expect(await prisma.message.count({ where: { connectionId, body } })).toBe(1);
    expect(responses.some((response) => response.headers()["idempotency-replayed"] === "true")).toBe(
      true,
    );

    const conflict = await request.post(`/api/v1/connections/${connectionId}/messages`, {
      headers,
      data: { type: "TEXT", body: `${body} changed` },
    });
    expect(conflict.status()).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({
      error: { code: "IDEMPOTENCY_CONFLICT", retryable: false },
    });
  });

  test("creates a location message through the v1 send contract", async ({ request }) => {
    const token = await accessToken(request);
    const key = `chat-${Date.now()}-location`;
    const created = await request.post(`/api/v1/connections/${connectionId}/messages`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": key,
      },
      data: {
        type: "LOCATION",
        locationLat: 48.137154,
        locationLng: 11.576124,
      },
    });
    expect(created.status()).toBe(201);
    const payload = (await created.json()) as {
      data: {
        id: string;
        type: string;
        location: { latitude: number; longitude: number; name: string | null };
      };
    };
    createdMessageIds.push(payload.data.id);
    expect(payload.data.type).toBe("LOCATION");
    expect(payload.data.location).toEqual({
      latitude: 48.137154,
      longitude: 11.576124,
      name: null,
    });

    const replay = await request.post(`/api/v1/connections/${connectionId}/messages`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": key,
      },
      data: {
        type: "LOCATION",
        locationLat: 48.137154,
        locationLng: 11.576124,
      },
    });
    expect(replay.status()).toBe(201);
    expect(replay.headers()["idempotency-replayed"]).toBe("true");
    expect((await replay.json()).data.id).toBe(payload.data.id);
  });

  test("reports a peer direct message through the legacy reports route", async ({
    request,
  }) => {
    const token = await accessToken(request);
    const peerUsers = await prisma.user.findMany({
      where: { username: { in: [E2E_USER, E2E_PEER] } },
      select: { id: true, username: true },
    });
    const byUsername = new Map(peerUsers.map((user) => [user.username, user.id]));
    const peerId = byUsername.get(E2E_PEER);
    expect(peerId).toBeTruthy();

    const peerMessage = await prisma.message.create({
      data: {
        connectionId,
        senderId: peerId!,
        type: "TEXT",
        body: `report target ${Date.now()}`,
      },
      select: { id: true },
    });
    createdMessageIds.push(peerMessage.id);

    const reported = await request.post("/api/reports", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        reportedUserId: peerId,
        messageId: peerMessage.id,
        reason: "SPAM",
        details: "native location/report slice",
      },
    });
    expect(reported.status()).toBe(201);
    const reportPayload = (await reported.json()) as {
      success: boolean;
      data: { id: string; reason: string; messageId: string | null };
    };
    expect(reportPayload.success).toBe(true);
    expect(reportPayload.data.reason).toBe("SPAM");
    expect(reportPayload.data.messageId).toBe(peerMessage.id);
    await prisma.report.delete({ where: { id: reportPayload.data.id } });
  });

  test("returns chronological cursor pages and reply metadata", async ({ request }) => {
    const token = await accessToken(request);
    const firstId = createdMessageIds[0];
    expect(firstId).toBeTruthy();
    const reply = await request.post(`/api/v1/connections/${connectionId}/messages`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": `chat-${Date.now()}-reply`,
      },
      data: { type: "TEXT", body: `api v1 reply ${Date.now()}`, replyToId: firstId },
    });
    expect(reply.status()).toBe(201);
    const replyPayload = (await reply.json()) as {
      data: { id: string; replyTo: { id: string } | null };
    };
    createdMessageIds.push(replyPayload.data.id);
    expect(replyPayload.data.replyTo?.id).toBe(firstId);

    const firstPage = await request.get(
      `/api/v1/connections/${connectionId}/messages?limit=1`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(firstPage.status()).toBe(200);
    const firstPagePayload = (await firstPage.json()) as {
      data: { messages: Array<{ id: string }>; connection: { peer: { username: string } } };
      meta: { hasMore: boolean; nextCursor: string | null };
    };
    expect(firstPagePayload.data.messages).toHaveLength(1);
    expect(firstPagePayload.data.messages[0]?.id).toBe(replyPayload.data.id);
    expect(firstPagePayload.data.connection.peer.username).toBe(E2E_PEER);
    expect(firstPagePayload.meta.hasMore).toBe(true);
    expect(firstPagePayload.meta.nextCursor).toBe(replyPayload.data.id);

    const olderPage = await request.get(
      `/api/v1/connections/${connectionId}/messages?limit=100&cursor=${firstPagePayload.meta.nextCursor}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(olderPage.status()).toBe(200);
    const olderPayload = (await olderPage.json()) as {
      data: { messages: Array<{ id: string }> };
    };
    expect(olderPayload.data.messages.some((message) => message.id === firstId)).toBe(true);
  });

  test("blocks a third unreplied message until the peer replies", async ({ request }) => {
    const users = await prisma.user.findMany({
      where: { username: { in: [E2E_USER, E2E_PEER] } },
      select: { id: true, username: true },
    });
    const byUsername = new Map(users.map((user) => [user.username, user.id]));
    const userId = byUsername.get(E2E_USER);
    const peerId = byUsername.get(E2E_PEER);
    expect(userId && peerId).toBeTruthy();

    const isolated = await prisma.connection.create({
      data: {
        userAId: userId!,
        userBId: peerId!,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    const isolatedIds: string[] = [];

    try {
      const token = await accessToken(request, E2E_USER);
      const peerToken = await accessToken(request, E2E_PEER);

      for (const index of [1, 2] as const) {
        const created = await request.post(`/api/v1/connections/${isolated.id}/messages`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Idempotency-Key": `unreplied-${isolated.id}-${index}`,
          },
          data: { type: "TEXT", body: `unreplied ${index} ${Date.now()}` },
        });
        expect(created.status()).toBe(201);
        const payload = (await created.json()) as { data: { id: string } };
        isolatedIds.push(payload.data.id);
      }

      const blocked = await request.post(`/api/v1/connections/${isolated.id}/messages`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": `unreplied-${isolated.id}-3`,
        },
        data: { type: "TEXT", body: `unreplied blocked ${Date.now()}` },
      });
      expect(blocked.status()).toBe(403);
      await expect(blocked.json()).resolves.toMatchObject({
        error: { code: "PEER_REPLY_REQUIRED", retryable: false },
      });

      await prisma.message.updateMany({
        where: { id: { in: isolatedIds } },
        data: { deletedAt: new Date(), body: "" },
      });

      const stillBlocked = await request.post(`/api/v1/connections/${isolated.id}/messages`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": `unreplied-${isolated.id}-after-delete`,
        },
        data: { type: "TEXT", body: `unreplied after delete ${Date.now()}` },
      });
      expect(stillBlocked.status()).toBe(403);
      await expect(stillBlocked.json()).resolves.toMatchObject({
        error: { code: "PEER_REPLY_REQUIRED" },
      });

      const peerReply = await request.post(`/api/v1/connections/${isolated.id}/messages`, {
        headers: {
          Authorization: `Bearer ${peerToken}`,
          "Idempotency-Key": `unreplied-${isolated.id}-peer`,
        },
        data: { type: "TEXT", body: `peer reply ${Date.now()}` },
      });
      expect(peerReply.status()).toBe(201);
      const peerPayload = (await peerReply.json()) as { data: { id: string } };
      isolatedIds.push(peerPayload.data.id);

      // The first reply completes mutual contact. The responder must not be
      // limited to another two messages while waiting for the initiator again.
      for (const index of [2, 3, 4] as const) {
        const continuedReply = await request.post(
          `/api/v1/connections/${isolated.id}/messages`,
          {
            headers: {
              Authorization: `Bearer ${peerToken}`,
              "Idempotency-Key": `unreplied-${isolated.id}-peer-${index}`,
            },
            data: { type: "TEXT", body: `peer continued ${index} ${Date.now()}` },
          },
        );
        expect(continuedReply.status()).toBe(201);
        const continuedPayload = (await continuedReply.json()) as { data: { id: string } };
        isolatedIds.push(continuedPayload.data.id);
      }

      const unlocked = await prisma.connection.findUnique({
        where: { id: isolated.id },
        select: { replyLimitUnlockedAt: true },
      });
      expect(unlocked?.replyLimitUnlockedAt).not.toBeNull();

      const afterReply = await request.post(`/api/v1/connections/${isolated.id}/messages`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": `unreplied-${isolated.id}-after-peer`,
        },
        data: { type: "TEXT", body: `after peer ${Date.now()}` },
      });
      expect(afterReply.status()).toBe(201);
      const afterPayload = (await afterReply.json()) as { data: { id: string } };
      isolatedIds.push(afterPayload.data.id);
    } finally {
      await prisma.apiIdempotencyRecord.deleteMany({
        where: { scope: `native-direct-message:${isolated.id}` },
      });
      if (isolatedIds.length > 0) {
        await prisma.message.deleteMany({ where: { id: { in: isolatedIds } } });
      }
      await prisma.message.deleteMany({ where: { connectionId: isolated.id } });
      await prisma.connection.delete({ where: { id: isolated.id } }).catch(() => {});
    }
  });
});
