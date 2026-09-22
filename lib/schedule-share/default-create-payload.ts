import { defaultShareExpiresAt } from "@/lib/schedule-share/share-range-presets";
import {
  shareDateKeysForNextDayCount,
  shareRangeFromSelectedDateKeys,
  sortedShareIncludedDates,
} from "@/lib/schedule-share/share-selected-days";
import type { ScheduleShareUsageLimitInput } from "@/lib/schedule-share/usage-limit";
import {
  SCHEDULE_SHARE_DEFAULT_AVAILABILITY_END_MINUTES,
  SCHEDULE_SHARE_DEFAULT_AVAILABILITY_START_MINUTES,
} from "@/lib/schedule-share/reveal-config";

export function buildDefaultScheduleShareCreatePayload(baseNow = new Date()) {
  const selected = shareDateKeysForNextDayCount(3, baseNow);
  const { rangeStart, rangeEnd } = shareRangeFromSelectedDateKeys(selected);
  return {
    rangeStart: rangeStart.toISOString(),
    rangeEnd: rangeEnd.toISOString(),
    revealConfig: {
      categoryIds: [] as string[],
      presetKeys: [] as string[],
      hideAllDetails: true,
      includedDates: sortedShareIncludedDates(selected),
      availabilityStartMinutes: SCHEDULE_SHARE_DEFAULT_AVAILABILITY_START_MINUTES,
      availabilityEndMinutes: SCHEDULE_SHARE_DEFAULT_AVAILABILITY_END_MINUTES,
    },
    allowGuestProposals: true,
    usageLimit: "UNLIMITED" as ScheduleShareUsageLimitInput,
    expiresAt: defaultShareExpiresAt(baseNow).toISOString(),
  };
}

export { pathFromScheduleShareUrl } from "@/lib/schedule-share/share-link-urls";
