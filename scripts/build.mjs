import { execSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const buildEnv = {
  ...process.env,
  PATH: ["/usr/local/bin", "/opt/homebrew/bin", process.env.PATH]
    .filter(Boolean)
    .join(":"),
};

// Prisma `directUrl` uses DATABASE_URL_UNPOOLED (Neon Quick start). Fall back to DATABASE_URL for CI.
if (!String(buildEnv.DATABASE_URL_UNPOOLED ?? "").trim() && buildEnv.DATABASE_URL) {
  buildEnv.DATABASE_URL_UNPOOLED = buildEnv.DATABASE_URL;
  console.warn(
    "[build] DATABASE_URL_UNPOOLED unset — using DATABASE_URL for Prisma migrate. Add Neon unpooled URL for more reliable migrations.\n",
  );
}

function run(command, args, { allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: buildEnv,
    cwd: repoRoot,
  });

  if (result.status !== 0 && !allowFailure) {
    process.exit(result.status ?? 1);
  }
}

function sleepMs(ms) {
  const sec = Math.max(1, Math.round(ms / 1000));
  try {
    execSync(`sleep ${sec}`, { stdio: "ignore" });
  } catch {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      /* fallback if sleep is unavailable */
    }
  }
}

function migrateDeployWithRetries() {
  const maxAttempts = Number(process.env.PRISMA_MIGRATE_DEPLOY_ATTEMPTS || "4");
  const delayMs = Number(process.env.PRISMA_MIGRATE_RETRY_DELAY_MS || "12000");

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "inherit",
      env: buildEnv,
      cwd: repoRoot,
    });
    if (result.status === 0) {
      return;
    }
    if (attempt < maxAttempts) {
      console.warn(
        `\n[build] prisma migrate deploy failed (exit ${result.status ?? 1}), attempt ${attempt}/${maxAttempts}. Retrying in ${delayMs}ms…\n`,
      );
      sleepMs(delayMs);
    } else {
      process.exit(result.status ?? 1);
    }
  }
}

if (process.env.VERCEL) {
  /** Clear failed migration rows so deploy can continue (allowFailure: prior resolve may noop). */
  const vercelMigrationResolves = [
    ["--rolled-back", "20260511130000_user_calendar_ics_subscription_url"],
    ["--rolled-back", "20260215180000_schedule_share_mvp"],
    ["--rolled-back", "20260516180000_schedule_share_one_pending_per_user"],
    ["--rolled-back", "20260521140000_user_calendar_category_ics_backfill"],
  ];
  for (const [flag, name] of vercelMigrationResolves) {
    run("npx", ["prisma", "migrate", "resolve", flag, name], { allowFailure: true });
  }
}

migrateDeployWithRetries();
// Ensure generated client matches schema even if install/postinstall was skipped or cached oddly.
run("npx", ["prisma", "generate"]);
run("npx", ["next", "build"]);
