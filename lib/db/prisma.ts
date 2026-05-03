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
 * (e.g. `courseRoomMessage`) are undefined until we construct a fresh client.
 */
function getPrisma(): PrismaClient {
  const existing = globalForPrisma.prisma;
  const staleDevSingleton =
    process.env.NODE_ENV !== "production" &&
    Boolean(existing) &&
    typeof (existing as unknown as { courseRoomMessage?: unknown }).courseRoomMessage ===
      "undefined";

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

export const prisma = getPrisma();
