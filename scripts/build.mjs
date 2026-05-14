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

// Prisma schema requires `directUrl = env("DIRECT_URL")`. Vercel/CI often only set DATABASE_URL.
// Mirror DATABASE_URL so migrate + generate validate; for Neon, prefer a separate non-pooler DIRECT_URL
// in production to avoid migrate advisory-lock timeouts (P1002).
if (!String(buildEnv.DIRECT_URL ?? "").trim() && buildEnv.DATABASE_URL) {
  buildEnv.DIRECT_URL = buildEnv.DATABASE_URL;
  console.warn(
    "[build] DIRECT_URL unset — using DATABASE_URL for Prisma. Add DIRECT_URL (Neon direct host, no -pooler) in Vercel env for more reliable migrations.\n",
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
  run(
    "npx",
    [
      "prisma",
      "migrate",
      "resolve",
      "--rolled-back",
      "20260503120000_availability_share_included_dates",
    ],
    { allowFailure: true },
  );
}

migrateDeployWithRetries();
// Ensure generated client matches schema even if install/postinstall was skipped or cached oddly.
run("npx", ["prisma", "generate"]);
run("npx", ["next", "build"]);
