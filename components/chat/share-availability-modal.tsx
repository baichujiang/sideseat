"use client";

/**
 * @deprecated Use Schedule Share from Home or Chat (`create-schedule-share-dialog`) instead.
 * Retained so older AvailabilityShare flows keep working until fully migrated.
 */

import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { CalendarRange, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { AppPushLayer } from "@/components/ui/app-push-layer";
import { Button } from "@/components/ui/button";
import { createAvailabilityShare } from "@/lib/api/chat-planning";
import { cn } from "@/lib/utils";

type RangePreset = "NEXT_WEEK" | "CUSTOM";

const FIELD_INPUT =
  "h-11 w-full rounded-xl border border-input bg-background px-3.5 text-[14px] outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

function nextCalendarWeekBounds() {
  const now = new Date();
  const thisMonday = startOfWeek(now, { weekStartsOn: 1 });
  const nextMonday = addDays(thisMonday, 7);
  const nextSunday = addDays(nextMonday, 6);
  return { rangeStart: startOfDay(nextMonday), rangeEnd: endOfDay(nextSunday) };
}

export function ShareAvailabilityModal({
  open,
  connectionId,
  onClose,
}: {
  open: boolean;
  connectionId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [preset, setPreset] = useState<RangePreset>("NEXT_WEEK");
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDayKeys, setSelectedDayKeys] = useState<Set<string>>(() => new Set());
  const [expiresAt, setExpiresAt] = useState(() => defaultExpiry());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPreset("NEXT_WEEK");
    setCalendarMonth(startOfMonth(new Date()));
    setSelectedDayKeys(new Set());
    setExpiresAt(defaultExpiry());
    setErr(null);
  }, [open]);

  const customSummary = useMemo(() => {
    if (selectedDayKeys.size === 0) return "No days selected";
    const sorted = [...selectedDayKeys].sort();
    if (sorted.length <= 3) return sorted.join(", ");
    return `${sorted.length} days selected`;
  }, [selectedDayKeys]);

  function toggleCalendarDay(date: Date) {
    const key = format(date, "yyyy-MM-dd");
    setSelectedDayKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      if (preset === "CUSTOM") {
        if (selectedDayKeys.size === 0) {
          setErr("Tap the calendar to choose at least one day.");
          setBusy(false);
          return;
        }
        const sortedDates = [...selectedDayKeys].sort();
        await createAvailabilityShare(connectionId, {
          visibilityMode: "FREE_BUSY",
          includedDates: sortedDates,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        });
      } else {
        const { rangeStart, rangeEnd } = nextCalendarWeekBounds();
        await createAvailabilityShare(connectionId, {
          visibilityMode: "FREE_BUSY",
          rangeStart: rangeStart.toISOString(),
          rangeEnd: rangeEnd.toISOString(),
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        });
      }
      onClose();
      router.refresh();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Unable to share availability.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppPushLayer open={open} onClose={onClose} zClassName="z-50" panelClassName="w-[min(100vw,28rem)] border-0">
      <div className="flex h-full min-h-0 flex-col bg-background pt-[env(safe-area-inset-top)]">
        <div className="shrink-0 px-4 pb-3 pt-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                <CalendarRange className="h-4.5 w-4.5" strokeWidth={2.25} />
              </span>
              <div>
                <h2 className="text-sm font-semibold">Share availability</h2>
                <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                  Share free/busy time only. Event titles stay private.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" strokeWidth={2.25} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3">
          <Labeled label="Dates to share">
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: "NEXT_WEEK" as const, label: "Next week", hint: "Mon–Sun" },
                { value: "CUSTOM" as const, label: "Custom", hint: "Pick days" },
              ] as const).map((option) => {
                const active = option.value === preset;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPreset(option.value)}
                    className={cn(
                      "min-h-11 rounded-[0.95rem] border px-3 py-2 text-left text-[13px] font-medium transition",
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-foreground/80",
                    )}
                  >
                    <span className="block">{option.label}</span>
                    <span className="mt-0.5 block text-[10.5px] font-normal text-muted-foreground">
                      {option.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </Labeled>

          {preset === "CUSTOM" ? (
            <div className="rounded-2xl border border-border/70 bg-card/40 px-3 py-3">
              <MonthMultiCalendar
                month={calendarMonth}
                selectedKeys={selectedDayKeys}
                onPrevMonth={() => setCalendarMonth((m) => addMonths(m, -1))}
                onNextMonth={() => setCalendarMonth((m) => addMonths(m, 1))}
                onToggleDay={toggleCalendarDay}
              />
              <p className="mt-2 text-[11px] text-muted-foreground">
                Tap days to add or remove. {customSummary}
              </p>
            </div>
          ) : null}

          <Labeled label="Expires">
            <input
              type="datetime-local"
              className={FIELD_INPUT}
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </Labeled>
        </div>

        <div className="border-t border-border/60 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {err ? <p className="mb-2 text-[11.5px] text-destructive">{err}</p> : null}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" className="h-11 flex-1 rounded-xl" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" className="h-11 flex-1 rounded-xl" onClick={submit} disabled={busy}>
              {busy ? "Sharing…" : "Share in chat"}
            </Button>
          </div>
        </div>
      </div>
    </AppPushLayer>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function MonthMultiCalendar({
  month,
  selectedKeys,
  onPrevMonth,
  onNextMonth,
  onToggleDay,
}: {
  month: Date;
  selectedKeys: Set<string>;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToggleDay: (date: Date) => void;
}) {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const today = new Date();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[15px] font-semibold text-foreground">{format(month, "MMMM yyyy")}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPrevMonth}
            className="flex h-9 w-9 items-center justify-center rounded-full text-primary transition hover:bg-muted"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onClick={onNextMonth}
            className="flex h-9 w-9 items-center justify-center rounded-full text-primary transition hover:bg-muted"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <div key={day} className="py-1">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((date) => {
          const inMonth = isSameMonth(date, month);
          const key = format(date, "yyyy-MM-dd");
          const isSelected = selectedKeys.has(key);
          const isToday = isSameDay(date, today);

          return (
            <button
              key={key}
              type="button"
              onClick={() => onToggleDay(date)}
              className={cn(
                "flex aspect-square items-center justify-center rounded-xl border text-[13px] font-medium tabular-nums transition",
                isSelected
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : isToday
                    ? "border-primary/25 bg-primary/[0.06] text-foreground"
                    : "border-transparent bg-transparent text-foreground hover:bg-muted/60",
                !inMonth && !isSelected ? "opacity-40" : undefined,
              )}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function toLocalInputValue(d: Date) {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultExpiry() {
  return toLocalInputValue(addDays(new Date(), 7));
}
