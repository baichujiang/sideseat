"use client";

import { addDays } from "date-fns";
import { Share2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BackLink } from "@/components/nav/back-link";
import { Button } from "@/components/ui/button";
import { useLocaleContext } from "@/components/i18n/locale-provider";
import { ScheduleShareOwnerInlineControls } from "@/components/schedule-share/schedule-share-owner-inline-controls";
import { ScheduleShareOwnerPreview } from "@/components/schedule-share/schedule-share-owner-preview";
import {
  HOME_CALENDAR_VISIBLE_DAYS_DEFAULT,
  readHomeCalendarVisibleDaysFromStorage,
  writeHomeCalendarVisibleDaysToStorage,
} from "@/lib/calendar/home-calendar-preferences";
import { apiFetch } from "@/lib/auth/api-fetch";
import { formatMessage } from "@/lib/i18n/messages";
import type { PublicScheduleShareSnapshot } from "@/lib/schedule-share/build-schedule-share-snapshot";
import { formatShareSelectedDaysSummary } from "@/lib/schedule-share/format-share-create-summary";
import { parseRevealConfigJson } from "@/lib/schedule-share/reveal-config";
import {
  initialRevealedCategoryIds,
  revealConfigFromRevealedCategoryIds,
  shareRevealCategoryColor,
  uncategorizedRevealCategory,
  type ShareRevealCategoryInput,
} from "@/lib/schedule-share/reveal-category-selection";
import { berlinStartOfCalendarDay } from "@/lib/calendar/schedule-berlin";
import {
  berlinDateFromDateKey,
  initialShareSelectedDateKeys,
  shareDateKeysForQuickPreset,
  shareRangeFromSelectedDateKeys,
  sortedShareIncludedDates,
  toggleShareDaySelection,
  type ShareDayQuickPreset,
} from "@/lib/schedule-share/share-selected-days";
import type { ScheduleShareUsageLimitInput } from "@/lib/schedule-share/usage-limit";

export type ScheduleShareLinkSettingsInput = {
  rangeStart: string;
  rangeEnd: string;
  revealConfig: unknown;
  allowGuestProposals: boolean;
  usageLimit: ScheduleShareUsageLimitInput;
  expiresAt: string;
  createdAt: string;
};

function expiresInDaysFromDate(expiresAt: Date): 7 | 14 | 30 {
  const days = Math.round((expiresAt.getTime() - Date.now()) / 86_400_000);
  if (days <= 8) return 7;
  if (days <= 21) return 14;
  return 30;
}

function expiresAtFromDays(days: 7 | 14 | 30): Date {
  return addDays(new Date(), days);
}

export function ScheduleShareOwnerClient({
  token,
  backHref = "/home",
  shareUrl,
  initialSnapshot,
  linkSettings,
  calendarCategories,
}: {
  token: string;
  backHref?: string;
  shareUrl: string;
  initialSnapshot: PublicScheduleShareSnapshot;
  linkSettings: ScheduleShareLinkSettingsInput;
  calendarCategories: readonly ShareRevealCategoryInput[];
}) {
  const { locale, messages: ui } = useLocaleContext();
  const s = ui.scheduleShare;
  const initialRange = useMemo(
    () => ({
      start: new Date(linkSettings.rangeStart),
      end: new Date(linkSettings.rangeEnd),
    }),
    [linkSettings.rangeStart, linkSettings.rangeEnd],
  );
  const initialReveal = useMemo(() => {
    try {
      return parseRevealConfigJson(linkSettings.revealConfig);
    } catch {
      return { categoryIds: [], presetKeys: [], includedDates: [] };
    }
  }, [linkSettings.revealConfig]);

  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [focusDate, setFocusDate] = useState(() => berlinStartOfCalendarDay(initialRange.start));
  const [calendarVisibleDays, setCalendarVisibleDays] = useState(HOME_CALENDAR_VISIBLE_DAYS_DEFAULT);
  const [selectedShareDateKeys, setSelectedShareDateKeys] = useState<Set<string>>(() =>
    initialShareSelectedDateKeys(initialRange.start, initialRange.end, initialReveal.includedDates),
  );
  const revealCategories = useMemo<ShareRevealCategoryInput[]>(
    () => [
      uncategorizedRevealCategory(s.uncategorizedCategory),
      ...calendarCategories.map((c) => ({
        id: c.id,
        name: c.name,
        presetKey: c.presetKey,
        color: shareRevealCategoryColor(c.color),
      })),
    ],
    [calendarCategories, s.uncategorizedCategory],
  );
  const [revealedCategoryIds, setRevealedCategoryIds] = useState<string[]>(() =>
    initialRevealedCategoryIds(revealCategories, initialReveal),
  );
  const [usageLimit, setUsageLimit] = useState<ScheduleShareUsageLimitInput>(linkSettings.usageLimit);
  const [expiresInDays, setExpiresInDays] = useState<7 | 14 | 30>(() =>
    expiresInDaysFromDate(new Date(linkSettings.expiresAt)),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const skipNextSave = useRef(true);

  useEffect(() => {
    setCalendarVisibleDays(readHomeCalendarVisibleDaysFromStorage());
  }, []);

  useEffect(() => {
    writeHomeCalendarVisibleDaysToStorage(calendarVisibleDays);
  }, [calendarVisibleDays]);

  const handleSelectShareDay = useCallback(
    (date: Date) => {
      const { next, atCapacity } = toggleShareDaySelection(selectedShareDateKeys, date);
      if (atCapacity) {
        setSaveError(s.ownerShareMaxDays);
        return;
      }
      setSaveError(null);
      setSelectedShareDateKeys(next);
    },
    [selectedShareDateKeys, s.ownerShareMaxDays],
  );

  const handleClearAllShareDays = useCallback(() => {
    setSelectedShareDateKeys(new Set());
    setSaveError(null);
  }, []);

  const handleQuickSelectShareDays = useCallback((preset: ShareDayQuickPreset) => {
    const next = shareDateKeysForQuickPreset(preset);
    setSaveError(null);
    setSelectedShareDateKeys(next);
    const firstKey = sortedShareIncludedDates(next)[0];
    if (firstKey) setFocusDate(berlinDateFromDateKey(firstKey));
  }, []);

  const selectedDaysCountLabel = useMemo(() => {
    const count = selectedShareDateKeys.size;
    if (count === 0) return s.ownerNoShareDaysSelected;
    return formatMessage(s.ownerShareDaysCount, { count });
  }, [selectedShareDateKeys.size, s.ownerNoShareDaysSelected, s.ownerShareDaysCount]);

  const rangeDetail = useMemo(() => {
    if (selectedShareDateKeys.size === 0) return "";
    return formatShareSelectedDaysSummary(selectedShareDateKeys, locale);
  }, [selectedShareDateKeys, locale]);

  const persist = useCallback(async () => {
    if (selectedShareDateKeys.size === 0) return;
    const { rangeStart, rangeEnd } = shareRangeFromSelectedDateKeys(selectedShareDateKeys);
    const includedDates = sortedShareIncludedDates(selectedShareDateKeys);
    const { categoryIds, presetKeys, hideAllDetails } = revealConfigFromRevealedCategoryIds(
      revealCategories,
      revealedCategoryIds,
    );
    setSaving(true);
    setSaveError(null);
    try {
      const res = await apiFetch(`/api/schedule-shares/by-token/${encodeURIComponent(token)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rangeStart: rangeStart.toISOString(),
          rangeEnd: rangeEnd.toISOString(),
          revealConfig: { categoryIds, presetKeys, hideAllDetails, includedDates },
          allowGuestProposals: true,
          usageLimit,
          expiresAt: expiresAtFromDays(expiresInDays).toISOString(),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload.success !== true) {
        const msg = typeof payload.error === "string" ? payload.error : s.createFailed;
        setSaveError(msg);
        return;
      }
      if (payload.data?.snapshot) {
        setSnapshot(payload.data.snapshot as PublicScheduleShareSnapshot);
      }
    } catch {
      setSaveError(s.networkError);
    } finally {
      setSaving(false);
    }
  }, [
    selectedShareDateKeys,
    revealCategories,
    revealedCategoryIds,
    usageLimit,
    expiresInDays,
    token,
    s,
  ]);

  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      void persist();
    }, 450);
    return () => window.clearTimeout(timer);
  }, [
    selectedShareDateKeys,
    revealedCategoryIds,
    usageLimit,
    expiresInDays,
    persist,
  ]);

  async function generateShareLinkForGuests() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setSaveError(s.copyFailed);
    }
  }

  return (
    <div className="mx-auto flex h-dvh max-h-dvh min-w-0 max-w-md flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center gap-2 border-b border-border/50 px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <BackLink href={backHref} fallback="/home" label={ui.common.back} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-semibold">{s.ownerPageTitle}</h1>
          {saving ? (
            <p className="truncate text-[11px] text-muted-foreground">{s.savingSettings}</p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-9 shrink-0 rounded-full px-3 text-[12px]"
          aria-label={s.generateShareLink}
          onClick={() => void generateShareLinkForGuests()}
        >
          <Share2 className="mr-1 h-3.5 w-3.5" />
          {copied ? s.shareLinkGenerated : s.generateShareLink}
        </Button>
      </header>

      {saveError ? (
        <p className="shrink-0 px-3 py-1 text-[11px] text-destructive">{saveError}</p>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
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

        <div className="shrink-0 max-h-[34vh] overflow-y-auto overscroll-y-contain">
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
    </div>
  );
}
