import { expect, test, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { assertLocalTestDatabase } from "./helpers/local-test-database";

assertLocalTestDatabase();
const prisma = new PrismaClient();
const PASSWORD = "Password123";
const startedAt = new Date();
const suffix = `${process.pid}${Date.now().toString().slice(-6)}`;
const hostUsername = `journey_h_${suffix}`.slice(0, 30);
const seekerUsername = `journey_s_${suffix}`.slice(0, 30);
const IP = `203.0.113.${(process.pid % 180) + 40}`;

let hostId = "";
let seekerId = "";
let postId = "";
let connectionId = "";
let planId = "";

function auth(token: string, idempotencyKey?: string) {
  return {
    Authorization: `Bearer ${token}`,
    "x-forwarded-for": IP,
    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
  };
}

async function accessToken(request: APIRequestContext, identifier: string) {
  const response = await request.post("/api/v1/auth/login", {
    headers: { "x-forwarded-for": IP },
    data: {
      identifier,
      password: PASSWORD,
      device: {
        id: `playwright-buddy-journey-${identifier}`,
        name: "Buddy Journey iPhone",
        appVersion: "1.0.0",
        platformVersion: "17.0",
      },
    },
  });
  expect(response.status()).toBe(200);
  return ((await response.json()) as { data: { tokens: { accessToken: string } } }).data
    .tokens.accessToken;
}

function futureWindow() {
  const start = new Date(Date.now() + 48 * 60 * 60_000);
  start.setUTCMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 90 * 60_000);
  return { startTime: start.toISOString(), endTime: end.toISOString() };
}

test.beforeAll(async () => {
  const seed = await prisma.user.findUnique({
    where: { username: "test_001" },
    select: { hashedPassword: true },
  });
  if (!seed) throw new Error("Run npm run seed:test-accounts before the journey test.");

  const [host, seeker] = await Promise.all([
    prisma.user.create({
      data: {
        username: hostUsername,
        nickname: "Journey Host",
        nicknameKey: "journey host",
        hashedPassword: seed.hashedPassword,
        school: "TUM",
        onboardingComplete: true,
        verifiedStudent: true,
        studentVerificationStatus: "VERIFIED",
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    }),
    prisma.user.create({
      data: {
        username: seekerUsername,
        nickname: "Journey Seeker",
        nicknameKey: "journey seeker",
        hashedPassword: seed.hashedPassword,
        school: "TUM",
        onboardingComplete: true,
        verifiedStudent: true,
        studentVerificationStatus: "VERIFIED",
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    }),
  ]);
  hostId = host.id;
  seekerId = seeker.id;
});

test.afterAll(async () => {
  await prisma.apiIdempotencyRecord.deleteMany({
    where: { createdAt: { gte: startedAt } },
  });
  if (hostId || seekerId) {
    await prisma.user.deleteMany({
      where: { id: { in: [hostId, seekerId].filter(Boolean) } },
    });
  }
  await prisma.$disconnect();
});

test("find-buddy post becomes an unlocked chat and an accepted plan in both calendars", async ({
  request,
}) => {
  const hostToken = await accessToken(request, hostUsername);
  const seekerToken = await accessToken(request, seekerUsername);
  const title = `Buddy journey ${suffix}`;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString();

  const published = await request.post("/api/v1/discover/posts", {
    headers: auth(hostToken, `journey-post-${suffix}`),
    data: {
      city: "Munich",
      title,
      body: "Looking for someone to study and make a concrete plan with.",
      expiresAt,
    },
  });
  expect(published.status()).toBe(201);
  postId = ((await published.json()) as { data: { postId: string } }).data.postId;

  const feed = await request.get(`/api/v1/discover?q=${encodeURIComponent(title)}`, {
    headers: auth(seekerToken),
  });
  expect(feed.status()).toBe(200);
  await expect(feed.json()).resolves.toMatchObject({
    data: {
      buddies: [
        expect.objectContaining({
          id: postId,
          isOwn: false,
          author: expect.objectContaining({ id: hostId }),
        }),
      ],
    },
  });

  const detail = await request.get(`/api/v1/discover/posts/${postId}`, {
    headers: auth(seekerToken),
  });
  expect(detail.status()).toBe(200);
  await expect(detail.json()).resolves.toMatchObject({
    data: { post: { id: postId }, viewerCanMessage: true },
  });

  const opened = await request.post("/api/v1/connections/open", {
    headers: auth(seekerToken, `journey-open-${suffix}`),
    data: { peerId: hostId, postId },
  });
  expect(opened.status()).toBe(201);
  connectionId = ((await opened.json()) as { data: { connectionId: string } }).data
    .connectionId;
  await expect(
    prisma.classmatePostInsight.findUnique({
      where: {
        postId_actorId_kind: {
          postId,
          actorId: seekerId,
          kind: "MESSAGE_INTENT",
        },
      },
    }),
  ).resolves.not.toBeNull();

  for (const index of [1, 2]) {
    const sent = await request.post(`/api/v1/connections/${connectionId}/messages`, {
      headers: auth(seekerToken, `journey-message-${suffix}-${index}`),
      data: { type: "TEXT", body: `Hi, I am interested (${index}).` },
    });
    expect(sent.status()).toBe(201);
  }

  const window = futureWindow();
  const blockedPlan = await request.post(`/api/v1/connections/${connectionId}/plans`, {
    headers: auth(seekerToken, `journey-blocked-plan-${suffix}`),
    data: { title: "Should wait for a reply", ...window },
  });
  expect(blockedPlan.status()).toBe(403);
  await expect(blockedPlan.json()).resolves.toMatchObject({
    error: { code: "PEER_REPLY_REQUIRED" },
  });

  const hostReply = await request.post(`/api/v1/connections/${connectionId}/messages`, {
    headers: auth(hostToken, `journey-reply-${suffix}`),
    data: { type: "TEXT", body: "Yes, let's plan it." },
  });
  expect(hostReply.status()).toBe(201);
  await expect(
    prisma.connection.findUnique({
      where: { id: connectionId },
      select: { replyLimitUnlockedAt: true },
    }),
  ).resolves.toMatchObject({ replyLimitUnlockedAt: expect.any(Date) });

  const outsider = await prisma.user.findUniqueOrThrow({
    where: { username: "test_003" },
    select: { id: true },
  });
  const invalidReceiver = await request.post(`/api/v1/connections/${connectionId}/plans`, {
    headers: auth(seekerToken, `journey-invalid-receiver-${suffix}`),
    data: {
      title: "Invalid receiver",
      receiverUserId: outsider.id,
      ...window,
    },
  });
  expect(invalidReceiver.status()).toBe(422);

  const createdPlan = await request.post(`/api/v1/connections/${connectionId}/plans`, {
    headers: auth(seekerToken, `journey-plan-${suffix}`),
    data: {
      title: "Library study together",
      location: "Main Library",
      message: "Meet by the entrance.",
      planType: "STUDY",
      ...window,
    },
  });
  expect(createdPlan.status()).toBe(201);
  planId = ((await createdPlan.json()) as { data: { plan: { id: string } } }).data.plan.id;

  const acceptResponses = await Promise.all([
    request.post(`/api/v1/plans/${planId}/accept`, {
      headers: auth(hostToken, `journey-accept-a-${suffix}`),
    }),
    request.post(`/api/v1/plans/${planId}/accept`, {
      headers: auth(hostToken, `journey-accept-b-${suffix}`),
    }),
  ]);
  expect(acceptResponses.map((response) => response.status()).sort()).toEqual([200, 409]);

  const calendarEntries = await prisma.calendarEntry.findMany({
    where: { planRequestId: planId },
    select: { id: true, userId: true, companions: { select: { userId: true } } },
  });
  expect(calendarEntries).toHaveLength(2);
  expect(new Set(calendarEntries.map((entry) => entry.userId))).toEqual(
    new Set([hostId, seekerId]),
  );
  for (const entry of calendarEntries) {
    const expectedCompanion = entry.userId === hostId ? seekerId : hostId;
    expect(entry.companions).toContainEqual({ userId: expectedCompanion });
  }

  for (const token of [hostToken, seekerToken]) {
    const plans = await request.get("/api/v1/plans", { headers: auth(token) });
    expect(plans.status()).toBe(200);
    await expect(plans.json()).resolves.toMatchObject({
      data: {
        plans: expect.arrayContaining([
          expect.objectContaining({ id: planId, status: "ACCEPTED" }),
        ]),
      },
    });

    const schedule = await request.get(
      `/api/v1/home/schedule?windowStart=${encodeURIComponent(
        new Date(new Date(window.startTime).getTime() - 60 * 60_000).toISOString(),
      )}&windowEnd=${encodeURIComponent(
        new Date(new Date(window.endTime).getTime() + 60 * 60_000).toISOString(),
      )}`,
      { headers: auth(token) },
    );
    expect(schedule.status()).toBe(200);
    await expect(schedule.json()).resolves.toMatchObject({
      data: {
        studyEntries: expect.arrayContaining([
          expect.objectContaining({
            title: "Library study together",
            startISO: window.startTime,
            endISO: window.endTime,
          }),
        ]),
      },
    });
  }
});
