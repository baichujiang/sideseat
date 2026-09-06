import type { DiscoverActivityRow } from "@/lib/discover/discover-activity-row";

export function toNativeDiscoverActivity(row: DiscoverActivityRow) {
  return {
    id: row.id,
    city: row.city,
    school: row.school,
    title: row.title,
    description: row.description,
    category: row.category,
    startAt: row.startAtISO,
    endAt: row.endAtISO,
    location: row.location,
    capacity: row.capacity,
    status: row.status,
    phase: row.phase,
    goingCount: row.goingCount,
    commentCount: row.commentCount,
    viewerSignupStatus: row.viewerSignupStatus,
    isOrganizer: row.isOrganizer,
    organizer: {
      id: row.organizerId,
      displayName: row.organizerNickname,
      avatarUrl: row.organizerAvatarUrl,
      verifiedStudent: row.organizerVerifiedStudent,
    },
  };
}
