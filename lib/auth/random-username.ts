import "server-only";
import { randomBytes } from "crypto";

import { prisma } from "@/lib/db/prisma";

/** Allocates a stable ASCII `username` for users who sign up with email or phone only. */
export async function allocateUniqueUsername(): Promise<string> {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const raw = randomBytes(12).toString("base64url").replace(/[^a-z0-9]/gi, "");
    const suffix = (raw + randomBytes(4).toString("hex")).slice(0, 18);
    const candidate = `u_${suffix}`.slice(0, 32);
    if (candidate.startsWith("guest_")) continue;

    const clash = await prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    });
    if (!clash) {
      return candidate;
    }
  }
  throw new Error("Could not allocate username.");
}
