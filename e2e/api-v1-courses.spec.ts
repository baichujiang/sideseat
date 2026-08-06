import { expect, test, type APIRequestContext } from "@playwright/test";
import { CourseIntent, PrismaClient } from "@prisma/client";

import { getCurrentSemesterLabel } from "../lib/constants/semester";
import { assertLocalTestDatabase } from "./helpers/local-test-database";

assertLocalTestDatabase();
const prisma = new PrismaClient();
const E2E_USER = process.env.E2E_USER ?? "test_001";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "Password123";
const COURSES_TEST_IP = `198.51.100.${(process.pid % 180) + 40}`;
const device = {
  id: "playwright-ios-courses-device",
  name: "Playwright Courses iPhone",
  appVersion: "1.0.0",
  platformVersion: "17.0",
};

let viewerId = "";
let otherUserId = "";
let crossSemesterUserId = "";
let courseId = "";
let archivedCourseId = "";
let manualCourseId = "";
let variantFingerprint = "";

async function accessToken(request: APIRequestContext, identifier = E2E_USER) {
  const response = await request.post("/api/v1/auth/login", {
    headers: { "x-forwarded-for": COURSES_TEST_IP },
    data: { identifier, password: E2E_PASSWORD, device },
  });
  expect(response.status()).toBe(200);
  return ((await response.json()) as { data: { tokens: { accessToken: string } } }).data.tokens
    .accessToken;
}

function auth(token: string, key?: string) {
  return {
    Authorization: `Bearer ${token}`,
    ...(key ? { "Idempotency-Key": key } : {}),
  };
}

test.beforeAll(async () => {
  const [viewer, other, crossSemesterUser] = await Promise.all([
    prisma.user.findUnique({ where: { username: E2E_USER }, select: { id: true } }),
    prisma.user.findUnique({ where: { username: "test_002" }, select: { id: true } }),
    prisma.user.findUnique({ where: { username: "test_003" }, select: { id: true } }),
  ]);
  if (!viewer || !other || !crossSemesterUser) {
    throw new Error("Seeded course test users are missing.");
  }
  viewerId = viewer.id;
  otherUserId = other.id;
  crossSemesterUserId = crossSemesterUser.id;
  await prisma.user.update({
    where: { id: viewer.id },
    data: { courseReviewSemesterLabel: null },
  });

  const nonce = `${Date.now()}-${process.pid}`;
  variantFingerprint = `TUE 10:00-11:30 ${nonce}`;
  const code = `NC${String(process.pid).slice(-4)}${String(Date.now()).slice(-4)}`;
  const course = await prisma.course.create({
    data: {
      name: `Native Course API ${nonce}`,
      code,
      school: "TUM",
      semesterLabel: getCurrentSemesterLabel(),
      instructorSummary: "Professor Native",
      members: {
        create: {
          userId: otherUserId,
          intentions: [CourseIntent.EXAM_PREP],
        },
      },
      officialScheduleVariants: {
        create: {
          label: "Lecture",
          fingerprint: variantFingerprint,
          sessions: {
            create: {
              weekday: "TUE",
              startMinute: 600,
              endMinute: 690,
              location: "Room N1",
            },
          },
        },
      },
    },
  });
  courseId = course.id;

  const archivedCourse = await prisma.course.create({
    data: {
      name: `Native Course API Archive ${nonce}`,
      code: `${code.slice(0, 2).toLowerCase()} ${code.slice(2)}`,
      school: "TUM",
      semesterLabel: "SS 2025",
      members: {
        create: {
          userId: crossSemesterUserId,
          intentions: [CourseIntent.STUDY_TOGETHER],
          activeUntil: new Date("2027-03-31T21:59:59.999Z"),
        },
      },
    },
  });
  archivedCourseId = archivedCourse.id;
});

test.afterAll(async () => {
  const courseIds = [courseId, archivedCourseId, manualCourseId].filter(Boolean);
  if (courseIds.length) await prisma.course.deleteMany({ where: { id: { in: courseIds } } });
  if (courseId) {
    await prisma.apiIdempotencyRecord.deleteMany({
      where: { scope: { contains: courseId } },
    });
  }
  await prisma.$disconnect();
});

test.describe.serial("API v1 Courses", () => {
  test("requires authentication and validates list input", async ({ request }) => {
    expect((await request.get("/api/v1/courses")).status()).toBe(401);
    const token = await accessToken(request);
    expect(
      (await request.get("/api/v1/courses?scope=unknown", { headers: auth(token) })).status(),
    ).toBe(422);
    expect(
      (await request.get("/api/v1/courses?cursor=broken", { headers: auth(token) })).status(),
    ).toBe(422);
  });

  test("searches catalog data and returns viewer state", async ({ request }) => {
    const token = await accessToken(request);
    const response = await request.get(
      `/api/v1/courses?scope=popular&q=${encodeURIComponent("Native Course API")}`,
      { headers: auth(token) },
    );
    expect(response.status()).toBe(200);
    const payload = await response.json();
    expect(payload.data.schools).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "TUM" }), expect.objectContaining({ code: "LMU" })]),
    );
    expect(payload.data.courses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: courseId,
          memberCount: 1,
          viewer: { enrolled: false, saved: false },
        }),
      ]),
    );
  });

  test("matches multiple OCR course terms in one request", async ({ request }) => {
    const token = await accessToken(request);
    const response = await request.post("/api/v1/courses/match", {
      headers: auth(token),
      data: { school: "TUM", terms: ["Native Course API", "does not exist"] },
    });
    expect(response.status()).toBe(200);
    expect((await response.json()).data.courses).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: courseId })]),
    );
  });

  test("verified students can add and idempotently join a community course", async ({ request }) => {
    const token = await accessToken(request);
    const key = `courses-manual-${Date.now()}`;
    const code = `CM${String(Date.now()).slice(-7)}`;
    const first = await request.post("/api/v1/courses/manual", {
      headers: auth(token, key),
      data: { name: `Community Systems ${code}`, code },
    });
    expect(first.status()).toBe(201);
    const firstBody = (await first.json()).data;
    manualCourseId = firstBody.courseId;
    expect(firstBody).toMatchObject({ code, school: "TUM", communitySubmitted: true });

    const replay = await request.post("/api/v1/courses/manual", {
      headers: auth(token, key),
      data: { name: `Community Systems ${code}`, code },
    });
    expect(replay.status()).toBe(201);
    expect(replay.headers()["idempotency-replayed"]).toBe("true");
    expect(
      await prisma.userCourse.count({ where: { userId: viewerId, courseId: manualCourseId } }),
    ).toBe(1);

    const listed = await request.get(`/api/v1/courses?q=${code}`, {
      headers: auth(token),
    });
    expect(listed.status()).toBe(200);
    expect((await listed.json()).data.courses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: manualCourseId, communitySubmitted: true }),
      ]),
    );
  });

  test("unverified students cannot publish community courses", async ({ request }) => {
    const token = await accessToken(request, "test_004");
    const response = await request.post("/api/v1/courses/manual", {
      headers: auth(token, `courses-manual-unverified-${Date.now()}`),
      data: { name: "Unverified Course", code: "NOACCESS1" },
    });
    expect(response.status()).toBe(403);
    expect((await response.json()).error.code).toBe("CONTENT_RESTRICTED");
  });

  test("saves exactly once and exposes the saved collection", async ({ request }) => {
    const token = await accessToken(request);
    const key = `courses-save-${Date.now()}`;
    const first = await request.post(`/api/v1/courses/${courseId}/saved`, {
      headers: auth(token, key),
    });
    expect(first.status()).toBe(201);
    const replay = await request.post(`/api/v1/courses/${courseId}/saved`, {
      headers: auth(token, key),
    });
    expect(replay.status()).toBe(201);
    expect(replay.headers()["idempotency-replayed"]).toBe("true");
    expect(
      await prisma.savedCourse.count({ where: { userId: viewerId, courseId } }),
    ).toBe(1);

    const list = await request.get("/api/v1/courses?scope=saved", { headers: auth(token) });
    expect(list.status()).toBe(200);
    expect((await list.json()).data.courses).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: courseId })]),
    );
  });

  test("loads detail, enrolls and applies an official timetable", async ({ request }) => {
    const token = await accessToken(request);
    const detailBefore = await request.get(`/api/v1/courses/${courseId}`, {
      headers: auth(token),
    });
    expect(detailBefore.status()).toBe(200);
    const before = (await detailBefore.json()).data;
    expect(before.members).toHaveLength(0);
    expect(before.officialScheduleVariants[0]).toMatchObject({
      fingerprint: variantFingerprint,
      label: "Lecture",
    });

    const enroll = await request.post(`/api/v1/courses/${courseId}/enrollment`, {
      headers: auth(token, `courses-enroll-${Date.now()}`),
    });
    expect(enroll.status()).toBe(200);
    expect(await prisma.savedCourse.count({ where: { userId: viewerId, courseId } })).toBe(0);

    const schedule = await request.patch(`/api/v1/courses/${courseId}/schedule`, {
      headers: auth(token, `courses-schedule-${Date.now()}`),
      data: { variantFingerprint },
    });
    expect(schedule.status()).toBe(200);
    expect((await schedule.json()).data.sessionCount).toBe(1);

    const detailAfter = await request.get(`/api/v1/courses/${courseId}`, {
      headers: auth(token),
    });
    const after = (await detailAfter.json()).data;
    expect(after.course.viewer.enrolled).toBe(true);
    expect(after.course.memberCount).toBe(3);
    expect(after.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: otherUserId }),
        expect.objectContaining({ userId: crossSemesterUserId }),
      ]),
    );
    expect(after.members[0]).not.toHaveProperty("email");
    expect(after.members[0]).not.toHaveProperty("phone");
    expect(after.members[0]).not.toHaveProperty("hashedPassword");
    expect(after.membership.sessions[0]).toMatchObject({
      weekday: "TUE",
      startMinute: 600,
      endMinute: 690,
    });
    expect(after.chat.available).toBe(true);
  });

  test("expires matching access and renews it through semester review", async ({ request }) => {
    const token = await accessToken(request);
    await prisma.userCourse.update({
      where: { userId_courseId: { userId: viewerId, courseId } },
      data: { activeUntil: new Date("2020-01-01T00:00:00.000Z") },
    });

    const enrolled = await request.get(
      `/api/v1/courses?scope=enrolled&q=${encodeURIComponent("Native Course API")}`,
      { headers: auth(token) },
    );
    expect(enrolled.status()).toBe(200);
    expect((await enrolled.json()).data.courses).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: courseId })]),
    );

    const expiredDetail = await request.get(`/api/v1/courses/${courseId}`, {
      headers: auth(token),
    });
    expect(expiredDetail.status()).toBe(200);
    expect((await expiredDetail.json()).data).toMatchObject({
      course: { viewer: { enrolled: false }, memberCount: 2 },
      members: [],
      membership: null,
      chat: { available: false },
    });

    const review = await request.get("/api/v1/courses/semester-review", {
      headers: auth(token),
    });
    expect(review.status()).toBe(200);
    expect((await review.json()).data).toMatchObject({
      semesterLabel: getCurrentSemesterLabel(),
      required: true,
      courseCount: 1,
      courses: [expect.objectContaining({ id: courseId })],
    });

    const renewKey = `courses-semester-review-${Date.now()}`;
    const renew = await request.post("/api/v1/courses/semester-review", {
      headers: auth(token, renewKey),
      data: { courseIds: [courseId] },
    });
    expect(renew.status()).toBe(200);
    expect((await renew.json()).data).toMatchObject({
      semesterLabel: getCurrentSemesterLabel(),
      renewedCount: 1,
      archivedCount: 0,
    });
    const replay = await request.post("/api/v1/courses/semester-review", {
      headers: auth(token, renewKey),
      data: { courseIds: [courseId] },
    });
    expect(replay.status()).toBe(200);
    expect(replay.headers()["idempotency-replayed"]).toBe("true");

    const renewed = await prisma.userCourse.findUniqueOrThrow({
      where: { userId_courseId: { userId: viewerId, courseId } },
      select: { activeUntil: true },
    });
    expect(renewed.activeUntil?.getTime()).toBeGreaterThan(Date.now());
    expect(
      (
        await prisma.user.findUniqueOrThrow({
          where: { id: viewerId },
          select: { courseReviewSemesterLabel: true },
        })
      ).courseReviewSemesterLabel,
    ).toBe(getCurrentSemesterLabel());
  });

  test("leaves idempotently and removes the private timetable", async ({ request }) => {
    const token = await accessToken(request);
    const key = `courses-leave-${Date.now()}`;
    const first = await request.delete(`/api/v1/courses/${courseId}/enrollment`, {
      headers: auth(token, key),
    });
    expect(first.status()).toBe(200);
    const replay = await request.delete(`/api/v1/courses/${courseId}/enrollment`, {
      headers: auth(token, key),
    });
    expect(replay.status()).toBe(200);
    expect(replay.headers()["idempotency-replayed"]).toBe("true");
    expect(await prisma.userCourse.count({ where: { userId: viewerId, courseId } })).toBe(0);
    expect(
      await prisma.courseSession.count({ where: { userCourse: { userId: viewerId, courseId } } }),
    ).toBe(0);
  });
});
