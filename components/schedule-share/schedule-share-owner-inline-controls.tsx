"use client";

import { useLocaleContext } from "@/components/i18n/locale-provider";
import { ScheduleShareRevealCategoryChips } from "@/components/schedule-share/schedule-share-reveal-category-chips";
import {
  isAllCategoriesRevealed,
  isNoCategoriesRevealed,
  type ShareRevealCategoryInput,
} from "@/lib/schedule-share/reveal-category-selection";
import type { ScheduleShareUsageLimitInput } from "@/lib/schedule-share/usage-limit";
import { cn } from "@/lib/utils";

const CHIP_ROW_CLASS =
  "flex gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

function Chip({
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
        "shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition",
        active
          ? "border-[#2563EB]/55 bg-[#EFF6FF] text-[#1D4ED8] ring-2 ring-[#2563EB]/35 dark:border-blue-400/50 dark:bg-blue-950/50 dark:text-blue-200"
          : "border-border/70 bg-background text-muted-foreground hover:bg-muted/40",
      )}
    >
      {children}
    </button>
  );
}

export function ScheduleShareOwnerInlineControls({
  categories,
  revealedCategoryIds,
  onRevealedCategoryIdsChange,
  usageLimit,
  onUsageLimitChange,
  expiresInDays,
  onExpiresInDaysChange,
  availabilityStartMinutes,
  onAvailabilityStartMinutesChange,
  availabilityEndMinutes,
  onAvailabilityEndMinutesChange,
  allowGuestProposals,
  onAllowGuestProposalsChange,
}: {
  categories: readonly ShareRevealCategoryInput[];
  revealedCategoryIds: string[];
  onRevealedCategoryIdsChange: (next: string[]) => void;
  usageLimit: ScheduleShareUsageLimitInput;
  onUsageLimitChange: (next: ScheduleShareUsageLimitInput) => void;
  expiresInDays: 7 | 14 | 30;
  onExpiresInDaysChange: (next: 7 | 14 | 30) => void;
  availabilityStartMinutes: number;
  onAvailabilityStartMinutesChange: (next: number) => void;
  availabilityEndMinutes: number;
  onAvailabilityEndMinutesChange: (next: number) => void;
  allowGuestProposals: boolean;
  onAllowGuestProposalsChange: (next: boolean) => void;
}) {
  const { messages: ui } = useLocaleContext();
  const s = ui.scheduleShare;

  return (
    <div className="shrink-0 space-y-2.5 pb-1">
      <div className="space-y-1.5">
        <p className="text-[12px] font-semibold text-foreground">{s.availabilityHoursLabel}</p>
        <div className="flex items-center gap-2">
          <select
            value={availabilityStartMinutes}
            onChange={(event) => {
              const next = Number(event.target.value);
              onAvailabilityStartMinutesChange(next);
              if (availabilityEndMinutes <= next) {
                onAvailabilityEndMinutesChange(Math.min(next + 60, 24 * 60));
              }
            }}
            aria-label={s.availabilityStartLabel}
            className="h-10 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-[13px] font-medium text-foreground"
          >
            {Array.from({ length: 48 }, (_, index) => index * 30)
              .filter((value) => value < availabilityEndMinutes)
              .map((value) => (
                <option key={value} value={value}>{formatMinuteOfDay(value)}</option>
              ))}
          </select>
          <span className="text-muted-foreground">–</span>
          <select
            value={availabilityEndMinutes}
            onChange={(event) => onAvailabilityEndMinutesChange(Number(event.target.value))}
            aria-label={s.availabilityEndLabel}
            className="h-10 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-[13px] font-medium text-foreground"
          >
            {Array.from({ length: 48 }, (_, index) => (index + 1) * 30)
              .filter((value) => value > availabilityStartMinutes)
              .map((value) => (
                <option key={value} value={value}>{formatMinuteOfDay(value)}</option>
              ))}
          </select>
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">{s.availabilityHoursHint}</p>
      </div>

      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border/70 bg-background px-3 py-2">
        <input
          type="checkbox"
          checked={allowGuestProposals}
          onChange={(event) => onAllowGuestProposalsChange(event.target.checked)}
          className="h-4 w-4 rounded border-input accent-primary"
        />
        <span className="min-w-0">
          <span className="block text-[12px] font-semibold text-foreground">{s.allowProposals}</span>
          <span className="block text-[11px] leading-snug text-muted-foreground">
            {s.allowProposalsHelper}
          </span>
        </span>
      </label>

      <div className="space-y-1.5">
        <p className="text-[12px] font-semibold text-foreground">{s.revealSectionTitle}</p>
        <ScheduleShareRevealCategoryChips
          categories={categories}
          revealedCategoryIds={revealedCategoryIds}
          onRevealedCategoryIdsChange={onRevealedCategoryIdsChange}
        />
        {isNoCategoriesRevealed(categories, revealedCategoryIds) ? (
          <p className="text-[11px] leading-snug text-muted-foreground">{s.privacyPreviewNone}</p>
        ) : isAllCategoriesRevealed(categories, revealedCategoryIds) ? null : (
          <p className="text-[11px] leading-snug text-muted-foreground">{s.privacyPreviewSome}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <p className="text-[12px] font-semibold text-foreground">{s.linkUsageLabel}</p>
        <div className="flex items-center gap-2">
          <div className={cn(CHIP_ROW_CLASS, "min-w-0 shrink-0")}>
            <Chip
              active={usageLimit === "SINGLE_USE"}
              onClick={() => onUsageLimitChange("SINGLE_USE")}
            >
              {s.linkUsageSingleUse}
            </Chip>
            <Chip
              active={usageLimit === "UNLIMITED"}
              onClick={() => onUsageLimitChange("UNLIMITED")}
            >
              {s.linkUsageUnlimited}
            </Chip>
          </div>
          {usageLimit === "UNLIMITED" ? (
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <span className="whitespace-nowrap text-[11px] font-medium text-muted-foreground">
                {s.linkExpiryLabel}
              </span>
              <div className="flex gap-1">
                {([7, 14, 30] as const).map((days) => (
                  <Chip
                    key={days}
                    active={expiresInDays === days}
                    onClick={() => onExpiresInDaysChange(days)}
                  >
                    {days}d
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function formatMinuteOfDay(value: number): string {
  if (value === 24 * 60) return "24:00";
  const hours = String(Math.floor(value / 60)).padStart(2, "0");
  const minutes = String(value % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}
