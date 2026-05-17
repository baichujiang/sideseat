import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

/**
 * In dev, Next keeps `globalThis.prisma` across hot reloads. After `prisma generate`
 * adds new models, the cached instance is still the old class shape — new delegates
 * are undefined until we construct a fresh client.
 *
 * Do not cache the client in a module-level `const prisma = getPrisma()`: Fast Refresh
 * often reloads route modules without re-running this file, so that const would keep
 * pointing at a stale client forever. Resolve through `getPrisma()` on every access.
 */
function getPrisma(): PrismaClient {
  const existing = globalForPrisma.prisma;
  const delegates = existing as unknown as {
    courseRoomMessage?: unknown;
    classmatePostSave?: unknown;
    scheduleShareLink?: unknown;
  } | undefined;
  const staleDevSingleton =
    process.env.NODE_ENV !== "production" &&
    Boolean(existing) &&
    (typeof delegates?.courseRoomMessage === "undefined" ||
      typeof delegates?.classmatePostSave === "undefined" ||
      typeof delegates?.scheduleShareLink === "undefined");

  if (existing && !staleDevSingleton) {
    return existing;
  }

  if (staleDevSingleton && existing) {
    void existing.$disconnect().catch(() => {});
  }

  const client = createPrismaClient();

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }

  return client;
}

function createPrismaProxy(): PrismaClient {
  return new Proxy({} as PrismaClient, {
    get(_target, prop, receiver) {
      const client = getPrisma();
      const value = Reflect.get(client, prop, receiver) as unknown;
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(client) : value;
    },
  });
}

export const prisma = createPrismaProxy();
