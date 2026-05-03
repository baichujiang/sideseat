"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export function timePart(value: string) {
  return value.slice(11, 16);
}

export function withTime(value: string, nextTime: string) {
  if (!value || nextTime.length < 5) return value;
  return `${value.slice(0, 11)}${nextTime}`;
}

export function withDate(value: string, nextDate: string) {
  if (!value || nextDate.length < 10) return value;
  return `${nextDate}${value.slice(10)}`;
}

export function buildHourChoices() {
  return Array.from({ length: 24 }, (_, hour) => hour.toString().padStart(2, "0"));
}

export function buildMinuteChoices() {
  return Array.from({ length: 12 }, (_, index) => (index * 5).toString().padStart(2, "0"));
}

export function formatDisplayDate(value: string) {
  if (!value || value.length < 10) return "--.--.----";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}.${month}.${year}`;
}

export function EventDateTimeRow({
  label,
  dateValue,
  timeValue,
  hasDivider = false,
  activeDate,
  activeTime,
  onPickDate,
  onPickTime,
}: {
  label: string;
  dateValue: string;
  timeValue: string;
  hasDivider?: boolean;
  activeDate: boolean;
  activeTime: boolean;
  onPickDate: () => void;
  onPickTime: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 py-2.5",
        hasDivider && "border-b border-border/60",
      )}
    >
      <span className="text-[14px] font-medium text-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPickDate}
          className={cn(
            "rounded-full border px-3.5 py-1.5 text-[14px] font-medium transition",
            activeDate
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-border/70 bg-background text-foreground",
          )}
        >
          {dateValue}
        </button>
        <button
          type="button"
          onClick={onPickTime}
          className={cn(
            "rounded-full border px-3.5 py-1.5 text-[14px] font-medium tabular-nums transition",
            activeTime
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-border/70 bg-background text-foreground",
          )}
        >
          {timeValue}
        </button>
      </div>
    </div>
  );
}

export function InlineDateCalendar({
  month,
  selectedDate,
  onPrevMonth,
  onNextMonth,
  onSelectDate,
}: {
  month: Date;
  selectedDate: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onSelectDate: (date: Date) => void;
}) {
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
      <CompactDateCalendar month={month} selectedDate={selectedDate} onSelectDate={onSelectDate} />
    </div>
  );
}

function CompactDateCalendar({
  month,
  selectedDate,
  onSelectDate,
}: {
  month: Date;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
}) {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const today = new Date();

  return (
    <div className="space-y-2">
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
          const isSelected = isSameDay(date, selectedDate);
          const isToday = isSameDay(date, today);

          return (
            <button
              key={date.toISOString()}
              type="button"
              onClick={() => onSelectDate(date)}
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

export function TimeWheelPicker({
  hour,
  minute,
  hourChoices,
  minuteChoices,
  onChangeHour,
  onChangeMinute,
  danger = false,
}: {
  hour: string;
  minute: string;
  hourChoices: string[];
  minuteChoices: string[];
  onChangeHour: (next: string) => void;
  onChangeMinute: (next: string) => void;
  danger?: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-[1.35rem] border border-border/60 bg-muted/20 px-3 py-4">
      <div className="pointer-events-none absolute inset-x-3 top-1/2 h-14 -translate-y-1/2 rounded-full border border-primary/15 bg-primary/[0.08]" />
      <div className="grid grid-cols-2 gap-2">
        <WheelColumn values={hourChoices} selected={hour} onSelect={onChangeHour} accent={danger} />
        <WheelColumn values={minuteChoices} selected={minute} onSelect={onChangeMinute} accent={danger} />
      </div>
    </div>
  );
}

function WheelColumn({
  values,
  selected,
  onSelect,
  accent,
}: {
  values: string[];
  selected: string;
  onSelect: (next: string) => void;
  accent?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastSelectedRef = useRef<string | null>(null);
  const programmaticScrollRef = useRef(false);
  const repeated = useMemo(() => Array.from({ length: 9 }, () => values).flat(), [values]);
  const middleLoop = Math.floor(repeated.length / 2 / values.length) * values.length;
  const itemHeight = 56;
  const containerHeight = 208;
  const verticalPadding = (containerHeight - itemHeight) / 2;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (lastSelectedRef.current === selected) return;
    lastSelectedRef.current = selected;

    const indexInValues = values.indexOf(selected);
    const targetIndex = (indexInValues >= 0 ? indexInValues : 0) + middleLoop;
    const targetTop = verticalPadding + targetIndex * itemHeight;
    programmaticScrollRef.current = true;
    container.scrollTo({
      top: targetTop - container.clientHeight / 2 + itemHeight / 2,
      behavior: "auto",
    });
    requestAnimationFrame(() => {
      programmaticScrollRef.current = false;
    });
  }, [itemHeight, middleLoop, selected, values, verticalPadding]);

  function handleScroll() {
    const container = containerRef.current;
    if (!container) return;

    const loopSize = values.length * itemHeight;
    const totalHeight = repeated.length * itemHeight;
    const min = loopSize * 2;
    const max = totalHeight - loopSize * 3;

    if (container.scrollTop < min) {
      container.scrollTop += loopSize * 3;
    } else if (container.scrollTop > max) {
      container.scrollTop -= loopSize * 3;
    }

    if (programmaticScrollRef.current) return;

    const centeredIndex = Math.round(
      (container.scrollTop + container.clientHeight / 2 - verticalPadding - itemHeight / 2) /
        itemHeight,
    );
    const normalizedIndex = ((centeredIndex % values.length) + values.length) % values.length;
    const centeredValue = values[normalizedIndex];

    if (centeredValue && centeredValue !== lastSelectedRef.current) {
      lastSelectedRef.current = centeredValue;
      onSelect(centeredValue);
    }
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="h-52 snap-y snap-mandatory overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div style={{ paddingTop: verticalPadding, paddingBottom: verticalPadding }}>
        {repeated.map((value, index) => {
          const active = value === selected;
          return (
            <button
              key={`${value}-${index}`}
              type="button"
              onClick={() => onSelect(value)}
              className={cn(
                "flex h-14 w-full snap-center items-center justify-center text-[18px] font-medium tabular-nums transition",
                active
                  ? accent
                    ? "text-destructive"
                    : "text-foreground"
                  : "text-muted-foreground/45",
              )}
            >
              {value}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Start + end rows with the same calendar + wheel UX as the home schedule. */
export function ScheduleStyleDateTimeRange({
  startAt,
  endAt,
  onChangeStart,
  onChangeEnd,
}: {
  startAt: string;
  endAt: string;
  onChangeStart: (next: string) => void;
  onChangeEnd: (next: string) => void;
}) {
  const [activeTimePicker, setActiveTimePicker] = useState<"start" | "end" | null>(null);
  const [activeDateDialog, setActiveDateDialog] = useState<"start" | "end" | null>(null);
  const [dateDialogMonth, setDateDialogMonth] = useState(() => new Date(startAt));

  const hourChoices = useMemo(() => buildHourChoices(), []);
  const minuteChoices = useMemo(() => buildMinuteChoices(), []);

  function setTimeValue(target: "start" | "end", nextHour?: string, nextMinute?: string) {
    const current = target === "start" ? startAt : endAt;
    const [hour, minute] = timePart(current).split(":");
    const nextTime = `${nextHour ?? hour}:${nextMinute ?? minute}`;
    if (target === "start") {
      onChangeStart(withTime(startAt, nextTime));
      return;
    }
    onChangeEnd(withTime(endAt, nextTime));
  }

  function openDatePicker(target: "start" | "end") {
    setActiveDateDialog((current) => {
      if (current === target) return null;
      const currentValue = target === "start" ? startAt : endAt;
      setDateDialogMonth(new Date(currentValue));
      setActiveTimePicker(null);
      return target;
    });
  }

  function applyDateFromCalendar(date: Date) {
    const isoDate = format(date, "yyyy-MM-dd");
    if (activeDateDialog === "start") {
      onChangeStart(withDate(startAt, isoDate));
    } else if (activeDateDialog === "end") {
      onChangeEnd(withDate(endAt, isoDate));
    }
  }

  return (
    <div className="rounded-2xl border border-border/70 bg-muted/[0.06] px-4 py-1 text-foreground">
      <EventDateTimeRow
        label="Start"
        dateValue={formatDisplayDate(startAt)}
        timeValue={timePart(startAt)}
        hasDivider
        activeDate={activeDateDialog === "start"}
        activeTime={activeTimePicker === "start"}
        onPickDate={() => openDatePicker("start")}
        onPickTime={() => {
          setActiveDateDialog(null);
          setActiveTimePicker((current) => (current === "start" ? null : "start"));
        }}
      />

      {activeDateDialog === "start" ? (
        <div className="pb-3 pt-2">
          <InlineDateCalendar
            month={dateDialogMonth}
            selectedDate={new Date(startAt)}
            onPrevMonth={() => setDateDialogMonth((current) => addMonths(current, -1))}
            onNextMonth={() => setDateDialogMonth((current) => addMonths(current, 1))}
            onSelectDate={applyDateFromCalendar}
          />
        </div>
      ) : null}

      <EventDateTimeRow
        label="End"
        dateValue={formatDisplayDate(endAt)}
        timeValue={timePart(endAt)}
        activeDate={activeDateDialog === "end"}
        activeTime={activeTimePicker === "end"}
        onPickDate={() => openDatePicker("end")}
        onPickTime={() => {
          setActiveDateDialog(null);
          setActiveTimePicker((current) => (current === "end" ? null : "end"));
        }}
      />

      {activeDateDialog === "end" ? (
        <div className="pt-2">
          <InlineDateCalendar
            month={dateDialogMonth}
            selectedDate={new Date(endAt)}
            onPrevMonth={() => setDateDialogMonth((current) => addMonths(current, -1))}
            onNextMonth={() => setDateDialogMonth((current) => addMonths(current, 1))}
            onSelectDate={applyDateFromCalendar}
          />
        </div>
      ) : null}

      {activeTimePicker && !activeDateDialog ? (
        <div className="pt-2">
          <TimeWheelPicker
            hour={timePart(activeTimePicker === "start" ? startAt : endAt).split(":")[0] ?? "00"}
            minute={timePart(activeTimePicker === "start" ? startAt : endAt).split(":")[1] ?? "00"}
            hourChoices={hourChoices}
            minuteChoices={minuteChoices}
            onChangeHour={(nextHour) => setTimeValue(activeTimePicker, nextHour)}
            onChangeMinute={(nextMinute) => setTimeValue(activeTimePicker, undefined, nextMinute)}
            danger={activeTimePicker === "end"}
          />
        </div>
      ) : null}
    </div>
  );
}
