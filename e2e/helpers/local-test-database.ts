const LOCAL_DATABASE_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export function assertLocalTestDatabase() {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error(
      "DATABASE_URL is required for database-backed E2E tests. Run them through scripts/with-local-test-db.mjs.",
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL for database-backed E2E tests.");
  }

  if (!LOCAL_DATABASE_HOSTS.has(url.hostname)) {
    throw new Error(
      `Refusing to run database-backed E2E tests against non-local host ${url.hostname}.`,
    );
  }
}
