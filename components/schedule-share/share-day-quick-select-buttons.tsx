"use client";

import { CalendarRange, Eraser } from "lucide-react";

import type { ShareDayQuickPreset } from "@/lib/schedule-share/share-selected-days";
import { cn } from "@/lib/utils";

const PRESET_CARD_CLASS: Record<ShareDayQuickPreset, string> = {
  next_3_days:
    "border-sky-300/70 bg-sky-50/95 hover:border-sky-400 hover:bg-sky-100/95 dark:border-sky-700/55 dark:bg-sky-950/45 dark:hover:border-sky-600 dark:hover:bg-sky-950/70",
  next_7_days:
    "border-[#93C5FD]/80 bg-[#EFF6FF]/95 hover:border-[#60A5FA] hover:bg-blue-50 dark:border-blue-600/45 dark:bg-blue-950/50 dark:hover:border-blue-500/60 dark:hover:bg-blue-950/75",
  next_week:
    "border-violet-300/70 bg-violet-50/95 hover:border-violet-400 hover:bg-violet-100/95 dark:border-violet-700/55 dark:bg-violet-950/45 dark:hover:border-violet-600 dark:hover:bg-violet-950/70",
};

const PRESET_BADGE_CLASS: Record<ShareDayQuickPreset, string> = {
  next_3_days: "bg-sky-600 text-white shadow-sm shadow-sky-600/25",
  next_7_days: "bg-[#2563EB] text-white shadow-sm shadow-blue-600/25",
  next_week: "bg-violet-600 text-white shadow-sm shadow-violet-600/25",
};

function WeekSpanBadge() {
  return <CalendarRange className="h-4.5 w-4.5" strokeWidth={2.25} aria-hidden />;
}

function ShareDayQuickSelectButton({
  preset,
  title,
  hint,
  onClick,
}: {
  preset: ShareDayQuickPreset;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  const dayCount = preset === "next_3_days" ? 3 : preset === "next_7_days" ? 7 : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-w-[6.75rem] max-w-[9.5rem] flex-1 items-center gap-2 rounded-xl border-2 px-2 py-1.5 text-left transition active:scale-[0.98]",
        PRESET_CARD_CLASS[preset],
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg",
          PRESET_BADGE_CLASS[preset],
        )}
      >
        {dayCount != null ? (
          <span className="text-[20px] font-bold leading-none tabular-nums">{dayCount}</span>
        ) : (
          <WeekSpanBadge />
        )}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[11px] font-semibold text-foreground">{title}</span>
        <span className="mt-0.5 block truncate text-[10px] font-medium text-muted-foreground">
          {hint}
        </span>
      </span>
    </button>
  );
}

export function ShareDayQuickSelectRow({
  presets,
  onSelect,
  clearLabel,
  onClear,
  clearDisabled,
}: {
  presets: ReadonlyArray<{ preset: ShareDayQuickPreset; title: string; hint: string }>;
  onSelect: (preset: ShareDayQuickPreset) => void;
  clearLabel: string;
  onClear: () => void;
  clearDisabled: boolean;
}) {
  return (
    <div className="flex flex-wrap items-stretch justify-center gap-1.5">
      {presets.map(({ preset, title, hint }) => (
        <ShareDayQuickSelectButton
          key={preset}
          preset={preset}
          title={title}
          hint={hint}
          onClick={() => onSelect(preset)}
        />
      ))}
      <button
        type="button"
        onClick={onClear}
        disabled={clearDisabled}
        className={cn(
          "flex min-h-[2.75rem] shrink-0 items-center gap-1.5 self-center rounded-xl border-2 px-2.5 py-1.5 text-[11px] font-semibold transition",
          clearDisabled
            ? "cursor-not-allowed border-border/40 bg-muted/20 text-muted-foreground/45"
            : "border-border/70 bg-background text-muted-foreground hover:border-destructive/35 hover:bg-destructive/5 hover:text-destructive dark:hover:bg-destructive/10",
        )}
      >
        <Eraser className="h-3.5 w-3.5 shrink-0 opacity-80" strokeWidth={2.25} aria-hidden />
        <span className="max-w-[4.5rem] leading-tight">{clearLabel}</span>
      </button>
    </div>
  );
}
