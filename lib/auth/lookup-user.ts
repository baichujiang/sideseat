import "server-only";

import { prisma } from "@/lib/db/prisma";

export function identifierLooksLikeEmail(identifier: string) {
  return identifier.includes("@");
}

/**
 * Login identifier: email (unique) or username (stored lowercase).
 */
export async function findUserForLogin(identifier: string) {
  const trimmed = identifier.trim();
  if (!trimmed) {
    return null;
  }

  if (identifierLooksLikeEmail(trimmed)) {
    return prisma.user.findUnique({
      where: { email: trimmed.toLowerCase() },
    });
  }

  return prisma.user.findUnique({
    where: { username: trimmed.toLowerCase() },
  });
}
