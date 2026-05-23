import { z } from "zod";

import { DEFAULT_USER_CALENDAR_PRESETS } from "@/lib/calendar/default-user-calendar-categories";
import type { AppLocale } from "@/lib/i18n/app-locale";

export const CALENDAR_CATEGORY_PRESET_KEYS = [
  "personal",
  "work",
  "course",
  "study",
  "meal",
  "language",
  "sports",
  "other",
] as const satisfies ReadonlyArray<
  (typeof DEFAULT_USER_CALENDAR_PRESETS)[number]["presetKey"]
>;

export const llmCategoryPresetSchema = z.enum(CALENDAR_CATEGORY_PRESET_KEYS).nullish();

export type CalendarCategoryPresetKey = (typeof CALENDAR_CATEGORY_PRESET_KEYS)[number];

export type UserCategoryForMapping = {
  id: string;
  name: string;
  presetKey: string | null;
};

export type CategoryPresetResolve =
  | { status: "none" }
  | { status: "matched"; categoryId: string; presetKey: CalendarCategoryPresetKey }
  | { status: "invalid_preset"; presetKey: string }
  | { status: "not_available"; presetKey: CalendarCategoryPresetKey };

export function resolveCategoryFromPreset(
  preset: string | null | undefined,
  categories: UserCategoryForMapping[],
): CategoryPresetResolve {
  const key = preset?.trim().toLowerCase() ?? "";
  if (!key) {
    return { status: "none" };
  }
  if (!(CALENDAR_CATEGORY_PRESET_KEYS as readonly string[]).includes(key)) {
    return { status: "invalid_preset", presetKey: key };
  }
  const typed = key as CalendarCategoryPresetKey;
  const match = categories.find((c) => c.presetKey?.toLowerCase() === key);
  if (!match) {
    return { status: "not_available", presetKey: typed };
  }
  return { status: "matched", categoryId: match.id, presetKey: typed };
}

export function categoryMappingWarning(
  locale: AppLocale,
  eventIndex: number,
  reason: "unclear" | "invalid_preset" | "preset_not_available",
  preset?: string,
): string {
  const n = eventIndex + 1;
  if (locale === "zh-CN") {
    if (reason === "unclear") {
      return `第 ${n} 条：未识别日历类别，请在预览中选择。`;
    }
    if (reason === "invalid_preset") {
      return `第 ${n} 条：类别「${preset ?? "?"}」无效，请在预览中选择。`;
    }
    return `第 ${n} 条：类别「${preset ?? "?"}」暂无对应列表，请在预览中选择。`;
  }
  if (reason === "unclear") {
    return `Event ${n}: category unclear — pick one in the preview.`;
  }
  if (reason === "invalid_preset") {
    return `Event ${n}: invalid category "${preset ?? "?"}" — pick one in the preview.`;
  }
  return `Event ${n}: category "${preset ?? "?"}" is not on your calendar lists — pick one in the preview.`;
}
