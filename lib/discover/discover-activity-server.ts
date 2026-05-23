import "server-only";

import type { User } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type { DiscoverActivityViewer } from "@/lib/discover/discover-activity-state";
import { DEFAULT_SCHOOL, normalizeSchoolCode } from "@/lib/constants/schools";

export function viewerFromUser(
  user: User | null,
  opts?: { blockedWithOrganizer?: boolean },
): DiscoverActivityViewer {
  if (!user) {
    return { userId: null, isGuest: true, school: null, blockedWithOrganizer: false };
  }
  return {
    userId: user.id,
    isGuest: Boolean(user.isGuest),
    school: normalizeSchoolCode(user.school) ?? DEFAULT_SCHOOL,
    blockedWithOrganizer: opts?.blockedWithOrganizer,
  };
}

export async function isBlockedBetween(userAId: string, userBId: string): Promise<boolean> {
  const block = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: userAId, blockedId: userBId },
        { blockerId: userBId, blockedId: userAId },
      ],
    },
    select: { id: true },
  });
  return Boolean(block);
}

export async function lockDiscoverActivityRow(activityId: string) {
  await prisma.$executeRaw`SELECT id FROM "DiscoverActivity" WHERE id = ${activityId} FOR UPDATE`;
}
