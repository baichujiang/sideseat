import { REVEAL_PRESET_KEYS_ALLOWLIST } from "@/lib/schedule-share/reveal-config";
import { defaultShareExpiresAt } from "@/lib/schedule-share/share-range-presets";
import {
  shareDateKeysForNextDayCount,
  shareRangeFromSelectedDateKeys,
  sortedShareIncludedDates,
} from "@/lib/schedule-share/share-selected-days";
import type { ScheduleShareUsageLimitInput } from "@/lib/schedule-share/usage-limit";

export function buildDefaultScheduleShareCreatePayload(baseNow = new Date()) {
  const selected = shareDateKeysForNextDayCount(3, baseNow);
  const { rangeStart, rangeEnd } = shareRangeFromSelectedDateKeys(selected);
  return {
    rangeStart: rangeStart.toISOString(),
    rangeEnd: rangeEnd.toISOString(),
    revealConfig: {
      categoryIds: [] as string[],
      presetKeys: [...REVEAL_PRESET_KEYS_ALLOWLIST],
      includedDates: sortedShareIncludedDates(selected),
    },
    allowGuestProposals: true,
    usageLimit: "SINGLE_USE" as ScheduleShareUsageLimitInput,
    expiresAt: defaultShareExpiresAt(baseNow).toISOString(),
  };
}

export { pathFromScheduleShareUrl } from "@/lib/schedule-share/share-link-urls";
