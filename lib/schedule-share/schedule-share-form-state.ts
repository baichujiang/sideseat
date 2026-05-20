import {
  REVEAL_PRESET_KEYS_ALLOWLIST,
  parseRevealConfigJson,
  type RevealPresetKeyAllowlisted,
} from "@/lib/schedule-share/reveal-config";
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
  presetKeys: RevealPresetKeyAllowlisted[];
  categoryIds: string[];
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
    presetKeys: [],
    categoryIds: [],
    allowGuestProposals: true,
    usageLimit: "UNLIMITED",
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
): ScheduleShareFormState {
  const reveal = parseRevealConfigJson(link.revealConfig);
  const baseNow = link.createdAt;
  return {
    rangePreset: inferShareRangePreset(link.rangeStart, link.rangeEnd, baseNow),
    rangeStartInput: toDatetimeLocalValue(link.rangeStart),
    rangeEndInput: toDatetimeLocalValue(link.rangeEnd),
    presetKeys: reveal.presetKeys.filter((k): k is RevealPresetKeyAllowlisted =>
      (REVEAL_PRESET_KEYS_ALLOWLIST as readonly string[]).includes(k),
    ),
    categoryIds: reveal.categoryIds,
    allowGuestProposals: link.allowGuestProposals,
    usageLimit: link.usageLimit,
    expiresInput: toDatetimeLocalValue(link.expiresAt),
  };
}

export function scheduleShareFormToPayload(form: ScheduleShareFormState) {
  const rangeStart = new Date(form.rangeStartInput);
  const rangeEnd = new Date(form.rangeEndInput);
  let expiresAt: string | undefined;
  if (form.expiresInput.trim()) {
    const exp = new Date(form.expiresInput);
    if (!Number.isNaN(exp.getTime())) {
      expiresAt = exp.toISOString();
    }
  }
  return {
    rangeStart: rangeStart.toISOString(),
    rangeEnd: rangeEnd.toISOString(),
    revealConfig: { categoryIds: form.categoryIds, presetKeys: form.presetKeys },
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
