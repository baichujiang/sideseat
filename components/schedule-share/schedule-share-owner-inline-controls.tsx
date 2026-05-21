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
}: {
  categories: readonly ShareRevealCategoryInput[];
  revealedCategoryIds: string[];
  onRevealedCategoryIdsChange: (next: string[]) => void;
  usageLimit: ScheduleShareUsageLimitInput;
  onUsageLimitChange: (next: ScheduleShareUsageLimitInput) => void;
  expiresInDays: 7 | 14 | 30;
  onExpiresInDaysChange: (next: 7 | 14 | 30) => void;
}) {
  const { messages: ui } = useLocaleContext();
  const s = ui.scheduleShare;

  return (
    <div className="shrink-0 space-y-2.5 pb-1">
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
