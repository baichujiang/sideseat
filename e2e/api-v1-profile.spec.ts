import { expect, test, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { assertLocalTestDatabase } from "./helpers/local-test-database";

assertLocalTestDatabase();
const prisma = new PrismaClient();
const E2E_USER = process.env.E2E_USER ?? "test_001";
const E2E_PEER = process.env.E2E_PEER ?? "test_002";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "Password123";
const PROFILE_TEST_IP = `192.0.2.${(process.pid % 100) + 100}`;
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

async function accessToken(request: APIRequestContext, identifier = E2E_USER) {
  const response = await request.post("/api/v1/auth/login", {
    headers: { "x-forwarded-for": PROFILE_TEST_IP },
    data: {
      identifier,
      password: E2E_PASSWORD,
      device: {
        id: "playwright-ios-profile-device",
        name: "Playwright Profile iPhone",
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
  const users = await prisma.user.findMany({
    where: { username: { in: [E2E_USER, E2E_PEER] } },
    select: { id: true },
  });
  await prisma.block.deleteMany({
    where: {
      blockerId: { in: users.map((user) => user.id) },
      blockedId: { in: users.map((user) => user.id) },
      reason: "api-v1-profile-test",
    },
  });
  await prisma.apiIdempotencyRecord.deleteMany({
    where: {
      scope: { startsWith: "native-profile-" },
    },
  });
  await prisma.apiIdempotencyRecord.deleteMany({
    where: {
      scope: { startsWith: "native-me-blocks-delete:" },
    },
  });
  await prisma.apiIdempotencyRecord.deleteMany({
    where: {
      scope: "native-product-tutorial-dismiss",
    },
  });
  await prisma.apiIdempotencyRecord.deleteMany({
    where: {
      scope: "native-connection-open",
    },
  });
  await prisma.$disconnect();
});

test.describe.serial("API v1 Profile", () => {
  test("returns the current profile DTO without leaking private server fields", async ({
    request,
  }) => {
    expect((await request.get("/api/v1/me")).status()).toBe(401);
    const token = await accessToken(request);
    const response = await request.get("/api/v1/me", {
      headers: { ...auth(token), "Accept-Language": "zh-CN" },
    });
    expect(response.status()).toBe(200);
    const payload = await response.json();
    expect(payload.data).toEqual(
      expect.objectContaining({
        username: E2E_USER,
        locale: "zh-CN",
        displayName: expect.any(String),
        schoolSummary: expect.objectContaining({
          schoolShort: expect.any(String),
          degreeLabel: expect.any(String),
        }),
        lifePhotos: expect.any(Array),
        contacts: expect.objectContaining({
          wechatHandle: null,
          whatsappHandle: null,
          telegramHandle: null,
          instagramHandle: null,
        }),
        privacy: expect.objectContaining({
          hideFromDiscovery: expect.any(Boolean),
          hideFromCourseMembers: expect.any(Boolean),
          contactInfoOptIn: expect.any(Boolean),
        }),
        counts: expect.objectContaining({ blocked: expect.any(Number) }),
      }),
    );
    expect(payload.data).toHaveProperty("productTutorialDismissedAt");
    expect(
      payload.data.productTutorialDismissedAt === null ||
        typeof payload.data.productTutorialDismissedAt === "string",
    ).toBe(true);
    expect(Object.keys(payload.data.contacts).sort()).toEqual([
      "instagramHandle",
      "telegramHandle",
      "wechatHandle",
      "whatsappHandle",
    ]);
    expect(payload.data).not.toHaveProperty("hashedPassword");
    expect(payload.data).not.toHaveProperty("languages");
    expect(payload.data).not.toHaveProperty("sessions");
  });

  test("returns a permission-filtered public profile and hides blocked peers", async ({
    request,
  }) => {
    const token = await accessToken(request);
    const [viewer, peer] = await Promise.all([
      prisma.user.findUnique({ where: { username: E2E_USER }, select: { id: true } }),
      prisma.user.findUnique({ where: { username: E2E_PEER }, select: { id: true } }),
    ]);
    if (!viewer || !peer) throw new Error("Seeded profile users are missing.");

    const invalid = await request.get("/api/v1/users/not-a-cuid/profile", {
      headers: auth(token),
    });
    expect(invalid.status()).toBe(422);

    const self = await request.get(`/api/v1/users/${viewer.id}/profile`, {
      headers: auth(token),
    });
    expect(self.status()).toBe(404);

    const response = await request.get(`/api/v1/users/${peer.id}/profile`, {
      headers: auth(token),
    });
    expect(response.status()).toBe(200);
    const payload = await response.json();
    expect(payload.data).toEqual(
      expect.objectContaining({
        mode: "connection",
        connectionId: expect.any(String),
        viewerCanMessage: true,
        profile: expect.objectContaining({
          id: peer.id,
          username: E2E_PEER,
          displayName: expect.any(String),
          schoolSummary: expect.any(Object),
          lifePhotos: expect.any(Array),
        }),
        sharedCourses: expect.any(Array),
        peerCourses: expect.any(Array),
      }),
    );
    expect(payload.data.profile).not.toHaveProperty("email");
    expect(payload.data.profile).not.toHaveProperty("languages");
    expect(payload.data.profile).not.toHaveProperty("phone");
    expect(payload.data.profile).not.toHaveProperty("hashedPassword");

    await prisma.block.create({
      data: {
        blockerId: viewer.id,
        blockedId: peer.id,
        reason: "api-v1-profile-test",
      },
    });
    try {
      const blocked = await request.get(`/api/v1/users/${peer.id}/profile`, {
        headers: auth(token),
      });
      expect(blocked.status()).toBe(404);
    } finally {
      await prisma.block.deleteMany({
        where: {
          blockerId: viewer.id,
          blockedId: peer.id,
          reason: "api-v1-profile-test",
        },
      });
    }
  });

  test("opens an existing direct conversation for a public profile peer idempotently", async ({
    request,
  }) => {
    const token = await accessToken(request);
    const peer = await prisma.user.findUnique({
      where: { username: E2E_PEER },
      select: { id: true },
    });
    if (!peer) throw new Error("Seeded profile peer is missing.");

    const missingKey = await request.post("/api/v1/connections/open", {
      headers: auth(token),
      data: { peerId: peer.id },
    });
    expect(missingKey.status()).toBe(422);

    const invalid = await request.post("/api/v1/connections/open", {
      headers: { ...auth(token), "Idempotency-Key": `open-invalid-${Date.now()}` },
      data: { peerId: "not-a-cuid" },
    });
    expect(invalid.status()).toBe(422);

    const key = `open-existing-${Date.now()}-${process.pid}`;
    const response = await request.post("/api/v1/connections/open", {
      headers: { ...auth(token), "Idempotency-Key": key },
      data: { peerId: peer.id },
    });
    expect(response.status()).toBe(200);
    const payload = await response.json();
    expect(payload.data).toEqual(
      expect.objectContaining({
        connectionId: expect.any(String),
        created: false,
        peerId: peer.id,
      }),
    );

    const replay = await request.post("/api/v1/connections/open", {
      headers: { ...auth(token), "Idempotency-Key": key },
      data: { peerId: peer.id },
    });
    expect(replay.status()).toBe(200);
    expect(replay.headers()["idempotency-replayed"]).toBe("true");
    expect((await replay.json()).data.connectionId).toBe(payload.data.connectionId);

    const conflict = await request.post("/api/v1/connections/open", {
      headers: { ...auth(token), "Idempotency-Key": key },
      data: { peerId: peer.id, courseId: "cmconflictcourse00000000001" },
    });
    expect(conflict.status()).toBe(409);

    const selfKey = `open-self-${Date.now()}-${process.pid}`;
    const viewer = await prisma.user.findUnique({
      where: { username: E2E_USER },
      select: { id: true },
    });
    if (!viewer) throw new Error("Seeded profile user is missing.");
    const selfNotes = await request.post("/api/v1/connections/open", {
      headers: { ...auth(token), "Idempotency-Key": selfKey },
      data: { peerId: viewer.id },
    });
    expect([200, 201]).toContain(selfNotes.status());
    const selfPayload = await selfNotes.json();
    expect(selfPayload.data).toEqual(
      expect.objectContaining({
        connectionId: expect.any(String),
        peerId: viewer.id,
      }),
    );
  });

  test("updates current profile fields idempotently and returns the refreshed DTO", async ({
    request,
  }) => {
    const token = await accessToken(request);
    const original = await prisma.user.findUnique({
      where: { username: E2E_USER },
    });
    if (!original) throw new Error("Seeded profile user is missing.");

    const update = {
      nickname: `Native Profile ${process.pid}`,
      bio: "Native profile edit test",
      gender: "PRIVATE",
      // The native editor submits the selected school with every save. An
      // unchanged school must not clear an existing verification identity.
      school: original.school ?? "TUM",
      major: "Informatics",
      semester: 4,
      wechatHandle: `wx_native_${process.pid}`,
      whatsappHandle: `+49151${String(process.pid).slice(-8).padStart(8, "0")}`,
      telegramHandle: `@tg_native_${process.pid}`,
      instagramHandle: `ig_native_${process.pid}`,
      contactInfoOptIn: true,
      hideFromDiscovery: !original.hideFromDiscovery,
      hideFromCourseMembers: !original.hideFromCourseMembers,
    };

    try {
      const missingKey = await request.patch("/api/v1/me/profile", {
        headers: auth(token),
        data: update,
      });
      expect(missingKey.status()).toBe(422);

      const key = `profile-${Date.now()}-${process.pid}`;
      const response = await request.patch("/api/v1/me/profile", {
        headers: { ...auth(token), "Idempotency-Key": key },
        data: update,
      });
      expect(response.status()).toBe(200);
      const payload = await response.json();
      expect(payload.data).toEqual(
        expect.objectContaining({
          username: E2E_USER,
          nickname: update.nickname,
          displayName: update.nickname,
          tagline: update.bio,
          gender: update.gender,
          school: update.school,
          verifiedStudent: original.verifiedStudent,
          studentVerificationStatus: original.studentVerificationStatus,
          major: update.major,
          semester: update.semester,
          contacts: {
            wechatHandle: update.wechatHandle,
            whatsappHandle: update.whatsappHandle,
            telegramHandle: update.telegramHandle,
            instagramHandle: update.instagramHandle,
          },
          privacy: expect.objectContaining({
            hideFromDiscovery: update.hideFromDiscovery,
            hideFromCourseMembers: update.hideFromCourseMembers,
            contactInfoOptIn: update.contactInfoOptIn,
          }),
        }),
      );
      expect(payload.data).not.toHaveProperty("hashedPassword");
      expect(payload.data).not.toHaveProperty("schoolChange");

      const replay = await request.patch("/api/v1/me/profile", {
        headers: { ...auth(token), "Idempotency-Key": key },
        data: update,
      });
      expect(replay.status()).toBe(200);
      expect(replay.headers()["idempotency-replayed"]).toBe("true");

      const conflict = await request.patch("/api/v1/me/profile", {
        headers: { ...auth(token), "Idempotency-Key": key },
        data: { ...update, bio: "A different body for the same key" },
      });
      expect(conflict.status()).toBe(409);

      const current = await request.get("/api/v1/me", { headers: auth(token) });
      expect(current.status()).toBe(200);
      const currentPayload = await current.json();
      expect(currentPayload.data.nickname).toBe(update.nickname);
      expect(currentPayload.data.privacy.hideFromDiscovery).toBe(update.hideFromDiscovery);
    } finally {
      await prisma.user.update({
        where: { id: original.id },
        data: {
          nickname: original.nickname,
          nicknameKey: original.nicknameKey,
          gender: original.gender,
          school: original.school,
          verifiedStudent: original.verifiedStudent,
          studentVerificationStatus: original.studentVerificationStatus,
          studentVerificationMethod: original.studentVerificationMethod,
          studentVerifiedAt: original.studentVerifiedAt,
          emailVerifiedAt: original.emailVerifiedAt,
          studentVerificationNotes: original.studentVerificationNotes,
          manualReviewProofUrl: original.manualReviewProofUrl,
          manualReviewProofFilename: original.manualReviewProofFilename,
          manualReviewRequestedAt: original.manualReviewRequestedAt,
          major: original.major,
          semester: original.semester,
          bio: original.bio,
          wechatHandle: original.wechatHandle,
          whatsappHandle: original.whatsappHandle,
          telegramHandle: original.telegramHandle,
          instagramHandle: original.instagramHandle,
          contactInfoOptIn: original.contactInfoOptIn,
          hideFromDiscovery: original.hideFromDiscovery,
          hideFromCourseMembers: original.hideFromCourseMembers,
        },
      });
    }
  });

  test("updates the login username with a three-per-week limit, uniqueness and idempotency", async ({
    request,
  }) => {
    const token = await accessToken(request);
    const original = await prisma.user.findUnique({
      where: { username: E2E_USER },
      select: {
        id: true,
        username: true,
        usernameUpdatedAt: true,
        usernameChangeWindowStartedAt: true,
        usernameChangeCount: true,
      },
    });
    if (!original) throw new Error("Seeded profile user is missing.");

    const nextUsername = `native_${process.pid}_${Date.now()}`.slice(0, 32);
    const secondUsername = `second_${process.pid}_${Date.now()}`.slice(0, 32);
    const thirdUsername = `third_${process.pid}_${Date.now()}`.slice(0, 32);
    const limitedUsername = `limit_${process.pid}_${Date.now()}`.slice(0, 32);

    try {
      await prisma.user.update({
        where: { id: original.id },
        data: {
          usernameUpdatedAt: null,
          usernameChangeWindowStartedAt: null,
          usernameChangeCount: 0,
        },
      });

      const missingKey = await request.patch("/api/v1/me/username", {
        headers: auth(token),
        data: { username: nextUsername },
      });
      expect(missingKey.status()).toBe(422);

      const invalid = await request.patch("/api/v1/me/username", {
        headers: { ...auth(token), "Idempotency-Key": `username-invalid-${Date.now()}` },
        data: { username: "guest_reserved" },
      });
      expect(invalid.status()).toBe(422);

      const taken = await request.patch("/api/v1/me/username", {
        headers: { ...auth(token), "Idempotency-Key": `username-taken-${Date.now()}` },
        data: { username: E2E_PEER },
      });
      expect(taken.status()).toBe(409);
      const takenPayload = await taken.json();
      expect(takenPayload.error.code).toBe("USERNAME_TAKEN");

      const key = `username-${Date.now()}-${process.pid}`;
      const response = await request.patch("/api/v1/me/username", {
        headers: { ...auth(token), "Idempotency-Key": key },
        data: { username: nextUsername.toUpperCase() },
      });
      expect(response.status()).toBe(200);
      const payload = await response.json();
      expect(payload.data).toEqual(
        expect.objectContaining({
          id: original.id,
          username: nextUsername,
          usernameUpdatedAt: expect.any(String),
          usernameChangePolicy: expect.objectContaining({
            limit: 3,
            windowDays: 7,
            changesUsed: 1,
            changesRemaining: 2,
            nextAllowedAt: null,
          }),
        }),
      );

      const replay = await request.patch("/api/v1/me/username", {
        headers: { ...auth(token), "Idempotency-Key": key },
        data: { username: nextUsername.toUpperCase() },
      });
      expect(replay.status()).toBe(200);
      expect(replay.headers()["idempotency-replayed"]).toBe("true");

      const conflict = await request.patch("/api/v1/me/username", {
        headers: { ...auth(token), "Idempotency-Key": key },
        data: { username: secondUsername },
      });
      expect(conflict.status()).toBe(409);

      const current = await request.get("/api/v1/me", { headers: auth(token) });
      expect(current.status()).toBe(200);
      const currentPayload = await current.json();
      expect(currentPayload.data.username).toBe(nextUsername);

      const second = await request.patch("/api/v1/me/username", {
        headers: { ...auth(token), "Idempotency-Key": `username-second-${Date.now()}` },
        data: { username: secondUsername },
      });
      expect(second.status()).toBe(200);
      expect((await second.json()).data.usernameChangePolicy.changesRemaining).toBe(1);

      const third = await request.patch("/api/v1/me/username", {
        headers: { ...auth(token), "Idempotency-Key": `username-third-${Date.now()}` },
        data: { username: thirdUsername },
      });
      expect(third.status()).toBe(200);
      expect((await third.json()).data.usernameChangePolicy).toEqual(
        expect.objectContaining({
          changesUsed: 3,
          changesRemaining: 0,
          nextAllowedAt: expect.any(String),
        }),
      );

      const limited = await request.patch("/api/v1/me/username", {
        headers: { ...auth(token), "Idempotency-Key": `username-limited-${Date.now()}` },
        data: { username: limitedUsername },
      });
      expect(limited.status()).toBe(429);
      expect(limited.headers()["x-username-next-allowed-at"]).toEqual(expect.any(String));
      const limitedPayload = await limited.json();
      expect(limitedPayload.error.code).toBe("USERNAME_CHANGE_COOLDOWN");
      expect(limitedPayload.error.field).toBe("username");
    } finally {
      await prisma.user.update({
        where: { id: original.id },
        data: {
          username: original.username,
          usernameUpdatedAt: original.usernameUpdatedAt,
          usernameChangeWindowStartedAt: original.usernameChangeWindowStartedAt,
          usernameChangeCount: original.usernameChangeCount,
        },
      });
    }
  });

  test("uploads the current profile avatar idempotently and returns the refreshed DTO", async ({
    request,
  }) => {
    const token = await accessToken(request);
    const original = await prisma.user.findUnique({
      where: { username: E2E_USER },
      select: { id: true, avatarUrl: true },
    });
    if (!original) throw new Error("Seeded profile user is missing.");
    const nonce = `${Date.now()}-${process.pid}`;

    try {
      const missingKey = await request.post("/api/v1/me/avatar", {
        headers: auth(token),
        multipart: {
          file: {
            name: "avatar.png",
            mimeType: "image/png",
            buffer: ONE_PIXEL_PNG,
          },
        },
      });
      expect(missingKey.status()).toBe(422);

      const invalid = await request.post("/api/v1/me/avatar", {
        headers: auth(token, `profile-avatar-invalid-${nonce}`),
        multipart: {
          file: {
            name: "avatar.png",
            mimeType: "image/png",
            buffer: Buffer.from("not a png"),
          },
        },
      });
      expect(invalid.status()).toBe(422);

      const key = `profile-avatar-${nonce}`;
      const uploaded = await request.post("/api/v1/me/avatar", {
        headers: auth(token, key),
        multipart: {
          file: {
            name: "avatar.png",
            mimeType: "image/png",
            buffer: ONE_PIXEL_PNG,
          },
        },
      });
      expect(uploaded.status()).toBe(201);
      const payload = (await uploaded.json()).data as {
        avatar: {
          url: string;
          contentType: string;
          width: number;
          height: number;
          byteSize: number;
        };
        profile: {
          username: string;
          avatarUrl: string | null;
          displayName: string;
        };
      };
      expect(payload.avatar).toEqual(
        expect.objectContaining({
          contentType: "image/png",
          width: 1,
          height: 1,
          byteSize: ONE_PIXEL_PNG.byteLength,
        }),
      );
      expect(payload.profile).toEqual(
        expect.objectContaining({
          username: E2E_USER,
          avatarUrl: payload.avatar.url,
          displayName: expect.any(String),
        }),
      );
      expect(payload.profile).not.toHaveProperty("hashedPassword");

      const replay = await request.post("/api/v1/me/avatar", {
        headers: auth(token, key),
        multipart: {
          file: {
            name: "avatar.png",
            mimeType: "image/png",
            buffer: ONE_PIXEL_PNG,
          },
        },
      });
      expect(replay.status()).toBe(201);
      expect(replay.headers()["idempotency-replayed"]).toBe("true");
      expect((await replay.json()).data.avatar.url).toBe(payload.avatar.url);

      const current = await request.get("/api/v1/me", { headers: auth(token) });
      expect(current.status()).toBe(200);
      expect((await current.json()).data.avatarUrl).toBe(payload.avatar.url);
    } finally {
      await prisma.user.update({
        where: { id: original.id },
        data: { avatarUrl: original.avatarUrl },
      });
    }
  });

  test("manages current profile life photos with idempotent upload, reorder and delete", async ({
    request,
  }) => {
    const token = await accessToken(request);
    const original = await prisma.user.findUnique({
      where: { username: E2E_USER },
      select: {
        id: true,
        lifePhotos: {
          orderBy: { sortOrder: "asc" },
          select: { id: true, url: true, sortOrder: true, createdAt: true },
        },
      },
    });
    if (!original) throw new Error("Seeded profile user is missing.");
    const nonce = `${Date.now()}-${process.pid}`;

    try {
      await prisma.userLifePhoto.deleteMany({ where: { userId: original.id } });

      const missingKey = await request.post("/api/v1/me/life-photos", {
        headers: auth(token),
        multipart: {
          file: {
            name: "life.png",
            mimeType: "image/png",
            buffer: ONE_PIXEL_PNG,
          },
        },
      });
      expect(missingKey.status()).toBe(422);

      const firstUpload = await request.post("/api/v1/me/life-photos", {
        headers: auth(token, `profile-life-upload-a-${nonce}`),
        multipart: {
          file: {
            name: "life-a.png",
            mimeType: "image/png",
            buffer: ONE_PIXEL_PNG,
          },
        },
      });
      expect(firstUpload.status()).toBe(201);
      const firstPayload = (await firstUpload.json()).data as {
        photo: { id: string; url: string; sortOrder: number };
        upload: { contentType: string; width: number; height: number; byteSize: number };
        profile: { lifePhotos: Array<{ id: string; sortOrder: number }> };
      };
      expect(firstPayload.photo.sortOrder).toBe(0);
      expect(firstPayload.upload).toEqual(
        expect.objectContaining({
          contentType: "image/png",
          width: 1,
          height: 1,
          byteSize: ONE_PIXEL_PNG.byteLength,
        }),
      );
      expect(firstPayload.profile.lifePhotos.map((photo) => photo.id)).toEqual([
        firstPayload.photo.id,
      ]);

      const secondKey = `profile-life-upload-b-${nonce}`;
      const secondUpload = await request.post("/api/v1/me/life-photos", {
        headers: auth(token, secondKey),
        multipart: {
          file: {
            name: "life-b.png",
            mimeType: "image/png",
            buffer: ONE_PIXEL_PNG,
          },
        },
      });
      expect(secondUpload.status()).toBe(201);
      const secondPayload = (await secondUpload.json()).data as {
        photo: { id: string; sortOrder: number };
        profile: { lifePhotos: Array<{ id: string; sortOrder: number }> };
      };
      expect(secondPayload.photo.sortOrder).toBe(1);
      expect(secondPayload.profile.lifePhotos.map((photo) => photo.id)).toEqual([
        firstPayload.photo.id,
        secondPayload.photo.id,
      ]);

      const secondReplay = await request.post("/api/v1/me/life-photos", {
        headers: auth(token, secondKey),
        multipart: {
          file: {
            name: "life-b.png",
            mimeType: "image/png",
            buffer: ONE_PIXEL_PNG,
          },
        },
      });
      expect(secondReplay.status()).toBe(201);
      expect(secondReplay.headers()["idempotency-replayed"]).toBe("true");
      expect((await secondReplay.json()).data.photo.id).toBe(secondPayload.photo.id);

      const invalidOrder = await request.patch("/api/v1/me/life-photos", {
        headers: auth(token, `profile-life-reorder-invalid-${nonce}`),
        data: { photoIds: [secondPayload.photo.id] },
      });
      expect(invalidOrder.status()).toBe(422);

      const reorderKey = `profile-life-reorder-${nonce}`;
      const reordered = await request.patch("/api/v1/me/life-photos", {
        headers: auth(token, reorderKey),
        data: { photoIds: [secondPayload.photo.id, firstPayload.photo.id] },
      });
      expect(reordered.status()).toBe(200);
      const reorderedPhotos = ((await reordered.json()).data as {
        photos: Array<{ id: string; sortOrder: number }>;
      }).photos;
      expect(reorderedPhotos).toEqual([
        expect.objectContaining({ id: secondPayload.photo.id, sortOrder: 0 }),
        expect.objectContaining({ id: firstPayload.photo.id, sortOrder: 1 }),
      ]);

      const reorderReplay = await request.patch("/api/v1/me/life-photos", {
        headers: auth(token, reorderKey),
        data: { photoIds: [secondPayload.photo.id, firstPayload.photo.id] },
      });
      expect(reorderReplay.status()).toBe(200);
      expect(reorderReplay.headers()["idempotency-replayed"]).toBe("true");

      const deleteKey = `profile-life-delete-${nonce}`;
      const deleted = await request.delete(
        `/api/v1/me/life-photos/${secondPayload.photo.id}`,
        {
          headers: auth(token, deleteKey),
        },
      );
      expect(deleted.status()).toBe(200);
      const deletePayload = (await deleted.json()).data as {
        deletedPhotoId: string;
        profile: { lifePhotos: Array<{ id: string; sortOrder: number }> };
      };
      expect(deletePayload.deletedPhotoId).toBe(secondPayload.photo.id);
      expect(deletePayload.profile.lifePhotos).toEqual([
        expect.objectContaining({ id: firstPayload.photo.id, sortOrder: 0 }),
      ]);

      const deleteReplay = await request.delete(
        `/api/v1/me/life-photos/${secondPayload.photo.id}`,
        {
          headers: auth(token, deleteKey),
        },
      );
      expect(deleteReplay.status()).toBe(200);
      expect(deleteReplay.headers()["idempotency-replayed"]).toBe("true");

      const current = await request.get("/api/v1/me", { headers: auth(token) });
      expect(current.status()).toBe(200);
      expect((await current.json()).data.lifePhotos).toEqual([
        expect.objectContaining({ id: firstPayload.photo.id, sortOrder: 0 }),
      ]);
    } finally {
      await prisma.userLifePhoto.deleteMany({ where: { userId: original.id } });
      if (original.lifePhotos.length > 0) {
        await prisma.userLifePhoto.createMany({
          data: original.lifePhotos.map((photo) => ({
            id: photo.id,
            userId: original.id,
            url: photo.url,
            sortOrder: photo.sortOrder,
            createdAt: photo.createdAt,
          })),
        });
      }
    }
  });

  test("lists blocked users and unblocks with idempotency", async ({ request }) => {
    const token = await accessToken(request);
    const [actor, peer] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { username: E2E_USER }, select: { id: true } }),
      prisma.user.findUniqueOrThrow({ where: { username: E2E_PEER }, select: { id: true } }),
    ]);

    await prisma.block.deleteMany({
      where: { blockerId: actor.id, blockedId: peer.id },
    });
    await prisma.block.create({
      data: {
        blockerId: actor.id,
        blockedId: peer.id,
        reason: "api-v1-profile-test",
      },
    });

    expect((await request.get("/api/v1/me/blocks")).status()).toBe(401);

    const listed = await request.get("/api/v1/me/blocks", { headers: auth(token) });
    expect(listed.status()).toBe(200);
    const listPayload = (await listed.json()).data as {
      blocks: Array<{ blockedId: string; username: string }>;
    };
    expect(listPayload.blocks.some((row) => row.blockedId === peer.id)).toBe(true);

    const key = `unblock-${Date.now()}`;
    const first = await request.delete(`/api/v1/me/blocks/${peer.id}`, {
      headers: auth(token, key),
    });
    expect(first.status()).toBe(200);
    expect((await first.json()).data).toEqual({
      unblocked: true,
      blockedId: peer.id,
    });

    const replay = await request.delete(`/api/v1/me/blocks/${peer.id}`, {
      headers: auth(token, key),
    });
    expect(replay.status()).toBe(200);
    expect(replay.headers()["idempotency-replayed"]).toBe("true");

    const after = await request.get("/api/v1/me/blocks", { headers: auth(token) });
    expect(after.status()).toBe(200);
    expect(
      ((await after.json()).data.blocks as Array<{ blockedId: string }>).some(
        (row) => row.blockedId === peer.id,
      ),
    ).toBe(false);
  });

  test("dismisses the product tutorial with idempotency", async ({ request }) => {
    const token = await accessToken(request);
    const actor = await prisma.user.findUniqueOrThrow({
      where: { username: E2E_USER },
      select: { id: true, productTutorialDismissedAt: true },
    });
    await prisma.user.update({
      where: { id: actor.id },
      data: { productTutorialDismissedAt: null },
    });

    const key = `tutorial-dismiss-${Date.now()}`;
    const first = await request.post("/api/v1/me/product-tutorial/dismiss", {
      headers: auth(token, key),
    });
    expect(first.status()).toBe(200);
    const payload = (await first.json()).data as {
      saved: boolean;
      productTutorialDismissedAt: string | null;
    };
    expect(payload.saved).toBe(true);
    expect(payload.productTutorialDismissedAt).toEqual(expect.any(String));

    const replay = await request.post("/api/v1/me/product-tutorial/dismiss", {
      headers: auth(token, key),
    });
    expect(replay.status()).toBe(200);
    expect(replay.headers()["idempotency-replayed"]).toBe("true");

    const me = await request.get("/api/v1/me", { headers: auth(token) });
    expect(me.status()).toBe(200);
    expect((await me.json()).data.productTutorialDismissedAt).toEqual(expect.any(String));
  });
});
