"use client";

import { useMemo } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { useLocaleContext } from "@/components/i18n/locale-provider";
import {
  formatShareCreateRangeSummary,
  formatShareExpirySummary,
} from "@/lib/schedule-share/format-share-create-summary";
import { formatMessage } from "@/lib/i18n/messages";
import { REVEAL_PRESET_KEYS_ALLOWLIST, type RevealPresetKeyAllowlisted } from "@/lib/schedule-share/reveal-config";
import {
  applyShareRangePresetToForm,
  type ScheduleShareFormState,
} from "@/lib/schedule-share/schedule-share-form-state";
import type { ShareRangePreset } from "@/lib/schedule-share/share-range-presets";
import type { ScheduleShareUsageLimitInput } from "@/lib/schedule-share/usage-limit";
import { cn } from "@/lib/utils";

export type ScheduleShareCategoryInput = {
  id: string;
  name: string;
  presetKey: string | null;
};

const FIELD_INPUT =
  "h-11 w-full rounded-xl border border-input bg-background px-3.5 text-[14px] outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

const CHIP_ROW_CLASS =
  "flex gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

function Section({
  title,
  hint,
  children,
  error,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  error?: string | null;
}) {
  return (
    <section className="space-y-2">
      <p className="text-[13px] font-semibold text-foreground">{title}</p>
      {hint ? <p className="text-[12px] leading-snug text-muted-foreground">{hint}</p> : null}
      {children}
      {error ? <p className="text-[11.5px] text-destructive">{error}</p> : null}
    </section>
  );
}

function RangeChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3 py-2 text-[13px] font-semibold transition",
        active
          ? "border-[#2563EB]/55 bg-[#EFF6FF] text-[#1D4ED8] ring-2 ring-[#2563EB]/35 dark:border-blue-400/50 dark:bg-blue-950/50 dark:text-blue-200 dark:ring-blue-400/30"
          : "border-border/70 bg-background text-muted-foreground hover:bg-muted/40 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Subheading({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] font-medium text-muted-foreground">{children}</p>;
}

export function ScheduleShareOptionsForm({
  value,
  onChange,
  baseNow,
  categories,
  rangeError,
  expiryError,
  showPrivacyPreview = true,
}: {
  value: ScheduleShareFormState;
  onChange: (next: ScheduleShareFormState) => void;
  baseNow: Date;
  categories: ScheduleShareCategoryInput[];
  rangeError?: string | null;
  expiryError?: string | null;
  showPrivacyPreview?: boolean;
}) {
  const { locale, messages: ui } = useLocaleContext();
  const s = ui.scheduleShare;

  function presetLabel(key: RevealPresetKeyAllowlisted): string {
    switch (key) {
      case "course":
        return s.presetCourse;
      case "personal":
        return s.presetPersonal;
      case "work":
        return s.presetWork;
      default:
        return s.presetOther;
    }
  }

  const rangeSummary = useMemo(() => {
    const start = new Date(value.rangeStartInput);
    const end = new Date(value.rangeEndInput);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";
    return formatShareCreateRangeSummary(start, end, locale);
  }, [value.rangeStartInput, value.rangeEndInput, locale]);

  const expirySummary = useMemo(() => {
    const exp = new Date(value.expiresInput);
    if (Number.isNaN(exp.getTime())) return "";
    const usage =
      value.usageLimit === "SINGLE_USE" ? s.linkUsageSingleUse : s.linkUsageUnlimited;
    const when = formatShareExpirySummary(exp, locale);
    return formatMessage(s.linkExpirySummary, { usage, when });
  }, [value.expiresInput, value.usageLimit, locale, s]);

  const hasRevealSelection = value.presetKeys.length > 0 || value.categoryIds.length > 0;
  const customCalendars = useMemo(() => categories.filter((c) => !c.presetKey), [categories]);

  function selectPreset(preset: ShareRangePreset) {
    onChange(applyShareRangePresetToForm(value, preset, baseNow));
  }

  return (
    <div className="space-y-4">
      {showPrivacyPreview ? (
        <p className="rounded-xl bg-muted/30 px-3 py-2.5 text-[12px] leading-snug text-muted-foreground">
          {hasRevealSelection ? s.privacyPreviewSome : s.privacyPreviewNone}
        </p>
      ) : null}

      <Section title={s.visibleRange} error={rangeError}>
        <div className={CHIP_ROW_CLASS}>
          <RangeChip active={value.rangePreset === "this_week"} onClick={() => selectPreset("this_week")}>
            {s.presetThisWeek}
          </RangeChip>
          <RangeChip active={value.rangePreset === "next_week"} onClick={() => selectPreset("next_week")}>
            {s.presetNextWeek}
          </RangeChip>
          <RangeChip active={value.rangePreset === "seven_days"} onClick={() => selectPreset("seven_days")}>
            {s.presetSevenDays}
          </RangeChip>
          <RangeChip active={value.rangePreset === "custom"} onClick={() => selectPreset("custom")}>
            {s.presetCustom}
          </RangeChip>
        </div>
        {rangeSummary ? (
          <p className="text-[12px] leading-snug text-muted-foreground">{rangeSummary}</p>
        ) : null}
        {value.rangePreset === "custom" ? (
          <div className="grid gap-2">
            <input
              type="datetime-local"
              className={FIELD_INPUT}
              value={value.rangeStartInput}
              onChange={(e) =>
                onChange({
                  ...value,
                  rangeStartInput: e.target.value,
                  rangePreset: "custom",
                })
              }
            />
            <input
              type="datetime-local"
              className={FIELD_INPUT}
              value={value.rangeEndInput}
              onChange={(e) =>
                onChange({
                  ...value,
                  rangeEndInput: e.target.value,
                  rangePreset: "custom",
                })
              }
            />
          </div>
        ) : null}
      </Section>

      <Section title={s.revealSectionTitle} hint={s.revealPresetsHint}>
        <Subheading>{s.presetsGroupLabel}</Subheading>
        <div className="space-y-2">
          {REVEAL_PRESET_KEYS_ALLOWLIST.map((key) => (
            <Checkbox
              key={key}
              checked={value.presetKeys.includes(key)}
              onChange={(checked) => {
                onChange({
                  ...value,
                  presetKeys: checked
                    ? value.presetKeys.includes(key)
                      ? value.presetKeys
                      : [...value.presetKeys, key]
                    : value.presetKeys.filter((k) => k !== key),
                });
              }}
              label={presetLabel(key)}
            />
          ))}
        </div>
        {customCalendars.length ? (
          <>
            <Subheading>{s.myCalendarsTitle}</Subheading>
            <div className="space-y-2">
              {customCalendars.map((c) => (
                <Checkbox
                  key={c.id}
                  checked={value.categoryIds.includes(c.id)}
                  onChange={(checked) => {
                    onChange({
                      ...value,
                      categoryIds: checked
                        ? value.categoryIds.includes(c.id)
                          ? value.categoryIds
                          : [...value.categoryIds, c.id]
                        : value.categoryIds.filter((x) => x !== c.id),
                    });
                  }}
                  label={c.name}
                />
              ))}
            </div>
          </>
        ) : null}
      </Section>

      <div className="space-y-2 rounded-xl border border-border/60 bg-muted/25 px-3 py-3">
        <p className="text-[13px] font-semibold">{s.meetingProposalsTitle}</p>
        <Checkbox
          checked={value.allowGuestProposals}
          onChange={(checked) => onChange({ ...value, allowGuestProposals: checked })}
          label={s.allowProposals}
        />
        <p className="text-[11px] leading-snug text-muted-foreground">{s.allowProposalsHelper}</p>
      </div>

      <Section title={s.linkExpiryLabel} hint={s.linkExpiryHelper} error={expiryError}>
        <Subheading>{s.linkUsageLabel}</Subheading>
        <div className={CHIP_ROW_CLASS}>
          <RangeChip
            active={value.usageLimit === "SINGLE_USE"}
            onClick={() => onChange({ ...value, usageLimit: "SINGLE_USE" as ScheduleShareUsageLimitInput })}
          >
            {s.linkUsageSingleUse}
          </RangeChip>
          <RangeChip
            active={value.usageLimit === "UNLIMITED"}
            onClick={() => onChange({ ...value, usageLimit: "UNLIMITED" })}
          >
            {s.linkUsageUnlimited}
          </RangeChip>
        </div>
        {value.usageLimit === "SINGLE_USE" ? (
          <p className="text-[11px] leading-snug text-muted-foreground">{s.linkUsageSingleUseHint}</p>
        ) : null}
        <Subheading>{s.linkExpiresAtLabel}</Subheading>
        <input
          type="datetime-local"
          className={FIELD_INPUT}
          value={value.expiresInput}
          onChange={(e) => onChange({ ...value, expiresInput: e.target.value })}
        />
        {expirySummary ? (
          <p className="text-[12px] leading-snug text-muted-foreground">{expirySummary}</p>
        ) : null}
      </Section>
    </div>
  );
}
