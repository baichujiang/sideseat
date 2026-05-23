"use client";

import { Check } from "lucide-react";
import { useState } from "react";

import type { AppMessages } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

export type CalendarCategoryOption = {
  id: string;
  name: string;
  color: string;
  presetKey: string | null;
};

export function CategoryNoneRow({ labels }: { labels: AppMessages["schedule"] }) {
  return (
    <div className="relative rounded-xl border border-border/70 bg-muted/[0.06] px-3 py-0.5">
      <div className="flex w-full items-center justify-between py-2.5 text-[14px]">
        <span className="font-medium text-foreground">{labels.addPanelCalendar}</span>
        <span className="text-muted-foreground">{labels.addPanelNone}</span>
      </div>
    </div>
  );
}

export function CategoryPickerRow({
  categories,
  value,
  onChange,
  labels,
  compact,
}: {
  categories: CalendarCategoryOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  labels: AppMessages["schedule"];
  /** Smaller label for natural-language preview cards. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = categories.find((c) => c.id === value);

  return (
    <div className="relative rounded-xl border border-border/70 bg-muted/[0.06] px-3 py-0.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between text-left",
          compact ? "py-2 text-[13px]" : "py-2.5 text-[14px]",
        )}
      >
        <span className="font-medium text-foreground">{labels.addPanelCalendar}</span>
        <span className="inline-flex items-center gap-2 text-right">
          {selected ? (
            <>
              <span
                className="h-3 w-3 shrink-0 rounded-full border border-black/10 shadow-sm dark:border-white/15"
                style={{ backgroundColor: selected.color }}
                aria-hidden
              />
              <span className="text-foreground">{selected.name}</span>
            </>
          ) : (
            <span className="text-muted-foreground">{labels.addPanelNone}</span>
          )}
        </span>
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-30 mt-2 w-[min(14rem,72vw)] overflow-hidden rounded-[1.75rem] border border-border/70 bg-popover p-2 text-popover-foreground shadow-xl">
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left text-[14px] transition hover:bg-muted/70",
              "border-b border-border/50",
            )}
          >
            <span className="flex h-5 w-5 items-center justify-center">
              {value === null ? <Check className="h-4 w-4 text-primary" strokeWidth={2.5} /> : null}
            </span>
            <span className="flex-1 text-muted-foreground">{labels.addPanelNone}</span>
          </button>
          {categories.map((c, i) => {
            const active = value === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onChange(c.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left text-[14px] transition hover:bg-muted/70",
                  i !== categories.length - 1 && "border-b border-border/50",
                )}
              >
                <span className="flex h-5 w-5 items-center justify-center">
                  {active ? <Check className="h-4 w-4 text-primary" strokeWidth={2.5} /> : null}
                </span>
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/10 shadow-sm dark:border-white/15"
                  style={{ backgroundColor: c.color }}
                  aria-hidden
                />
                <span className="flex-1">{c.name}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
