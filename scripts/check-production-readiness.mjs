import { readFileSync } from "node:fs";

const required = [
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "SESSION_SECRET",
  "NEXT_PUBLIC_APP_URL",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "NEXT_PUBLIC_SUPPORT_EMAIL",
  "BLOB_READ_WRITE_TOKEN",
  "VERIFICATION_BLOB_READ_WRITE_TOKEN",
  "CRON_SECRET",
  "CRON_MONITOR_URLS",
  "DATABASE_BACKUP_PROVIDER",
  "DATABASE_BACKUP_RETENTION_DAYS",
  "DATABASE_RESTORE_TESTED_AT",
  "DASHSCOPE_API_KEY",
  "APNS_TEAM_ID",
  "APNS_BUNDLE_ID",
  "APPLE_TEAM_ID",
];

const failures = [];

if (process.env.ALLOW_REMOTE_DATABASE_MIGRATIONS?.trim() === "1") {
  failures.push(
    "ALLOW_REMOTE_DATABASE_MIGRATIONS must not remain enabled in Production; approve and run remote migrations as a one-shot release step.",
  );
}

for (const key of required) {
  const value = process.env[key]?.trim();
  if (!value || /replace-with|your-production|\.invalid/i.test(value)) {
    failures.push(`${key} is missing or still uses a placeholder.`);
  }
}

const appURL = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "";
if (!appURL.startsWith("https://") || /localhost|127\.0\.0\.1/i.test(appURL)) {
  failures.push("NEXT_PUBLIC_APP_URL must be a public HTTPS origin.");
}

if (process.env.APNS_BUNDLE_ID?.trim() !== "app.sideseat.mobile") {
  failures.push("APNS_BUNDLE_ID must match app.sideseat.mobile.");
}

if (process.env.APNS_USE_SANDBOX?.trim() !== "0") {
  failures.push("APNS_USE_SANDBOX must be 0 for App Store delivery.");
}

const hasProductionApnsKey = Boolean(
  process.env.APNS_PRODUCTION_KEY_ID?.trim() &&
    process.env.APNS_PRODUCTION_KEY_P8?.trim(),
);
const hasLegacyProductionApnsKey = Boolean(
  process.env.APNS_USE_SANDBOX?.trim() === "0" &&
    process.env.APNS_KEY_ID?.trim() &&
    process.env.APNS_KEY_P8?.trim(),
);
if (!hasProductionApnsKey && !hasLegacyProductionApnsKey) {
  failures.push(
    "APNS_PRODUCTION_KEY_ID and APNS_PRODUCTION_KEY_P8 are required for TestFlight/App Store delivery.",
  );
}

const storeKitEnabled = process.env.STOREKIT_SUPPORT_ENABLED?.trim();
if (storeKitEnabled !== "0" && storeKitEnabled !== "1") {
  failures.push("STOREKIT_SUPPORT_ENABLED must explicitly be 0 or 1 in production.");
}
if (storeKitEnabled === "1") {
  if (process.env.STOREKIT_VERIFICATION_MODE?.trim() !== "strict") {
    failures.push("STOREKIT_VERIFICATION_MODE must be strict when StoreKit support is enabled.");
  }
  for (const key of [
    "STOREKIT_APPLE_ISSUER_ID",
    "STOREKIT_APPLE_KEY_ID",
    "STOREKIT_APPLE_PRIVATE_KEY",
  ]) {
    if (!process.env[key]?.trim()) {
      failures.push(`${key} is required when StoreKit support is enabled.`);
    }
  }
}

if (/onboarding@resend\.dev/i.test(process.env.EMAIL_FROM ?? "")) {
  failures.push("EMAIL_FROM must use a verified production sending domain.");
}

const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim().toLowerCase() ?? "";
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) {
  failures.push("NEXT_PUBLIC_SUPPORT_EMAIL must be a valid, monitored support address.");
}

const scheduledCronJobs = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"))
  .crons.map(({ path }) => path.split("/").filter(Boolean).at(-1));
const cronMonitorUrlsRaw = process.env.CRON_MONITOR_URLS?.trim() ?? "";
try {
  const cronMonitorUrls = JSON.parse(cronMonitorUrlsRaw);
  const successUrls = new Set();
  for (const job of scheduledCronJobs) {
    const endpoint = cronMonitorUrls?.[job];
    for (const field of ["successUrl", "failureUrl"]) {
      const value = endpoint?.[field];
      let valid = false;
      try {
        const url = new URL(value);
        valid = url.protocol === "https:" && !/^(localhost|127\.0\.0\.1)$/i.test(url.hostname);
      } catch {
        // Report the configuration error below.
      }
      if (!valid) {
        failures.push(`CRON_MONITOR_URLS.${job}.${field} must be a public HTTPS URL.`);
      }
    }
    if (typeof endpoint?.successUrl === "string") {
      if (successUrls.has(endpoint.successUrl)) {
        failures.push(`CRON_MONITOR_URLS must use a distinct successUrl for ${job}.`);
      }
      successUrls.add(endpoint.successUrl);
    }
  }
} catch {
  failures.push("CRON_MONITOR_URLS must be valid JSON with one entry per scheduled job.");
}

const backupRetentionDays = Number.parseInt(
  process.env.DATABASE_BACKUP_RETENTION_DAYS?.trim() ?? "",
  10,
);
if (!Number.isFinite(backupRetentionDays) || backupRetentionDays < 7) {
  failures.push("DATABASE_BACKUP_RETENTION_DAYS must be at least 7.");
}

const restoreTestedAtRaw = process.env.DATABASE_RESTORE_TESTED_AT?.trim() ?? "";
const restoreTestedAt = new Date(restoreTestedAtRaw);
const restoreTestAgeMs = Date.now() - restoreTestedAt.getTime();
const maxRestoreTestAgeMs = 90 * 24 * 60 * 60 * 1_000;
if (
  !restoreTestedAtRaw ||
  Number.isNaN(restoreTestedAt.getTime()) ||
  restoreTestAgeMs < 0 ||
  restoreTestAgeMs > maxRestoreTestAgeMs
) {
  failures.push("DATABASE_RESTORE_TESTED_AT must be a valid ISO date within the last 90 days.");
}

if (failures.length > 0) {
  console.error("SideSeat production readiness failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("SideSeat production server configuration passed.");
