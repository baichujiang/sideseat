import { expect, test, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { assertLocalTestDatabase } from "./helpers/local-test-database";

assertLocalTestDatabase();
const prisma = new PrismaClient();
const E2E_USER = process.env.E2E_USER ?? "test_001";
const E2E_PEER = process.env.E2E_PEER ?? "test_002";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "Password123";
const IP = `198.51.100.${(process.pid % 200) + 70}`;
const device = {
  id: "playwright-ios-plans-device",
  name: "Playwright Plans iPhone",
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

function futureWindow(hoursFromNow = 24) {
  const start = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { startTime: start.toISOString(), endTime: end.toISOString() };
}

test.beforeAll(async () => {
  const users = await prisma.user.findMany({
    where: { username: { in: [E2E_USER, E2E_PEER] } },
    select: { id: true, username: true },
  });
  const byUsername = new Map(users.map((user) => [user.username, user.id]));
  userId = byUsername.get(E2E_USER) ?? "";
  peerId = byUsername.get(E2E_PEER) ?? "";
  if (!userId || !peerId) throw new Error("Seeded plan users missing.");

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
    data: { status: "ACTIVE", endedAt: null, endedById: null },
  });
  await prisma.calendarEntry.deleteMany({
    where: {
      planRequest: { connectionId },
    },
  });
  await prisma.message.deleteMany({ where: { connectionId, planRequestId: { not: null } } });
  await prisma.planRequest.deleteMany({ where: { connectionId } });
});

test.afterAll(async () => {
  await prisma.calendarEntry.deleteMany({
    where: { planRequest: { connectionId } },
  });
  await prisma.message.deleteMany({ where: { connectionId, planRequestId: { not: null } } });
  await prisma.planRequest.deleteMany({ where: { connectionId } });
  await prisma.$disconnect();
});

test("create plan, list pending, accept, and enrich message DTO", async ({ request }) => {
  const proposerToken = await accessToken(request, E2E_USER);
  const receiverToken = await accessToken(request, E2E_PEER);
  const window = futureWindow(30);

  const create = await request.post(`/api/v1/connections/${connectionId}/plans`, {
    headers: {
      Authorization: `Bearer ${proposerToken}`,
      "Idempotency-Key": `plan-create-${Date.now()}`,
      "x-forwarded-for": IP,
    },
    data: {
      title: "Library study",
      location: "Central Library",
      message: "Bring notes",
      ...window,
      planType: "STUDY",
    },
  });
  expect(create.status()).toBe(201);
  const created = (await create.json()) as {
    data: { plan: { id: string; status: string; title: string }; messageId: string };
  };
  expect(created.data.plan.status).toBe("PENDING");
  expect(created.data.plan.title).toBe("Library study");
  expect(created.data.messageId).toBeTruthy();

  const list = await request.get("/api/v1/plans", {
    headers: { Authorization: `Bearer ${receiverToken}`, "x-forwarded-for": IP },
  });
  expect(list.status()).toBe(200);
  const pending = (await list.json()) as {
    data: { plans: Array<{ id: string; status: string }> };
  };
  expect(pending.data.plans.some((plan) => plan.id === created.data.plan.id)).toBe(true);

  const proposerList = await request.get("/api/v1/plans", {
    headers: { Authorization: `Bearer ${proposerToken}`, "x-forwarded-for": IP },
  });
  expect(proposerList.status()).toBe(200);
  const proposerPending = (await proposerList.json()) as {
    data: { plans: Array<{ id: string; status: string }> };
  };
  expect(proposerPending.data.plans).toContainEqual(
    expect.objectContaining({ id: created.data.plan.id, status: "PENDING" }),
  );

  const messages = await request.get(`/api/v1/connections/${connectionId}/messages`, {
    headers: { Authorization: `Bearer ${receiverToken}`, "x-forwarded-for": IP },
  });
  expect(messages.status()).toBe(200);
  const page = (await messages.json()) as {
    data: {
      messages: Array<{
        id: string;
        type: string;
        planRequestId: string | null;
        planRequest: { id: string; title: string } | null;
      }>;
    };
  };
  const card = page.data.messages.find((message) => message.id === created.data.messageId);
  expect(card?.type).toBe("PLAN_REQUEST_CARD");
  expect(card?.planRequest?.id).toBe(created.data.plan.id);
  expect(card?.planRequest?.title).toBe("Library study");

  const accept = await request.post(`/api/v1/plans/${created.data.plan.id}/accept`, {
    headers: {
      Authorization: `Bearer ${receiverToken}`,
      "Idempotency-Key": `plan-accept-${Date.now()}`,
      "x-forwarded-for": IP,
    },
  });
  expect(accept.status()).toBe(200);
  const accepted = (await accept.json()) as { data: { plan: { status: string } } };
  expect(accepted.data.plan.status).toBe("ACCEPTED");

  const calendarEntries = await prisma.calendarEntry.findMany({
    where: { planRequestId: created.data.plan.id },
    select: { id: true, userId: true },
  });
  expect(calendarEntries).toHaveLength(2);

  const scheduleStart = new Date(new Date(window.startTime).getTime() - 60 * 60 * 1000);
  const scheduleEnd = new Date(new Date(window.endTime).getTime() + 60 * 60 * 1000);

  for (const viewer of [
    { token: proposerToken, userId },
    { token: receiverToken, userId: peerId },
  ]) {
    const plans = await request.get("/api/v1/plans", {
      headers: { Authorization: `Bearer ${viewer.token}`, "x-forwarded-for": IP },
    });
    expect(plans.status()).toBe(200);
    const plansPayload = (await plans.json()) as {
      data: { plans: Array<{ id: string; status: string }> };
    };
    expect(plansPayload.data.plans).toContainEqual(
      expect.objectContaining({ id: created.data.plan.id, status: "ACCEPTED" }),
    );

    const schedule = await request.get(
      `/api/v1/home/schedule?windowStart=${encodeURIComponent(scheduleStart.toISOString())}&windowEnd=${encodeURIComponent(scheduleEnd.toISOString())}`,
      { headers: { Authorization: `Bearer ${viewer.token}`, "x-forwarded-for": IP } },
    );
    expect(schedule.status()).toBe(200);
    const schedulePayload = (await schedule.json()) as {
      data: {
        studyEntries: Array<{
          id: string;
          title: string;
          startISO: string;
          endISO: string;
        }>;
      };
    };
    const calendarEntry = calendarEntries.find((entry) => entry.userId === viewer.userId);
    if (!calendarEntry) {
      throw new Error(`Calendar entry missing for user ${viewer.userId}.`);
    }
    expect(schedulePayload.data.studyEntries).toContainEqual(
      expect.objectContaining({
        id: calendarEntry.id,
        title: "Library study",
        startISO: window.startTime,
        endISO: window.endTime,
      }),
    );
  }
});

test("decline and counter-propose plan requests", async ({ request }) => {
  const proposerToken = await accessToken(request, E2E_USER);
  const receiverToken = await accessToken(request, E2E_PEER);

  const declineWindow = futureWindow(40);
  const declineCreate = await request.post(`/api/v1/connections/${connectionId}/plans`, {
    headers: {
      Authorization: `Bearer ${proposerToken}`,
      "Idempotency-Key": `plan-decline-create-${Date.now()}`,
      "x-forwarded-for": IP,
    },
    data: {
      title: "Quick coffee",
      ...declineWindow,
    },
  });
  expect(declineCreate.status()).toBe(201);
  const declinePlan = (await declineCreate.json()) as { data: { plan: { id: string } } };

  const decline = await request.post(`/api/v1/plans/${declinePlan.data.plan.id}/decline`, {
    headers: {
      Authorization: `Bearer ${receiverToken}`,
      "Idempotency-Key": `plan-decline-${Date.now()}`,
      "x-forwarded-for": IP,
    },
  });
  expect(decline.status()).toBe(200);
  const declined = (await decline.json()) as { data: { plan: { status: string } } };
  expect(declined.data.plan.status).toBe("DECLINED");

  const counterWindow = futureWindow(50);
  const counterCreate = await request.post(`/api/v1/connections/${connectionId}/plans`, {
    headers: {
      Authorization: `Bearer ${proposerToken}`,
      "Idempotency-Key": `plan-counter-create-${Date.now()}`,
      "x-forwarded-for": IP,
    },
    data: {
      title: "Campus walk",
      ...counterWindow,
    },
  });
  expect(counterCreate.status()).toBe(201);
  const original = (await counterCreate.json()) as { data: { plan: { id: string } } };

  const nextWindow = futureWindow(52);
  const counter = await request.post(`/api/v1/plans/${original.data.plan.id}/counter`, {
    headers: {
      Authorization: `Bearer ${receiverToken}`,
      "Idempotency-Key": `plan-counter-${Date.now()}`,
      "x-forwarded-for": IP,
    },
    data: {
      title: "Campus walk later",
      ...nextWindow,
    },
  });
  expect(counter.status()).toBe(201);
  const countered = (await counter.json()) as {
    data: { plan: { id: string; status: string; counterOfId: string | null; title: string } };
  };
  expect(countered.data.plan.status).toBe("PENDING");
  expect(countered.data.plan.counterOfId).toBe(original.data.plan.id);
  expect(countered.data.plan.title).toBe("Campus walk later");

  const originalRow = await prisma.planRequest.findUnique({
    where: { id: original.data.plan.id },
    select: { status: true },
  });
  expect(originalRow?.status).toBe("COUNTER_PROPOSED");
});
