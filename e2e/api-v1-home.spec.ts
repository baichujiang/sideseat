import { expect, test, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { assertLocalTestDatabase } from "./helpers/local-test-database";

assertLocalTestDatabase();
const prisma = new PrismaClient();
const E2E_USER = process.env.E2E_USER ?? "test_001";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "Password123";
const HOME_TEST_IP = `198.51.100.${(process.pid % 200) + 21}`;
const device = {
  id: "playwright-ios-home-device",
  name: "Playwright Home iPhone",
  appVersion: "1.0.0",
  platformVersion: "17.0",
};

let calendarEntryId = "";
let categoryId = "";
const eventStart = new Date(Date.now() + 60 * 60 * 1000);
const eventEnd = new Date(eventStart.getTime() + 45 * 60 * 1000);

async function accessToken(request: APIRequestContext) {
  const response = await request.post("/api/v1/auth/login", {
    headers: { "x-forwarded-for": HOME_TEST_IP },
    data: { identifier: E2E_USER, password: E2E_PASSWORD, device },
  });
  expect(response.status()).toBe(200);
  const payload = (await response.json()) as { data: { tokens: { accessToken: string } } };
  return payload.data.tokens.accessToken;
}

test.beforeAll(async () => {
  const user = await prisma.user.findUnique({
    where: { username: E2E_USER },
    select: { id: true },
  });
  if (!user) throw new Error("The seeded Home test user is missing.");

  const category = await prisma.userCalendarCategory.create({
    data: {
      userId: user.id,
      name: `API v1 Home ${Date.now()}`,
      color: "#2563EB",
      sortOrder: 999,
    },
  });
  categoryId = category.id;
  const entry = await prisma.calendarEntry.create({
    data: {
      userId: user.id,
      categoryId,
      title: "Native Home schedule fixture",
      location: "Munich",
      startAt: eventStart,
      endAt: eventEnd,
    },
  });
  calendarEntryId = entry.id;
});

test.afterAll(async () => {
  if (calendarEntryId) {
    await prisma.calendarEntry.deleteMany({ where: { id: calendarEntryId } });
  }
  if (categoryId) {
    await prisma.userCalendarCategory.deleteMany({ where: { id: categoryId } });
  }
  await prisma.$disconnect();
});

test.describe.serial("API v1 Home schedule", () => {
  test("requires authentication and validates the requested window", async ({ request }) => {
    const query = `windowStart=${encodeURIComponent(eventStart.toISOString())}&windowEnd=${encodeURIComponent(eventEnd.toISOString())}`;
    expect((await request.get(`/api/v1/home/schedule?${query}`)).status()).toBe(401);
    expect(
      (await request.get(`/api/v1/home/schedule/ics-subscriptions?${query}`)).status(),
    ).toBe(401);

    const token = await accessToken(request);
    const invalid = await request.get(
      "/api/v1/home/schedule?windowStart=invalid&windowEnd=also-invalid",
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(invalid.status()).toBe(422);
    expect((await invalid.json()).error.field).toBe("windowStart");

    const invalidSubscriptions = await request.get(
      "/api/v1/home/schedule/ics-subscriptions?windowStart=invalid&windowEnd=also-invalid",
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(invalidSubscriptions.status()).toBe(422);
    expect((await invalidSubscriptions.json()).error.field).toBe("windowStart");

    const start = new Date("2026-01-01T00:00:00.000Z");
    const end = new Date("2026-06-01T00:00:00.000Z");
    const tooWide = await request.get(
      `/api/v1/home/schedule?windowStart=${encodeURIComponent(start.toISOString())}&windowEnd=${encodeURIComponent(end.toISOString())}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(tooWide.status()).toBe(422);
    expect((await tooWide.json()).error.field).toBe("windowEnd");
  });

  test("returns stable schedule, category and window DTOs", async ({ request }) => {
    const token = await accessToken(request);
    const windowStart = new Date(eventStart.getTime() - 24 * 60 * 60 * 1000);
    const windowEnd = new Date(eventEnd.getTime() + 24 * 60 * 60 * 1000);
    const response = await request.get(
      `/api/v1/home/schedule?windowStart=${encodeURIComponent(windowStart.toISOString())}&windowEnd=${encodeURIComponent(windowEnd.toISOString())}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    expect(response.status()).toBe(200);
    const payload = (await response.json()) as {
      data: {
        window: { start: string; end: string; timeZone: string };
        studyEntries: Array<{
          id: string;
          title: string;
          startISO: string;
          endISO: string;
          categoryId: string | null;
        }>;
        classBlocks: unknown[];
        companionOptions: unknown[];
        initialCalendarCategories: Array<{ id: string; color: string }>;
      };
    };
    const event = payload.data.studyEntries.find((entry) => entry.id === calendarEntryId);
    expect(payload.data.window).toEqual({
      start: windowStart.toISOString(),
      end: windowEnd.toISOString(),
      timeZone: "Europe/Berlin",
    });
    expect(event).toMatchObject({
      title: "Native Home schedule fixture",
      startISO: eventStart.toISOString(),
      endISO: eventEnd.toISOString(),
      categoryId,
    });
    expect(
      payload.data.initialCalendarCategories.some(
        (category) => category.id === categoryId && category.color === "#2563EB",
      ),
    ).toBe(true);
    expect(Array.isArray(payload.data.classBlocks)).toBe(true);
    expect(Array.isArray(payload.data.companionOptions)).toBe(true);

    const subscriptions = await request.get(
      `/api/v1/home/schedule/ics-subscriptions?windowStart=${encodeURIComponent(windowStart.toISOString())}&windowEnd=${encodeURIComponent(windowEnd.toISOString())}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(subscriptions.status()).toBe(200);
    const subscriptionPayload = (await subscriptions.json()) as {
      data: { studyEntries: Array<{ id: string }> };
    };
    expect(Array.isArray(subscriptionPayload.data.studyEntries)).toBe(true);
    expect(
      subscriptionPayload.data.studyEntries.every((entry) => entry.id.startsWith("icsfeed:")),
    ).toBe(true);
  });
});
