import { expect, test, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { assertLocalTestDatabase } from "./helpers/local-test-database";
import { getClassScheduleDateRange } from "@/lib/constants/vorlesungszeit";

assertLocalTestDatabase();
const prisma = new PrismaClient();
const E2E_USER = process.env.E2E_USER ?? "test_001";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "Password123";
const TEST_RUN = `${Date.now()}-${process.pid}`;
const TEST_TITLE = `Native calendar ${TEST_RUN}`;
const TEST_IP = `198.51.100.${(process.pid % 200) + 31}`;
const device = {
  id: `playwright-ios-calendar-${process.pid}`,
  name: "Playwright Calendar iPhone",
  appVersion: "1.0.0",
  platformVersion: "17.0",
};

let userId = "";
let userSchool: string | null = null;
let categoryId = "";
let eventId = "";
let managedCategoryId = "";
let managedCategoryEventId = "";
let cachedAccessToken = "";

const startAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

async function accessToken(request: APIRequestContext) {
  if (cachedAccessToken) return cachedAccessToken;
  const response = await request.post("/api/v1/auth/login", {
    headers: { "x-forwarded-for": TEST_IP },
    data: { identifier: E2E_USER, password: E2E_PASSWORD, device },
  });
  expect(response.status()).toBe(200);
  const payload = (await response.json()) as { data: { tokens: { accessToken: string } } };
  cachedAccessToken = payload.data.tokens.accessToken;
  return cachedAccessToken;
}

function eventBody(overrides: Record<string, unknown> = {}) {
  return {
    title: TEST_TITLE,
    location: "Munich",
    note: "Created from native iOS",
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    repeat: "NONE",
    repeatUntil: "",
    categoryId,
    withUserIds: [],
    ...overrides,
  };
}

function formatIcsUtc(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

test.beforeAll(async () => {
  const user = await prisma.user.findUnique({
    where: { username: E2E_USER },
    select: { id: true, school: true },
  });
  if (!user) throw new Error("The seeded Calendar test user is missing.");
  userId = user.id;
  userSchool = user.school;
  const category = await prisma.userCalendarCategory.create({
    data: {
      userId,
      name: `Native Calendar ${TEST_RUN}`,
      color: "#10B981",
      sortOrder: 1001,
    },
  });
  categoryId = category.id;
});

test.afterAll(async () => {
  if (managedCategoryEventId) {
    await prisma.calendarEntry.deleteMany({ where: { id: managedCategoryEventId } });
  }
  if (userId) {
    await prisma.calendarEntry.deleteMany({
      where: { userId, title: { startsWith: `Native calendar ${TEST_RUN}` } },
    });
  }
  if (categoryId) {
    await prisma.userCalendarCategory.deleteMany({ where: { id: categoryId } });
  }
  if (managedCategoryId) {
    await prisma.userCalendarCategory.deleteMany({ where: { id: managedCategoryId } });
  }
  await prisma.$disconnect();
});

test.describe.serial("API v1 Calendar categories", () => {
  test("lists only the current general-purpose defaults and requires authentication", async ({
    request,
  }) => {
    expect((await request.get("/api/v1/calendar/categories")).status()).toBe(401);

    const token = await accessToken(request);
    const response = await request.get("/api/v1/calendar/categories", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status()).toBe(200);
    const payload = (await response.json()) as {
      data: { categories: Array<{ presetKey: string | null }> };
    };
    const presets = payload.data.categories
      .map((category) => category.presetKey)
      .filter((value): value is string => Boolean(value));
    expect(presets).toEqual(["study", "work", "personal"]);
    expect(presets).not.toEqual(expect.arrayContaining(["important", "other", "meal", "sports"]));
  });

  test("creates exactly once and normalizes a WebCal subscription", async ({ request }) => {
    const token = await accessToken(request);
    const key = `calendar-category-create-${TEST_RUN}`;
    const headers = { Authorization: `Bearer ${token}`, "Idempotency-Key": key };
    const data = {
      name: `Native category ${TEST_RUN}`,
      color: "#10b981",
      icsSubscriptionUrl: "webcal://example.com/sideseat.ics",
    };
    const first = await request.post("/api/v1/calendar/categories", { headers, data });
    expect(first.status()).toBe(201);
    const firstPayload = (await first.json()) as {
      data: { id: string; color: string; presetKey: null; icsSubscriptionUrl: string };
    };
    managedCategoryId = firstPayload.data.id;
    expect(firstPayload.data).toMatchObject({
      color: "#10B981",
      presetKey: null,
      icsSubscriptionUrl: "https://example.com/sideseat.ics",
    });

    const replay = await request.post("/api/v1/calendar/categories", { headers, data });
    expect(replay.status()).toBe(201);
    expect(replay.headers()["idempotency-replayed"]).toBe("true");
    expect(await prisma.userCalendarCategory.count({ where: { id: managedCategoryId } })).toBe(1);

    const conflict = await request.post("/api/v1/calendar/categories", {
      headers,
      data: { ...data, color: "#DC2626" },
    });
    expect(conflict.status()).toBe(409);
    expect((await conflict.json()).error.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  test("updates custom calendars, protects starter subscriptions, and permits deletion", async ({
    request,
  }) => {
    const token = await accessToken(request);
    const auth = { Authorization: `Bearer ${token}` };
    const list = await request.get("/api/v1/calendar/categories", { headers: auth });
    const listPayload = (await list.json()) as {
      data: { categories: Array<{ id: string; presetKey: string | null }> };
    };
    const builtIn = listPayload.data.categories.find((category) => category.presetKey === "personal");
    expect(builtIn).toBeTruthy();

    const builtInSubscription = await request.patch(
      `/api/v1/calendar/categories/${builtIn!.id}`,
      {
        headers: {
          ...auth,
          "Idempotency-Key": `calendar-category-built-in-sub-${TEST_RUN}`,
        },
        data: { icsSubscriptionUrl: "https://example.com/not-allowed.ics" },
      },
    );
    expect(builtInSubscription.status()).toBe(409);
    expect((await builtInSubscription.json()).error.code).toBe("BUILT_IN_CALENDAR");

    const deletableStarter = await prisma.userCalendarCategory.create({
      data: {
        userId,
        name: `Deletable starter ${TEST_RUN}`,
        color: "#0284C7",
        sortOrder: 1002,
        presetKey: `starter-test-${TEST_RUN}`,
      },
    });
    const starterDelete = await request.delete(
      `/api/v1/calendar/categories/${deletableStarter.id}`,
      {
        headers: {
          ...auth,
          "Idempotency-Key": `calendar-category-starter-delete-${TEST_RUN}`,
        },
      },
    );
    expect(starterDelete.status()).toBe(200);
    expect(await prisma.userCalendarCategory.count({ where: { id: deletableStarter.id } })).toBe(0);
    const afterDelete = await request.get("/api/v1/calendar/categories", { headers: auth });
    const afterDeletePayload = (await afterDelete.json()) as {
      data: { categories: Array<{ id: string }> };
    };
    expect(afterDeletePayload.data.categories.some((category) => category.id === deletableStarter.id)).toBe(false);

    const headers = {
      ...auth,
      "Idempotency-Key": `calendar-category-update-${TEST_RUN}`,
    };
    const data = { name: `Renamed category ${TEST_RUN}`, color: "#2563eb", icsSubscriptionUrl: null };
    const updated = await request.patch(`/api/v1/calendar/categories/${managedCategoryId}`, {
      headers,
      data,
    });
    expect(updated.status()).toBe(200);
    expect(await updated.json()).toMatchObject({
      data: { id: managedCategoryId, name: data.name, color: "#2563EB", icsSubscriptionUrl: null },
    });
    const replay = await request.patch(`/api/v1/calendar/categories/${managedCategoryId}`, {
      headers,
      data,
    });
    expect(replay.headers()["idempotency-replayed"]).toBe("true");
  });

  test("deletes a custom calendar exactly once and detaches its events", async ({ request }) => {
    const linked = await prisma.calendarEntry.create({
      data: {
        userId,
        title: `Native category event ${TEST_RUN}`,
        startAt,
        endAt,
        categoryId: managedCategoryId,
      },
      select: { id: true },
    });
    managedCategoryEventId = linked.id;

    const token = await accessToken(request);
    const headers = {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": `calendar-category-delete-${TEST_RUN}`,
    };
    const first = await request.delete(`/api/v1/calendar/categories/${managedCategoryId}`, { headers });
    expect(first.status()).toBe(200);
    expect(await first.json()).toMatchObject({
      data: { categoryId: managedCategoryId, deleted: true, detachedEventCount: 1 },
    });

    const replay = await request.delete(`/api/v1/calendar/categories/${managedCategoryId}`, { headers });
    expect(replay.status()).toBe(200);
    expect(replay.headers()["idempotency-replayed"]).toBe("true");
    expect(await prisma.userCalendarCategory.count({ where: { id: managedCategoryId } })).toBe(0);
    expect(await prisma.calendarEntry.findUnique({ where: { id: linked.id } })).toMatchObject({
      categoryId: null,
    });
    managedCategoryId = "";
  });
});

test.describe.serial("API v1 Calendar events", () => {
  test("requires authentication, validation and an idempotency key", async ({ request }) => {
    expect((await request.post("/api/v1/calendar/events", { data: eventBody() })).status()).toBe(401);

    const token = await accessToken(request);
    const headers = { Authorization: `Bearer ${token}` };
    const missingKey = await request.post("/api/v1/calendar/events", {
      headers,
      data: eventBody(),
    });
    expect(missingKey.status()).toBe(422);
    expect((await missingKey.json()).error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");

    const invalidTime = await request.post("/api/v1/calendar/events", {
      headers: { ...headers, "Idempotency-Key": `calendar-invalid-time-${TEST_RUN}` },
      data: eventBody({ endAt: startAt.toISOString() }),
    });
    expect(invalidTime.status()).toBe(422);
    expect((await invalidTime.json()).error.field).toBe("endAt");
  });

  test("creates once, replays retries and rejects key reuse", async ({ request }) => {
    const token = await accessToken(request);
    const key = `calendar-create-${TEST_RUN}`;
    const headers = { Authorization: `Bearer ${token}`, "Idempotency-Key": key };

    const first = await request.post("/api/v1/calendar/events", {
      headers,
      data: eventBody(),
    });
    expect(first.status()).toBe(201);
    expect(await first.json()).toMatchObject({ data: { count: 1 } });

    const replay = await request.post("/api/v1/calendar/events", {
      headers,
      data: eventBody(),
    });
    expect(replay.status()).toBe(201);
    expect(replay.headers()["idempotency-replayed"]).toBe("true");

    const rows = await prisma.calendarEntry.findMany({
      where: { userId, title: TEST_TITLE },
      select: { id: true },
    });
    expect(rows).toHaveLength(1);
    eventId = rows[0]!.id;

    const conflict = await request.post("/api/v1/calendar/events", {
      headers,
      data: eventBody({ title: `${TEST_TITLE} conflict` }),
    });
    expect(conflict.status()).toBe(409);
    expect((await conflict.json()).error.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  test("rejects categories that do not belong to the user", async ({ request }) => {
    const token = await accessToken(request);
    const response = await request.post("/api/v1/calendar/events", {
      headers: {
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": `calendar-invalid-category-${TEST_RUN}`,
      },
      data: eventBody({ categoryId: "cm00000000000000000000000" }),
    });
    expect(response.status()).toBe(422);
    expect((await response.json()).error.field).toBe("categoryId");
  });

  test("updates once and exposes the change through Home", async ({ request }) => {
    const token = await accessToken(request);
    const title = `${TEST_TITLE} updated`;
    const headers = {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": `calendar-update-${TEST_RUN}`,
    };
    const update = await request.patch(`/api/v1/calendar/events/${eventId}`, {
      headers,
      data: eventBody({ title, location: "Garching" }),
    });
    expect(update.status()).toBe(200);
    expect(await update.json()).toMatchObject({ data: { id: eventId } });

    const replay = await request.patch(`/api/v1/calendar/events/${eventId}`, {
      headers,
      data: eventBody({ title, location: "Garching" }),
    });
    expect(replay.status()).toBe(200);
    expect(replay.headers()["idempotency-replayed"]).toBe("true");

    const windowStart = new Date(startAt.getTime() - 60 * 60 * 1000).toISOString();
    const windowEnd = new Date(endAt.getTime() + 60 * 60 * 1000).toISOString();
    const home = await request.get(
      `/api/v1/home/schedule?windowStart=${encodeURIComponent(windowStart)}&windowEnd=${encodeURIComponent(windowEnd)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(home.status()).toBe(200);
    const payload = (await home.json()) as {
      data: { studyEntries: Array<{ id: string; title: string; location: string | null }> };
    };
    expect(payload.data.studyEntries.find((entry) => entry.id === eventId)).toMatchObject({
      title,
      location: "Garching",
    });
  });

  test("deletes safely and replays a lost response", async ({ request }) => {
    const token = await accessToken(request);
    const headers = {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": `calendar-delete-${TEST_RUN}`,
    };
    const deleted = await request.delete(`/api/v1/calendar/events/${eventId}?scope=this`, {
      headers,
    });
    expect(deleted.status()).toBe(200);
    expect(await deleted.json()).toMatchObject({ data: { deleted: 1 } });

    const replay = await request.delete(`/api/v1/calendar/events/${eventId}?scope=this`, {
      headers,
    });
    expect(replay.status()).toBe(200);
    expect(replay.headers()["idempotency-replayed"]).toBe("true");
    expect(await prisma.calendarEntry.count({ where: { id: eventId } })).toBe(0);
  });

  test("keeps Berlin wall time and duration across DST for cross-day repeats", async ({
    request,
  }) => {
    const token = await accessToken(request);
    const title = `${TEST_TITLE} DST series`;
    const data = eventBody({
      title,
      startAt: "2026-03-22T23:30:00+01:00",
      endAt: "2026-03-23T01:00:00+01:00",
      repeat: "WEEKLY",
      repeatUntil: "2026-04-05T23:59:59+02:00",
    });
    const response = await request.post("/api/v1/calendar/events", {
      headers: {
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": `calendar-dst-create-${TEST_RUN}`,
      },
      data,
    });
    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject({ data: { count: 3 } });

    const rows = await prisma.calendarEntry.findMany({
      where: { userId, title },
      orderBy: { startAt: "asc" },
      select: { id: true, startAt: true, endAt: true, recurrenceGroupId: true },
    });
    expect(rows.map((row) => row.startAt.toISOString())).toEqual([
      "2026-03-22T22:30:00.000Z",
      "2026-03-29T21:30:00.000Z",
      "2026-04-05T21:30:00.000Z",
    ]);
    expect(rows.map((row) => row.endAt.getTime() - row.startAt.getTime())).toEqual([
      90 * 60_000,
      90 * 60_000,
      90 * 60_000,
    ]);
    expect(new Set(rows.map((row) => row.recurrenceGroupId)).size).toBe(1);
  });

  test("promotes a one-off event into a Berlin-aligned recurring series", async ({ request }) => {
    const title = `${TEST_TITLE} promoted series`;
    const oneOff = await prisma.calendarEntry.create({
      data: {
        userId,
        title,
        categoryId,
        startAt: new Date("2026-10-23T07:00:00.000Z"),
        endAt: new Date("2026-10-23T08:00:00.000Z"),
      },
      select: { id: true },
    });
    const token = await accessToken(request);
    const response = await request.patch(
      `/api/v1/calendar/events/${oneOff.id}?scope=this`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": `calendar-promote-update-${TEST_RUN}`,
        },
        data: eventBody({
          title,
          startAt: "2026-10-23T09:00:00+02:00",
          endAt: "2026-10-23T10:00:00+02:00",
          repeat: "DAILY",
          repeatUntil: "2026-10-25T23:59:59+01:00",
        }),
      },
    );
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { id: oneOff.id, scope: "this", updated: 1, created: 2, deleted: 0 },
    });

    const rows = await prisma.calendarEntry.findMany({
      where: { userId, title },
      orderBy: { startAt: "asc" },
      select: { id: true, startAt: true, recurrenceGroupId: true },
    });
    expect(rows[0]!.id).toBe(oneOff.id);
    expect(rows.map((row) => row.startAt.toISOString())).toEqual([
      "2026-10-23T07:00:00.000Z",
      "2026-10-24T07:00:00.000Z",
      "2026-10-25T08:00:00.000Z",
    ]);
    expect(new Set(rows.map((row) => row.recurrenceGroupId)).size).toBe(1);
  });

  test("turns a single edited occurrence into a detached exception", async ({ request }) => {
    const title = `${TEST_TITLE} DST series`;
    const rows = await prisma.calendarEntry.findMany({
      where: { userId, title },
      orderBy: { startAt: "asc" },
      select: { id: true, recurrenceGroupId: true },
    });
    const selected = rows[1]!;
    const originalGroupId = selected.recurrenceGroupId;
    const token = await accessToken(request);
    const response = await request.patch(
      `/api/v1/calendar/events/${selected.id}?scope=this`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": `calendar-this-update-${TEST_RUN}`,
        },
        data: eventBody({
          title: `${title} exception`,
          startAt: "2026-03-30T00:00:00+02:00",
          endAt: "2026-03-30T01:30:00+02:00",
          repeat: "WEEKLY",
          repeatUntil: "2026-04-05T23:59:59+02:00",
        }),
      },
    );
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { id: selected.id, scope: "this", updated: 1, created: 0, deleted: 0 },
    });
    expect(await prisma.calendarEntry.findUnique({ where: { id: selected.id } })).toMatchObject({
      title: `${title} exception`,
      repeatRule: "NONE",
      repeatUntil: null,
      recurrenceGroupId: null,
      startAt: new Date("2026-03-29T22:00:00.000Z"),
    });
    expect(
      await prisma.calendarEntry.count({
        where: { userId, recurrenceGroupId: originalGroupId },
      }),
    ).toBe(2);
  });

  test("rebuilds future and entire scopes exactly once around the selected occurrence", async ({
    request,
  }) => {
    const token = await accessToken(request);
    const title = `${TEST_TITLE} scoped series`;
    const create = await request.post("/api/v1/calendar/events", {
      headers: {
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": `calendar-scoped-create-${TEST_RUN}`,
      },
      data: eventBody({
        title,
        startAt: "2026-04-06T09:00:00+02:00",
        endAt: "2026-04-06T10:00:00+02:00",
        repeat: "WEEKLY",
        repeatUntil: "2026-04-27T23:59:59+02:00",
      }),
    });
    expect(create.status()).toBe(201);
    expect(await create.json()).toMatchObject({ data: { count: 4 } });

    let rows = await prisma.calendarEntry.findMany({
      where: { userId, title },
      orderBy: { startAt: "asc" },
      select: { id: true, startAt: true, recurrenceGroupId: true },
    });
    const originalAnchorId = rows[0]!.id;
    const futureAnchorId = rows[1]!.id;
    const groupId = rows[0]!.recurrenceGroupId;
    const futureHeaders = {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": `calendar-future-update-${TEST_RUN}`,
    };
    const futureData = eventBody({
      title,
      startAt: "2026-04-13T10:00:00+02:00",
      endAt: "2026-04-13T11:00:00+02:00",
      repeat: "WEEKLY",
      repeatUntil: "2026-04-27T23:59:59+02:00",
    });
    const future = await request.patch(
      `/api/v1/calendar/events/${futureAnchorId}?scope=future`,
      { headers: futureHeaders, data: futureData },
    );
    expect(future.status()).toBe(200);
    expect(await future.json()).toMatchObject({
      data: { id: futureAnchorId, scope: "future", updated: 1, created: 2, deleted: 2 },
    });
    const futureReplay = await request.patch(
      `/api/v1/calendar/events/${futureAnchorId}?scope=future`,
      { headers: futureHeaders, data: futureData },
    );
    expect(futureReplay.headers()["idempotency-replayed"]).toBe("true");

    rows = await prisma.calendarEntry.findMany({
      where: { userId, recurrenceGroupId: groupId },
      orderBy: { startAt: "asc" },
      select: { id: true, startAt: true, recurrenceGroupId: true },
    });
    expect(rows.map((row) => row.startAt.toISOString())).toEqual([
      "2026-04-06T07:00:00.000Z",
      "2026-04-13T08:00:00.000Z",
      "2026-04-20T08:00:00.000Z",
      "2026-04-27T08:00:00.000Z",
    ]);

    const selectedForAll = rows[2]!;
    const all = await request.patch(
      `/api/v1/calendar/events/${selectedForAll.id}?scope=all`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": `calendar-all-update-${TEST_RUN}`,
        },
        data: eventBody({
          title: `${title} all`,
          startAt: "2026-04-20T10:30:00+02:00",
          endAt: "2026-04-20T11:30:00+02:00",
          repeat: "WEEKLY",
          repeatUntil: "2026-04-27T23:59:59+02:00",
        }),
      },
    );
    expect(all.status()).toBe(200);
    expect(await all.json()).toMatchObject({
      data: { id: originalAnchorId, scope: "all", updated: 1, created: 3, deleted: 3 },
    });
    rows = await prisma.calendarEntry.findMany({
      where: { userId, recurrenceGroupId: groupId },
      orderBy: { startAt: "asc" },
      select: { id: true, startAt: true, recurrenceGroupId: true },
    });
    expect(rows.map((row) => row.startAt.toISOString())).toEqual([
      "2026-04-06T07:30:00.000Z",
      "2026-04-13T07:30:00.000Z",
      "2026-04-20T07:30:00.000Z",
      "2026-04-27T07:30:00.000Z",
    ]);
  });

  test("keeps the legacy Web create, scoped update and delete contracts working", async ({
    request,
  }) => {
    const token = await accessToken(request);
    const headers = { Authorization: `Bearer ${token}` };
    const title = `${TEST_TITLE} legacy Web`;
    const created = await request.post("/api/calendar/events", {
      headers,
      data: eventBody({
        title,
        startAt: "2026-11-02T09:00:00+01:00",
        endAt: "2026-11-02T10:00:00+01:00",
      }),
    });
    expect(created.status()).toBe(201);
    expect(await created.json()).toMatchObject({ success: true, data: { count: 1 } });
    const first = await prisma.calendarEntry.findFirstOrThrow({
      where: { userId, title },
      select: { id: true },
    });

    const updated = await request.patch(`/api/calendar/events/${first.id}?scope=this`, {
      headers,
      data: eventBody({
        title,
        startAt: "2026-11-02T09:00:00+01:00",
        endAt: "2026-11-02T10:00:00+01:00",
        repeat: "WEEKLY",
        repeatUntil: "2026-11-09T23:59:59+01:00",
      }),
    });
    expect(updated.status()).toBe(200);
    expect(await updated.json()).toMatchObject({ success: true, data: { ok: true } });
    expect(await prisma.calendarEntry.count({ where: { userId, title } })).toBe(2);

    const deleted = await request.delete(`/api/calendar/events/${first.id}?scope=all`, {
      headers,
    });
    expect(deleted.status()).toBe(200);
    expect(await deleted.json()).toMatchObject({ success: true, data: { ok: true } });
    expect(await prisma.calendarEntry.count({ where: { userId, title } })).toBe(0);
  });
});

test.describe.serial("API v1 Calendar smart batch creation", () => {
  test("requires authentication, validates input and reflects provider availability", async ({
    request,
  }) => {
    expect(
      (await request.post("/api/v1/calendar/parse-natural", { data: { text: "Tomorrow at 3" } }))
        .status(),
    ).toBe(401);
    expect(
      (await request.post("/api/v1/calendar/events/batch", { data: { events: [eventBody()] } }))
        .status(),
    ).toBe(401);

    const token = await accessToken(request);
    const auth = { Authorization: `Bearer ${token}` };
    const invalid = await request.post("/api/v1/calendar/parse-natural", {
      headers: auth,
      data: { text: "" },
    });
    expect(invalid.status()).toBe(422);

    const config = await request.get("/api/v1/client-config");
    const configPayload = (await config.json()) as {
      data: { features: { naturalLanguageSchedule?: boolean } };
    };
    const parsed = await request.post("/api/v1/calendar/parse-natural", {
      headers: auth,
      data: {
        text: "Create a one-hour study session tomorrow at 15:00 in the library.",
        locale: "en",
      },
    });
    if (configPayload.data.features.naturalLanguageSchedule) {
      expect(parsed.status()).toBe(200);
      const payload = (await parsed.json()) as {
        data: { events: Array<{ title: string; startAt: string; endAt: string }>; warnings: string[] };
      };
      expect(payload.data.events).toHaveLength(1);
      expect(new Date(payload.data.events[0]!.endAt).getTime()).toBeGreaterThan(
        new Date(payload.data.events[0]!.startAt).getTime(),
      );
      expect(Array.isArray(payload.data.warnings)).toBe(true);
    } else {
      expect(parsed.status()).toBe(503);
      expect((await parsed.json()).error.code).toBe("FEATURE_UNAVAILABLE");
    }
  });

  test("creates a validated batch exactly once", async ({ request }) => {
    const token = await accessToken(request);
    const key = `calendar-batch-${TEST_RUN}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": key,
    };
    const batchStart = new Date(startAt.getTime() + 6 * 60 * 60 * 1000);
    const firstBody = {
      events: [
        eventBody({
          title: `${TEST_TITLE} batch A`,
          startAt: batchStart.toISOString(),
          endAt: new Date(batchStart.getTime() + 30 * 60 * 1000).toISOString(),
        }),
        eventBody({
          title: `${TEST_TITLE} batch B`,
          startAt: new Date(batchStart.getTime() + 60 * 60 * 1000).toISOString(),
          endAt: new Date(batchStart.getTime() + 90 * 60 * 1000).toISOString(),
        }),
      ],
    };

    const missingKey = await request.post("/api/v1/calendar/events/batch", {
      headers: { Authorization: `Bearer ${token}` },
      data: firstBody,
    });
    expect(missingKey.status()).toBe(422);
    expect((await missingKey.json()).error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");

    const first = await request.post("/api/v1/calendar/events/batch", {
      headers,
      data: firstBody,
    });
    expect(first.status()).toBe(201);
    expect(await first.json()).toMatchObject({ data: { count: 2, events: 2 } });

    const replay = await request.post("/api/v1/calendar/events/batch", {
      headers,
      data: firstBody,
    });
    expect(replay.status()).toBe(201);
    expect(replay.headers()["idempotency-replayed"]).toBe("true");
    expect(
      await prisma.calendarEntry.count({
        where: { userId, title: { in: [`${TEST_TITLE} batch A`, `${TEST_TITLE} batch B`] } },
      }),
    ).toBe(2);

    const conflict = await request.post("/api/v1/calendar/events/batch", {
      headers,
      data: {
        events: [
          {
            ...firstBody.events[0],
            title: `${TEST_TITLE} changed batch`,
          },
        ],
      },
    });
    expect(conflict.status()).toBe(409);
    expect((await conflict.json()).error.code).toBe("IDEMPOTENCY_CONFLICT");
  });
});

test.describe.serial("API v1 Calendar ICS transfer", () => {
  test("requires authentication, valid ICS and an idempotency key", async ({ request }) => {
    expect((await request.get("/api/v1/calendar/export")).status()).toBe(401);
    expect((await request.post("/api/v1/calendar/import", { data: { ics: "" } })).status()).toBe(
      401,
    );

    const token = await accessToken(request);
    const authorization = { Authorization: `Bearer ${token}` };
    const missingKey = await request.post("/api/v1/calendar/import", {
      headers: authorization,
      data: { ics: "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n" },
    });
    expect(missingKey.status()).toBe(422);
    expect((await missingKey.json()).error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");

    const invalid = await request.post("/api/v1/calendar/import", {
      headers: {
        ...authorization,
        "Idempotency-Key": `calendar-import-invalid-${TEST_RUN}`,
      },
      data: { ics: "not a calendar" },
    });
    expect(invalid.status()).toBe(422);
    expect(await invalid.json()).toMatchObject({ error: { code: "INVALID_REQUEST", field: "ics" } });
  });

  test("imports once, replays retries and exports the imported event", async ({ request }) => {
    const token = await accessToken(request);
    const title = `${TEST_TITLE} ICS import`;
    const exportWindow = getClassScheduleDateRange({ school: userSchool });
    const importedStart = new Date(exportWindow.start.getTime() + 2 * 24 * 60 * 60 * 1000);
    importedStart.setUTCHours(9, 30, 0, 0);
    const importedEnd = new Date(importedStart.getTime() + 45 * 60 * 1000);
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      `UID:${TEST_RUN}@sideseat.test`,
      `DTSTART:${formatIcsUtc(importedStart)}`,
      `DTEND:${formatIcsUtc(importedEnd)}`,
      `SUMMARY:${title}`,
      "LOCATION:Test room",
      "DESCRIPTION:Imported from the native API test",
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ].join("\r\n");
    const headers = {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": `calendar-import-${TEST_RUN}`,
    };

    const first = await request.post("/api/v1/calendar/import", { headers, data: { ics } });
    expect(first.status()).toBe(201);
    expect(await first.json()).toMatchObject({ data: { imported: 1, skipped: 0 } });

    const replay = await request.post("/api/v1/calendar/import", { headers, data: { ics } });
    expect(replay.status()).toBe(201);
    expect(replay.headers()["idempotency-replayed"]).toBe("true");
    expect(await prisma.calendarEntry.count({ where: { userId, title } })).toBe(1);

    const exported = await request.get("/api/v1/calendar/export", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(exported.status()).toBe(200);
    const payload = (await exported.json()) as {
      data: { filename: string; mediaType: string; ics: string };
    };
    expect(payload.data).toMatchObject({
      filename: "sideseat-schedule.ics",
      mediaType: "text/calendar; charset=utf-8",
    });
    expect(payload.data.ics).toContain("BEGIN:VCALENDAR");
    expect(payload.data.ics).toContain(`SUMMARY:${title}`);
  });
});
