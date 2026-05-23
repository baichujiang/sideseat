import type { Prisma } from "@prisma/client";

import type { DiscoverActivityRow } from "@/lib/discover/discover-activity-row";
import { deriveActivityPhase } from "@/lib/discover/discover-activity-state";

export const discoverActivityForFeedInclude = {
  organizer: {
    select: {
      id: true,
      nickname: true,
      avatarUrl: true,
      moderationBlocks: { where: { isActive: true }, select: { id: true }, take: 1 },
    },
  },
  signups: {
    select: { userId: true, status: true },
  },
  _count: {
    select: {
      signups: { where: { status: "GOING" as const } },
    },
  },
} satisfies Prisma.DiscoverActivityInclude;

export type DiscoverActivityFeedRecord = Prisma.DiscoverActivityGetPayload<{
  include: typeof discoverActivityForFeedInclude;
}>;

export function prismaDiscoverActivityToRow(
  activity: DiscoverActivityFeedRecord,
  viewerUserId: string | null,
  now: Date,
): DiscoverActivityRow {
  const viewerSignup = viewerUserId
    ? activity.signups.find((s) => s.userId === viewerUserId && s.status === "GOING")
    : null;

  return {
    id: activity.id,
    organizerId: activity.organizerId,
    organizerNickname: activity.organizer.nickname?.trim() || "Student",
    organizerAvatarUrl: activity.organizer.avatarUrl,
    city: activity.city,
    school: activity.school,
    title: activity.title,
    description: activity.description,
    category: activity.category,
    startAtISO: activity.startAt.toISOString(),
    endAtISO: activity.endAt.toISOString(),
    location: activity.location,
    capacity: activity.capacity,
    status: activity.status,
    phase: deriveActivityPhase(activity, now),
    goingCount: activity._count.signups,
    viewerSignupStatus: viewerSignup ? "GOING" : null,
    isOrganizer: viewerUserId === activity.organizerId,
  };
}
