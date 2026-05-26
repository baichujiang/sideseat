"use client";

import { useLocaleContext } from "@/components/i18n/locale-provider";
import {
  allRevealedCategoryIds,
  isAllCategoriesRevealed,
  shareRevealCategoryColor,
  type ShareRevealCategoryInput,
} from "@/lib/schedule-share/reveal-category-selection";
import { cn } from "@/lib/utils";

const CHIP_ROW_CLASS =
  "flex gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

function CategoryVisibilityChip({
  isRevealed,
  onClick,
  name,
  color,
  showAllMode = false,
}: {
  isRevealed: boolean;
  onClick: () => void;
  name: string;
  color: string;
  /** Master chip: highlighted when every category is shown. */
  showAllMode?: boolean;
}) {
  const allRevealed = showAllMode && isRevealed;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition",
        isRevealed
          ? "border-[#2563EB]/55 bg-[#EFF6FF] text-[#1D4ED8] dark:border-blue-400/50 dark:bg-blue-950/50 dark:text-blue-200"
          : "border-muted-foreground/35 bg-muted/50 text-muted-foreground",
        allRevealed && "ring-2 ring-[#2563EB]/35 dark:ring-blue-400/30",
        !isRevealed && !showAllMode && "hover:bg-muted/70",
      )}
    >
      <span
        className={cn(
          "h-3 w-3 shrink-0 rounded-full border border-black/10 shadow-sm dark:border-white/15",
          !isRevealed && "opacity-50",
        )}
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span className="max-w-[8rem] truncate">{name}</span>
    </button>
  );
}

export function ScheduleShareRevealCategoryChips({
  categories,
  revealedCategoryIds,
  onRevealedCategoryIdsChange,
}: {
  categories: readonly ShareRevealCategoryInput[];
  revealedCategoryIds: readonly string[];
  onRevealedCategoryIdsChange: (next: string[]) => void;
}) {
  const { messages: ui } = useLocaleContext();
  const s = ui.scheduleShare;
  const revealedSet = new Set(revealedCategoryIds);
  const showAll = isAllCategoriesRevealed(categories, revealedCategoryIds);

  return (
    <div className={CHIP_ROW_CLASS}>
      {categories.length > 0 ? (
        <CategoryVisibilityChip
          isRevealed={showAll}
          showAllMode
          onClick={() =>
            onRevealedCategoryIdsChange(showAll ? [] : allRevealedCategoryIds(categories))
          }
          name={s.showAllCategories}
          color="#2563EB"
        />
      ) : null}
      {categories.map((c) => {
        const isRevealed = revealedSet.has(c.id);
        return (
          <CategoryVisibilityChip
            key={c.id}
            isRevealed={isRevealed}
            onClick={() => {
              const next = new Set(revealedSet);
              if (isRevealed) next.delete(c.id);
              else next.add(c.id);
              onRevealedCategoryIdsChange([...next].sort());
            }}
            name={c.name}
            color={shareRevealCategoryColor(c.color)}
          />
        );
      })}
    </div>
  );
}
