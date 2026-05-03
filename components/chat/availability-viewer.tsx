"use client";

import { differenceInMinutes, format, parseISO } from "date-fns";
import { Loader2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { loadAvailabilityShare } from "@/lib/api/chat-planning";
import { Button } from "@/components/ui/button";
import { PlanRequestModal } from "@/components/chat/plan-request-modal";
import { cn } from "@/lib/utils";

const VIEW_START_HOUR = 8;
const VIEW_END_HOUR = 22;
const MINUTES_PER_HOUR = 60;
const ROW_HEIGHT = 40;

type AvailabilityData = Awaited<ReturnType<typeof loadAvailabilityShare>>;

export function AvailabilityViewer({
  open,
  shareId,
  peerName,
  onClose,
}: {
  open: boolean;
  shareId: string;
  peerName: string;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AvailabilityData | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ startTime: string; endTime: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setSelectedDate(null);
    loadAvailabilityShare(shareId)
      .then((next) => {
        setData(next);
        setSelectedDate(next.days[0]?.date ?? null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load availability."))
      .finally(() => setLoading(false));
  }, [open, shareId]);

  useEffect(() => {
    if (!open || selectedSlot) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const panel = panelRef.current;
      if (panel && e.target instanceof Node && !panel.contains(e.target)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown, { passive: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open, onClose, selectedSlot]);

  const selectedDay = useMemo(() => {
    if (!data || !selectedDate) return null;
    return data.days.find((day) => day.date === selectedDate) ?? data.days[0] ?? null;
  }, [data, selectedDate]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/35"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div ref={panelRef} className="flex w-full max-w-md flex-col rounded-t-[1.75rem] bg-background shadow-2xl">
          <div className="px-4 pb-3 pt-2">
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-muted" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">{peerName}'s availability</h2>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  Pick a time to plan something together.
                </p>
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

          <div className="max-h-[75dvh] space-y-3 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : error ? (
              <p className="rounded-2xl border border-border bg-card px-4 py-5 text-sm text-muted-foreground">
                {error}
              </p>
            ) : data?.status !== "active" ? (
              <p className="rounded-2xl border border-border bg-card px-4 py-5 text-sm text-muted-foreground">
                This availability is no longer available.
              </p>
            ) : data?.days?.length ? (
              <>
                <DateStrip
                  data={data}
                  selectedDate={selectedDate}
                  onSelect={setSelectedDate}
                />
                {selectedDay ? (
                  <DayTimeline
                    data={data}
                    day={selectedDay}
                    onSuggest={(slot) => setSelectedSlot(slot)}
                  />
                ) : null}
              </>
            ) : (
              <p className="rounded-2xl border border-border bg-card px-4 py-5 text-sm text-muted-foreground">
                No available times in this range.
              </p>
            )}
          </div>
        </div>
      </div>

      <PlanRequestModal
        open={selectedSlot != null}
        onClose={() => setSelectedSlot(null)}
        mode={{ kind: "from-share", shareId }}
        peerName={peerName}
        slot={selectedSlot}
      />
    </>
  );
}

function DateStrip({
  data,
  selectedDate,
  onSelect,
}: {
  data: AvailabilityData;
  selectedDate: string | null;
  onSelect: (date: string) => void;
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <div className="flex min-w-max gap-2 pb-1">
        {data.days.map((day) => {
          const active = day.date === selectedDate;
          const totalFreeMinutes = day.slots.reduce(
            (sum, slot) => sum + differenceInMinutes(new Date(slot.endTime), new Date(slot.startTime)),
            0,
          );
          return (
            <button
              key={day.date}
              type="button"
              onClick={() => onSelect(day.date)}
              className={cn(
                "min-w-[88px] rounded-2xl border px-3 py-3 text-left transition",
                active
                  ? "border-primary/30 bg-primary/10 shadow-sm"
                  : "border-border/70 bg-card hover:bg-muted/40",
              )}
            >
              <p className="text-[13px] font-semibold text-foreground">
                {format(parseISO(`${day.date}T12:00:00`), "EEE d")}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {totalFreeMinutes > 0 ? `Free ${formatHours(totalFreeMinutes)}` : "Busy"}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DayTimeline({
  data,
  day,
  onSuggest,
}: {
  data: AvailabilityData;
  day: AvailabilityData["days"][number];
  onSuggest: (slot: { startTime: string; endTime: string }) => void;
}) {
  const dayDate = parseISO(`${day.date}T12:00:00`);
  const rangeStart = parseISO(data.rangeStart);
  const rangeEnd = parseISO(data.rangeEnd);
  const totalHeight = (VIEW_END_HOUR - VIEW_START_HOUR) * ROW_HEIGHT;

  return (
    <div className="rounded-[1.35rem] border border-border/70 bg-card">
      <div className="border-b border-border/60 px-4 py-3">
        <p className="text-[13px] font-semibold text-foreground">
          {format(dayDate, "EEE, MMM d")}
        </p>
        <div className="mt-2 flex flex-wrap gap-3 text-[10.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-sky-400" />
            Available
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-muted-foreground/35" />
            Busy
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-muted" />
            Outside shared range
          </span>
        </div>
      </div>

      <div className="flex px-3 pb-3 pt-2">
        <div className="w-14 shrink-0 pt-1">
          {Array.from({ length: VIEW_END_HOUR - VIEW_START_HOUR + 1 }, (_, idx) => VIEW_START_HOUR + idx).map(
            (hour, index) => (
              <div
                key={hour}
                className="relative text-right text-[11px] text-muted-foreground"
                style={{ height: index === VIEW_END_HOUR - VIEW_START_HOUR ? 0 : ROW_HEIGHT }}
              >
                <span className="-translate-y-1/2 absolute right-2 top-0">
                  {`${hour.toString().padStart(2, "0")}:00`}
                </span>
              </div>
            ),
          )}
        </div>

        <div className="relative flex-1 overflow-hidden rounded-2xl border border-border/60 bg-background">
          {Array.from({ length: VIEW_END_HOUR - VIEW_START_HOUR }, (_, idx) => VIEW_START_HOUR + idx).map((hour) => {
            const segmentStart = withTime(dayDate, hour, 0);
            const segmentEnd = withTime(dayDate, hour + 1, 0);
            const status = getHourStatus(segmentStart, segmentEnd, day, rangeStart, rangeEnd);
            return (
              <div
                key={hour}
                className={cn(
                  "relative border-t first:border-t-0",
                  status === "outside"
                    ? "border-border/50 bg-muted/40"
                    : status === "busy"
                      ? "border-border/50 bg-muted/20"
                      : "border-border/40 bg-background",
                )}
                style={{ height: ROW_HEIGHT }}
              />
            );
          })}

          {day.slots.map((slot) => {
            const start = new Date(slot.startTime);
            const end = new Date(slot.endTime);
            const top = minutesFromViewStart(start) * (ROW_HEIGHT / MINUTES_PER_HOUR);
            const height = Math.max(
              differenceInMinutes(end, start) * (ROW_HEIGHT / MINUTES_PER_HOUR),
              34,
            );
            return (
              <button
                key={`${slot.startTime}-${slot.endTime}`}
                type="button"
                onClick={() => onSuggest({ startTime: slot.startTime, endTime: slot.endTime })}
                className="absolute left-2 right-2 rounded-2xl border border-sky-200/90 bg-sky-50 px-3 py-2 text-left shadow-sm transition hover:bg-sky-100"
                style={{ top, height }}
              >
                <p className="text-[12px] font-semibold text-sky-900">
                  {format(start, "HH:mm")}–{format(end, "HH:mm")}
                </p>
                <p className="mt-1 text-[11px] font-medium text-sky-700">Available · Suggest</p>
              </button>
            );
          })}
          <div style={{ height: totalHeight }} />
        </div>
      </div>
    </div>
  );
}

function getHourStatus(
  segmentStart: Date,
  segmentEnd: Date,
  day: AvailabilityData["days"][number],
  rangeStart: Date,
  rangeEnd: Date,
) {
  const inSharedRange = isWithinSharedRange(segmentStart, segmentEnd, rangeStart, rangeEnd);
  if (!inSharedRange) return "outside";

  const overlapsAvailable = day.slots.some((slot) =>
    rangesOverlap(segmentStart, segmentEnd, new Date(slot.startTime), new Date(slot.endTime)),
  );

  return overlapsAvailable ? "available" : "busy";
}

function isWithinSharedRange(
  segmentStart: Date,
  segmentEnd: Date,
  rangeStart: Date,
  rangeEnd: Date,
) {
  return segmentStart < rangeEnd && segmentEnd > rangeStart;
}

function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && aEnd > bStart;
}

function minutesFromViewStart(date: Date) {
  return (date.getHours() - VIEW_START_HOUR) * 60 + date.getMinutes();
}

function withTime(date: Date, hours: number, minutes: number) {
  const next = new Date(date);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

function formatHours(totalMinutes: number) {
  const hours = totalMinutes / 60;
  if (Number.isInteger(hours)) return `${hours}h`;
  return `${hours.toFixed(1)}h`;
}
