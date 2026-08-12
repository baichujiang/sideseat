import { expect, test, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { assertLocalTestDatabase } from "./helpers/local-test-database";

assertLocalTestDatabase();
const prisma = new PrismaClient();
const E2E_USER = process.env.E2E_USER ?? "test_001";
const E2E_PEER = process.env.E2E_PEER ?? "test_002";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "Password123";
// Keep each Discover test login isolated from fixed-window rate-limit state.
let discoverLoginSequence = 0;
const createdPostIds: string[] = [];
const createdActivityIds: string[] = [];
const createdReportIds: string[] = [];
const createdConnectionIds: string[] = [];
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

async function accessToken(request: APIRequestContext, identifier = E2E_USER) {
  discoverLoginSequence += 1;
  const loginIp = `198.19.${10 + (process.pid % 100)}.${(discoverLoginSequence % 200) + 1}`;
  const response = await request.post("/api/v1/auth/login", {
    headers: { "x-forwarded-for": loginIp },
    data: {
      identifier,
      password: E2E_PASSWORD,
      device: {
        id: "playwright-ios-discover-device",
        name: "Playwright Discover iPhone",
        appVersion: "1.0.0",
        platformVersion: "17.0",
      },
    },
  });
  expect(response.status()).toBe(200);
  return (
    (await response.json()) as { data: { tokens: { accessToken: string } } }
  ).data.tokens.accessToken;
}

function auth(token: string, key?: string) {
  return {
    Authorization: `Bearer ${token}`,
    ...(key ? { "Idempotency-Key": key } : {}),
  };
}

test.afterAll(async () => {
  await prisma.report.deleteMany({ where: { id: { in: createdReportIds } } });
  await prisma.classmatePost.deleteMany({
    where: { id: { in: createdPostIds } },
  });
  await prisma.discoverActivity.deleteMany({
    where: { id: { in: createdActivityIds } },
  });
  await prisma.connection.deleteMany({
    where: { id: { in: createdConnectionIds } },
  });
  await prisma.apiIdempotencyRecord.deleteMany({
    where: {
      scope: { startsWith: "native-discover-" },
    },
  });
  await prisma.$disconnect();
});

test.describe.serial("API v1 Discover", () => {
  test("requires authentication and validates feed input", async ({
    request,
  }) => {
    expect((await request.get("/api/v1/discover")).status()).toBe(401);
    const token = await accessToken(request);
    expect(
      (
        await request.get("/api/v1/discover?city=Berlin", {
          headers: auth(token),
        })
      ).status(),
    ).toBe(422);
    expect(
      (
        await request.get(`/api/v1/discover?q=${"x".repeat(81)}`, {
          headers: auth(token),
        })
      ).status(),
    ).toBe(422);
  });

  test("reports a visible peer buddy post", async ({ request }) => {
    const token = await accessToken(request);
    const peer = await prisma.user.findUniqueOrThrow({
      where: { username: E2E_PEER },
      select: { id: true },
    });
    const reporter = await prisma.user.findUniqueOrThrow({
      where: { username: E2E_USER },
      select: { id: true },
    });
    const post = await prisma.classmatePost.create({
      data: {
        userId: peer.id,
        city: "Munich",
        category: "OTHER",
        title: `Peer report target ${Date.now()}`,
        visibility: "CITY_INTERNATIONALS",
        expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
      },
      select: { id: true },
    });
    createdPostIds.push(post.id);

    const response = await request.post("/api/reports", {
      headers: auth(token),
      data: {
        reportedUserId: reporter.id,
        classmatePostId: post.id,
        reason: "SPAM",
        details: "discover post report",
      },
    });
    expect(response.status()).toBe(201);
    const payload = (await response.json()) as {
      data: { id: string; reportedUserId: string; classmatePostId: string | null };
    };
    createdReportIds.push(payload.data.id);
    expect(payload.data.reportedUserId).toBe(peer.id);
    expect(payload.data.classmatePostId).toBe(post.id);
  });

  test("supports public questions with one host answer, moderation, and deletion", async ({
    request,
  }) => {
    const askerToken = await accessToken(request);
    const hostToken = await accessToken(request, E2E_PEER);
    const host = await prisma.user.findUniqueOrThrow({
      where: { username: E2E_PEER },
      select: { id: true },
    });
    const post = await prisma.classmatePost.create({
      data: {
        userId: host.id,
        city: "Munich",
        category: "OTHER",
        title: `Question target ${Date.now()}`,
        visibility: "CITY_INTERNATIONALS",
        expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
      },
      select: { id: true },
    });
    createdPostIds.push(post.id);

    const questionKey = `discover-question-${Date.now()}`;
    const asked = await request.post(
      `/api/v1/discover/posts/${post.id}/questions`,
      {
        headers: auth(askerToken, questionKey),
        data: { body: "Should I bring anything?" },
      },
    );
    expect(asked.status()).toBe(201);
    const questionId = (await asked.json()).data.questionId as string;

    const replay = await request.post(
      `/api/v1/discover/posts/${post.id}/questions`,
      {
        headers: auth(askerToken, questionKey),
        data: { body: "Should I bring anything?" },
      },
    );
    expect(replay.status()).toBe(201);
    expect(replay.headers()["idempotency-replayed"]).toBe("true");

    const peerAnswer = await request.post(
      `/api/v1/discover/posts/${post.id}/questions`,
      {
        headers: auth(askerToken, `discover-answer-denied-${Date.now()}`),
        data: { body: "I am not the host.", parentId: questionId },
      },
    );
    expect(peerAnswer.status()).toBe(403);

    const answered = await request.post(
      `/api/v1/discover/posts/${post.id}/questions`,
      {
        headers: auth(hostToken, `discover-answer-${Date.now()}`),
        data: { body: "Just bring your student card.", parentId: questionId },
      },
    );
    expect(answered.status()).toBe(201);
    const answerId = (await answered.json()).data.commentId as string;

    const duplicate = await request.post(
      `/api/v1/discover/posts/${post.id}/questions`,
      {
        headers: auth(hostToken, `discover-answer-duplicate-${Date.now()}`),
        data: { body: "A second answer.", parentId: questionId },
      },
    );
    expect(duplicate.status()).toBe(409);

    const list = await request.get(
      `/api/v1/discover/posts/${post.id}/questions`,
      { headers: auth(askerToken) },
    );
    expect(list.status()).toBe(200);
    expect((await list.json()).data.questions).toEqual([
      expect.objectContaining({
        id: questionId,
        body: "Should I bring anything?",
        isOwn: true,
        canDelete: true,
        canReply: false,
        reply: expect.objectContaining({
          id: answerId,
          body: "Just bring your student card.",
          isOwn: false,
        }),
      }),
    ]);

    const report = await request.post("/api/reports", {
      headers: auth(askerToken),
      data: {
        reportedUserId: host.id,
        classmatePostCommentId: answerId,
        reason: "SPAM",
        details: "public answer report",
      },
    });
    expect(report.status()).toBe(201);
    const reportBody = (await report.json()).data as {
      id: string;
      classmatePostCommentId: string | null;
    };
    createdReportIds.push(reportBody.id);
    expect(reportBody.classmatePostCommentId).toBe(answerId);

    const deleted = await request.delete(
      `/api/v1/discover/posts/${post.id}/questions/${questionId}`,
      {
        headers: auth(askerToken, `discover-question-delete-${Date.now()}`),
      },
    );
    expect(deleted.status()).toBe(200);
    expect(await prisma.classmatePostComment.count({ where: { postId: post.id } })).toBe(0);
  });

  test("supports lightweight activity messages with one organizer reply", async ({
    request,
  }) => {
    const senderToken = await accessToken(request);
    const organizerToken = await accessToken(request, E2E_PEER);
    const organizer = await prisma.user.findUniqueOrThrow({
      where: { username: E2E_PEER },
      select: { id: true },
    });
    const sender = await prisma.user.findUniqueOrThrow({
      where: { username: E2E_USER },
      select: { id: true },
    });
    const activity = await prisma.discoverActivity.create({
      data: {
        organizerId: organizer.id,
        city: "Munich",
        school: "TUM",
        title: `Message target ${Date.now()}`,
        startAt: new Date(Date.now() + 6 * 60 * 60_000),
        endAt: new Date(Date.now() + 8 * 60 * 60_000),
        location: "Main Library",
      },
      select: { id: true },
    });
    createdActivityIds.push(activity.id);

    const messageKey = `discover-activity-message-${Date.now()}`;
    const posted = await request.post(
      `/api/v1/discover/activities/${activity.id}/messages`,
      {
        headers: auth(senderToken, messageKey),
        data: { body: "Should I bring anything?" },
      },
    );
    expect(posted.status()).toBe(201);
    const messageId = (await posted.json()).data.messageId as string;

    const replay = await request.post(
      `/api/v1/discover/activities/${activity.id}/messages`,
      {
        headers: auth(senderToken, messageKey),
        data: { body: "Should I bring anything?" },
      },
    );
    expect(replay.status()).toBe(201);
    expect(replay.headers()["idempotency-replayed"]).toBe("true");

    const unauthorizedReply = await request.post(
      `/api/v1/discover/activities/${activity.id}/messages`,
      {
        headers: auth(senderToken, `activity-reply-denied-${Date.now()}`),
        data: { body: "I am not the organizer.", parentId: messageId },
      },
    );
    expect(unauthorizedReply.status()).toBe(403);

    const reply = await request.post(
      `/api/v1/discover/activities/${activity.id}/messages`,
      {
        headers: auth(organizerToken, `activity-reply-${Date.now()}`),
        data: { body: "Nothing special.", parentId: messageId },
      },
    );
    expect(reply.status()).toBe(201);
    const replyId = (await reply.json()).data.commentId as string;

    const duplicateReply = await request.post(
      `/api/v1/discover/activities/${activity.id}/messages`,
      {
        headers: auth(organizerToken, `activity-reply-duplicate-${Date.now()}`),
        data: { body: "A second reply.", parentId: messageId },
      },
    );
    expect(duplicateReply.status()).toBe(409);

    const list = await request.get(
      `/api/v1/discover/activities/${activity.id}/messages`,
      { headers: auth(senderToken) },
    );
    expect(list.status()).toBe(200);
    expect((await list.json()).data.messages).toEqual([
      expect.objectContaining({
        id: messageId,
        body: "Should I bring anything?",
        isOwn: true,
        canDelete: true,
        canReply: false,
        reply: expect.objectContaining({
          id: replyId,
          body: "Nothing special.",
          isOwn: false,
        }),
      }),
    ]);

    const report = await request.post("/api/reports", {
      headers: auth(senderToken),
      data: {
        reportedUserId: sender.id,
        discoverActivityCommentId: replyId,
        reason: "SPAM",
        details: "activity organizer reply report",
      },
    });
    expect(report.status()).toBe(201);
    const reportBody = (await report.json()).data as {
      id: string;
      discoverActivityCommentId: string | null;
    };
    createdReportIds.push(reportBody.id);
    expect(reportBody.discoverActivityCommentId).toBe(replyId);

    const deleted = await request.delete(
      `/api/v1/discover/activities/${activity.id}/messages/${messageId}`,
      {
        headers: auth(
          senderToken,
          `activity-message-delete-${Date.now()}`,
        ),
      },
    );
    expect(deleted.status()).toBe(200);
    expect(
      await prisma.discoverActivityComment.count({
        where: { activityId: activity.id },
      }),
    ).toBe(0);
  });

  test("creates one scheduled plan and exposes it through search", async ({
    request,
  }) => {
    const token = await accessToken(request);
    const nonce = `Native buddy ${Date.now()}-${process.pid}`;
    const startsAt = new Date(Date.now() + 6 * 60 * 60_000).toISOString();
    const endsAt = new Date(Date.now() + 8 * 60 * 60_000).toISOString();
    const data = {
      city: "Munich",
      title: nonce,
      body: "Looking for a library study buddy.",
      startsAt,
      endsAt,
      location: "Main Library",
      capacity: 4,
      expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60_000).toISOString(),
    };
    expect(
      (
        await request.post("/api/v1/discover/posts", {
          headers: auth(token),
          data,
        })
      ).status(),
    ).toBe(422);

    const key = `discover-post-${Date.now()}`;
    const first = await request.post("/api/v1/discover/posts", {
      headers: auth(token, key),
      data,
    });
    expect(first.status()).toBe(201);
    const body = (await first.json()).data as { postId: string };
    createdPostIds.push(body.postId);

    const replay = await request.post("/api/v1/discover/posts", {
      headers: auth(token, key),
      data,
    });
    expect(replay.status()).toBe(201);
    expect(replay.headers()["idempotency-replayed"]).toBe("true");
    expect(
      await prisma.classmatePost.count({ where: { id: body.postId } }),
    ).toBe(1);

    const conflict = await request.post("/api/v1/discover/posts", {
      headers: auth(token, key),
      data: { ...data, title: `${nonce} changed` },
    });
    expect(conflict.status()).toBe(409);

    const feed = await request.get(
      `/api/v1/discover?q=${encodeURIComponent(nonce)}`,
      {
        headers: auth(token),
      },
    );
    expect(feed.status()).toBe(200);
    const payload = (await feed.json()).data;
    expect(payload.city).toBe("Munich");
    expect(payload.buddies).toEqual([
      expect.objectContaining({
        id: body.postId,
        category: "OTHER",
        startsAt,
        endsAt,
        location: "Main Library",
        capacity: 4,
        isOwn: true,
        author: expect.objectContaining({ id: expect.any(String) }),
      }),
    ]);
    expect(payload.activities).toEqual([]);
    await prisma.classmatePost.delete({ where: { id: body.postId } });
  });

  test("keeps public buddy posts visible after users connect", async ({
    request,
  }) => {
    const token = await accessToken(request);
    const [viewer, peer] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { username: E2E_USER },
        select: { id: true },
      }),
      prisma.user.findUniqueOrThrow({
        where: { username: E2E_PEER },
        select: { id: true },
      }),
    ]);
    const existingConnection = await prisma.connection.findFirst({
      where: {
        status: "ACTIVE",
        OR: [
          { userAId: viewer.id, userBId: peer.id },
          { userAId: peer.id, userBId: viewer.id },
        ],
      },
      select: { id: true },
    });
    if (!existingConnection) {
      const connection = await prisma.connection.create({
        data: { userAId: viewer.id, userBId: peer.id, status: "ACTIVE" },
        select: { id: true },
      });
      createdConnectionIds.push(connection.id);
    }

    const nonce = `Connected peer post ${Date.now()}-${process.pid}`;
    const post = await prisma.classmatePost.create({
      data: {
        userId: peer.id,
        city: "Munich",
        category: "OTHER",
        title: nonce,
        visibility: "CITY_INTERNATIONALS",
        expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
      },
      select: { id: true },
    });
    createdPostIds.push(post.id);

    const feed = await request.get(
      `/api/v1/discover?q=${encodeURIComponent(nonce)}`,
      { headers: auth(token) },
    );
    expect(feed.status()).toBe(200);
    expect((await feed.json()).data.buddies).toEqual([
      expect.objectContaining({ id: post.id, isOwn: false }),
    ]);
  });

  test("uploads a bounded buddy image and attaches it to a created post", async ({
    request,
  }) => {
    const token = await accessToken(request);
    const nonce = `${Date.now()}-${process.pid}`;

    const missingKey = await request.post("/api/v1/discover/posts/images", {
      headers: auth(token),
      multipart: {
        file: {
          name: "photo.png",
          mimeType: "image/png",
          buffer: ONE_PIXEL_PNG,
        },
      },
    });
    expect(missingKey.status()).toBe(422);

    const invalid = await request.post("/api/v1/discover/posts/images", {
      headers: auth(token, `discover-image-invalid-${nonce}`),
      multipart: {
        file: {
          name: "photo.png",
          mimeType: "image/png",
          buffer: Buffer.from("not a png"),
        },
      },
    });
    expect(invalid.status()).toBe(422);

    const imageKey = `discover-image-${nonce}`;
    const uploaded = await request.post("/api/v1/discover/posts/images", {
      headers: auth(token, imageKey),
      multipart: {
        file: {
          name: "photo.png",
          mimeType: "image/png",
          buffer: ONE_PIXEL_PNG,
        },
      },
    });
    expect(uploaded.status()).toBe(201);
    const image = (await uploaded.json()).data.image as {
      url: string;
      contentType: string;
      width: number;
      height: number;
      byteSize: number;
    };
    expect(image).toEqual(
      expect.objectContaining({
        contentType: "image/png",
        width: 1,
        height: 1,
        byteSize: ONE_PIXEL_PNG.byteLength,
      }),
    );

    const replay = await request.post("/api/v1/discover/posts/images", {
      headers: auth(token, imageKey),
      multipart: {
        file: {
          name: "photo.png",
          mimeType: "image/png",
          buffer: ONE_PIXEL_PNG,
        },
      },
    });
    expect(replay.status()).toBe(201);
    expect(replay.headers()["idempotency-replayed"]).toBe("true");
    expect((await replay.json()).data.image.url).toBe(image.url);

    const post = await request.post("/api/v1/discover/posts", {
      headers: auth(token, `discover-image-post-${nonce}`),
      data: {
        city: "Munich",
        title: `Native image buddy ${nonce}`,
        body: "Photo-backed buddy post.",
        expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60_000).toISOString(),
        imageUrls: [image.url],
      },
    });
    expect(post.status()).toBe(201);
    const postId = (await post.json()).data.postId as string;
    createdPostIds.push(postId);

    const detail = await request.get(`/api/v1/discover/posts/${postId}`, {
      headers: auth(token),
    });
    expect(detail.status()).toBe(200);
    expect((await detail.json()).data.post.imageUrls).toEqual([image.url]);

    await prisma.classmatePost.delete({ where: { id: postId } });
  });

  test("lets an author edit an active plan without losing saves or questions", async ({
    request,
  }) => {
    const ownerToken = await accessToken(request);
    const peerToken = await accessToken(request, E2E_PEER);
    const nonce = `${Date.now()}-${process.pid}`;
    const originalTitle = `Editable plan ${nonce}`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString();

    const created = await request.post("/api/v1/discover/posts", {
      headers: auth(ownerToken, `discover-edit-create-${nonce}`),
      data: {
        city: "Munich",
        title: originalTitle,
        body: "Original details.",
        expiresAt,
      },
    });
    expect(created.status()).toBe(201);
    const postId = (await created.json()).data.postId as string;
    createdPostIds.push(postId);

    const saved = await request.post(`/api/v1/discover/posts/${postId}/saved`, {
      headers: auth(peerToken, `discover-edit-save-${nonce}`),
    });
    expect(saved.status()).toBe(201);
    const question = await request.post(
      `/api/v1/discover/posts/${postId}/questions`,
      {
        headers: auth(peerToken, `discover-edit-question-${nonce}`),
        data: { body: "Does the updated plan still include beginners?" },
      },
    );
    expect(question.status()).toBe(201);
    const questionId = (await question.json()).data.questionId as string;

    const startsAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
    const endsAt = new Date(Date.now() + 26 * 60 * 60_000).toISOString();
    const updateData = {
      city: "Munich",
      title: `Updated plan ${nonce}`,
      body: "Updated details for everyone. #focus",
      tags: [],
      visibility: "VERIFIED_ONLY",
      replyPreference: "DIRECT_MESSAGE",
      startsAt,
      endsAt,
      location: "Updated Library",
      capacity: 6,
      expiresAt,
      courseIds: [],
      imageUrls: [],
    };

    const denied = await request.patch(`/api/v1/discover/posts/${postId}`, {
      headers: auth(peerToken, `discover-edit-denied-${nonce}`),
      data: updateData,
    });
    expect(denied.status()).toBe(403);

    const updateKey = `discover-edit-${nonce}`;
    const updated = await request.patch(`/api/v1/discover/posts/${postId}`, {
      headers: auth(ownerToken, updateKey),
      data: updateData,
    });
    expect(updated.status()).toBe(200);
    expect((await updated.json()).data.post).toEqual(
      expect.objectContaining({
        id: postId,
        title: updateData.title,
        body: updateData.body,
        tags: ["focus"],
        visibility: "VERIFIED_ONLY",
        startsAt,
        endsAt,
        location: "Updated Library",
        capacity: 6,
        interestedCount: 1,
      }),
    );

    const replay = await request.patch(`/api/v1/discover/posts/${postId}`, {
      headers: auth(ownerToken, updateKey),
      data: updateData,
    });
    expect(replay.status()).toBe(200);
    expect(replay.headers()["idempotency-replayed"]).toBe("true");

    const detail = await request.get(`/api/v1/discover/posts/${postId}`, {
      headers: auth(peerToken),
    });
    expect(detail.status()).toBe(200);
    expect((await detail.json()).data.post).toEqual(
      expect.objectContaining({
        id: postId,
        title: updateData.title,
        savedByViewer: true,
        interestedCount: 1,
      }),
    );
    const questions = await request.get(
      `/api/v1/discover/posts/${postId}/questions`,
      { headers: auth(peerToken) },
    );
    expect(questions.status()).toBe(200);
    expect((await questions.json()).data.questions).toContainEqual(
      expect.objectContaining({ id: questionId }),
    );

    const closed = await request.patch(
      `/api/v1/discover/posts/${postId}/status`,
      {
        headers: auth(ownerToken, `discover-edit-close-${nonce}`),
        data: { status: "CLOSED" },
      },
    );
    expect(closed.status()).toBe(200);
    const editClosed = await request.patch(`/api/v1/discover/posts/${postId}`, {
      headers: auth(ownerToken, `discover-edit-closed-${nonce}`),
      data: updateData,
    });
    expect(editClosed.status()).toBe(409);
  });

  test("creates one activity and exposes it through search", async ({
    request,
  }) => {
    const token = await accessToken(request);
    const nonce = `Native activity ${Date.now()}-${process.pid}`;
    const data = {
      title: nonce,
      description: "A small public meetup for the native client test.",
      startAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
      location: "Main Library",
      unlimitedCapacity: false,
      capacity: 8,
    };
    const key = `discover-activity-${Date.now()}`;
    const first = await request.post("/api/v1/discover/activities", {
      headers: auth(token, key),
      data,
    });
    expect(first.status()).toBe(201);
    const body = (await first.json()).data as { activityId: string };
    createdActivityIds.push(body.activityId);

    const replay = await request.post("/api/v1/discover/activities", {
      headers: auth(token, key),
      data,
    });
    expect(replay.status()).toBe(201);
    expect(replay.headers()["idempotency-replayed"]).toBe("true");
    expect(
      await prisma.discoverActivity.count({ where: { id: body.activityId } }),
    ).toBe(1);

    const feed = await request.get(
      `/api/v1/discover?q=${encodeURIComponent(nonce)}`,
      {
        headers: auth(token),
      },
    );
    expect(feed.status()).toBe(200);
    const payload = (await feed.json()).data;
    expect(payload.buddies).toEqual([]);
    expect(payload.activities).toEqual([
      expect.objectContaining({
        id: body.activityId,
        capacity: 8,
        phase: "bookable",
        isOrganizer: true,
        organizer: expect.objectContaining({ id: expect.any(String) }),
      }),
    ]);
    await prisma.discoverActivity.delete({ where: { id: body.activityId } });
  });

  test("loads details and applies save, RSVP, and organizer status transitions", async ({
    request,
  }) => {
    const ownerToken = await accessToken(request);
    const peerToken = await accessToken(request, E2E_PEER);
    const nonce = `${Date.now()}-${process.pid}`;

    const post = await request.post("/api/v1/discover/posts", {
      headers: auth(ownerToken, `discover-detail-post-${nonce}`),
      data: {
        city: "Munich",
        title: `Native detail buddy ${nonce}`,
        body: "Details and saved-state test.",
        expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60_000).toISOString(),
      },
    });
    expect(post.status()).toBe(201);
    const postId = (await post.json()).data.postId as string;
    createdPostIds.push(postId);

    const detail = await request.get(`/api/v1/discover/posts/${postId}`, {
      headers: auth(peerToken),
    });
    expect(detail.status()).toBe(200);
    expect((await detail.json()).data).toEqual(
      expect.objectContaining({
        post: expect.objectContaining({
          id: postId,
          savedByViewer: false,
          interestedCount: 0,
          visibility: "CITY_INTERNATIONALS",
          replyPreference: "DIRECT_MESSAGE",
        }),
        viewerCanMessage: true,
      }),
    );

    const saveKey = `discover-save-${nonce}`;
    const saved = await request.post(`/api/v1/discover/posts/${postId}/saved`, {
      headers: auth(peerToken, saveKey),
    });
    expect(saved.status()).toBe(201);
    expect((await saved.json()).data).toEqual(
      expect.objectContaining({
        postId,
        savedByViewer: true,
        interestedCount: 1,
      }),
    );
    const savedReplay = await request.post(
      `/api/v1/discover/posts/${postId}/saved`,
      {
        headers: auth(peerToken, saveKey),
      },
    );
    expect(savedReplay.status()).toBe(201);
    expect(savedReplay.headers()["idempotency-replayed"]).toBe("true");

    const unsaved = await request.delete(
      `/api/v1/discover/posts/${postId}/saved`,
      {
        headers: auth(peerToken, `discover-unsave-${nonce}`),
      },
    );
    expect(unsaved.status()).toBe(200);
    expect((await unsaved.json()).data).toEqual(
      expect.objectContaining({
        postId,
        savedByViewer: false,
        interestedCount: 0,
      }),
    );

    const activity = await request.post("/api/v1/discover/activities", {
      headers: auth(ownerToken, `discover-detail-activity-${nonce}`),
      data: {
        title: `Native detail activity ${nonce}`,
        description: "Details and RSVP test.",
        startAt: new Date(Date.now() + 4 * 60 * 60_000).toISOString(),
        location: "Main Library",
        unlimitedCapacity: false,
        capacity: 8,
      },
    });
    expect(activity.status()).toBe(201);
    const activityId = (await activity.json()).data.activityId as string;
    createdActivityIds.push(activityId);

    const activityDetail = await request.get(
      `/api/v1/discover/activities/${activityId}`,
      {
        headers: auth(peerToken),
      },
    );
    expect(activityDetail.status()).toBe(200);
    expect((await activityDetail.json()).data.activity).toEqual(
      expect.objectContaining({
        id: activityId,
        viewerSignupStatus: null,
        isOrganizer: false,
      }),
    );

    const joinKey = `discover-join-${nonce}`;
    const joined = await request.post(
      `/api/v1/discover/activities/${activityId}/signup`,
      {
        headers: auth(peerToken, joinKey),
      },
    );
    expect(joined.status()).toBe(201);
    expect((await joined.json()).data.activity).toEqual(
      expect.objectContaining({
        id: activityId,
        viewerSignupStatus: "GOING",
        goingCount: 1,
      }),
    );
    const joinedReplay = await request.post(
      `/api/v1/discover/activities/${activityId}/signup`,
      {
        headers: auth(peerToken, joinKey),
      },
    );
    expect(joinedReplay.status()).toBe(201);
    expect(joinedReplay.headers()["idempotency-replayed"]).toBe("true");

    const calendarKey = `discover-calendar-${nonce}`;
    const calendar = await request.post(
      `/api/v1/discover/activities/${activityId}/calendar`,
      {
        headers: auth(peerToken, calendarKey),
      },
    );
    expect(calendar.status()).toBe(201);
    const calendarBody = await calendar.json();
    expect(calendarBody.data).toEqual(
      expect.objectContaining({
        calendarEntryId: expect.any(String),
        created: true,
      }),
    );
    const calendarReplay = await request.post(
      `/api/v1/discover/activities/${activityId}/calendar`,
      {
        headers: auth(peerToken, calendarKey),
      },
    );
    expect(calendarReplay.status()).toBe(201);
    expect(calendarReplay.headers()["idempotency-replayed"]).toBe("true");
    expect((await calendarReplay.json()).data.calendarEntryId).toBe(
      calendarBody.data.calendarEntryId,
    );

    const existingCalendar = await request.post(
      `/api/v1/discover/activities/${activityId}/calendar`,
      {
        headers: auth(peerToken, `discover-calendar-again-${nonce}`),
      },
    );
    expect(existingCalendar.status()).toBe(200);
    expect((await existingCalendar.json()).data).toEqual({
      calendarEntryId: calendarBody.data.calendarEntryId,
      created: false,
    });

    const activityDetailAfterCalendar = await request.get(
      `/api/v1/discover/activities/${activityId}`,
      {
        headers: auth(peerToken),
      },
    );
    expect(activityDetailAfterCalendar.status()).toBe(200);
    expect((await activityDetailAfterCalendar.json()).data.calendarEntryId).toBe(
      calendarBody.data.calendarEntryId,
    );

    const left = await request.delete(
      `/api/v1/discover/activities/${activityId}/signup`,
      {
        headers: auth(peerToken, `discover-leave-${nonce}`),
      },
    );
    expect(left.status()).toBe(200);
    expect((await left.json()).data.activity).toEqual(
      expect.objectContaining({ id: activityId, viewerSignupStatus: null }),
    );

    const peerClose = await request.patch(
      `/api/v1/discover/activities/${activityId}/status`,
      {
        headers: auth(peerToken, `discover-peer-close-${nonce}`),
        data: { status: "CLOSED" },
      },
    );
    expect(peerClose.status()).toBe(403);

    const closed = await request.patch(
      `/api/v1/discover/activities/${activityId}/status`,
      {
        headers: auth(ownerToken, `discover-close-${nonce}`),
        data: { status: "CLOSED" },
      },
    );
    expect(closed.status()).toBe(200);
    expect((await closed.json()).data.activity).toEqual(
      expect.objectContaining({
        id: activityId,
        status: "CLOSED",
        phase: "closed",
      }),
    );

    const canceled = await request.patch(
      `/api/v1/discover/activities/${activityId}/status`,
      {
        headers: auth(ownerToken, `discover-cancel-${nonce}`),
        data: { status: "CANCELED" },
      },
    );
    expect(canceled.status()).toBe(200);
    expect((await canceled.json()).data.activity).toEqual(
      expect.objectContaining({
        id: activityId,
        status: "CANCELED",
        phase: "canceled",
      }),
    );

    await prisma.classmatePost.delete({ where: { id: postId } });
    await prisma.discoverActivity.delete({ where: { id: activityId } });
  });

  test("lists and closes the current user's published plans", async ({
    request,
  }) => {
    const ownerToken = await accessToken(request);
    const peerToken = await accessToken(request, E2E_PEER);
    const nonce = `${Date.now()}-${process.pid}`;

    const postResponse = await request.post("/api/v1/discover/posts", {
      headers: auth(ownerToken, `discover-my-post-${nonce}`),
      data: {
        city: "Munich",
        title: `My published plan ${nonce}`,
        body: "Visible from the personal publishing manager.",
        expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60_000).toISOString(),
      },
    });
    expect(postResponse.status()).toBe(201);
    const postId = (await postResponse.json()).data.postId as string;
    createdPostIds.push(postId);

    const activityResponse = await request.post(
      "/api/v1/discover/activities",
      {
        headers: auth(ownerToken, `discover-my-activity-${nonce}`),
        data: {
          title: `My published activity ${nonce}`,
          description: "Also visible from the publishing manager.",
          startAt: new Date(Date.now() + 6 * 60 * 60_000).toISOString(),
          location: "Student Center",
          unlimitedCapacity: true,
        },
      },
    );
    expect(activityResponse.status()).toBe(201);
    const activityId = (await activityResponse.json()).data.activityId as string;
    createdActivityIds.push(activityId);

    expect((await request.get("/api/v1/me/posts")).status()).toBe(401);
    const mine = await request.get("/api/v1/me/posts", {
      headers: auth(ownerToken),
    });
    expect(mine.status()).toBe(200);
    const mineData = (await mine.json()).data;
    expect(mineData.posts).toContainEqual(
      expect.objectContaining({
        id: postId,
        status: "ACTIVE",
        closureReason: null,
        closedAt: null,
        isOwn: true,
      }),
    );
    expect(mineData.activities).toContainEqual(
      expect.objectContaining({
        id: activityId,
        status: "OPEN",
        isOrganizer: true,
      }),
    );

    const denied = await request.patch(
      `/api/v1/discover/posts/${postId}/status`,
      {
        headers: auth(peerToken, `discover-my-post-denied-${nonce}`),
        data: { status: "CLOSED" },
      },
    );
    expect(denied.status()).toBe(403);

    const closeKey = `discover-my-post-close-${nonce}`;
    const closed = await request.patch(
      `/api/v1/discover/posts/${postId}/status`,
      {
        headers: auth(ownerToken, closeKey),
        data: { status: "CLOSED" },
      },
    );
    expect(closed.status()).toBe(200);
    const closedPost = (await closed.json()).data.post;
    expect(closedPost).toEqual(
      expect.objectContaining({
        id: postId,
        status: "CLOSED",
        closureReason: "AUTHOR_CLOSED",
      }),
    );
    expect(new Date(closedPost.closedAt).toString()).not.toBe("Invalid Date");

    const replay = await request.patch(
      `/api/v1/discover/posts/${postId}/status`,
      {
        headers: auth(ownerToken, closeKey),
        data: { status: "CLOSED" },
      },
    );
    expect(replay.status()).toBe(200);
    expect(replay.headers()["idempotency-replayed"]).toBe("true");
  });

  test("keeps legacy Web buddy and activity creation contracts working", async ({
    request,
  }) => {
    const token = await accessToken(request);
    const nonce = `${Date.now()}-${process.pid}`;
    const post = await request.post("/api/classmate-posts", {
      headers: auth(token),
      data: {
        city: "Munich",
        title: `Legacy buddy ${nonce}`,
        body: "Legacy Web compatibility",
        expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60_000).toISOString(),
      },
    });
    expect(post.status()).toBe(201);
    const postId = (await post.json()).data.post.id as string;
    createdPostIds.push(postId);

    const activity = await request.post("/api/discover-activities", {
      headers: auth(token),
      data: {
        title: `Legacy activity ${nonce}`,
        description: "Legacy Web compatibility",
        startAt: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
        location: "Legacy Room",
        unlimitedCapacity: true,
      },
    });
    expect(activity.status()).toBe(201);
    const activityId = (await activity.json()).data.activity.id as string;
    createdActivityIds.push(activityId);

    expect(await prisma.classmatePost.count({ where: { id: postId } })).toBe(1);
    expect(
      await prisma.discoverActivity.count({ where: { id: activityId } }),
    ).toBe(1);
  });
});
