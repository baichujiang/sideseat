"use client";

import { addDays } from "date-fns";
import { Loader2, Share2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/auth/api-fetch";
import { AppPushLayer } from "@/components/ui/app-push-layer";
import { Button } from "@/components/ui/button";
import { ScheduleShareOwnerInlineControls } from "@/components/schedule-share/schedule-share-owner-inline-controls";
import { ScheduleShareOwnerPreview } from "@/components/schedule-share/schedule-share-owner-preview";
import { useLocaleContext } from "@/components/i18n/locale-provider";
import {
  HOME_CALENDAR_VISIBLE_DAYS_DEFAULT,
  readHomeCalendarVisibleDaysFromStorage,
  writeHomeCalendarVisibleDaysToStorage,
} from "@/lib/calendar/home-calendar-preferences";
import { berlinStartOfCalendarDay } from "@/lib/calendar/schedule-berlin";
import { formatMessage } from "@/lib/i18n/messages";
import type { PublicScheduleShareSnapshot } from "@/lib/schedule-share/build-schedule-share-snapshot";
import { formatShareSelectedDaysSummary } from "@/lib/schedule-share/format-share-create-summary";
import {
  allRevealedCategoryIds,
  revealConfigFromRevealedCategoryIds,
  shareRevealCategoryColor,
  type ShareRevealCategoryInput,
} from "@/lib/schedule-share/reveal-category-selection";
import { defaultShareExpiresAt } from "@/lib/schedule-share/share-range-presets";
import {
  berlinDateFromDateKey,
  shareDateKeysForQuickPreset,
  shareRangeFromSelectedDateKeys,
  sortedShareIncludedDates,
  toggleShareDaySelection,
  type ShareDayQuickPreset,
} from "@/lib/schedule-share/share-selected-days";
import type { ScheduleShareUsageLimitInput } from "@/lib/schedule-share/usage-limit";

export type ScheduleShareCategoryInput = {
  id: string;
  name: string;
  presetKey: string | null;
  color: string;
};

function expiresAtFromDays(days: 7 | 14 | 30): Date {
  return addDays(new Date(), days);
}

export function CreateScheduleShareDialog({
  open,
  onClose,
  calendarCategories: calendarCategoriesProp,
  connectionId,
  onSentToChat,
}: {
  open: boolean;
  onClose: () => void;
  calendarCategories?: ScheduleShareCategoryInput[];
  /** When set, creates the share and posts a card in this chat instead of showing a copy-link step. */
  connectionId?: string;
  onSentToChat?: () => void;
}) {
  const { locale, messages: ui } = useLocaleContext();
  const s = ui.scheduleShare;

  const [categories, setCategories] = useState<ScheduleShareCategoryInput[]>(calendarCategoriesProp ?? []);
  const [snapshot, setSnapshot] = useState<PublicScheduleShareSnapshot | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [baseNow, setBaseNow] = useState<Date>(() => new Date());
  const [focusDate, setFocusDate] = useState(() => berlinStartOfCalendarDay(new Date()));
  const [calendarVisibleDays, setCalendarVisibleDays] = useState(HOME_CALENDAR_VISIBLE_DAYS_DEFAULT);
  const [selectedShareDateKeys, setSelectedShareDateKeys] = useState<Set<string>>(() =>
    shareDateKeysForQuickPreset("next_3_days"),
  );
  const [usageLimit, setUsageLimit] = useState<ScheduleShareUsageLimitInput>("SINGLE_USE");
  const [expiresInDays, setExpiresInDays] = useState<7 | 14 | 30>(7);
  const [revealedCategoryIds, setRevealedCategoryIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const revealCategories = useMemo<ShareRevealCategoryInput[]>(
    () =>
      categories.map((c) => ({
        id: c.id,
        name: c.name,
        presetKey: c.presetKey,
        color: shareRevealCategoryColor(c.color),
      })),
    [categories],
  );

  const resetForm = useCallback(() => {
    const now = new Date();
    setBaseNow(now);
    setFocusDate(berlinStartOfCalendarDay(now));
    setSelectedShareDateKeys(shareDateKeysForQuickPreset("next_3_days", now));
    setUsageLimit("SINGLE_USE");
    setExpiresInDays(7);
    setRevealedCategoryIds([]);
    setShareUrl(null);
    setCopied(false);
    setErr(null);
    setSnapshot(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    resetForm();
    setCalendarVisibleDays(readHomeCalendarVisibleDaysFromStorage());
  }, [open, resetForm]);

  useEffect(() => {
    writeHomeCalendarVisibleDaysToStorage(calendarVisibleDays);
  }, [calendarVisibleDays]);

  useEffect(() => {
    if (calendarCategoriesProp?.length) {
      setCategories(calendarCategoriesProp);
    }
  }, [calendarCategoriesProp]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      setPreviewLoading(true);
      setErr(null);
      try {
        const [previewRes, categoriesRes] = await Promise.all([
          apiFetch("/api/schedule-shares/owner-preview"),
          calendarCategoriesProp?.length
            ? Promise.resolve(null)
            : apiFetch("/api/calendar/categories"),
        ]);
        if (cancelled) return;

        const previewPayload = await previewRes.json().catch(() => ({}));
        if (!previewRes.ok || previewPayload.success !== true) {
          setErr(s.createFailed);
          return;
        }
        setSnapshot(previewPayload.data?.snapshot ?? null);

        if (!calendarCategoriesProp?.length && categoriesRes) {
          const catPayload = await categoriesRes.json().catch(() => ({}));
          if (categoriesRes.ok && catPayload.success === true) {
            const rows: ScheduleShareCategoryInput[] = (catPayload.data ?? []).map(
              (c: { id: string; name: string; presetKey: string | null; color: string }) => ({
                id: c.id,
                name: c.name,
                presetKey: c.presetKey,
                color: c.color,
              }),
            );
            setCategories(rows);
          }
        }
      } catch {
        if (!cancelled) setErr(s.networkError);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, calendarCategoriesProp, s]);

  useEffect(() => {
    if (revealCategories.length > 0) {
      setRevealedCategoryIds(allRevealedCategoryIds(revealCategories));
    }
  }, [revealCategories]);

  const handleSelectShareDay = useCallback(
    (date: Date) => {
      const { next, atCapacity } = toggleShareDaySelection(selectedShareDateKeys, date);
      if (atCapacity) {
        setErr(s.ownerShareMaxDays);
        return;
      }
      setErr(null);
      setSelectedShareDateKeys(next);
    },
    [selectedShareDateKeys, s.ownerShareMaxDays],
  );

  const handleClearAllShareDays = useCallback(() => {
    setSelectedShareDateKeys(new Set());
    setErr(null);
  }, []);

  const handleQuickSelectShareDays = useCallback(
    (preset: ShareDayQuickPreset) => {
      const next = shareDateKeysForQuickPreset(preset, baseNow);
      setErr(null);
      setSelectedShareDateKeys(next);
      const firstKey = sortedShareIncludedDates(next)[0];
      if (firstKey) setFocusDate(berlinDateFromDateKey(firstKey));
    },
    [baseNow],
  );

  const selectedDaysCountLabel = useMemo(() => {
    const count = selectedShareDateKeys.size;
    if (count === 0) return s.ownerNoShareDaysSelected;
    return formatMessage(s.ownerShareDaysCount, { count });
  }, [selectedShareDateKeys.size, s.ownerNoShareDaysSelected, s.ownerShareDaysCount]);

  const rangeDetail = useMemo(() => {
    if (selectedShareDateKeys.size === 0) return "";
    return formatShareSelectedDaysSummary(selectedShareDateKeys, locale);
  }, [selectedShareDateKeys, locale]);

  async function submit() {
    if (selectedShareDateKeys.size === 0) {
      setErr(s.ownerNoShareDaysSelected);
      return;
    }

    setBusy(true);
    setErr(null);
    try {
      const { rangeStart, rangeEnd } = shareRangeFromSelectedDateKeys(selectedShareDateKeys);
      const includedDates = sortedShareIncludedDates(selectedShareDateKeys);
      const { categoryIds, presetKeys } = revealConfigFromRevealedCategoryIds(
        revealCategories,
        revealedCategoryIds,
      );
      const expiresAt =
        usageLimit === "UNLIMITED"
          ? expiresAtFromDays(expiresInDays).toISOString()
          : defaultShareExpiresAt(baseNow).toISOString();

      const body = {
        rangeStart: rangeStart.toISOString(),
        rangeEnd: rangeEnd.toISOString(),
        revealConfig: { categoryIds, presetKeys, includedDates },
        allowGuestProposals: true,
        usageLimit,
        expiresAt,
      };

      const endpoint = connectionId
        ? `/api/connections/${encodeURIComponent(connectionId)}/schedule-shares`
        : "/api/schedule-shares";

      let res: Response;
      try {
        res = await apiFetch(endpoint, {
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
        const msg =
          typeof payload.error === "string"
            ? payload.error
            : connectionId
              ? s.sendToChatFailed
              : s.createFailed;
        setErr(msg);
        return;
      }
      const url = payload.data?.shareUrl;
      if (typeof url !== "string") {
        setErr(connectionId ? s.sendToChatFailed : s.createFailed);
        return;
      }
      if (connectionId) {
        onSentToChat?.();
        onClose();
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
    <AppPushLayer
      open={open}
      onClose={onClose}
      zClassName="z-50"
      panelClassName="flex h-[min(100dvh,92vh)] w-[min(100vw,28rem)] flex-col border-0"
    >
      <div className="flex h-full min-h-0 flex-col bg-background pt-[env(safe-area-inset-top)]">
        <div className="shrink-0 px-4 pb-2 pt-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                <Share2 className="h-4.5 w-4.5" strokeWidth={2.25} />
              </span>
              <div>
                <h2 className="text-sm font-semibold">{s.dialogTitle}</h2>
                <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                  {connectionId ? s.dialogSubtitleChat : s.dialogSubtitle}
                </p>
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
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-2">
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
          ) : previewLoading || !snapshot ? (
            <div className="flex flex-1 items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" strokeWidth={2} aria-hidden />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <ScheduleShareOwnerPreview
                  fillParent
                  snapshot={snapshot}
                  rangeDetail={rangeDetail}
                  busyAnonymousLabel={s.busyAnonymous}
                  focusDate={focusDate}
                  visibleDayCount={calendarVisibleDays}
                  onVisibleDayCountChange={setCalendarVisibleDays}
                  selectedShareDateKeys={selectedShareDateKeys}
                  onSelectShareDay={handleSelectShareDay}
                  dayHeaderSelectAria={s.ownerSelectShareDayAria}
                  selectedDaysCountLabel={selectedDaysCountLabel}
                  onClearAllShareDays={handleClearAllShareDays}
                  clearAllShareDaysLabel={s.ownerClearShareDays}
                  quickSelectPresets={[
                    {
                      preset: "next_3_days",
                      title: s.ownerQuickSelectNext3Days,
                      hint: s.ownerQuickSelectNext3DaysHint,
                    },
                    {
                      preset: "next_7_days",
                      title: s.ownerQuickSelectNext7Days,
                      hint: s.ownerQuickSelectNext7DaysHint,
                    },
                    {
                      preset: "next_week",
                      title: s.ownerQuickSelectNextWeek,
                      hint: s.ownerQuickSelectNextWeekHint,
                    },
                  ]}
                  onQuickSelectShareDays={handleQuickSelectShareDays}
                  revealCategories={revealCategories}
                  revealedCategoryIds={revealedCategoryIds}
                />
              </div>
              <div className="max-h-[34vh] shrink-0 overflow-y-auto overscroll-y-contain border-t border-border/50 pt-2">
                <ScheduleShareOwnerInlineControls
                  categories={revealCategories}
                  revealedCategoryIds={revealedCategoryIds}
                  onRevealedCategoryIdsChange={setRevealedCategoryIds}
                  usageLimit={usageLimit}
                  onUsageLimitChange={setUsageLimit}
                  expiresInDays={expiresInDays}
                  onExpiresInDaysChange={setExpiresInDays}
                />
              </div>
            </div>
          )}
        </div>

        {!shareUrl ? (
          <div className="shrink-0 border-t border-border/60 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            {err ? <p className="mb-2 text-[11.5px] text-destructive">{err}</p> : null}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" className="h-11 flex-1 rounded-xl" onClick={onClose}>
                {ui.common.cancel}
              </Button>
              <Button
                type="button"
                className="h-11 flex-1 rounded-xl"
                onClick={submit}
                disabled={busy || previewLoading || !snapshot}
              >
                {busy ? (connectionId ? s.sendingToChat : s.creating) : connectionId ? s.sendInChat : s.createLink}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </AppPushLayer>
  );
}
