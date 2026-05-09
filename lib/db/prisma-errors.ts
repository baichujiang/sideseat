/**
 * True when Prisma cannot open a connection (wrong URL, Neon paused, network, etc.).
 * Lets API routes return 503 instead of a generic 400.
 */
export function isDatabaseUnreachable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as Record<string, unknown>;
  if (e.name === "PrismaClientInitializationError") return true;
  if (e.code === "P1001" || e.code === "P1000") return true;
  if (typeof e.message === "string" && e.message.includes("Can't reach database server")) {
    return true;
  }
  return false;
}

const DB_UNREACHABLE_LOG_MS = 60_000;
let lastDbUnreachableWarnAt = 0;
let dbUnreachableSuppressed = 0;

/** Avoid flooding the console when the DB is down (every poll hits Prisma). */
export function warnDatabaseUnreachableThrottled(context: string): void {
  const now = Date.now();
  if (now - lastDbUnreachableWarnAt < DB_UNREACHABLE_LOG_MS) {
    dbUnreachableSuppressed++;
    return;
  }
  const extra =
    dbUnreachableSuppressed > 0
      ? ` (${dbUnreachableSuppressed} similar failures not logged)`
      : "";
  dbUnreachableSuppressed = 0;
  console.warn(
    `[db] ${context}: PostgreSQL unreachable.${extra} Wake Neon / verify DATABASE_URL / check network.`,
  );
  lastDbUnreachableWarnAt = now;
}
