import type { DiscoverActivityCategory } from "@prisma/client";

import type { AppMessages } from "@/lib/i18n/messages";

export const ALL_DISCOVER_ACTIVITY_CATEGORIES: DiscoverActivityCategory[] = [
  "STUDY_GROUP",
  "SOCIAL",
  "SPORTS",
  "FOOD",
  "CAMPUS_EVENT",
  "OTHER",
];

export function discoverActivityCategoryLabel(
  category: DiscoverActivityCategory,
  labels: AppMessages["discoverActivity"]["categories"],
): string {
  return labels[category];
}

export function shouldShowActivityCategory(
  category: DiscoverActivityCategory | null | undefined,
): category is DiscoverActivityCategory {
  return category != null;
}
