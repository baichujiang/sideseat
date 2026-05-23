import "server-only";

import { prisma } from "@/lib/db/prisma";

export async function isUsernameAvailable(username: string, excludeUserId?: string): Promise<boolean> {
  const normalized = username.trim().toLowerCase();
  const clash = await prisma.user.findFirst({
    where: {
      username: normalized,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { id: true },
  });
  return !clash;
}
