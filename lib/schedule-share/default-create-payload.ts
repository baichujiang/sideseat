import {
  defaultShareExpiresAt,
  shareRangeForPreset,
} from "@/lib/schedule-share/share-range-presets";
import type { ScheduleShareUsageLimitInput } from "@/lib/schedule-share/usage-limit";

export function buildDefaultScheduleShareCreatePayload(baseNow = new Date()) {
  const { start, end } = shareRangeForPreset("next_week", baseNow);
  return {
    rangeStart: start.toISOString(),
    rangeEnd: end.toISOString(),
    revealConfig: { categoryIds: [] as string[], presetKeys: [] as string[] },
    allowGuestProposals: true,
    usageLimit: "UNLIMITED" as ScheduleShareUsageLimitInput,
    expiresAt: defaultShareExpiresAt(baseNow).toISOString(),
  };
}

export function pathFromScheduleShareUrl(shareUrl: string): string {
  try {
    return new URL(shareUrl).pathname;
  } catch {
    const match = shareUrl.match(/\/share\/schedule\/[^?#]+/);
    return match?.[0] ?? "/home";
  }
}
