import type { Prisma, PrismaClient, ScheduleShareLink, ScheduleShareUsageLimit } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export type ScheduleShareUsageLimitInput = ScheduleShareUsageLimit;

export function isScheduleShareOwner(
  link: Pick<ScheduleShareLink, "ownerUserId">,
  viewerUserId: string | null | undefined,
): boolean {
  return Boolean(viewerUserId && viewerUserId === link.ownerUserId);
}

/** True when a non-owner may no longer use a single-use link. */
export function isScheduleShareSingleUseConsumed(
  link: Pick<ScheduleShareLink, "usageLimit" | "consumedAt" | "consumedByUserId">,
  viewerUserId: string | null | undefined,
  ownerUserId: string,
): boolean {
  if (link.usageLimit !== "SINGLE_USE") return false;
  if (isScheduleShareOwner({ ownerUserId }, viewerUserId)) return false;
  if (!link.consumedAt) return false;
  if (viewerUserId && link.consumedByUserId === viewerUserId) return false;
  return true;
}

/**
 * Marks a single-use link as consumed on first non-owner access.
 * Returns false when another visitor already consumed it.
 */
export async function consumeScheduleShareLinkForVisitor(
  db: Db,
  link: Pick<
    ScheduleShareLink,
    "id" | "ownerUserId" | "usageLimit" | "consumedAt" | "consumedByUserId"
  >,
  viewerUserId: string | null | undefined,
): Promise<boolean> {
  if (link.usageLimit !== "SINGLE_USE") return true;
  if (isScheduleShareOwner(link, viewerUserId)) return true;
  if (link.consumedAt) {
    if (viewerUserId && link.consumedByUserId === viewerUserId) return true;
    return false;
  }

  const updated = await db.scheduleShareLink.updateMany({
    where: { id: link.id, consumedAt: null },
    data: {
      consumedAt: new Date(),
      consumedByUserId: viewerUserId ?? null,
    },
  });
  if (updated.count > 0) return true;

  const fresh = await db.scheduleShareLink.findUnique({
    where: { id: link.id },
    select: { consumedAt: true, consumedByUserId: true },
  });
  if (!fresh?.consumedAt) return true;
  if (viewerUserId && fresh.consumedByUserId === viewerUserId) return true;
  return false;
}
