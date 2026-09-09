import { expect, test, type APIRequestContext } from "@playwright/test";

import { assertLocalTestDatabase } from "./helpers/local-test-database";

assertLocalTestDatabase();

async function login(request: APIRequestContext, identifier: string) {
  const response = await request.post("/api/v1/auth/login", {
    data: {
      identifier,
      password: "Password123",
      device: {
        id: `system-avatar-qa-${identifier}`,
        name: "System Avatar QA",
        appVersion: "1.0.0",
        platformVersion: "17.0",
      },
    },
  });
  expect(response.status()).toBe(200);
  const { data } = await response.json();
  return { Authorization: `Bearer ${data.tokens.accessToken}` };
}

test("native preset selection persists and is visible to a connected account", async ({
  request,
}) => {
  const headers = await login(request, "test_001");
  const peerHeaders = await login(request, "test_002");
  const current = await request.get("/api/v1/me", { headers });
  expect(current.status()).toBe(200);
  const { data: original } = await current.json();

  try {
    for (const avatarId of ["p05", "p20"]) {
      const saved = await request.post("/api/profile/avatar", {
        headers,
        data: { avatarId },
      });
      expect(saved.status()).toBe(200);
      expect(await saved.json()).toMatchObject({
        success: true,
        data: { avatarId },
      });

      const reloaded = await request.get("/api/v1/me", { headers });
      expect(reloaded.status()).toBe(200);
      expect((await reloaded.json()).data.avatarUrl).toBe(avatarId);

      const publicProfile = await request.get(
        `/api/v1/users/${original.id}/profile`,
        {
          headers: peerHeaders,
        },
      );
      expect(publicProfile.status()).toBe(200);
      expect((await publicProfile.json()).data.profile.avatarUrl).toBe(
        avatarId,
      );

      const asset = await request.get(
        `/avatars/companions-v1/${avatarId}.svg`,
        {
          maxRedirects: 0,
        },
      );
      expect(asset.status()).toBe(200);
      expect(asset.headers()["content-type"]).toContain("image/svg+xml");
      expect(await asset.text()).toContain('viewBox="0 0 100 100"');
    }
  } finally {
    const restored = await request.post("/api/profile/avatar", {
      headers,
      data: { avatarId: original.avatarUrl },
    });
    expect(restored.status()).toBe(200);
  }
});
