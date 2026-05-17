import type { Prisma, PrismaClient, ScheduleShareLink, User } from "@prisma/client";

import { hashScheduleShareToken } from "@/lib/schedule-share/token";

type Db = PrismaClient | Prisma.TransactionClient;

export type ScheduleShareLinkWithOwner = ScheduleShareLink & { owner: User };

export async function findScheduleShareLinkByPlainToken(
  db: Db,
  plaintextToken: string,
): Promise<
  | { ok: true; link: ScheduleShareLinkWithOwner }
  | { ok: false; reason: "not_found" | "revoked" | "expired" }
> {
  const tokenHash = hashScheduleShareToken(plaintextToken);
  const link = await db.scheduleShareLink.findUnique({
    where: { tokenHash },
    include: { owner: true },
  });
  if (!link) return { ok: false, reason: "not_found" };
  const now = new Date();
  if (link.revokedAt) return { ok: false, reason: "revoked" };
  if (link.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  return { ok: true, link };
}
