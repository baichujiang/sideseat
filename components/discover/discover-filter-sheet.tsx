"use client";

import { ClassmatePostCategory } from "@prisma/client";
import { SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";

import { AppPushLayer } from "@/components/ui/app-push-layer";
import { Button } from "@/components/ui/button";
import { ALL_BUDDY_CATEGORIES, buddyTypeLabel } from "@/lib/discover/buddy-type-labels";
import type { DiscoverPostRow } from "@/lib/discover/discover-post-row";
import { cn } from "@/lib/utils";
import type { AppMessages } from "@/lib/i18n/messages";

export type BuddyFeedTimeFilter = "any" | "today" | "tomorrow" | "week";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function applyBuddyFeedClientFilters(
  posts: DiscoverPostRow[],
  opts: {
    categories: ClassmatePostCategory[] | null;
    time: BuddyFeedTimeFilter;
    openOnly: boolean;
  },
): DiscoverPostRow[] {
  const now = new Date();
  let out = posts;

  if (opts.categories?.length) {
    const set = new Set(opts.categories);
    out = out.filter((p) => set.has(p.category));
  }

  if (opts.openOnly) {
    out = out.filter((p) => new Date(p.expiresAt) > now);
  }

  switch (opts.time) {
    case "today": {
      const s = startOfDay(now);
      const e = endOfDay(now);
      out = out.filter((p) => {
        const c = new Date(p.createdAt);
        return c >= s && c <= e;
      });
      break;
    }
    case "tomorrow": {
      const t0 = startOfDay(addDays(now, 1));
      const t1 = endOfDay(addDays(now, 1));
      out = out.filter((p) => {
        const c = new Date(p.createdAt);
        return c >= t0 && c <= t1;
      });
      break;
    }
    case "week": {
      const wEnd = endOfDay(addDays(now, 7));
      out = out.filter((p) => new Date(p.createdAt) <= wEnd);
      break;
    }
    default:
      break;
  }

  return out;
}

export function DiscoverFilterSheet({
  open,
  onClose,
  onApply,
  initial,
  buddy,
}: {
  open: boolean;
  onClose: () => void;
  onApply: (next: { categories: ClassmatePostCategory[] | null; time: BuddyFeedTimeFilter; openOnly: boolean }) => void;
  initial: { categories: ClassmatePostCategory[] | null; time: BuddyFeedTimeFilter; openOnly: boolean };
  buddy: AppMessages["discoverBuddy"];
}) {
  const [categories, setCategories] = useState<Set<ClassmatePostCategory>>(
    () => new Set(initial.categories ?? []),
  );
  const [time, setTime] = useState<BuddyFeedTimeFilter>(initial.time);
  const [openOnly, setOpenOnly] = useState(initial.openOnly);

  useEffect(() => {
    if (!open) return;
    setCategories(new Set(initial.categories ?? []));
    setTime(initial.time);
    setOpenOnly(initial.openOnly);
  }, [open, initial]);

  function toggleCategory(c: ClassmatePostCategory) {
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  return (
    <AppPushLayer
      open={open}
      onClose={onClose}
      zClassName="z-40"
      panelClassName="w-[min(100vw,26rem)] border-0 bg-background shadow-none dark:shadow-none"
    >
      <div className="flex h-full min-h-0 flex-col px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="mx-auto mb-3 h-1.5 w-12 shrink-0 rounded-full bg-border/80" />
        <h3 className="mb-3 text-[15px] font-semibold">{buddy.filterSheetTitle}</h3>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto">
          <section>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {buddy.filterBuddyTypeSection}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ALL_BUDDY_CATEGORIES.map((c) => {
                const on = categories.has(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleCategory(c)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors",
                      on
                        ? "border-classmates-blue-border bg-classmates-blue-soft text-classmates-blue"
                        : "border-border/80 bg-muted/40 text-foreground/80",
                    )}
                  >
                    {buddyTypeLabel(c, buddy)}
                  </button>
                );
              })}
            </div>
          </section>
          <section>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {buddy.filterTimeSection}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["any", buddy.filterTimeAny],
                  ["today", buddy.filterTimeToday],
                  ["tomorrow", buddy.filterTimeTomorrow],
                  ["week", buddy.filterTimeThisWeek],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTime(value)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors",
                    time === value
                      ? "border-classmates-blue-border bg-classmates-blue-soft text-classmates-blue"
                      : "border-border/80 bg-muted/40 text-foreground/80",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>
          <label className="flex cursor-pointer items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={openOnly}
              onChange={(e) => setOpenOnly(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-classmates-blue"
            />
            {buddy.filterOpenOnly}
          </label>
        </div>
        <div className="mt-4 flex shrink-0 gap-2 border-t border-border/60 pt-3">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => {
              setCategories(new Set());
              setTime("any");
              setOpenOnly(false);
              onApply({ categories: null, time: "any", openOnly: false });
              onClose();
            }}
          >
            {buddy.filterReset}
          </Button>
          <Button
            type="button"
            className="flex-1"
            onClick={() => {
              onApply({
                categories: categories.size ? [...categories] : null,
                time,
                openOnly,
              });
              onClose();
            }}
          >
            {buddy.filterApply}
          </Button>
        </div>
      </div>
    </AppPushLayer>
  );
}

export function DiscoverFilterTriggerButton({
  onClick,
  ariaLabel,
  active,
}: {
  onClick: () => void;
  ariaLabel: string;
  active: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#E7E0D6] bg-white text-muted-foreground shadow-sm transition-colors",
        "hover:border-border hover:bg-muted/35 hover:text-foreground",
        active && "border-classmates-blue-border text-classmates-blue",
      )}
    >
      <SlidersHorizontal className="h-4 w-4" strokeWidth={2.25} aria-hidden />
    </button>
  );
}
