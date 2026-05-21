import type { ScheduleShareUsageLimit } from "@prisma/client";

export type ScheduleShareLinkDisplayStatus = "active" | "expired" | "revoked" | "used";

export function scheduleShareLinkDisplayStatus(
  link: {
    revokedAt: Date | null;
    expiresAt: Date;
    consumedAt: Date | null;
    usageLimit: ScheduleShareUsageLimit;
  },
  now = new Date(),
): ScheduleShareLinkDisplayStatus {
  if (link.revokedAt) return "revoked";
  if (link.expiresAt.getTime() <= now.getTime()) return "expired";
  if (link.usageLimit === "SINGLE_USE" && link.consumedAt) return "used";
  return "active";
}

export function isScheduleShareLinkRevokable(
  link: Parameters<typeof scheduleShareLinkDisplayStatus>[0],
  now = new Date(),
): boolean {
  return scheduleShareLinkDisplayStatus(link, now) === "active";
}
