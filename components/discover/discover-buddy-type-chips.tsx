"use client";

import { ClassmatePostCategory } from "@prisma/client";

import { ALL_BUDDY_CATEGORIES, buddyTypeLabel } from "@/lib/discover/buddy-type-labels";
import type { AppMessages } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

export type BuddyTypeChipValue = "all" | ClassmatePostCategory;

const CHIP_ORDER: BuddyTypeChipValue[] = ["all", ...ALL_BUDDY_CATEGORIES];

function chipLabel(value: BuddyTypeChipValue, buddy: AppMessages["discoverBuddy"]): string {
  if (value === "all") return buddy.typeChipAll;
  return buddyTypeLabel(value, buddy);
}

export function DiscoverBuddyTypeChips({
  value,
  onChange,
  labels,
}: {
  value: BuddyTypeChipValue;
  onChange: (next: BuddyTypeChipValue) => void;
  labels: AppMessages["discoverBuddy"];
}) {
  return (
    <div
      role="group"
      aria-label={labels.typeChipsAria}
      className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {CHIP_ORDER.map((chip) => {
        const selected = value === chip;
        return (
          <button
            key={chip}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(chip)}
            className={cn(
              "shrink-0 touch-manipulation rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
              selected
                ? "border-classmates-blue-border bg-classmates-blue-soft text-classmates-blue"
                : "border-border/80 bg-white/90 text-foreground/80 hover:bg-muted/50 dark:bg-card/80",
            )}
          >
            {chipLabel(chip, labels)}
          </button>
        );
      })}
    </div>
  );
}
