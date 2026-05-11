import "server-only";

import { normalizePhone } from "@/lib/auth/phone";
import { prisma } from "@/lib/db/prisma";

export function identifierLooksLikeEmail(identifier: string) {
  return identifier.includes("@");
}

/**
 * Login identifier: email, E.164 phone, or username (stored lowercase).
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

  const phone = normalizePhone(trimmed);
  if (phone) {
    const byPhone = await prisma.user.findUnique({ where: { phone } });
    if (byPhone) {
      return byPhone;
    }
  }

  return prisma.user.findUnique({
    where: { username: trimmed.toLowerCase() },
  });
}
