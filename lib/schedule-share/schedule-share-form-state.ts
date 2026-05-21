import { parseRevealConfigJson } from "@/lib/schedule-share/reveal-config";
import {
  allRevealedCategoryIds,
  initialRevealedCategoryIds,
  revealConfigFromRevealedCategoryIds,
  type ShareRevealCategoryInput,
} from "@/lib/schedule-share/reveal-category-selection";
import { inferShareRangePreset } from "@/lib/schedule-share/infer-range-preset";
import {
  defaultShareExpiresAt,
  shareRangeForPreset,
  type ShareRangePreset,
} from "@/lib/schedule-share/share-range-presets";
import type { ScheduleShareUsageLimitInput } from "@/lib/schedule-share/usage-limit";

export function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type ScheduleShareFormState = {
  rangePreset: ShareRangePreset;
  rangeStartInput: string;
  rangeEndInput: string;
  revealedCategoryIds: string[];
  allowGuestProposals: boolean;
  usageLimit: ScheduleShareUsageLimitInput;
  expiresInput: string;
};

export function defaultScheduleShareFormState(baseNow = new Date()): ScheduleShareFormState {
  const { start, end } = shareRangeForPreset("next_week", baseNow);
  return {
    rangePreset: "next_week",
    rangeStartInput: toDatetimeLocalValue(start),
    rangeEndInput: toDatetimeLocalValue(end),
    revealedCategoryIds: [],
    allowGuestProposals: true,
    usageLimit: "SINGLE_USE",
    expiresInput: toDatetimeLocalValue(defaultShareExpiresAt(baseNow)),
  };
}

export function scheduleShareFormFromLink(
  link: {
    rangeStart: Date;
    rangeEnd: Date;
    revealConfig: unknown;
    allowGuestProposals: boolean;
    usageLimit: ScheduleShareUsageLimitInput;
    expiresAt: Date;
    createdAt: Date;
  },
  categories: readonly ShareRevealCategoryInput[],
): ScheduleShareFormState {
  const reveal = parseRevealConfigJson(link.revealConfig);
  const baseNow = link.createdAt;
  return {
    rangePreset: inferShareRangePreset(link.rangeStart, link.rangeEnd, baseNow),
    rangeStartInput: toDatetimeLocalValue(link.rangeStart),
    rangeEndInput: toDatetimeLocalValue(link.rangeEnd),
    revealedCategoryIds: initialRevealedCategoryIds(categories, reveal),
    allowGuestProposals: link.allowGuestProposals,
    usageLimit: link.usageLimit,
    expiresInput: toDatetimeLocalValue(link.expiresAt),
  };
}

export function scheduleShareFormToPayload(
  form: ScheduleShareFormState,
  categories: readonly ShareRevealCategoryInput[],
) {
  const rangeStart = new Date(form.rangeStartInput);
  const rangeEnd = new Date(form.rangeEndInput);
  let expiresAt: string | undefined;
  if (form.expiresInput.trim()) {
    const exp = new Date(form.expiresInput);
    if (!Number.isNaN(exp.getTime())) {
      expiresAt = exp.toISOString();
    }
  }
  const { categoryIds, presetKeys } = revealConfigFromRevealedCategoryIds(
    categories,
    form.revealedCategoryIds,
  );
  return {
    rangeStart: rangeStart.toISOString(),
    rangeEnd: rangeEnd.toISOString(),
    revealConfig: { categoryIds, presetKeys },
    allowGuestProposals: form.allowGuestProposals,
    usageLimit: form.usageLimit,
    expiresAt,
  };
}

export function applyShareRangePresetToForm(
  form: ScheduleShareFormState,
  preset: ShareRangePreset,
  baseNow: Date,
): ScheduleShareFormState {
  if (preset === "custom") {
    return { ...form, rangePreset: "custom" };
  }
  const { start, end } = shareRangeForPreset(preset, baseNow);
  return {
    ...form,
    rangePreset: preset,
    rangeStartInput: toDatetimeLocalValue(start),
    rangeEndInput: toDatetimeLocalValue(end),
  };
}
