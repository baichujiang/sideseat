import { expect, test, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

import { assertLocalTestDatabase } from "./helpers/local-test-database";

assertLocalTestDatabase();
const prisma = new PrismaClient();
const IP = `198.51.100.${(process.pid % 200) + 100}`;

async function seedDisposableUser() {
  const existing = await prisma.user.findFirst({
    where: { username: "test_001" },
    select: { hashedPassword: true, school: true },
  });
  if (!existing?.hashedPassword) {
    throw new Error("Seeded test_001 missing; cannot clone password hash.");
  }
  const username = `del_${randomBytes(4).toString("hex")}`;
  return prisma.user.create({
    data: {
      username,
      nickname: "Delete Me",
      hashedPassword: existing.hashedPassword,
      onboardingComplete: true,
      isGuest: false,
      school: existing.school ?? "TUM",
      gender: "PRIVATE",
    },
    select: { id: true, username: true },
  });
}

async function accessToken(request: APIRequestContext, identifier: string) {
  const response = await request.post("/api/v1/auth/login", {
    headers: { "x-forwarded-for": IP },
    data: {
      identifier,
      password: "Password123",
      device: {
        id: `playwright-delete-${identifier}`,
        name: "Playwright Delete iPhone",
        appVersion: "1.0.0",
        platformVersion: "17.0",
      },
    },
  });
  expect(response.status()).toBe(200);
  const payload = (await response.json()) as { data: { tokens: { accessToken: string } } };
  return payload.data.tokens.accessToken;
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("rejects mismatched username then deletes disposable account", async ({ request }) => {
  const user = await seedDisposableUser();
  const token = await accessToken(request, user.username);

  const mismatch = await request.delete("/api/v1/me", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": `delete-mismatch-${Date.now()}`,
      "x-forwarded-for": IP,
    },
    data: { confirmUsername: "wrong-username" },
  });
  expect(mismatch.status()).toBe(422);

  const deleted = await request.delete("/api/v1/me", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": `delete-ok-${Date.now()}`,
      "x-forwarded-for": IP,
    },
    data: { confirmUsername: user.username },
  });
  expect(deleted.status()).toBe(200);
  const body = (await deleted.json()) as { data: { deleted: boolean } };
  expect(body.data.deleted).toBe(true);

  const gone = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true } });
  expect(gone).toBeNull();
});
