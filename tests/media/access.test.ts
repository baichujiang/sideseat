import assert from "node:assert/strict";
import test from "node:test";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { isAllowedChatImageUrl } from "../../lib/constants/chat-media";

const resolver = Module as typeof Module & { _resolveFilename: (request: string, ...args: unknown[]) => string };
const original = resolver._resolveFilename;
resolver._resolveFilename = function(request, ...args) {
  return request === "server-only" ? fileURLToPath(new URL("../v2/server-only-test-stub.cjs", import.meta.url)) : original.call(this, request, ...args);
};

test("media grant expires and is bound to the viewer, message and connection", async () => {
  const { chatImageReadUrl, verifyChatImageGrant } = await import("../../lib/media/chat-image-access");
  const now = Date.now();
  const url = new URL(chatImageReadUrl("connection", "message", "viewer", now));
  assert.equal(verifyChatImageGrant(url, "connection", "message", now), "viewer");
  assert.equal(verifyChatImageGrant(url, "connection", "message", now + 3_600_000), null);
  assert.equal(verifyChatImageGrant(url, "other", "message", now), null);
  assert.equal(verifyChatImageGrant(url, "connection", "other", now), null);
  url.searchParams.set("viewer", "outsider");
  assert.equal(verifyChatImageGrant(url, "connection", "message", now), null);
});

test("new chat attachments must be private, connection-scoped and sender-owned", () => {
  const pointer = `https://store.private.blob.vercel-storage.com/chat/c1/u1/${"a".repeat(36)}.jpg`;
  assert(isAllowedChatImageUrl("c1", pointer, "u1"));
  assert(!isAllowedChatImageUrl("c2", pointer, "u1"));
  assert(!isAllowedChatImageUrl("c1", pointer, "u2"));
  assert(!isAllowedChatImageUrl("c1", pointer.replace(".private.", ".public."), "u1"));
  assert(!isAllowedChatImageUrl("c1", "data:image/jpeg;base64,AA==", "u1"));
});

test("missing Blob configuration never falls back to storing image bytes in PostgreSQL", async () => {
  const { uploadNativeImage } = await import("../../lib/media/native-image-upload");
  const { MediaStorageUnavailableError } = await import("../../lib/media/private-blob");
  const { isAllowedClassmatePostImageUrl } = await import("../../lib/constants/classmate-post-media");
  const saved = { token: process.env.BLOB_READ_WRITE_TOKEN, local: process.env.MEDIA_LOCAL_STORAGE };
  delete process.env.BLOB_READ_WRITE_TOKEN; delete process.env.MEDIA_LOCAL_STORAGE;
  try {
    await assert.rejects(uploadNativeImage({ userId: "user", image: { bytes: Buffer.from("test"), contentType: "image/png", width: 1, height: 1 }, blobPrefix: "classmate-posts/user/", logScope: "test" }), MediaStorageUnavailableError);
    assert.equal(isAllowedClassmatePostImageUrl("user", "data:image/png;base64,AA=="), false);
  } finally {
    if (saved.token === undefined) delete process.env.BLOB_READ_WRITE_TOKEN; else process.env.BLOB_READ_WRITE_TOKEN = saved.token;
    if (saved.local === undefined) delete process.env.MEDIA_LOCAL_STORAGE; else process.env.MEDIA_LOCAL_STORAGE = saved.local;
  }
});
