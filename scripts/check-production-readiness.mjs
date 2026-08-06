const required = [
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "SESSION_SECRET",
  "NEXT_PUBLIC_APP_URL",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "BLOB_READ_WRITE_TOKEN",
  "VERIFICATION_BLOB_READ_WRITE_TOKEN",
  "CRON_SECRET",
  "CRON_MONITOR_URL",
  "DATABASE_BACKUP_PROVIDER",
  "DATABASE_BACKUP_RETENTION_DAYS",
  "DATABASE_RESTORE_TESTED_AT",
  "DASHSCOPE_API_KEY",
  "APNS_KEY_ID",
  "APNS_TEAM_ID",
  "APNS_KEY_P8",
  "APNS_BUNDLE_ID",
  "APPLE_TEAM_ID",
  "STOREKIT_APPLE_ISSUER_ID",
  "STOREKIT_APPLE_KEY_ID",
  "STOREKIT_APPLE_PRIVATE_KEY",
];

const failures = [];

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

if (process.env.STOREKIT_SUPPORT_ENABLED?.trim() !== "1") {
  failures.push("STOREKIT_SUPPORT_ENABLED must be 1 for the in-app support flow.");
}

if (process.env.STOREKIT_VERIFICATION_MODE?.trim() !== "strict") {
  failures.push("STOREKIT_VERIFICATION_MODE must be strict in production.");
}

if (/onboarding@resend\.dev/i.test(process.env.EMAIL_FROM ?? "")) {
  failures.push("EMAIL_FROM must use a verified production sending domain.");
}

const cronMonitorUrl = process.env.CRON_MONITOR_URL?.trim() ?? "";
if (!cronMonitorUrl.startsWith("https://") || /localhost|127\.0\.0\.1/i.test(cronMonitorUrl)) {
  failures.push("CRON_MONITOR_URL must be a public HTTPS monitoring webhook.");
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
