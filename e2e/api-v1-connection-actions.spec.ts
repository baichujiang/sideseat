import { expect, test, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { assertLocalTestDatabase } from "./helpers/local-test-database";

assertLocalTestDatabase();
const prisma = new PrismaClient();
const E2E_USER = process.env.E2E_USER ?? "test_001";
const E2E_PEER = process.env.E2E_PEER ?? "test_002";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "Password123";
const IP = `198.51.100.${(process.pid % 200) + 60}`;
const device = {
  id: "playwright-ios-connection-actions-device",
  name: "Playwright Connection Actions iPhone",
  appVersion: "1.0.0",
  platformVersion: "17.0",
};

let userId = "";
let peerId = "";
let connectionId = "";

async function accessToken(request: APIRequestContext, identifier = E2E_USER) {
  const response = await request.post("/api/v1/auth/login", {
    headers: { "x-forwarded-for": IP },
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
  userId = byUsername.get(E2E_USER) ?? "";
  peerId = byUsername.get(E2E_PEER) ?? "";
  if (!userId || !peerId) throw new Error("Seeded connection-action users missing.");

  const connection = await prisma.connection.findFirst({
    where: {
      OR: [
        { userAId: userId, userBId: peerId },
        { userAId: peerId, userBId: userId },
      ],
    },
    select: { id: true },
  });
  if (!connection) throw new Error("Seeded connection missing.");
  connectionId = connection.id;

  await prisma.connection.update({
    where: { id: connectionId },
    data: {
      status: "ACTIVE",
      endedAt: null,
      endedById: null,
      contactRemarkByA: null,
      contactRemarkByB: null,
    },
  });
  await prisma.friendLink.deleteMany({ where: { connectionId } });
  await prisma.contactExchangeRequest.deleteMany({ where: { connectionId } });
  await prisma.block.deleteMany({
    where: {
      OR: [
        { blockerId: userId, blockedId: peerId },
        { blockerId: peerId, blockedId: userId },
      ],
    },
  });
});

test.afterAll(async () => {
  await prisma.connection.update({
    where: { id: connectionId },
    data: {
      status: "ACTIVE",
      endedAt: null,
      endedById: null,
      contactRemarkByA: null,
      contactRemarkByB: null,
    },
  });
  await prisma.friendLink.deleteMany({ where: { connectionId } });
  await prisma.contactExchangeRequest.deleteMany({ where: { connectionId } });
  await prisma.block.deleteMany({
    where: {
      OR: [
        { blockerId: userId, blockedId: peerId },
        { blockerId: peerId, blockedId: userId },
      ],
    },
  });
  await prisma.$disconnect();
});

test.describe.serial("API v1 connection actions", () => {
  test("loads actions, sets remark, and toggles friend-link / contact-exchange", async ({
    request,
  }) => {
    const token = await accessToken(request);
    const headers = { Authorization: `Bearer ${token}` };

    const actions = await request.get(`/api/v1/connections/${connectionId}/actions`, { headers });
    expect(actions.status()).toBe(200);
    const actionsPayload = (await actions.json()) as {
      data: {
        peerId: string;
        friendLink: { status: string };
        contactExchange: { status: string };
      };
    };
    expect(actionsPayload.data.peerId).toBe(peerId);
    expect(actionsPayload.data.friendLink.status).toBe("NONE");

    const remark = await request.patch(`/api/v1/connections/${connectionId}/contact-remark`, {
      headers: { ...headers, "Idempotency-Key": `remark-${Date.now()}` },
      data: { remark: "Study buddy" },
    });
    expect(remark.status()).toBe(200);
    expect(((await remark.json()) as { data: { remark: string } }).data.remark).toBe("Study buddy");

    const friendRequest = await request.post(`/api/v1/connections/${connectionId}/friend-link`, {
      headers: { ...headers, "Idempotency-Key": `friend-req-${Date.now()}` },
      data: { action: "request" },
    });
    expect(friendRequest.status()).toBe(200);
    expect(((await friendRequest.json()) as { data: { status: string; role: string } }).data).toEqual({
      status: "PENDING",
      role: "requester",
    });

    const peerToken = await accessToken(request, E2E_PEER);
    const accept = await request.post(`/api/v1/connections/${connectionId}/friend-link`, {
      headers: {
        Authorization: `Bearer ${peerToken}`,
        "Idempotency-Key": `friend-accept-${Date.now()}`,
      },
      data: { action: "accept" },
    });
    expect(accept.status()).toBe(200);
    expect(((await accept.json()) as { data: { status: string } }).data.status).toBe("ACCEPTED");

    const exchange = await request.post(`/api/v1/connections/${connectionId}/contact-exchange`, {
      headers: { ...headers, "Idempotency-Key": `exchange-req-${Date.now()}` },
      data: { action: "request" },
    });
    expect(exchange.status()).toBe(200);
    expect(((await exchange.json()) as { data: { status: string; role: string } }).data).toEqual({
      status: "PENDING",
      role: "requester",
      cooldownUntil: null,
    });
  });

  test("ends a conversation", async ({ request }) => {
    await prisma.connection.update({
      where: { id: connectionId },
      data: { status: "ACTIVE", endedAt: null, endedById: null },
    });
    const token = await accessToken(request);
    const ended = await request.post(`/api/v1/connections/${connectionId}/end`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": `end-${Date.now()}`,
      },
    });
    expect(ended.status()).toBe(200);
    expect(
      Number.isNaN(
        Date.parse(((await ended.json()) as { data: { endedAt: string } }).data.endedAt),
      ),
    ).toBe(false);

    const row = await prisma.connection.findUniqueOrThrow({
      where: { id: connectionId },
      select: { status: true },
    });
    expect(row.status).toBe("ENDED");
  });
});
