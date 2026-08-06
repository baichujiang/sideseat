import { expect, test, type APIRequestContext } from "@playwright/test";

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

  const create = await request.post("/api/v1/feedback", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": `feedback-${Date.now()}`,
      "x-forwarded-for": IP,
    },
    data: {
      topic: "idea",
      title: "Native feedback smoke",
      message: "This is an automated Stage 6 feedback submission for native API coverage.",
    },
  });
  expect(create.status()).toBe(201);
  const created = (await create.json()) as { data: { id: string } };
  expect(created.data.id).toBeTruthy();

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

  const comment = await request.post(`/api/v1/feedback/${created.data.id}/comments`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": `feedback-comment-${Date.now()}`,
      "x-forwarded-for": IP,
    },
    data: { body: "Agree — this would help evening planning." },
  });
  expect(comment.status()).toBe(201);
  const commented = (await comment.json()) as { data: { comment: { id: string; body: string } } };
  expect(commented.data.comment.id).toBeTruthy();

  const detail = await request.get(`/api/v1/feedback/${created.data.id}`, {
    headers: { Authorization: `Bearer ${token}`, "x-forwarded-for": IP },
  });
  expect(detail.status()).toBe(200);
  const detailBody = (await detail.json()) as {
    data: { post: { comments: Array<{ id: string }> } };
  };
  expect(detailBody.data.post.comments.some((row) => row.id === commented.data.comment.id)).toBe(
    true,
  );
});
