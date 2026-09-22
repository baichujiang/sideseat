import { type Prisma } from "@prisma/client";
import { INTERNAL_ACCOUNT_PREFIXES, INTERNAL_ACCOUNT_USERNAMES, isInternalAccount } from "@/lib/analytics/layer2-outcome-pilot";

export function realExploreIntentWhere(
  userId: string,
  viewer: { username: string; school: string },
  now: Date,
): Prisma.WeeklyIntentWhereInput {
  return {
    userId: { not: userId }, status: "ACTIVE", exploreVisible: true,
    exploreResponseToId: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    user: {
      school: viewer.school, onboardingComplete: true, isGuest: false, verifiedStudent: true,
      hideFromDiscovery: false, hideFromRecommendations: false,
      moderationBlocks: { none: { isActive: true } },
      ...(!isInternalAccount(viewer.username) ? { NOT: { OR: [
        { username: { in: [...INTERNAL_ACCOUNT_USERNAMES], mode: "insensitive" as const } },
        ...INTERNAL_ACCOUNT_PREFIXES.map(prefix => ({ username: { startsWith: prefix, mode: "insensitive" as const } })),
      ] } } : {}),
    },
  };
}
