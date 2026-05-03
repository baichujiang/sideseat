import { spawnSync } from "node:child_process";
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

run("npx", ["prisma", "migrate", "deploy"]);
run("npx", ["next", "build"]);
