import {
  shareRangeForPreset,
  type ShareRangePreset,
} from "@/lib/schedule-share/share-range-presets";

const PRESET_ORDER = ["this_week", "next_week", "seven_days"] as const;

/** Match stored range to a preset chip when within ~1 minute of the preset window. */
export function inferShareRangePreset(
  rangeStart: Date,
  rangeEnd: Date,
  baseNow: Date,
): ShareRangePreset {
  for (const preset of PRESET_ORDER) {
    const { start, end } = shareRangeForPreset(preset, baseNow);
    if (
      Math.abs(start.getTime() - rangeStart.getTime()) < 60_000 &&
      Math.abs(end.getTime() - rangeEnd.getTime()) < 60_000
    ) {
      return preset;
    }
  }
  return "custom";
}
