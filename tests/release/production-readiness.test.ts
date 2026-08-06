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
    BLOB_READ_WRITE_TOKEN: "vercel_blob_release_token",
    VERIFICATION_BLOB_READ_WRITE_TOKEN: "vercel_private_blob_release_token",
    CRON_SECRET: "release-cron-secret",
    CRON_MONITOR_URL: "https://monitor.sideseat.example/cron",
    DATABASE_BACKUP_PROVIDER: "neon",
    DATABASE_BACKUP_RETENTION_DAYS: "30",
    DATABASE_RESTORE_TESTED_AT: new Date().toISOString(),
    DASHSCOPE_API_KEY: "dashscope-release-key",
    APNS_KEY_ID: "APNSKEY123",
    APNS_TEAM_ID: "TEAM123456",
    APNS_KEY_P8: "-----BEGIN PRIVATE KEY-----test-----END PRIVATE KEY-----",
    APNS_BUNDLE_ID: "app.sideseat.mobile",
    APNS_USE_SANDBOX: "0",
    APPLE_TEAM_ID: "TEAM123456",
    STOREKIT_APPLE_ISSUER_ID: "storekit-issuer",
    STOREKIT_APPLE_KEY_ID: "storekit-key",
    STOREKIT_APPLE_PRIVATE_KEY: "storekit-private-key",
    STOREKIT_SUPPORT_ENABLED: "1",
    STOREKIT_VERIFICATION_MODE: "strict",
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

  it("rejects a private cron monitor endpoint", () => {
    const result = runReadiness({ CRON_MONITOR_URL: "http://127.0.0.1:9000/cron" });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /public HTTPS monitoring webhook/);
  });

  it("requires a separate token for private verification documents", () => {
    const result = runReadiness({ VERIFICATION_BLOB_READ_WRITE_TOKEN: "" });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /VERIFICATION_BLOB_READ_WRITE_TOKEN/);
  });
});

describe("build database migration policy", () => {
  it("runs migrations for local databases and deployment environments", () => {
    assert.equal(
      buildMigrationPolicy({ DATABASE_URL: "postgresql://postgres@127.0.0.1/test" }).run,
      true,
    );
    assert.equal(
      buildMigrationPolicy({ DATABASE_URL: "postgresql://remote.example/test", VERCEL: "1" }).run,
      true,
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
      }).run,
      true,
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
