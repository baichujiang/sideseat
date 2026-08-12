import { expect, test, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { assertLocalTestDatabase } from "./helpers/local-test-database";

assertLocalTestDatabase();
const E2E_USER = process.env.E2E_USER ?? "test_001";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "Password123";
const IP = `198.51.100.${(process.pid % 200) + 90}`;
const device = {
  id: "playwright-ios-feedback-device",
  name: "Playwright Feedback iPhone",
  appVersion: "1.0.0",
  platformVersion: "17.0",
};
const prisma = new PrismaClient();
const createdFeedbackIds: string[] = [];

test.afterAll(async () => {
  if (createdFeedbackIds.length > 0) {
    await prisma.productFeedback.deleteMany({ where: { id: { in: createdFeedbackIds } } });
  }
  await prisma.$disconnect();
});

async function accessToken(request: APIRequestContext) {
  const response = await request.post("/api/v1/auth/login", {
    headers: { "x-forwarded-for": IP },
    data: {
      identifier: E2E_USER,
      password: E2E_PASSWORD,
      device,
    },
  });
  expect(response.status()).toBe(200);
  const payload = (await response.json()) as { data: { tokens: { accessToken: string } } };
  return payload.data.tokens.accessToken;
}

test("list and create product feedback", async ({ request }) => {
  const token = await accessToken(request);

  const list = await request.get("/api/v1/feedback", {
    headers: { Authorization: `Bearer ${token}`, "x-forwarded-for": IP },
  });
  expect(list.status()).toBe(200);
  const feed = (await list.json()) as {
    data: { posts: Array<{ id: string }>; viewer: { isAdmin: boolean } };
  };
  expect(Array.isArray(feed.data.posts)).toBe(true);
  expect(typeof feed.data.viewer.isAdmin).toBe("boolean");

  const createKey = `feedback-${Date.now()}`;
  const createData = {
    topic: "idea",
    title: "Native feedback smoke",
    message: "This is an automated Stage 6 feedback submission for native API coverage.",
  };
  const create = await request.post("/api/v1/feedback", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": createKey,
      "x-forwarded-for": IP,
    },
    data: createData,
  });
  expect(create.status()).toBe(201);
  const created = (await create.json()) as { data: { id: string } };
  expect(created.data.id).toBeTruthy();
  createdFeedbackIds.push(created.data.id);

  const createReplay = await request.post("/api/v1/feedback", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": createKey,
      "x-forwarded-for": IP,
    },
    data: createData,
  });
  expect(createReplay.status()).toBe(201);
  expect(((await createReplay.json()) as { data: { id: string } }).data.id).toBe(created.data.id);

  const again = await request.get("/api/v1/feedback", {
    headers: { Authorization: `Bearer ${token}`, "x-forwarded-for": IP },
  });
  expect(again.status()).toBe(200);
  const updated = (await again.json()) as { data: { posts: Array<{ id: string }> } };
  expect(updated.data.posts.some((post) => post.id === created.data.id)).toBe(true);

  const vote = await request.post(`/api/v1/feedback/${created.data.id}/vote`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": `feedback-vote-${Date.now()}`,
      "x-forwarded-for": IP,
    },
    data: { value: "UP" },
  });
  expect(vote.status()).toBe(200);
  const voted = (await vote.json()) as {
    data: { post: { myVote: string | null; up: number; comments: unknown[] } };
  };
  expect(voted.data.post.myVote).toBe("UP");
  expect(voted.data.post.up).toBeGreaterThanOrEqual(1);

  const downvote = await request.post(`/api/v1/feedback/${created.data.id}/vote`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": `feedback-downvote-${Date.now()}`,
      "x-forwarded-for": IP,
    },
    data: { value: "DOWN" },
  });
  expect(downvote.status()).toBe(200);
  const downvoted = (await downvote.json()) as {
    data: { post: { myVote: string | null; up: number; down: number; score: number } };
  };
  expect(downvoted.data.post).toMatchObject({ myVote: "DOWN", up: 0, down: 1, score: -1 });

  const clearVote = await request.post(`/api/v1/feedback/${created.data.id}/vote`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": `feedback-clear-vote-${Date.now()}`,
      "x-forwarded-for": IP,
    },
    data: { value: null },
  });
  expect(clearVote.status()).toBe(200);
  const cleared = (await clearVote.json()) as {
    data: { post: { myVote: string | null; up: number; down: number; score: number } };
  };
  expect(cleared.data.post).toMatchObject({ myVote: null, up: 0, down: 0, score: 0 });

  const commentKey = `feedback-comment-${Date.now()}`;
  const commentData = { body: "Agree — this would help evening planning." };
  const comment = await request.post(`/api/v1/feedback/${created.data.id}/comments`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": commentKey,
      "x-forwarded-for": IP,
    },
    data: commentData,
  });
  expect(comment.status()).toBe(201);
  const commented = (await comment.json()) as { data: { comment: { id: string; body: string } } };
  expect(commented.data.comment.id).toBeTruthy();

  const commentReplay = await request.post(`/api/v1/feedback/${created.data.id}/comments`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": commentKey,
      "x-forwarded-for": IP,
    },
    data: commentData,
  });
  expect(commentReplay.status()).toBe(201);
  expect(
    ((await commentReplay.json()) as { data: { comment: { id: string } } }).data.comment.id,
  ).toBe(commented.data.comment.id);

  const detail = await request.get(`/api/v1/feedback/${created.data.id}`, {
    headers: { Authorization: `Bearer ${token}`, "x-forwarded-for": IP },
  });
  expect(detail.status()).toBe(200);
  const detailBody = (await detail.json()) as {
    data: { post: { comments: Array<{ id: string }> } };
  };
  expect(
    detailBody.data.post.comments.filter((row) => row.id === commented.data.comment.id),
  ).toHaveLength(1);

  const untouched = await request.post("/api/v1/feedback", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": `feedback-untouched-${Date.now()}`,
      "x-forwarded-for": IP,
    },
    data: {
      topic: "other",
      title: "Untouched ranking comparison",
      message: "This post remains untouched to verify comprehensive ordering behavior.",
    },
  });
  expect(untouched.status()).toBe(201);
  const untouchedID = ((await untouched.json()) as { data: { id: string } }).data.id;
  createdFeedbackIds.push(untouchedID);

  const ranked = await request.get("/api/v1/feedback", {
    headers: { Authorization: `Bearer ${token}`, "x-forwarded-for": IP },
  });
  expect(ranked.status()).toBe(200);
  const rankedIDs = ((await ranked.json()) as { data: { posts: Array<{ id: string }> } }).data.posts.map(
    (post) => post.id,
  );
  expect(rankedIDs.indexOf(created.data.id)).toBeLessThan(rankedIDs.indexOf(untouchedID));
});
