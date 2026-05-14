import { ClassmatePostStatus } from "@prisma/client";

/** Display-only status for buddy requests (feed + detail). */
export type BuddyRequestDisplayStatus = "open" | "expired" | "closed";

/**
 * Closed wins over expired. Unknown Prisma status falls back to `closed` (safe: do not imply joinable).
 */
export function getBuddyRequestDisplayStatus(input: {
  status: ClassmatePostStatus;
  expiresAt: Date;
  now: Date;
}): BuddyRequestDisplayStatus {
  if (input.status === ClassmatePostStatus.CLOSED) return "closed";
  if (input.expiresAt.getTime() <= input.now.getTime()) return "expired";
  if (input.status === ClassmatePostStatus.ACTIVE) return "open";
  return "closed";
}
