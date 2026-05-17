"use client";

import { Share2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/auth/api-fetch";
import { AppPushLayer } from "@/components/ui/app-push-layer";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useLocaleContext } from "@/components/i18n/locale-provider";
import {
  formatShareCreateRangeSummary,
  formatShareExpirySummary,
} from "@/lib/schedule-share/format-share-create-summary";
import { formatMessage } from "@/lib/i18n/messages";
import { REVEAL_PRESET_KEYS_ALLOWLIST, type RevealPresetKeyAllowlisted } from "@/lib/schedule-share/reveal-config";
import type { ScheduleShareUsageLimitInput } from "@/lib/schedule-share/usage-limit";
import {
  defaultShareExpiresAt,
  shareRangeForPreset,
  type ShareRangePreset,
} from "@/lib/schedule-share/share-range-presets";
import { cn } from "@/lib/utils";

const FIELD_INPUT =
  "h-11 w-full rounded-xl border border-input bg-background px-3.5 text-[14px] outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

const CHIP_ROW_CLASS =
  "flex gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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

export type ScheduleShareCategoryInput = {
  id: string;
  name: string;
  presetKey: string | null;
};

export function CreateScheduleShareDialog({
  open,
  onClose,
  calendarCategories: calendarCategoriesProp,
}: {
  open: boolean;
  onClose: () => void;
  calendarCategories?: ScheduleShareCategoryInput[];
}) {
  const { locale, messages: ui } = useLocaleContext();
  const s = ui.scheduleShare;

  const [categories, setCategories] = useState<ScheduleShareCategoryInput[]>(calendarCategoriesProp ?? []);
  const [baseNow, setBaseNow] = useState<Date>(() => new Date());
  const [rangePreset, setRangePreset] = useState<ShareRangePreset>("next_week");
  const [rangeStartInput, setRangeStartInput] = useState("");
  const [rangeEndInput, setRangeEndInput] = useState("");
  const [usageLimit, setUsageLimit] = useState<ScheduleShareUsageLimitInput>("UNLIMITED");
  const [expiresInput, setExpiresInput] = useState("");
  const [presetKeys, setPresetKeys] = useState<RevealPresetKeyAllowlisted[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [allowGuestProposals, setAllowGuestProposals] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [expiryError, setExpiryError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const applyRangePreset = useCallback((preset: Exclude<ShareRangePreset, "custom">, anchor: Date) => {
    const { start, end } = shareRangeForPreset(preset, anchor);
    setRangeStartInput(toDatetimeLocalValue(start));
    setRangeEndInput(toDatetimeLocalValue(end));
  }, []);

  const resetForm = useCallback(() => {
    const now = new Date();
    setBaseNow(now);
    applyRangePreset("next_week", now);
    setRangePreset("next_week");
    setUsageLimit("UNLIMITED");
    setExpiresInput(toDatetimeLocalValue(defaultShareExpiresAt(now)));
    setPresetKeys([]);
    setCategoryIds([]);
    setAllowGuestProposals(true);
    setShareUrl(null);
    setCopied(false);
    setErr(null);
    setRangeError(null);
    setExpiryError(null);
  }, [applyRangePreset]);

  useEffect(() => {
    if (!open) return;
    resetForm();
  }, [open, resetForm]);

  useEffect(() => {
    if (calendarCategoriesProp?.length) {
      setCategories(calendarCategoriesProp);
    }
  }, [calendarCategoriesProp]);

  useEffect(() => {
    if (!open || calendarCategoriesProp?.length) return;
    let cancelled = false;
    (async () => {
      const res = await apiFetch("/api/calendar/categories");
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload.success !== true || cancelled) return;
      const rows: ScheduleShareCategoryInput[] = (payload.data ?? []).map(
        (c: { id: string; name: string; presetKey: string | null }) => ({
          id: c.id,
          name: c.name,
          presetKey: c.presetKey,
        }),
      );
      setCategories(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, calendarCategoriesProp]);

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
    const start = new Date(rangeStartInput);
    const end = new Date(rangeEndInput);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";
    return formatShareCreateRangeSummary(start, end, locale);
  }, [rangeStartInput, rangeEndInput, locale]);

  const expirySummary = useMemo(() => {
    const exp = new Date(expiresInput);
    if (Number.isNaN(exp.getTime())) return "";
    const usage =
      usageLimit === "SINGLE_USE" ? s.linkUsageSingleUse : s.linkUsageUnlimited;
    const when = formatShareExpirySummary(exp, locale);
    return formatMessage(s.linkExpirySummary, { usage, when });
  }, [expiresInput, usageLimit, locale, s]);

  const hasRevealSelection = presetKeys.length > 0 || categoryIds.length > 0;
  const customCalendars = useMemo(() => categories.filter((c) => !c.presetKey), [categories]);

  function selectPreset(preset: ShareRangePreset) {
    if (preset !== "custom") {
      applyRangePreset(preset, baseNow);
    }
    setRangePreset(preset);
    setRangeError(null);
  }

  async function submit() {
    setBusy(true);
    setErr(null);
    setRangeError(null);
    setExpiryError(null);
    try {
      const rangeStart = new Date(rangeStartInput);
      const rangeEnd = new Date(rangeEndInput);
      if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) {
        setRangeError(s.invalidRange);
        return;
      }
      if (rangeEnd <= rangeStart) {
        setRangeError(s.invalidRange);
        return;
      }

      let expiresAt: string | undefined;
      if (expiresInput.trim()) {
        const exp = new Date(expiresInput);
        if (Number.isNaN(exp.getTime())) {
          setExpiryError(s.invalidRange);
          return;
        }
        expiresAt = exp.toISOString();
      }

      const body = {
        rangeStart: rangeStart.toISOString(),
        rangeEnd: rangeEnd.toISOString(),
        revealConfig: { categoryIds, presetKeys },
        allowGuestProposals,
        usageLimit,
        expiresAt,
      };

      let res: Response;
      try {
        res = await apiFetch("/api/schedule-shares", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch {
        setErr(s.networkError);
        return;
      }

      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload.success !== true) {
        const msg = typeof payload.error === "string" ? payload.error : s.createFailed;
        setErr(msg);
        return;
      }
      const url = payload.data?.shareUrl;
      if (typeof url !== "string") {
        setErr(s.createFailed);
        return;
      }
      setShareUrl(url);
    } finally {
      setBusy(false);
    }
  }

  async function copyUrl() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setErr(s.copyFailed);
    }
  }

  return (
    <AppPushLayer open={open} onClose={onClose} zClassName="z-50" panelClassName="w-[min(100vw,28rem)] border-0">
      <div className="flex h-full min-h-0 flex-col bg-background pt-[env(safe-area-inset-top)]">
        <div className="shrink-0 px-4 pb-2 pt-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                <Share2 className="h-4.5 w-4.5" strokeWidth={2.25} />
              </span>
              <div>
                <h2 className="text-sm font-semibold">{s.dialogTitle}</h2>
                <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{s.dialogSubtitle}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={ui.common.close}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" strokeWidth={2.25} />
            </button>
          </div>

          {!shareUrl ? (
            <p className="mt-3 rounded-xl bg-muted/30 px-3 py-2.5 text-[12px] leading-snug text-muted-foreground">
              {hasRevealSelection ? s.privacyPreviewSome : s.privacyPreviewNone}
            </p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-2">
          {shareUrl ? (
            <div className="space-y-3 rounded-2xl border border-border/70 bg-card/40 px-3 py-3">
              <p className="text-[13px] font-medium text-foreground">{s.shareReady}</p>
              <p className="break-all text-[12px] leading-snug text-muted-foreground">{shareUrl}</p>
              <p className="text-[11px] leading-snug text-amber-800 dark:text-amber-200">{s.shareUrlHelp}</p>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" className="h-11 flex-1 rounded-xl" onClick={copyUrl}>
                  {copied ? s.copied : s.copyLink}
                </Button>
                <Button
                  type="button"
                  className="h-11 flex-1 rounded-xl"
                  onClick={() => {
                    setShareUrl(null);
                    onClose();
                  }}
                >
                  {ui.common.done}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Section title={s.visibleRange} error={rangeError}>
                <div className={CHIP_ROW_CLASS}>
                  <RangeChip active={rangePreset === "this_week"} onClick={() => selectPreset("this_week")}>
                    {s.presetThisWeek}
                  </RangeChip>
                  <RangeChip active={rangePreset === "next_week"} onClick={() => selectPreset("next_week")}>
                    {s.presetNextWeek}
                  </RangeChip>
                  <RangeChip active={rangePreset === "seven_days"} onClick={() => selectPreset("seven_days")}>
                    {s.presetSevenDays}
                  </RangeChip>
                  <RangeChip active={rangePreset === "custom"} onClick={() => selectPreset("custom")}>
                    {s.presetCustom}
                  </RangeChip>
                </div>
                {rangeSummary ? (
                  <p className="text-[12px] leading-snug text-muted-foreground">{rangeSummary}</p>
                ) : null}
                {rangePreset === "custom" ? (
                  <div className="grid gap-2">
                    <input
                      type="datetime-local"
                      className={FIELD_INPUT}
                      value={rangeStartInput}
                      onChange={(e) => {
                        setRangeStartInput(e.target.value);
                        setRangePreset("custom");
                        setRangeError(null);
                      }}
                    />
                    <input
                      type="datetime-local"
                      className={FIELD_INPUT}
                      value={rangeEndInput}
                      onChange={(e) => {
                        setRangeEndInput(e.target.value);
                        setRangePreset("custom");
                        setRangeError(null);
                      }}
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
                      checked={presetKeys.includes(key)}
                      onChange={(checked) => {
                        setPresetKeys((prev) =>
                          checked
                            ? prev.includes(key)
                              ? prev
                              : [...prev, key]
                            : prev.filter((k) => k !== key),
                        );
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
                          checked={categoryIds.includes(c.id)}
                          onChange={(checked) => {
                            setCategoryIds((prev) =>
                              checked
                                ? prev.includes(c.id)
                                  ? prev
                                  : [...prev, c.id]
                                : prev.filter((x) => x !== c.id),
                            );
                          }}
                          label={c.name}
                        />
                      ))}
                    </div>
                  </>
                ) : null}
              </Section>

              <div className="rounded-xl border border-border/60 bg-muted/25 px-3 py-3 space-y-2">
                <p className="text-[13px] font-semibold">{s.meetingProposalsTitle}</p>
                <Checkbox
                  checked={allowGuestProposals}
                  onChange={setAllowGuestProposals}
                  label={s.allowProposals}
                />
                <p className="text-[11px] leading-snug text-muted-foreground">{s.allowProposalsHelper}</p>
              </div>

              <Section title={s.linkExpiryLabel} hint={s.linkExpiryHelper} error={expiryError}>
                <Subheading>{s.linkUsageLabel}</Subheading>
                <div className={CHIP_ROW_CLASS}>
                  <RangeChip
                    active={usageLimit === "SINGLE_USE"}
                    onClick={() => setUsageLimit("SINGLE_USE")}
                  >
                    {s.linkUsageSingleUse}
                  </RangeChip>
                  <RangeChip
                    active={usageLimit === "UNLIMITED"}
                    onClick={() => setUsageLimit("UNLIMITED")}
                  >
                    {s.linkUsageUnlimited}
                  </RangeChip>
                </div>
                {usageLimit === "SINGLE_USE" ? (
                  <p className="text-[11px] leading-snug text-muted-foreground">{s.linkUsageSingleUseHint}</p>
                ) : null}
                <Subheading>{s.linkExpiresAtLabel}</Subheading>
                <input
                  type="datetime-local"
                  className={FIELD_INPUT}
                  value={expiresInput}
                  onChange={(e) => {
                    setExpiresInput(e.target.value);
                    setExpiryError(null);
                  }}
                />
                {expirySummary ? (
                  <p className="text-[12px] leading-snug text-muted-foreground">{expirySummary}</p>
                ) : null}
              </Section>
            </>
          )}
        </div>

        {!shareUrl ? (
          <div className="border-t border-border/60 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            {err ? <p className="mb-2 text-[11.5px] text-destructive">{err}</p> : null}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" className="h-11 flex-1 rounded-xl" onClick={onClose}>
                {ui.common.cancel}
              </Button>
              <Button type="button" className="h-11 flex-1 rounded-xl" onClick={submit} disabled={busy}>
                {busy ? s.creating : s.createLink}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </AppPushLayer>
  );
}
