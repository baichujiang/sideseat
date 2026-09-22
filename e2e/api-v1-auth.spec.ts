import { expect, test, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { assertLocalTestDatabase } from "./helpers/local-test-database";

assertLocalTestDatabase();
const prisma = new PrismaClient();

const E2E_USER = process.env.E2E_USER ?? "test_001";
const E2E_PEER = process.env.E2E_PEER ?? "test_002";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "Password123";
const workerOctet = (process.pid % 200) + 1;
const LOGIN_TEST_IP = `198.51.100.${workerOctet}`;
const RATE_LIMIT_TEST_IP = `203.0.113.${workerOctet}`;
const device = {
  id: "playwright-ios-device-001",
  name: "Playwright iPhone",
  appVersion: "1.0.0",
  platformVersion: "17.0",
};

type AuthPayload = {
  data: {
    user: { id: string; username: string };
    tokens: {
      accessToken: string;
      accessExpiresIn: number;
      refreshToken: string;
      refreshExpiresAt: string;
    };
  };
};

async function login(
  request: APIRequestContext,
  loginDevice = device,
  identifier = E2E_USER,
): Promise<AuthPayload> {
  const response = await request.post("/api/v1/auth/login", {
    headers: { "x-forwarded-for": LOGIN_TEST_IP },
    data: { identifier, password: E2E_PASSWORD, device: loginDevice },
  });
  expect(response.status()).toBe(200);
  return response.json();
}

test.describe.serial("API v1 native authentication", () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("returns stable config, validation, auth, rotation and replay protection", async ({ request }) => {
    const requestId = "e2e-api-v1-config";
    const config = await request.get("/api/v1/client-config", {
      headers: { "x-request-id": requestId },
    });
    expect(config.status()).toBe(200);
    expect(config.headers()["x-request-id"]).toBe(requestId);
    await expect(config.json()).resolves.toMatchObject({
      data: {
        apiVersion: "v1",
        features: { nativeAuthentication: true },
        discover: {
          defaultCity: "Munich",
          servedCities: expect.arrayContaining(["Munich"]),
        },
      },
    });

    const invalid = await request.post("/api/v1/auth/login", {
      headers: { "x-forwarded-for": LOGIN_TEST_IP },
      data: { identifier: E2E_USER, password: "wrong-password", device },
    });
    expect(invalid.status()).toBe(401);
    await expect(invalid.json()).resolves.toMatchObject({
      error: { code: "INVALID_CREDENTIALS", retryable: false },
    });

    const first = await login(request);
    expect(first.data.user.username).toBe(E2E_USER);
    expect(first.data.tokens.accessToken).toBeTruthy();
    expect(first.data.tokens.refreshToken.length).toBeGreaterThanOrEqual(32);

    const me = await request.get("/api/v1/me", {
      headers: {
        Authorization: `Bearer ${first.data.tokens.accessToken}`,
        "Accept-Language": "zh-CN",
      },
    });
    expect(me.status()).toBe(200);
    await expect(me.json()).resolves.toMatchObject({
      data: { username: E2E_USER, locale: "zh-CN" },
    });

    const refreshed = await request.post("/api/v1/auth/refresh", {
      data: { refreshToken: first.data.tokens.refreshToken, device },
    });
    expect(refreshed.status()).toBe(200);
    const second = (await refreshed.json()) as AuthPayload;
    expect(second.data.tokens.refreshToken).not.toBe(first.data.tokens.refreshToken);

    const replay = await request.post("/api/v1/auth/refresh", {
      data: { refreshToken: first.data.tokens.refreshToken, device },
    });
    expect(replay.status()).toBe(401);
    await expect(replay.json()).resolves.toMatchObject({
      error: { code: "REFRESH_TOKEN_REUSED", retryable: false },
    });

    const revokedReplacement = await request.post("/api/v1/auth/refresh", {
      data: { refreshToken: second.data.tokens.refreshToken, device },
    });
    expect(revokedReplacement.status()).toBe(401);
    await expect(revokedReplacement.json()).resolves.toMatchObject({
      error: { code: "REFRESH_TOKEN_REUSED" },
    });
  });

  test("binds a token family to one device and supports idempotent logout", async ({ request }) => {
    const signedIn = await login(request);
    const mismatch = await request.post("/api/v1/auth/refresh", {
      data: {
        refreshToken: signedIn.data.tokens.refreshToken,
        device: { ...device, id: "playwright-ios-device-002" },
      },
    });
    expect(mismatch.status()).toBe(401);
    await expect(mismatch.json()).resolves.toMatchObject({
      error: { code: "DEVICE_MISMATCH" },
    });

    const another = await login(request);
    const logout = await request.post("/api/v1/auth/logout", {
      data: { refreshToken: another.data.tokens.refreshToken },
    });
    expect(logout.status()).toBe(200);
    await expect(logout.json()).resolves.toEqual({ data: { revoked: true } });

    const logoutAgain = await request.post("/api/v1/auth/logout", {
      data: { refreshToken: another.data.tokens.refreshToken },
    });
    expect(logoutAgain.status()).toBe(200);
  });

  test("removes this iPhone push token from the old account on logout", async ({ request }) => {
    const logoutDevice = {
      ...device,
      id: "playwright-ios-push-logout",
      name: "Push Logout iPhone",
    };
    const signedIn = await login(request, logoutDevice);
    const pushToken = `e2e-apns-${process.pid}-${Date.now()}`;

    const registered = await request.post("/api/v1/push/devices", {
      headers: { Authorization: `Bearer ${signedIn.data.tokens.accessToken}` },
      data: { token: pushToken, platform: "ios", environment: "sandbox" },
    });
    expect(registered.status()).toBe(201);
    await expect(
      prisma.nativePushDevice.findUnique({ where: { token: pushToken } }),
    ).resolves.toMatchObject({
      userId: signedIn.data.user.id,
      environment: "sandbox",
    });

    const logout = await request.post("/api/v1/auth/logout", {
      data: {
        refreshToken: signedIn.data.tokens.refreshToken,
        pushToken,
      },
    });
    expect(logout.status()).toBe(200);
    await expect(
      prisma.nativePushDevice.findUnique({ where: { token: pushToken } }),
    ).resolves.toBeNull();
  });

  test("uses the new bearer account instead of a stale web cookie", async ({ request }) => {
    const legacyLogin = await request.post("/api/auth/login", {
      data: { identifier: E2E_USER, password: E2E_PASSWORD },
    });
    expect(legacyLogin.status()).toBe(200);
    expect(legacyLogin.headers()["set-cookie"]).toContain("sideseat_refresh");

    const peer = await login(
      request,
      { ...device, id: "playwright-ios-account-switch" },
      E2E_PEER,
    );
    expect(peer.data.user.username).toBe(E2E_PEER);

    const me = await request.get("/api/v1/me", {
      headers: { Authorization: `Bearer ${peer.data.tokens.accessToken}` },
    });
    expect(me.status()).toBe(200);
    await expect(me.json()).resolves.toMatchObject({
      data: { id: peer.data.user.id, username: E2E_PEER },
    });
  });

  test("lists and revokes another native device session", async ({ request }) => {
    const firstDevice = { ...device, id: "playwright-ios-device-101", name: "First iPhone" };
    const secondDevice = { ...device, id: "playwright-ios-device-102", name: "Second iPhone" };
    const first = await login(request, firstDevice);
    const second = await login(request, secondDevice);

    const sessionsResponse = await request.get("/api/v1/auth/sessions", {
      headers: { Authorization: `Bearer ${second.data.tokens.accessToken}` },
    });
    expect(sessionsResponse.status()).toBe(200);
    const sessionsPayload = (await sessionsResponse.json()) as {
      data: { sessions: Array<{ familyId: string; deviceId: string }> };
    };
    expect(sessionsPayload.data.sessions.map((session) => session.deviceId)).toEqual(
      expect.arrayContaining([firstDevice.id, secondDevice.id]),
    );

    const firstFamily = sessionsPayload.data.sessions.find(
      (session) => session.deviceId === firstDevice.id,
    );
    expect(firstFamily).toBeTruthy();
    const revoked = await request.delete(`/api/v1/auth/sessions/${firstFamily!.familyId}`, {
      headers: { Authorization: `Bearer ${second.data.tokens.accessToken}` },
    });
    expect(revoked.status()).toBe(200);

    const firstRefresh = await request.post("/api/v1/auth/refresh", {
      data: { refreshToken: first.data.tokens.refreshToken, device: firstDevice },
    });
    expect(firstRefresh.status()).toBe(401);
    await expect(firstRefresh.json()).resolves.toMatchObject({
      error: { code: "REFRESH_TOKEN_INVALID" },
    });

    await request.post("/api/v1/auth/logout", {
      data: { refreshToken: second.data.tokens.refreshToken },
    });
  });

  test("allows only one winner for concurrent refresh and revokes the compromised family", async ({
    request,
  }) => {
    const concurrentDevice = {
      ...device,
      id: "playwright-ios-device-concurrent",
      name: "Concurrent iPhone",
    };
    const signedIn = await login(request, concurrentDevice);
    const body = { refreshToken: signedIn.data.tokens.refreshToken, device: concurrentDevice };
    const responses = await Promise.all([
      request.post("/api/v1/auth/refresh", { data: body }),
      request.post("/api/v1/auth/refresh", { data: body }),
    ]);
    expect(responses.map((response) => response.status()).sort()).toEqual([200, 401]);

    const winner = responses.find((response) => response.status() === 200)!;
    const winnerPayload = (await winner.json()) as AuthPayload;
    const afterReplay = await request.post("/api/v1/auth/refresh", {
      data: { refreshToken: winnerPayload.data.tokens.refreshToken, device: concurrentDevice },
    });
    expect(afterReplay.status()).toBe(401);
    await expect(afterReplay.json()).resolves.toMatchObject({
      error: { code: "REFRESH_TOKEN_REUSED" },
    });
  });

  test("rate limits repeated native login attempts", async ({
    request,
  }) => {
    const identifier = `missing-${Date.now()}`;
    const headers = { "x-forwarded-for": RATE_LIMIT_TEST_IP };
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await request.post("/api/v1/auth/login", {
        headers,
        data: { identifier, password: "wrong-password", device },
      });
      expect(response.status()).toBe(401);
    }

    const limited = await request.post("/api/v1/auth/login", {
      headers,
      data: { identifier, password: "wrong-password", device },
    });
    expect(limited.status()).toBe(429);
    expect(Number(limited.headers()["retry-after"])).toBeGreaterThan(0);
    expect(limited.headers()["ratelimit-limit"]).toBe("10");
    expect(limited.headers()["ratelimit-remaining"]).toBe("0");
    await expect(limited.json()).resolves.toMatchObject({
      error: { code: "RATE_LIMITED", retryable: true },
    });
  });
});
