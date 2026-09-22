import { expect, test, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { assertLocalTestDatabase } from "./helpers/local-test-database";
import { getClassScheduleDateRange } from "@/lib/constants/vorlesungszeit";

assertLocalTestDatabase();
const prisma = new PrismaClient();
const E2E_USER = process.env.E2E_USER ?? "test_001";
const E2E_PEER = process.env.E2E_PEER ?? "test_002";
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
let peerId = "";
let userSchool: string | null = null;
let categoryId = "";
let eventId = "";
let managedCategoryId = "";
let managedCategoryEventId = "";
let eventShareLinkId = "";
let importedEventShareEntryId = "";
let calendarSubscriptionLinkId = "";
let calendarSubscriptionURL = "";
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

async function peerAccessToken(request: APIRequestContext) {
  const response = await request.post("/api/v1/auth/login", {
    headers: { "x-forwarded-for": TEST_IP },
    data: {
      identifier: E2E_PEER,
      password: E2E_PASSWORD,
      device: { ...device, id: `${device.id}-${E2E_PEER}` },
    },
  });
  expect(response.status()).toBe(200);
  const payload = (await response.json()) as { data: { tokens: { accessToken: string } } };
  return payload.data.tokens.accessToken;
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
  peerId = (
    await prisma.user.findUnique({
      where: { username: E2E_PEER },
      select: { id: true },
    })
  )?.id ?? "";
  if (!peerId) throw new Error("The seeded Calendar peer user is missing.");
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
  if (calendarSubscriptionLinkId) {
    await prisma.calendarSubscriptionLink.deleteMany({
      where: { id: calendarSubscriptionLinkId },
    });
  }
  if (importedEventShareEntryId) {
    await prisma.calendarEntry.deleteMany({ where: { id: importedEventShareEntryId } });
  }
  if (eventShareLinkId) {
    await prisma.eventShareLink.deleteMany({ where: { id: eventShareLinkId } });
  }
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
    expect((await request.get("/api/v1/calendar/search?q=planning")).status()).toBe(401);

    const token = await accessToken(request);
    const headers = { Authorization: `Bearer ${token}` };
    const invalidSearch = await request.get("/api/v1/calendar/search?q=", { headers });
    expect(invalidSearch.status()).toBe(422);
    expect((await invalidSearch.json()).error.field).toBe("q");
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

  test("shares a filtered snapshot and imports one independent copy", async ({ request }) => {
    const ownerToken = await accessToken(request);
    const peerToken = await peerAccessToken(request);
    const createHeaders = {
      Authorization: `Bearer ${ownerToken}`,
      "Idempotency-Key": `calendar-event-share-${TEST_RUN}`,
    };
    const createBody = { includeLocation: false, includeNotes: true };

    const unauthenticated = await request.post(
      `/api/v1/calendar/events/${eventId}/shares`,
      { data: createBody },
    );
    expect(unauthenticated.status()).toBe(401);

    const created = await request.post(`/api/v1/calendar/events/${eventId}/shares`, {
      headers: createHeaders,
      data: createBody,
    });
    expect(created.status()).toBe(201);
    const createdPayload = (await created.json()) as {
      data: { linkId: string; token: string; shareUrl: string; expiresAt: string };
    };
    eventShareLinkId = createdPayload.data.linkId;
    expect(createdPayload.data.shareUrl).toContain(`/share/event/${createdPayload.data.token}`);

    const replay = await request.post(`/api/v1/calendar/events/${eventId}/shares`, {
      headers: createHeaders,
      data: createBody,
    });
    expect(replay.status()).toBe(201);
    expect(replay.headers()["idempotency-replayed"]).toBe("true");
    expect((await replay.json()).data.linkId).toBe(eventShareLinkId);

    const publicView = await request.get(
      `/api/public/event-shares/${encodeURIComponent(createdPayload.data.token)}`,
    );
    expect(publicView.status()).toBe(200);
    expect(await publicView.json()).toMatchObject({
      data: {
        snapshot: {
          linkId: eventShareLinkId,
          title: `${TEST_TITLE} updated`,
          location: null,
          note: "Created from native iOS",
        },
      },
    });

    const recipient = await request.get(
      `/api/v1/event-shares/${encodeURIComponent(createdPayload.data.token)}`,
      { headers: { Authorization: `Bearer ${peerToken}` } },
    );
    expect(recipient.status()).toBe(200);
    expect(await recipient.json()).toMatchObject({
      data: {
        ownedByViewer: false,
        addedCalendarEntryId: null,
        snapshot: { linkId: eventShareLinkId, location: null },
      },
    });

    const importHeaders = {
      Authorization: `Bearer ${peerToken}`,
      "Idempotency-Key": `calendar-event-share-import-${TEST_RUN}`,
    };
    const imported = await request.post(
      `/api/v1/event-shares/${encodeURIComponent(createdPayload.data.token)}/add`,
      { headers: importHeaders },
    );
    expect(imported.status()).toBe(201);
    const importedPayload = (await imported.json()) as {
      data: { calendarEntryId: string; created: boolean };
    };
    importedEventShareEntryId = importedPayload.data.calendarEntryId;
    expect(importedPayload.data.created).toBe(true);
    expect(
      await prisma.calendarEntry.findUnique({ where: { id: importedEventShareEntryId } }),
    ).toMatchObject({
      userId: peerId,
      eventShareLinkId,
      title: `${TEST_TITLE} updated`,
      location: null,
      note: "Created from native iOS",
      source: "event_share",
      repeatRule: "NONE",
    });

    const repeatedImport = await request.post(
      `/api/v1/event-shares/${encodeURIComponent(createdPayload.data.token)}/add`,
      {
        headers: {
          Authorization: `Bearer ${peerToken}`,
          "Idempotency-Key": `calendar-event-share-import-again-${TEST_RUN}`,
        },
      },
    );
    expect(repeatedImport.status()).toBe(200);
    expect(await repeatedImport.json()).toMatchObject({
      data: { calendarEntryId: importedEventShareEntryId, created: false },
    });
    expect(
      await prisma.calendarEntry.count({ where: { userId: peerId, eventShareLinkId } }),
    ).toBe(1);

    const ownerImport = await request.post(
      `/api/v1/event-shares/${encodeURIComponent(createdPayload.data.token)}/add`,
      {
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          "Idempotency-Key": `calendar-event-share-owner-import-${TEST_RUN}`,
        },
      },
    );
    expect(ownerImport.status()).toBe(404);
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

  test("stores one never-ending master and expands its DST-safe occurrences by window", async ({
    request,
  }) => {
    const token = await accessToken(request);
    const title = `${TEST_TITLE} DST series`;
    const response = await request.post("/api/v1/calendar/events", {
      headers: {
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": `calendar-dst-create-${TEST_RUN}`,
      },
      data: eventBody({
        title,
        startAt: "2026-03-22T23:30:00+01:00",
        endAt: "2026-03-23T01:00:00+01:00",
        repeat: "WEEKLY",
        repeatUntil: "",
      }),
    });
    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject({ data: { count: 1 } });

    const master = await prisma.calendarEntry.findFirstOrThrow({
      where: { userId, title },
      select: { id: true, isRecurrenceMaster: true, repeatUntil: true },
    });
    expect(master).toMatchObject({ isRecurrenceMaster: true, repeatUntil: null });
    expect(await prisma.calendarEntry.count({ where: { userId, title } })).toBe(1);

    const home = await request.get(
      "/api/v1/home/schedule?windowStart=2026-03-20T00%3A00%3A00.000Z&windowEnd=2026-04-07T00%3A00%3A00.000Z",
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const payload = (await home.json()) as {
      data: { studyEntries: Array<{ id: string; title: string; startISO: string; endISO: string }> };
    };
    const occurrences = payload.data.studyEntries.filter((entry) => entry.title === title);
    expect(occurrences.map((entry) => entry.startISO)).toEqual([
      "2026-03-22T22:30:00.000Z",
      "2026-03-29T21:30:00.000Z",
      "2026-04-05T21:30:00.000Z",
    ]);
    expect(occurrences.every((entry) => entry.id.startsWith(`${master.id}_occ_`))).toBe(true);
    expect(
      occurrences.every(
        (entry) => new Date(entry.endISO).getTime() - new Date(entry.startISO).getTime() === 90 * 60_000,
      ),
    ).toBe(true);

    const search = await request.get(
      `/api/v1/calendar/search?q=${encodeURIComponent(title)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(search.status()).toBe(200);
    const searchResults = ((await search.json()) as {
      data: {
        results: Array<{ id: string; title: string; startISO: string; endISO: string }>;
      };
    }).data.results.filter((entry) => entry.title === title);
    expect(searchResults).toHaveLength(1);
    expect(searchResults[0]!.id).toMatch(new RegExp(`^${master.id}_occ_`));
    expect(
      new Date(searchResults[0]!.endISO).getTime()
        - new Date(searchResults[0]!.startISO).getTime(),
    ).toBe(90 * 60_000);
    expect(
      Math.abs(new Date(searchResults[0]!.startISO).getTime() - Date.now()),
    ).toBeLessThanOrEqual(7 * 24 * 60 * 60_000);

    const occurrenceShare = await request.post(
      `/api/v1/calendar/events/${encodeURIComponent(occurrences[1]!.id)}/shares`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": `calendar-occurrence-share-${TEST_RUN}`,
        },
        data: { includeLocation: true, includeNotes: false },
      },
    );
    expect(occurrenceShare.status()).toBe(201);
    const occurrenceSharePayload = (await occurrenceShare.json()) as {
      data: { linkId: string; token: string };
    };
    const occurrenceSnapshot = await request.get(
      `/api/public/event-shares/${encodeURIComponent(occurrenceSharePayload.data.token)}`,
    );
    expect(occurrenceSnapshot.status()).toBe(200);
    expect(await occurrenceSnapshot.json()).toMatchObject({
      data: {
        snapshot: {
          title,
          startAt: occurrences[1]!.startISO,
          endAt: occurrences[1]!.endISO,
          note: null,
        },
      },
    });
    await prisma.eventShareLink.delete({ where: { id: occurrenceSharePayload.data.linkId } });
  });

  test("extends an old materialized never-ending series beyond its stored rows", async ({
    request,
  }) => {
    const token = await accessToken(request);
    const title = `${TEST_TITLE} legacy infinite series`;
    const recurrenceGroupId = `legacy-infinite-${TEST_RUN}`;
    await prisma.calendarEntry.createMany({
      data: [
        {
          userId,
          title,
          repeatRule: "WEEKLY",
          repeatUntil: null,
          recurrenceGroupId,
          startAt: new Date("2026-01-05T08:00:00.000Z"),
          endAt: new Date("2026-01-05T09:00:00.000Z"),
          categoryId,
        },
        {
          userId,
          title,
          repeatRule: "WEEKLY",
          repeatUntil: null,
          recurrenceGroupId,
          startAt: new Date("2026-01-12T08:00:00.000Z"),
          endAt: new Date("2026-01-12T09:00:00.000Z"),
          categoryId,
        },
      ],
    });
    const anchor = await prisma.calendarEntry.findFirstOrThrow({
      where: { userId, title },
      orderBy: { startAt: "asc" },
      select: { id: true },
    });

    const home = await request.get(
      "/api/v1/home/schedule?windowStart=2030-01-01T00%3A00%3A00.000Z&windowEnd=2030-02-01T00%3A00%3A00.000Z",
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(home.status()).toBe(200);
    const occurrences = ((await home.json()) as {
      data: { studyEntries: Array<{ id: string; title: string; startISO: string }> };
    }).data.studyEntries.filter((entry) => entry.title === title);

    expect(occurrences.length).toBeGreaterThan(0);
    expect(occurrences.every((entry) => entry.id.startsWith(`${anchor.id}_occ_`))).toBe(true);
    expect(occurrences.every((entry) => new Date(entry.startISO).getUTCFullYear() === 2030)).toBe(
      true,
    );
    expect(await prisma.calendarEntry.count({ where: { userId, title } })).toBe(2);
  });

  test("stores a moved instance as an exception and a deleted instance as a tombstone", async ({
    request,
  }) => {
    const token = await accessToken(request);
    const title = `${TEST_TITLE} DST series`;
    const home = await request.get(
      "/api/v1/home/schedule?windowStart=2026-03-20T00%3A00%3A00.000Z&windowEnd=2026-04-14T00%3A00%3A00.000Z",
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const initial = ((await home.json()) as {
      data: { studyEntries: Array<{ id: string; title: string; startISO: string }> };
    }).data.studyEntries.filter((entry) => entry.title === title);
    const selected = initial[1]!;
    const moved = await request.patch(`/api/v1/calendar/events/${selected.id}?scope=this`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": `calendar-this-update-${TEST_RUN}`,
      },
      data: eventBody({
        title: `${title} exception`,
        startAt: "2026-03-30T00:00:00+02:00",
        endAt: "2026-03-30T01:30:00+02:00",
        repeat: "WEEKLY",
        repeatUntil: "",
      }),
    });
    expect(moved.status()).toBe(200);
    expect(await prisma.calendarEntry.count({
      where: { userId, recurrenceMasterId: { not: null } },
    })).toBeGreaterThanOrEqual(1);

    const removed = await request.delete(`/api/v1/calendar/events/${initial[2]!.id}?scope=this`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": `calendar-this-delete-${TEST_RUN}`,
      },
    });
    expect(removed.status()).toBe(200);
    expect(await prisma.calendarRecurrenceCancellation.count({ where: { userId } })).toBeGreaterThanOrEqual(1);

    const refreshed = await request.get(
      "/api/v1/home/schedule?windowStart=2026-03-20T00%3A00%3A00.000Z&windowEnd=2026-04-14T00%3A00%3A00.000Z",
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const starts = ((await refreshed.json()) as {
      data: { studyEntries: Array<{ title: string; startISO: string }> };
    }).data.studyEntries
      .filter((entry) => entry.title.startsWith(title))
      .map((entry) => entry.startISO);
    expect(starts).toContain("2026-03-29T22:00:00.000Z");
    expect(starts).not.toContain("2026-04-05T21:30:00.000Z");
  });

  test("splits this-and-future without pre-generating the new series", async ({ request }) => {
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
        repeatUntil: "",
      }),
    });
    expect(create.status()).toBe(201);

    const windowPath =
      "/api/v1/home/schedule?windowStart=2026-04-01T00%3A00%3A00.000Z&windowEnd=2026-05-01T00%3A00%3A00.000Z";
    const before = await request.get(windowPath, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const initial = ((await before.json()) as {
      data: { studyEntries: Array<{ id: string; title: string }> };
    }).data.studyEntries.filter((entry) => entry.title === title);
    const future = await request.patch(`/api/v1/calendar/events/${initial[1]!.id}?scope=future`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": `calendar-future-update-${TEST_RUN}`,
      },
      data: eventBody({
        title,
        startAt: "2026-04-13T10:00:00+02:00",
        endAt: "2026-04-13T11:00:00+02:00",
        repeat: "WEEKLY",
        repeatUntil: "",
      }),
    });
    expect(future.status()).toBe(200);
    expect(await prisma.calendarEntry.count({
      where: { userId, title, isRecurrenceMaster: true },
    })).toBe(2);

    const after = await request.get(windowPath, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const splitOccurrences = ((await after.json()) as {
      data: { studyEntries: Array<{ id: string; title: string; startISO: string }> };
    }).data.studyEntries.filter((entry) => entry.title === title);
    expect(splitOccurrences.map((entry) => entry.startISO)).toEqual([
      "2026-04-06T07:00:00.000Z",
      "2026-04-13T08:00:00.000Z",
      "2026-04-20T08:00:00.000Z",
      "2026-04-27T08:00:00.000Z",
    ]);

    const all = await request.patch(
      `/api/v1/calendar/events/${splitOccurrences[2]!.id}?scope=all`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": `calendar-all-update-${TEST_RUN}`,
        },
        data: eventBody({
          title,
          startAt: "2026-04-20T10:30:00+02:00",
          endAt: "2026-04-20T11:30:00+02:00",
          repeat: "WEEKLY",
          repeatUntil: "",
        }),
      },
    );
    expect(all.status()).toBe(200);
    const afterAll = await request.get(windowPath, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const startsAfterAll = ((await afterAll.json()) as {
      data: { studyEntries: Array<{ title: string; startISO: string }> };
    }).data.studyEntries
      .filter((entry) => entry.title === title)
      .map((entry) => entry.startISO);
    expect(startsAfterAll).toEqual([
      "2026-04-06T07:00:00.000Z",
      "2026-04-13T08:30:00.000Z",
      "2026-04-20T08:30:00.000Z",
      "2026-04-27T08:30:00.000Z",
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
    expect(await prisma.calendarEntry.count({ where: { userId, title } })).toBe(1);
    expect(await prisma.calendarEntry.findUnique({ where: { id: first.id } })).toMatchObject({
      isRecurrenceMaster: true,
      repeatRule: "WEEKLY",
    });

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

    const exportYear = importedStart.getFullYear();
    const exported = await request.get(`/api/v1/calendar/export?year=${exportYear}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(exported.status()).toBe(200);
    const payload = (await exported.json()) as {
      data: { filename: string; mediaType: string; ics: string };
    };
    expect(payload.data).toMatchObject({
      filename: `sideseat-schedule-${exportYear}.ics`,
      mediaType: "text/calendar; charset=utf-8",
    });
    expect(payload.data.ics).toContain("BEGIN:VCALENDAR");
    expect(payload.data.ics).toContain(`SUMMARY:${title}`);
  });
});

test.describe.serial("API v1 Calendar subscription connections", () => {
  test("creates a private hashed feed and never returns its URL from the list", async ({
    request,
  }) => {
    expect((await request.get("/api/v1/calendar/subscriptions")).status()).toBe(401);

    const token = await accessToken(request);
    const authorization = { Authorization: `Bearer ${token}` };
    const missingKey = await request.post("/api/v1/calendar/subscriptions", {
      headers: authorization,
      data: { label: "Apple Calendar" },
    });
    expect(missingKey.status()).toBe(422);

    const headers = {
      ...authorization,
      "Idempotency-Key": `calendar-subscription-${TEST_RUN}`,
    };
    const created = await request.post("/api/v1/calendar/subscriptions", {
      headers,
      data: { label: "Apple Calendar" },
    });
    expect(created.status()).toBe(201);
    const createdPayload = (await created.json()) as {
      data: {
        connection: { id: string; label: string; lastAccessedAt: string | null };
        subscriptionUrl: string;
      };
    };
    calendarSubscriptionLinkId = createdPayload.data.connection.id;
    calendarSubscriptionURL = createdPayload.data.subscriptionUrl;
    expect(createdPayload.data.connection).toMatchObject({
      label: "Apple Calendar",
      lastAccessedAt: null,
    });
    expect(calendarSubscriptionURL).toMatch(/\/api\/public\/calendar-subscriptions\/.+\.ics$/);

    const replay = await request.post("/api/v1/calendar/subscriptions", {
      headers,
      data: { label: "Apple Calendar" },
    });
    expect(replay.status()).toBe(201);
    expect(replay.headers()["idempotency-replayed"]).toBe("true");

    const stored = await prisma.calendarSubscriptionLink.findUniqueOrThrow({
      where: { id: calendarSubscriptionLinkId },
      select: { tokenHash: true },
    });
    const rawToken = new URL(calendarSubscriptionURL).pathname
      .split("/")
      .at(-1)!
      .replace(/\.ics$/, "");
    expect(stored.tokenHash).not.toBe(rawToken);
    expect(stored.tokenHash).toMatch(/^[a-f0-9]{64}$/);

    const listed = await request.get("/api/v1/calendar/subscriptions", {
      headers: authorization,
    });
    expect(listed.status()).toBe(200);
    const listedBody = await listed.text();
    expect(listedBody).toContain(calendarSubscriptionLinkId);
    expect(listedBody).not.toContain(rawToken);
    expect(listedBody).not.toContain("subscriptionUrl");
  });

  test("serves a refreshable ICS feed and revocation invalidates it", async ({ request }) => {
    const path = new URL(calendarSubscriptionURL).pathname;
    const feed = await request.get(path);
    expect(feed.status()).toBe(200);
    expect(feed.headers()["content-type"]).toContain("text/calendar");
    expect(feed.headers()["referrer-policy"]).toBe("no-referrer");
    expect(await feed.text()).toContain("BEGIN:VCALENDAR");
    const etag = feed.headers().etag;
    expect(etag).toBeTruthy();

    const unchanged = await request.get(path, { headers: { "If-None-Match": etag } });
    expect(unchanged.status()).toBe(304);

    const token = await accessToken(request);
    const headers = {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": `calendar-subscription-revoke-${TEST_RUN}`,
    };
    const revoked = await request.delete(
      `/api/v1/calendar/subscriptions/${calendarSubscriptionLinkId}`,
      { headers },
    );
    expect(revoked.status()).toBe(200);
    expect(await revoked.json()).toMatchObject({
      data: { id: calendarSubscriptionLinkId, revoked: true },
    });
    expect((await request.get(path)).status()).toBe(404);
  });
});
