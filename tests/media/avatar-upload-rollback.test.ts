import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Execute the real route, image validator/upload and lifecycle reference checks.
// The VM only exposes explicitly substituted I/O: no real Prisma, fetch or Blob.
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=", "base64");
const oldURL = "https://qa-unit.public.blob.vercel-storage.com/avatars/custom/owner_test/old.png";
const unrelatedURL = "https://qa-unit.public.blob.vercel-storage.com/avatars/custom/unrelated/keep.png";
const digest = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
type Mode = "rollback" | "commit-uncertain" | "delete-fails" | "queue-fails" | "success" | "replay" | "provider-ambiguous" | "profile-read-fails";
type Job = { id: string; url: string; store: string; attempts: number; availableAt: Date; lastError: string | null };
type Snapshot = { avatar: string; jobs: Job[] };

function scenario(mode: Mode) {
  const state = {
    avatar: oldURL, jobs: [] as Job[], objects: new Set([oldURL, unrelatedURL]),
    put: [] as string[], deleted: [] as string[], outsideQueue: [] as string[][],
    scopedQueries: [] as string[][], logs: [] as unknown[][], completeCalls: 0,
    originalError: Object.assign(new Error("injected transaction outcome"), { name: "OriginalTransactionError" }),
    cleanupError: Object.assign(new Error("injected cleanup unavailable"), { name: "CleanupUnavailable" }),
  };

  function load<T>(path: string, imports: Record<string, unknown>): T {
    const url = new URL(`../../${path}`, import.meta.url);
    const compiled = ts.transpileModule(readFileSync(url, "utf8"), {
      fileName: path,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText;
    const loaded = { exports: {} };
    const context = vm.createContext({
      Buffer, Blob, File, FormData, Request, Response, URL, Date, Error, Set, Map,
      console: { error: (...args: unknown[]) => state.logs.push(args) },
    });
    const evaluate = vm.runInContext(`(function(require,module,exports){${compiled}\n})`, context, { filename: path });
    evaluate((name: string) => {
      assert.ok(Object.hasOwn(imports, name), `Unexpected test dependency: ${name}`);
      return imports[name];
    }, loaded, loaded.exports);
    return loaded.exports as T;
  }

  function database(transaction = false, snapshot: Snapshot = state) {
    return {
      apiIdempotencyRecord: { deleteMany: async () => ({ count: 0 }) },
      user: {
        findUnique: async () => {
          if (mode === "profile-read-fails") throw state.originalError;
          return { avatarUrl: snapshot.avatar };
        },
        update: async ({ data }: { data: { avatarUrl: string } }) => {
          assert.ok(transaction);
          snapshot.avatar = data.avatarUrl;
          return { id: "owner_test", avatarUrl: snapshot.avatar, lifePhotos: [] };
        },
        findMany: async ({ where }: { where: { avatarUrl?: { in: string[] } } }) =>
          where.avatarUrl?.in.includes(state.avatar) ? [{ avatarUrl: state.avatar }] : [],
      },
      block: { count: async () => 0 },
      userLifePhoto: { findMany: async () => [] },
      classmatePostImage: { findMany: async () => [] },
      message: { findMany: async () => [] },
      userSchoolVerification: { findMany: async () => [] },
      mediaDeletionJob: {
        createMany: async ({ data }: { data: { url: string; store: string }[] }) => {
          if (!transaction) {
            state.outsideQueue.push(Array.from(data, row => row.url));
            if (mode === "queue-fails") throw state.cleanupError;
          }
          for (const row of data) {
            if (!snapshot.jobs.some(job => job.url === row.url)) snapshot.jobs.push({
              id: `job-${row.url}`, url: row.url, store: row.store,
              attempts: 0, availableAt: new Date(), lastError: null,
            });
          }
          return { count: data.length };
        },
        findMany: async ({ where, take }: { where: { url?: { in: string[] }; availableAt: { lte: Date } }; take: number }) => {
          assert.equal(transaction, false);
          assert.ok(Array.isArray(where.url?.in) && where.url.in.length === 1, "Broad deletion processing is forbidden");
          const urls = [...where.url.in];
          state.scopedQueries.push(urls);
          assert.ok(urls.every(url => url === oldURL || state.put.includes(url)));
          return snapshot.jobs.filter(job => urls.includes(job.url) && job.availableAt <= where.availableAt.lte).slice(0, take);
        },
        deleteMany: async ({ where }: { where: { id: string } }) => {
          assert.equal(transaction, false);
          const before = state.jobs.length;
          state.jobs = state.jobs.filter(job => job.id !== where.id);
          return { count: before - state.jobs.length };
        },
        updateMany: async ({ where, data }: {
          where: { id: string };
          data: { attempts: { increment: number }; availableAt: Date; lastError: string };
        }) => {
          assert.equal(transaction, false);
          const job = state.jobs.find(job => job.id === where.id);
          assert.ok(job);
          job.attempts += data.attempts.increment;
          job.availableAt = data.availableAt;
          job.lastError = data.lastError;
          return { count: 1 };
        },
      },
    };
  }
  const db = {
    ...database(),
    async $transaction(operation: (tx: ReturnType<typeof database>) => Promise<unknown>) {
      const staged = { avatar: state.avatar, jobs: state.jobs.map(job => ({ ...job })) };
      const result = await operation(database(true, staged));
      state.avatar = staged.avatar;
      state.jobs = staged.jobs;
      if (mode === "commit-uncertain") throw state.originalError;
      return result;
    },
  };
  class MediaStorageUnavailableError extends Error {}
  class MediaUploadRateLimitError extends Error {}
  const storage = {
    mediaStoreConfigured: () => true,
    putStoredMedia: async (store: string, key: string, bytes: Buffer, contentType: string) => {
      assert.equal(store, "public");
      assert.ok(key.startsWith("avatars/custom/owner_test/"));
      assert.equal(contentType, "image/png");
      assert.equal(Buffer.compare(bytes, png), 0);
      const url = `https://qa-unit.public.blob.vercel-storage.com/${key}`;
      state.put.push(url);
      state.objects.add(url);
      if (mode === "provider-ambiguous") throw state.originalError;
      return { url };
    },
    deleteStoredMedia: async (store: string, url: string) => {
      assert.equal(store, "public");
      assert.ok(url === oldURL || state.put.includes(url));
      if (mode === "delete-fails") throw state.cleanupError;
      state.deleted.push(url);
      state.objects.delete(url);
    },
    listStoredMedia: () => { throw new Error("A test may not sweep/list unknown objects"); },
  };
  const lifecycle = load("lib/media/lifecycle.ts", {
    "server-only": {}, "@/lib/db/prisma": { prisma: db }, "@/lib/media/storage": storage,
  });
  const image = load("lib/media/native-image-upload.ts", {
    "server-only": {}, crypto, "@/lib/media/storage": storage,
    "@/lib/media/private-blob": { MediaStorageUnavailableError },
    "@/lib/media/upload-allowance": { consumeMediaUploadAllowance: async () => {} },
  });
  const avatars = load("lib/constants/avatars.ts", {});
  const replayBody = { avatar: { url: oldURL }, profile: { id: "owner_test", avatarUrl: oldURL } };
  const route = load<{ POST: (request: Request) => Promise<Response> }>("app/api/v1/me/avatar/route.ts", {
    "@/lib/media/upload-allowance": { MediaUploadRateLimitError },
    "@/lib/media/private-blob": { MediaStorageUnavailableError },
    "@/lib/media/lifecycle": lifecycle,
    "@prisma/client": { Prisma: {} },
    "@/lib/api/v1/auth": { requireV1User: async () => ({ ok: true, user: { id: "owner_test" } }) },
    "@/lib/api/v1/http": {
      v1Success: (data: unknown, options: { status: number; headers?: Record<string, string> }) => Response.json({ data }, options),
      v1Error: (_request: Request, options: { status: number }) => Response.json({ error: options }, { status: options.status }),
    },
    "@/lib/api/v1/idempotency": {
      readIdempotencyKey: (request: Request) => request.headers.get("Idempotency-Key"),
      hashIdempotencyRequest: (value: unknown) => digest(JSON.stringify(value)),
      claimIdempotency: async () => mode === "replay" ? { kind: "replay", status: 201, body: replayBody } : { kind: "owner" },
      completeIdempotency: async () => {
        state.completeCalls++;
        if (["rollback", "delete-fails", "queue-fails"].includes(mode)) throw state.originalError;
      },
    },
    "@/lib/api/v1/rate-limit": {
      consumeV1RateLimit: async () => ({ allowed: true }), rateLimitHeaders: () => ({}), rateLimitSubject: (value: string) => value,
    },
    "@/lib/api/v1/profile-service": {
      currentProfileDto: (profile: { id: string; avatarUrl: string }) => ({ id: profile.id, avatarUrl: profile.avatarUrl }),
    },
    "@/lib/constants/avatars": avatars, "@/lib/db/prisma": { prisma: db }, "@/lib/media/native-image-upload": image,
  });
  return {
    state, replayBody,
    async run() {
      const form = new FormData();
      form.append("file", new File([png], "owned.png", { type: "image/png" }));
      return route.POST(new Request("http://unit.invalid/api/v1/me/avatar", {
        method: "POST", headers: { "Idempotency-Key": "unit-owned-key" }, body: form,
      }));
    },
  };
}

function originalErrorRetained(state: ReturnType<typeof scenario>["state"]) {
  assert.ok(state.logs.some(args => args[0] === "POST /api/v1/me/avatar" && args[1] === state.originalError));
  assert.ok(state.objects.has(unrelatedURL), "Unrelated media must remain untouched");
}

test("post-put rollback durably queues and deletes only the unreferenced new avatar outside the transaction", async () => {
  const { state, run } = scenario("rollback");
  assert.equal((await run()).status, 500);
  assert.equal(state.avatar, oldURL);
  assert.equal(state.put.length, 1);
  const [newURL] = state.put;
  assert.deepEqual(state.outsideQueue, [[newURL]]);
  assert.deepEqual(state.scopedQueries, [[newURL]]);
  assert.deepEqual(state.deleted, [newURL]);
  assert.ok(!state.objects.has(newURL));
  assert.ok(state.objects.has(oldURL));
  assert.equal(state.jobs.length, 0);
  originalErrorRetained(state);
});

test("an uncertain committed result preserves the in-use new avatar through the real reference check", async () => {
  const { state, run } = scenario("commit-uncertain");
  assert.equal((await run()).status, 500);
  const [newURL] = state.put;
  assert.equal(state.avatar, newURL);
  assert.ok(state.objects.has(newURL));
  assert.deepEqual(state.outsideQueue, [[newURL]]);
  assert.deepEqual(state.scopedQueries, [[newURL]]);
  assert.deepEqual(state.deleted, []);
  assert.deepEqual(state.jobs.map(job => job.url), [oldURL]);
  originalErrorRetained(state);
});

test("provider deletion failure retains the durable retry job and original route failure", async () => {
  const { state, run } = scenario("delete-fails");
  assert.equal((await run()).status, 500);
  const [newURL] = state.put;
  assert.equal(state.avatar, oldURL);
  assert.ok(state.objects.has(newURL));
  assert.equal(state.jobs.length, 1);
  assert.equal(state.jobs[0].url, newURL);
  assert.equal(state.jobs[0].attempts, 1);
  assert.ok(state.jobs[0].availableAt > new Date());
  assert.equal(state.jobs[0].lastError, "CleanupUnavailable");
  assert.deepEqual(state.scopedQueries, [[newURL]]);
  originalErrorRetained(state);
});

test("a cleanup enqueue failure does not replace the primary error or bypass reference checks", async () => {
  const { state, run } = scenario("queue-fails");
  assert.equal((await run()).status, 500);
  assert.deepEqual(state.outsideQueue, [[state.put[0]]]);
  assert.deepEqual(state.scopedQueries, []);
  assert.deepEqual(state.deleted, []);
  assert.equal(state.avatar, oldURL);
  originalErrorRetained(state);
});

test("successful201 keeps the new avatar and cleans only the old avatar", async () => {
  const { state, run } = scenario("success");
  const response = await run();
  assert.equal(response.status, 201);
  const body = await response.json(), [newURL] = state.put;
  assert.equal(body.data.avatar.url, newURL);
  assert.equal(body.data.profile.avatarUrl, newURL);
  assert.equal(state.avatar, newURL);
  assert.deepEqual(state.outsideQueue, []);
  assert.deepEqual(state.deleted, [oldURL]);
  assert.ok(state.objects.has(newURL));
  assert.ok(state.objects.has(unrelatedURL));
  assert.equal(state.completeCalls, 1);
  assert.equal(state.logs.length, 0);
});

test("idempotency replay returns the prior201 without uploading or queuing anything", async () => {
  const { state, run, replayBody } = scenario("replay");
  const response = await run();
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("Idempotency-Replayed"), "true");
  assert.deepEqual((await response.json()).data, replayBody);
  assert.deepEqual(state.put, []);
  assert.deepEqual(state.outsideQueue, []);
  assert.deepEqual(state.deleted, []);
  assert.equal(state.avatar, oldURL);
  assert.equal(state.completeCalls, 0);
});

test("a failed old-profile read cannot leave a concurrently started upload untracked", async () => {
  const { state, run } = scenario("profile-read-fails");
  assert.equal((await run()).status, 500);
  assert.deepEqual(state.put, []);
  assert.deepEqual(state.outsideQueue, []);
  assert.deepEqual(state.deleted, []);
  assert.equal(state.avatar, oldURL);
  originalErrorRetained(state);
});

test("a provider write that never returns its URL remains an explicit compensation limit", async () => {
  const { state, run } = scenario("provider-ambiguous");
  assert.equal((await run()).status, 500);
  assert.equal(state.put.length, 1);
  assert.ok(state.objects.has(state.put[0]));
  assert.deepEqual(state.outsideQueue, []);
  assert.deepEqual(state.deleted, []);
  assert.equal(state.avatar, oldURL);
  originalErrorRetained(state);
});
