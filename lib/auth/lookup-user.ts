import "server-only";

import { normalizeSignupEmail } from "@/lib/auth/normalize-email";
import { normalizePhone } from "@/lib/auth/phone";
import { prisma } from "@/lib/db/prisma";

export function identifierLooksLikeEmail(identifier: string) {
  return identifier.includes("@");
}

/** ASCII login handle shape stored on `User.username`. */
export function looksLikeUsername(identifier: string) {
  const s = identifier.trim();
  return s.length >= 2 && s.length <= 32 && /^[a-zA-Z0-9_-]+$/.test(s);
}

/**
 * Login identifier: email, E.164 phone, or username (stored lowercase).
 * Nickname is display-only — not used for sign-in.
 */
export async function findUserForLogin(identifier: string) {
  const trimmed = identifier.trim();
  if (!trimmed) {
    return null;
  }

  if (identifierLooksLikeEmail(trimmed)) {
    const email = normalizeSignupEmail(trimmed);
    if (email) {
      const byEmail = await prisma.user.findUnique({ where: { email } });
      if (byEmail) {
        return byEmail;
      }
    }
    // Invalid email shape (e.g. stray "@") — fall through to username / phone.
  }

  if (looksLikeUsername(trimmed)) {
    const byUsername = await prisma.user.findUnique({
      where: { username: trimmed.toLowerCase() },
    });
    if (byUsername) {
      return byUsername;
    }
  }

  const phone = normalizePhone(trimmed);
  if (phone) {
    const byPhone = await prisma.user.findUnique({ where: { phone } });
    if (byPhone) {
      return byPhone;
    }
  }

  if (!looksLikeUsername(trimmed)) {
    return prisma.user.findUnique({
      where: { username: trimmed.toLowerCase() },
    });
  }

  return null;
}
