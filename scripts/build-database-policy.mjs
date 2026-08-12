const LOCAL_DATABASE_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export function buildMigrationPolicy(env = process.env) {
  if (env.SKIP_DATABASE_MIGRATIONS === "1") {
    return { run: false, reason: "explicit-skip" };
  }

  const value = String(env.DATABASE_URL_UNPOOLED || env.DATABASE_URL || "").trim();
  if (!value) {
    return { run: false, reason: "unverified-database-url" };
  }

  try {
    const host = new URL(value).hostname;
    if (LOCAL_DATABASE_HOSTS.has(host)) {
      return { run: true, reason: "local-database", host };
    }
    if (env.ALLOW_REMOTE_DATABASE_MIGRATIONS === "1") {
      return { run: true, reason: "explicit-remote-approval", host };
    }
    if (env.VERCEL || env.CI) {
      return { run: false, reason: "remote-deployment-requires-approval", host };
    }
    return { run: false, reason: "remote-local-build", host };
  } catch {
    return { run: false, reason: "unverified-database-url" };
  }
}
