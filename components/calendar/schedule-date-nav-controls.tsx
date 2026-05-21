"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/** Shared chrome for prev / Today / next — matches Home schedule toolbar. */
export const scheduleDateNavControlClass = cn(
  "border border-[#2563EB]/55 bg-white text-[#1D4ED8] shadow-sm transition",
  "hover:bg-blue-50/90 hover:border-[#2563EB]/80 active:scale-95",
  "dark:border-blue-500/60 dark:bg-card dark:text-blue-300 dark:hover:bg-blue-950/40",
);

export function ScheduleDateNavControls({
  prevAria,
  nextAria,
  todayAria,
  todayLabel,
  onStepPrev,
  onStepNext,
  onJumpToday,
  prevDisabled = false,
  nextDisabled = false,
  className,
}: {
  prevAria: string;
  nextAria: string;
  todayAria: string;
  todayLabel: string;
  onStepPrev: () => void;
  onStepNext: () => void;
  onJumpToday: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-0.5 sm:gap-1", className)}>
      <button
        type="button"
        onClick={onStepPrev}
        disabled={prevDisabled}
        aria-label={prevAria}
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          scheduleDateNavControlClass,
          "disabled:pointer-events-none disabled:opacity-40",
        )}
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={2.5} aria-hidden />
      </button>
      <button
        type="button"
        onClick={onJumpToday}
        aria-label={todayAria}
        className={cn(
          "shrink-0 rounded-full px-2.5 py-1.5 text-[12px] font-semibold leading-none sm:px-3.5 sm:text-[13px]",
          scheduleDateNavControlClass,
        )}
      >
        {todayLabel}
      </button>
      <button
        type="button"
        onClick={onStepNext}
        disabled={nextDisabled}
        aria-label={nextAria}
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          scheduleDateNavControlClass,
          "disabled:pointer-events-none disabled:opacity-40",
        )}
      >
        <ChevronRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
      </button>
    </div>
  );
}
