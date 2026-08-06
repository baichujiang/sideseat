import type { Prisma } from "@prisma/client";

import { getCurrentSemesterDateRange } from "@/lib/constants/semester";

/**
 * Course membership is intentionally simpler than the catalog semester model:
 * users stay discoverable through the current term, then fall out of matching
 * unless they add or confirm the course again.
 */
export function courseMembershipActiveUntil(now: Date = new Date()): Date {
  return getCurrentSemesterDateRange(now).end;
}

export function courseMembershipActiveUntilForSemester(
  semesterLabel: string | null | undefined,
  now: Date = new Date(),
): Date {
  const currentTermEnd = courseMembershipActiveUntil(now);
  let catalogTermEnd: Date | null = null;
  const summer = semesterLabel?.trim().match(/^SS\s+(\d{4})$/i);
  if (summer) {
    catalogTermEnd = new Date(Number(summer[1]), 8, 30, 23, 59, 59, 999);
  }

  const winter = semesterLabel?.trim().match(/^WS\s+(\d{4})(?:\/\d{2,4})?$/i);
  if (winter) {
    catalogTermEnd = new Date(
      Number(winter[1]) + 1,
      2,
      31,
      23,
      59,
      59,
      999,
    );
  }

  return catalogTermEnd && catalogTermEnd > currentTermEnd
    ? catalogTermEnd
    : currentTermEnd;
}

/** Null keeps legacy fixtures compatible; production rows are backfilled. */
export function activeCourseMembershipWhere(
  now: Date = new Date(),
): Prisma.UserCourseWhereInput {
  return {
    OR: [{ activeUntil: null }, { activeUntil: { gte: now } }],
  };
}

export function isCourseMembershipActive(
  membership: { activeUntil: Date | null } | null | undefined,
  now: Date = new Date(),
): boolean {
  return Boolean(
    membership &&
      (membership.activeUntil === null || membership.activeUntil.getTime() >= now.getTime()),
  );
}
