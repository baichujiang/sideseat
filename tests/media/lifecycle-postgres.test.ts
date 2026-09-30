import assert from "node:assert/strict";
import test from "node:test";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm, utimes } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const resolver = Module as typeof Module & { _resolveFilename: (request: string, ...args: unknown[]) => string };
const original = resolver._resolveFilename;
resolver._resolveFilename = function(request, ...args) {
  return request === "server-only" ? fileURLToPath(new URL("../v2/server-only-test-stub.cjs", import.meta.url)) : original.call(this, request, ...args);
};
const local = process.env.DATABASE_URL && ["127.0.0.1", "localhost"].includes(new URL(process.env.DATABASE_URL).hostname);
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=", "base64");

test("media lifecycle on real PostgreSQL and a local object store", { skip: !local }, async t => {
  const db = new PrismaClient();
  const root = await mkdtemp(path.join(os.tmpdir(), "sideseat-media-"));
  process.env.MEDIA_LOCAL_STORAGE = "1"; process.env.MEDIA_LOCAL_DIR = root;
  const { putStoredMedia, readStoredMedia } = await import("../../lib/media/storage");
  const { queueMediaDeletion, queueAccountMediaDeletion, processMediaDeletionJobs, sweepUnreferencedMedia } = await import("../../lib/media/lifecycle");
  const { eraseAccountRecords } = await import("../../lib/api/v1/account-service");
  const { migrateLegacyChatImages } = await import("../../lib/media/migrate-chat-images");
  const ids: string[] = [];
  async function user() {
    const created = await db.user.create({ data: { username: `media_${randomUUID()}`, hashedPassword: "test-only", school: "TUM", onboardingComplete: true } });
    ids.push(created.id); return created;
  }
  try {
    await t.test("account deletion removes all owned media and cascading chat media, while keeping the peer's profile", async () => {
      const [a, b] = await Promise.all([user(), user()]);
      const avatar = await putStoredMedia("public", `avatars/custom/${a.id}/avatar.jpg`, png, "image/jpeg");
      const peerAvatar = await putStoredMedia("public", `avatars/custom/${b.id}/avatar.jpg`, png, "image/jpeg");
      const photo = await putStoredMedia("public", `profile/life-photos/${a.id}/photo.png`, png, "image/png");
      const postImage = await putStoredMedia("public", `classmate-posts/${a.id}/post.png`, png, "image/png");
      const proof = await putStoredMedia("verification", `student-proofs/${a.id}/proof.pdf`, png, "application/pdf");
      await db.user.update({ where: { id: a.id }, data: { avatarUrl: avatar.url, manualReviewProofUrl: proof.url } });
      await db.user.update({ where: { id: b.id }, data: { avatarUrl: peerAvatar.url } });
      await db.userLifePhoto.create({ data: { userId: a.id, url: photo.url, sortOrder: 0 } });
      await db.userSchoolVerification.create({ data: { userId: a.id, school: "TUM", manualReviewProofUrl: proof.url } });
      await db.classmatePost.create({ data: { userId: a.id, city: "Munich", category: "OTHER", title: "QA", expiresAt: new Date(), images: { create: { url: postImage.url, sortOrder: 0 } } } });
      const connection = await db.connection.create({ data: { userAId: a.id, userBId: b.id } });
      const attachment = await putStoredMedia("chat", `chat/${connection.id}/${b.id}/photo.png`, png, "image/png");
      await db.message.create({ data: { connectionId: connection.id, senderId: b.id, type: "IMAGE", body: "", imageUrl: attachment.url } });
      await assert.rejects(db.$transaction(async tx => { await queueAccountMediaDeletion(tx, a.id); throw new Error("rollback"); }));
      assert.equal(await db.mediaDeletionJob.count({ where: { url: avatar.url } }), 0);
      await eraseAccountRecords(a.id);
      for (const url of [avatar.url, photo.url, postImage.url]) assert.equal(await readStoredMedia("public", url), null);
      assert.equal(await readStoredMedia("verification", proof.url), null);
      assert.equal(await readStoredMedia("chat", attachment.url), null);
      assert(await readStoredMedia("public", peerAvatar.url));
      assert.equal(await db.user.findUnique({ where: { id: a.id } }), null);
    });
    await t.test("failed object deletion stays queued, retries successfully, and referenced files survive", async () => {
      const a = await user();
      const file = await putStoredMedia("public", `avatars/custom/${a.id}/retry.png`, png, "image/png");
      await queueMediaDeletion(db, [file.url]);
      const savedToken = process.env.BLOB_READ_WRITE_TOKEN;
      process.env.MEDIA_LOCAL_STORAGE = "0"; delete process.env.BLOB_READ_WRITE_TOKEN;
      try { assert.equal((await processMediaDeletionJobs({ urls: [file.url] })).failed, 1); }
      finally { process.env.MEDIA_LOCAL_STORAGE = "1"; if (savedToken) process.env.BLOB_READ_WRITE_TOKEN = savedToken; }
      const job = await db.mediaDeletionJob.findUniqueOrThrow({ where: { url: file.url } });
      assert.equal(job.attempts, 1);
      assert(await readStoredMedia("public", file.url));
      assert.equal((await processMediaDeletionJobs({ urls: [file.url], now: new Date(Date.now() + 120_000) })).deleted, 1);
      assert.equal(await readStoredMedia("public", file.url), null);
      const kept = await putStoredMedia("public", `avatars/custom/${a.id}/kept.png`, png, "image/png");
      await db.user.update({ where: { id: a.id }, data: { avatarUrl: kept.url } });
      await queueMediaDeletion(db, [kept.url]);
      assert.equal((await processMediaDeletionJobs({ urls: [kept.url] })).retained, 1);
      assert(await readStoredMedia("public", kept.url));
    });
    await t.test("paged sweep reaches old orphans and preserves new uploads and expired-but-retained content", async () => {
      const a = await user();
      const orphan = await putStoredMedia("public", `classmate-posts/${a.id}/old.png`, png, "image/png");
      const fresh = await putStoredMedia("public", `classmate-posts/${a.id}/fresh.png`, png, "image/png");
      const expired = await putStoredMedia("public", `classmate-posts/${a.id}/history.png`, png, "image/png");
      await db.classmatePost.create({ data: { userId: a.id, city: "Munich", category: "OTHER", title: "History", expiresAt: new Date(0), images: { create: { url: expired.url, sortOrder: 0 } } } });
      for (const url of [orphan.url, expired.url]) await utimes(path.join(root, "public", new URL(url).pathname), new Date(0), new Date(0));
      await db.mediaSweepState.deleteMany();
      for (let i = 0; i < 12; i++) await sweepUnreferencedMedia({ batchSize: 1 });
      await processMediaDeletionJobs({ urls: [orphan.url, fresh.url, expired.url] });
      assert.equal(await readStoredMedia("public", orphan.url), null);
      assert(await readStoredMedia("public", fresh.url));
      assert(await readStoredMedia("public", expired.url));
    });
    await t.test("legacy migration dry-run is read-only; apply keeps bytes, removes old public copies and is repeatable", async () => {
      const [a, b] = await Promise.all([user(), user()]);
      const connection = await db.connection.create({ data: { userAId: a.id, userBId: b.id } });
      const old = await putStoredMedia("public", `chat/${connection.id}/legacy.png`, png, "image/png");
      const first = await db.message.create({ data: { connectionId: connection.id, senderId: a.id, type: "IMAGE", body: "", imageUrl: old.url } });
      const second = await db.message.create({ data: { connectionId: connection.id, senderId: b.id, type: "IMAGE", body: "", imageUrl: `data:image/png;base64,${png.toString("base64")}` } });
      assert((await migrateLegacyChatImages()).remainingBefore >= 2);
      assert.equal((await db.message.findUniqueOrThrow({ where: { id: first.id } })).imageUrl, old.url);
      const applied = await migrateLegacyChatImages({ apply: true });
      assert.equal(applied.failed, 0); assert(applied.migrated >= 2);
      for (const message of [first, second]) {
        const current = await db.message.findUniqueOrThrow({ where: { id: message.id } });
        assert(current.imageUrl?.includes(".private.blob."));
        const image = await readStoredMedia("chat", current.imageUrl!);
        assert(image); assert.deepEqual(Buffer.from(await new Response(image.stream).arrayBuffer()), png);
      }
      assert.equal(await readStoredMedia("public", old.url), null);
      assert.equal((await migrateLegacyChatImages({ apply: true })).migrated, 0);
    });
  } finally {
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.mediaDeletionJob.deleteMany({ where: { url: { contains: "https://local" } } });
    await db.mediaSweepState.deleteMany();
    await db.$disconnect();
    await rm(root, { recursive: true, force: true });
  }
});
