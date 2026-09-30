import { test, expect, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { createHash, randomUUID } from "node:crypto";
import { assertLocalTestDatabase } from "./helpers/local-test-database";

assertLocalTestDatabase();
const db = new PrismaClient();
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=", "base64");
const password = "Storage-Test-Only-123";
const users: Array<{ id: string; username: string }> = [];
let connectionId = "";

async function login(request: APIRequestContext, index: number) {
  const result = await request.post("/api/v1/auth/login", { data: {
    identifier: users[index].username, password,
    device: { id: `storage-${users[index].id}`, name: "Storage QA", platformVersion: "17.0", appVersion: "1.0.0" },
  } });
  expect(result.status(), await result.text()).toBe(200);
  return (await result.json()).data.tokens.accessToken as string;
}

test.beforeAll(async () => {
  const suffix = randomUUID().slice(0, 8);
  const hashedPassword = await hash(password, 4);
  for (const label of ["a", "b", "c"]) users.push(await db.user.create({ data: {
    username: `media_${suffix}_${label}`, hashedPassword, school: "TUM", onboardingComplete: true,
    verifiedStudent: true, studentVerificationStatus: "VERIFIED", isGuest: false,
  }, select: { id: true, username: true } }));
  const connection = await db.connection.create({ data: { userAId: users[0].id, userBId: users[1].id, replyLimitUnlockedAt: new Date() } });
  connectionId = connection.id;
});

test.afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } });
  await db.$disconnect();
});

test("private chat image: upload, send, read, expire, block, revoke", async ({ request, playwright, baseURL }) => {
  const [a, b, c] = await Promise.all([0, 1, 2].map(index => login(request, index)));
  const uploadKey = randomUUID();
  const uploadRequest = {
    headers: { Authorization: `Bearer ${a}`, "Idempotency-Key": uploadKey }, multipart: { file: { name: "photo.png", mimeType: "image/png", buffer: png } },
  };
  const uploaded = await request.post(`/api/connections/${connectionId}/chat-images`, {
    ...uploadRequest,
  });
  expect(uploaded.status(), await uploaded.text()).toBe(200);
  const pointer = (await uploaded.json()).data.url as string;
  const uploadAgain = await request.post(`/api/connections/${connectionId}/chat-images`, uploadRequest);
  expect((await uploadAgain.json()).data.url).toBe(pointer);
  expect(pointer).toContain(".private.blob.vercel-storage.com/");
  const send = (token: string, imageUrl: string, key = randomUUID()) => request.post(`/api/v1/connections/${connectionId}/messages`, {
    headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": key }, data: { type: "IMAGE", imageUrl, body: "Private photo" },
  });
  expect((await send(b, pointer)).status()).toBe(422);
  expect((await send(a, `data:image/png;base64,${png.toString("base64")}`)).status()).toBe(422);
  const sendKey = randomUUID();
  const sent = await send(a, pointer, sendKey);
  expect(sent.status(), await sent.text()).toBe(201);
  const message = (await sent.json()).data;
  expect(message.imageUrl).not.toContain("blob.vercel-storage.com");
  const url = new URL(message.imageUrl);
  const anonymous = await playwright.request.newContext({ baseURL });
  try {
    const bytes = await anonymous.get(url.toString());
    expect(bytes.status(), await bytes.text()).toBe(200);
    expect(await bytes.body()).toEqual(png);
    expect(bytes.headers()["cache-control"]).toBe("private, no-store");
    const bare = new URL(url.pathname, baseURL).toString();
    expect((await anonymous.get(bare)).status()).toBe(401);
    expect((await anonymous.get(bare, { headers: { Authorization: `Bearer ${b}` } })).status()).toBe(200);
    expect((await anonymous.get(url.toString(), { headers: { Authorization: `Bearer ${c}` } })).status()).toBe(404);
    const tampered = new URL(url); tampered.searchParams.set("viewer", users[2].id);
    expect((await anonymous.get(tampered.toString())).status()).toBe(401);
    const expired = new URL(url); expired.searchParams.set("expires", "1");
    expect((await anonymous.get(expired.toString())).status()).toBe(401);
    await db.apiIdempotencyRecord.updateMany({ where: { scope: `native-direct-message:${connectionId}`, responseStatus: 201 },
      data: { responseBody: { ...message, imageUrl: expired.toString() } } });
    const replay = await send(a, pointer, sendKey);
    const replayMessage = (await replay.json()).data;
    expect(replayMessage.id).toBe(message.id);
    expect((await anonymous.get(replayMessage.imageUrl)).status()).toBe(200);
    const thread = await request.get(`/api/v1/connections/${connectionId}/messages`, { headers: { Authorization: `Bearer ${b}` } });
    expect(await thread.text()).not.toContain(pointer);
    const block = await db.block.create({ data: { blockerId: users[1].id, blockedId: users[0].id, connectionId } });
    expect((await anonymous.get(url.toString())).status()).toBe(404);
    expect((await request.post(`/api/connections/${connectionId}/chat-images`, uploadRequest)).status()).toBe(404);
    await db.block.delete({ where: { id: block.id } });
    expect((await request.delete(`/api/connections/${connectionId}/messages/${message.id}`, { headers: { Authorization: `Bearer ${a}` } })).status()).toBe(200);
    expect((await anonymous.get(url.toString())).status()).toBe(404);
  } finally { await anonymous.dispose(); }
});

test("daily upload limit is shared across chat and profile; a replay does not upload again", async ({ request }) => {
  const token = await login(request, 0);
  const scope = "media-upload-day";
  const sha = (text: string) => createHash("sha256").update(text).digest("hex");
  const subject = sha(`sideseat:v1:rate-limit-subject:${users[0].id}`);
  const start = new Date(Math.floor(Date.now() / 86_400_000) * 86_400_000);
  const id = sha(`${scope}\0${subject}\0${start.toISOString()}`);
  await db.apiRateLimitCounter.upsert({ where: { id }, create: { id, scope, count: 50, windowStartedAt: start, expiresAt: new Date(start.getTime() + 86_400_000) }, update: { count: 50 } });
  const upload = (url: string) => request.post(url, { headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": randomUUID() }, multipart: { file: { name: "limit.png", mimeType: "image/png", buffer: png } } });
  for (const url of [`/api/connections/${connectionId}/chat-images`, "/api/v1/me/avatar"]) {
    const limited = await upload(url);
    expect(limited.status(), await limited.text()).toBe(429);
    expect(Number(limited.headers()["retry-after"])).toBeGreaterThan(0);
  }
});

test("public profile upload stays out of DB payloads, is idempotent, and account deletion recovers files", async ({ request }) => {
  const token = await login(request, 2);
  const key = randomUUID();
  const upload = (buffer = png, uploadKey = key) => request.post("/api/v1/me/avatar", {
    headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": uploadKey },
    multipart: { file: { name: "avatar.png", mimeType: "image/png", buffer } },
  });
  const result = await upload();
  expect(result.status(), await result.text()).toBe(201);
  const avatar = (await result.json()).data.avatar;
  expect(avatar.url).toContain(".public.blob.vercel-storage.com/avatars/custom/");
  expect(avatar.byteSize).toBe(png.byteLength);
  expect((await (await upload()).json()).data.avatar.url).toBe(avatar.url);
  expect((await upload(Buffer.alloc(2 * 1024 * 1024 + 1), randomUUID())).status()).toBe(422);
  expect((await upload(Buffer.from("not an image"), randomUUID())).status()).toBe(422);
  const stored = await db.user.findUniqueOrThrow({ where: { id: users[2].id }, select: { avatarUrl: true } });
  expect(stored.avatarUrl).toBe(avatar.url);
  const deleted = await request.delete("/api/v1/me", {
    headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": randomUUID() }, data: { confirmUsername: users[2].username },
  });
  expect(deleted.status(), await deleted.text()).toBe(200);
  expect(await db.user.findUnique({ where: { id: users[2].id } })).toBeNull();
  expect(await db.mediaDeletionJob.count({ where: { url: avatar.url } })).toBe(0);
});
