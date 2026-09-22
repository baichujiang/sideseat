import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { buildMigrationPolicy } from "../../scripts/build-database-policy.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

function validProductionEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DATABASE_URL: "postgresql://release.example/sideseat",
    DATABASE_URL_UNPOOLED: "postgresql://release.example/sideseat",
    SESSION_SECRET: "release-session-secret-at-least-32-characters",
    NEXT_PUBLIC_APP_URL: "https://app.sideseat.example",
    RESEND_API_KEY: "re_release_key",
    EMAIL_FROM: "SideSeat <support@sideseat.example>",
    NEXT_PUBLIC_SUPPORT_EMAIL: "release-owner@example.com",
    BLOB_READ_WRITE_TOKEN: "vercel_blob_release_token",
    VERIFICATION_BLOB_READ_WRITE_TOKEN: "vercel_private_blob_release_token",
    CRON_SECRET: "release-cron-secret",
    CRON_MONITOR_URLS: JSON.stringify({
      "chat-realtime-retention": {
        successUrl: "https://monitor.sideseat.example/chat-retention",
        failureUrl: "https://monitor.sideseat.example/chat-retention/fail",
      },
      "student-verification-retention": {
        successUrl: "https://monitor.sideseat.example/verification-retention",
        failureUrl: "https://monitor.sideseat.example/verification-retention/fail",
      },
      "product-funnel-retention": {
        successUrl: "https://monitor.sideseat.example/product-funnel-retention",
        failureUrl: "https://monitor.sideseat.example/product-funnel-retention/fail",
      },
      "social-group-expiration": {
        successUrl: "https://monitor.sideseat.example/social-group-expiration",
        failureUrl: "https://monitor.sideseat.example/social-group-expiration/fail",
      },
      "tum-course-catalog": {
        successUrl: "https://monitor.sideseat.example/tum-catalog",
        failureUrl: "https://monitor.sideseat.example/tum-catalog/fail",
      },
      "lmu-course-catalog": {
        successUrl: "https://monitor.sideseat.example/lmu-catalog",
        failureUrl: "https://monitor.sideseat.example/lmu-catalog/fail",
      },
    }),
    DATABASE_BACKUP_PROVIDER: "neon",
    DATABASE_BACKUP_RETENTION_DAYS: "30",
    DATABASE_RESTORE_TESTED_AT: new Date().toISOString(),
    DASHSCOPE_API_KEY: "dashscope-release-key",
    APNS_TEAM_ID: "TEAM123456",
    APNS_PRODUCTION_KEY_ID: "APNSPROD123",
    APNS_PRODUCTION_KEY_P8: "-----BEGIN PRIVATE KEY-----test-----END PRIVATE KEY-----",
    APNS_BUNDLE_ID: "app.sideseat.mobile",
    APNS_USE_SANDBOX: "0",
    APPLE_TEAM_ID: "TEAM123456",
    STOREKIT_SUPPORT_ENABLED: "0",
    ALLOW_REMOTE_DATABASE_MIGRATIONS: "",
    V2_TESTFLIGHT_ALLOW_ALL: "",
    V2_SMALL_GROUP_ALLOW_ALL: "",
    ...overrides,
  } as NodeJS.ProcessEnv;
}

function runReadiness(overrides: Partial<NodeJS.ProcessEnv> = {}) {
  return spawnSync(process.execPath, ["scripts/check-production-readiness.mjs"], {
    cwd: repoRoot,
    env: validProductionEnv(overrides),
    encoding: "utf8",
  });
}

describe("production readiness guard", () => {
  it("accepts a complete production configuration", () => {
    const result = runReadiness();

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /configuration passed/);
  });

  it("rejects backup retention below seven days", () => {
    const result = runReadiness({ DATABASE_BACKUP_RETENTION_DAYS: "6" });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /must be at least 7/);
  });

  it("rejects a stale restore drill", () => {
    const result = runReadiness({ DATABASE_RESTORE_TESTED_AT: "2025-01-01T00:00:00.000Z" });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /within the last 90 days/);
  });

  it("rejects persistent remote migration authority", () => {
    const result = runReadiness({ ALLOW_REMOTE_DATABASE_MIGRATIONS: "1" });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /must not remain enabled in Production/);
  });

  it("rejects a production-wide V2 TestFlight bypass", () => {
    const result = runReadiness({ V2_TESTFLIGHT_ALLOW_ALL: "1" });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /V2_TESTFLIGHT_ALLOW_ALL must not be enabled/);
  });

  it("rejects a production-wide small-group bypass", () => {
    const result = runReadiness({ V2_SMALL_GROUP_ALLOW_ALL: "1" });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /V2_SMALL_GROUP_ALLOW_ALL must not be enabled/);
  });

  it("rejects a private cron monitor endpoint", () => {
    const monitors = JSON.parse(validProductionEnv().CRON_MONITOR_URLS!);
    monitors["chat-realtime-retention"].successUrl = "http://127.0.0.1:9000/cron";
    const result = runReadiness({ CRON_MONITOR_URLS: JSON.stringify(monitors) });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /chat-realtime-retention\.successUrl must be a public HTTPS URL/);
  });

  it("requires an independent monitor for every deployed cron", () => {
    const monitors = JSON.parse(validProductionEnv().CRON_MONITOR_URLS!);
    delete monitors["lmu-course-catalog"];
    const result = runReadiness({ CRON_MONITOR_URLS: JSON.stringify(monitors) });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /lmu-course-catalog\.successUrl/);
    assert.match(result.stderr, /lmu-course-catalog\.failureUrl/);
  });

  it("requires a separate token for private verification documents", () => {
    const result = runReadiness({ VERIFICATION_BLOB_READ_WRITE_TOKEN: "" });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /VERIFICATION_BLOB_READ_WRITE_TOKEN/);
  });

  it("accepts a monitored personal support inbox", () => {
    const result = runReadiness({ NEXT_PUBLIC_SUPPORT_EMAIL: "owner@gmail.com" });

    assert.equal(result.status, 0, result.stderr);
  });

  it("rejects an invalid support inbox", () => {
    const result = runReadiness({ NEXT_PUBLIC_SUPPORT_EMAIL: "not-an-email" });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /valid, monitored support address/);
  });

  it("rejects a sandbox-only APNs key for an App Store release", () => {
    const result = runReadiness({
      APNS_PRODUCTION_KEY_ID: "",
      APNS_PRODUCTION_KEY_P8: "",
      APNS_SANDBOX_KEY_ID: "SANDBOX123",
      APNS_SANDBOX_KEY_P8: "sandbox-private-key",
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /APNS_PRODUCTION_KEY_ID/);
  });

  it("allows StoreKit to remain disabled for a release without purchases", () => {
    const result = runReadiness({
      STOREKIT_SUPPORT_ENABLED: "0",
      STOREKIT_VERIFICATION_MODE: "",
      STOREKIT_APPLE_ISSUER_ID: "",
      STOREKIT_APPLE_KEY_ID: "",
      STOREKIT_APPLE_PRIVATE_KEY: "",
    });

    assert.equal(result.status, 0, result.stderr);
  });

  it("requires strict Apple verification before StoreKit can be enabled", () => {
    const result = runReadiness({
      STOREKIT_SUPPORT_ENABLED: "1",
      STOREKIT_VERIFICATION_MODE: "test",
      STOREKIT_APPLE_ISSUER_ID: "",
      STOREKIT_APPLE_KEY_ID: "",
      STOREKIT_APPLE_PRIVATE_KEY: "",
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /must be strict when StoreKit support is enabled/);
    assert.match(result.stderr, /STOREKIT_APPLE_ISSUER_ID is required/);
  });
});

describe("build database migration policy", () => {
  it("runs migrations for local databases", () => {
    assert.equal(
      buildMigrationPolicy({ DATABASE_URL: "postgresql://postgres@127.0.0.1/test" }).run,
      true,
    );
  });

  it("does not let Preview or CI builds mutate a remote database by default", () => {
    assert.deepEqual(
      buildMigrationPolicy({
        DATABASE_URL: "postgresql://remote.example/test",
        VERCEL: "1",
        VERCEL_ENV: "preview",
      }),
      {
        run: false,
        reason: "remote-deployment-requires-approval",
        host: "remote.example",
      },
    );
    assert.equal(
      buildMigrationPolicy({
        DATABASE_URL: "postgresql://remote.example/test",
        CI: "1",
      }).run,
      false,
    );
  });

  it("skips a remote database during a local build unless explicitly approved", () => {
    const blocked = buildMigrationPolicy({
      DATABASE_URL_UNPOOLED: "postgresql://remote.example/test",
    });
    assert.deepEqual(blocked, {
      run: false,
      reason: "remote-local-build",
      host: "remote.example",
    });

    assert.equal(
      buildMigrationPolicy({
        DATABASE_URL_UNPOOLED: "postgresql://remote.example/test",
        ALLOW_REMOTE_DATABASE_MIGRATIONS: "1",
        VERCEL: "1",
      }).run,
      true,
    );
  });

  it("honors an explicit skip before any migration approval", () => {
    assert.deepEqual(
      buildMigrationPolicy({
        DATABASE_URL: "postgresql://remote.example/test",
        VERCEL: "1",
        SKIP_DATABASE_MIGRATIONS: "1",
        ALLOW_REMOTE_DATABASE_MIGRATIONS: "1",
      }),
      { run: false, reason: "explicit-skip" },
    );
  });

  it("skips migrations when the local process cannot verify the target", () => {
    assert.deepEqual(buildMigrationPolicy({}), {
      run: false,
      reason: "unverified-database-url",
    });
    assert.equal(buildMigrationPolicy({ DATABASE_URL: "not-a-url" }).run, false);
  });
});
