import { expect, test, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { assertLocalTestDatabase } from "./helpers/local-test-database";

assertLocalTestDatabase();
const prisma = new PrismaClient();
const E2E_USER = process.env.E2E_USER ?? "test_001";
const E2E_PEER = process.env.E2E_PEER ?? "test_002";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "Password123";
const IP = `198.51.100.${(process.pid % 200) + 20}`;
const device = {
  id: "playwright-ios-contacts-device",
  name: "Playwright Contacts iPhone",
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
  if (!userId || !peerId) throw new Error("Seeded contacts users missing.");

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
  if (!connection) throw new Error("Seeded connection missing.");
  connectionId = connection.id;

  await prisma.friendLink.upsert({
    where: { connectionId },
    create: {
      connectionId,
      requesterId: userId,
      responderId: peerId,
      status: "ACCEPTED",
    },
    update: { status: "ACCEPTED", requesterId: userId, responderId: peerId },
  });
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe.serial("API v1 contacts", () => {
  test("lists accepted close friends and searches peers", async ({ request }) => {
    const unauthorized = await request.get("/api/v1/contacts");
    expect(unauthorized.status()).toBe(401);

    const token = await accessToken(request);
    const headers = { Authorization: `Bearer ${token}` };

    const list = await request.get("/api/v1/contacts", { headers });
    expect(list.status()).toBe(200);
    const listPayload = (await list.json()) as {
      data: { contacts: Array<{ connectionId: string; peer: { username: string } }> };
    };
    expect(
      listPayload.data.contacts.some(
        (row) => row.connectionId === connectionId && row.peer.username === E2E_PEER,
      ),
    ).toBe(true);

    const search = await request.get(`/api/v1/contacts/search?q=${E2E_PEER}`, { headers });
    expect(search.status()).toBe(200);
    const searchPayload = (await search.json()) as {
      data: { hits: Array<{ username: string; activeConnectionId: string | null; email?: string }> };
    };
    const hit = searchPayload.data.hits.find((row) => row.username === E2E_PEER);
    expect(hit?.activeConnectionId).toBe(connectionId);
    expect(hit && "email" in hit).toBe(false);
  });

  test("add contact is idempotent for an existing active connection", async ({ request }) => {
    const token = await accessToken(request);
    const response = await request.post("/api/v1/contacts", {
      headers: {
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": `contacts-add-${Date.now()}`,
      },
      data: { peerId },
    });
    expect(response.status()).toBe(200);
    const payload = (await response.json()) as {
      data: { connectionId: string; created: boolean };
    };
    expect(payload.data.connectionId).toBe(connectionId);
    expect(payload.data.created).toBe(false);
  });
});
