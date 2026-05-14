import type { AppMessages } from "@/lib/i18n/messages";

import { mealVenueLabel, studyVenueLabel } from "@/lib/discover/study-meta-labels";
import type {
  DiscoverPostRowMealsMeta,
  DiscoverPostRowStudyMeta,
} from "@/lib/discover/discover-post-row";

export function formatMealsVenueLine(
  meta: DiscoverPostRowMealsMeta,
  dl: AppMessages["discoverList"],
) {
  const parts: string[] = meta.venueTags.map((t) => mealVenueLabel(t, dl));
  if (meta.venueTags.includes("OTHER") && meta.venueOtherNote?.trim()) {
    parts.push(meta.venueOtherNote.trim());
  } else if (meta.venueTags.length === 0 && meta.venueOtherNote?.trim()) {
    parts.push(meta.venueOtherNote.trim());
  }
  return parts.filter(Boolean).join(" · ");
}

export function formatStudyVenueLine(
  meta: DiscoverPostRowStudyMeta,
  dl: AppMessages["discoverList"],
) {
  const parts: string[] = meta.venues.map((v) => studyVenueLabel(v, dl));
  if (meta.venues.includes("OTHER") && meta.venueOtherNote?.trim()) {
    parts.push(meta.venueOtherNote.trim());
  } else if (meta.venues.length === 0 && meta.venueOtherNote?.trim()) {
    parts.push(meta.venueOtherNote.trim());
  }
  return parts.filter(Boolean).join(" · ");
}
