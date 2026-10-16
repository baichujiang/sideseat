"use client";
import { useMemo, useRef, useState } from "react";
import { Check, Circle, Minus, Undo2 } from "lucide-react";
import { useAvailabilityGesture } from "@/components/time-polls/use-availability-gesture";
import styles from "./shared-time-poll.module.css";
import { availabilityCells, pollClock, pollDate, type SharedTimePoll } from "@/lib/time-polls/browser-types";

export function AvailabilityEditor({ poll, selected, onChange, onEditingChange, disabled, zh, results = false }: {
  poll: SharedTimePoll; selected: number[]; onChange: (ids: number[]) => void;
  onEditingChange: (editing: boolean) => void; disabled: boolean; zh: boolean; results?: boolean;
}) {
  const [undo, setUndo] = useState<number[] | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const { dates: pollDates, slots: pollSlots } = poll;
  const { rows, lookup, labels } = useMemo(() => {
    const cells = availabilityCells(pollSlots);
    const days = pollDates.map((date) => cells.filter((slot) => slot.date === date));
    const longest = days.reduce((a, b) => a.length >= b.length ? a : b, [] as typeof pollSlots);
    return { rows: longest.map((slot) => slot.row),
      lookup: new Map(cells.map((slot) => [slot.date + "|" + slot.row, slot])),
      labels: new Map(longest.map((slot) => [slot.row, slot.label])) };
  }, [pollDates, pollSlots]);
  const dates = poll.dates.map((date) => ({ date, label: pollDate(date, zh),
    day: new Intl.DateTimeFormat(zh ? "zh-CN" : "en-GB", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(date + "T12:00:00Z")),
    weekday: new Intl.DateTimeFormat(zh ? "zh-CN" : "en-GB", { timeZone: "UTC", weekday: "short" }).format(new Date(date + "T12:00:00Z")), ids: poll.slots.filter((slot) => slot.date === date).map((slot) => slot.id) }));
  const apply = (value: number[]) => {
    const next = [...new Set(value)].sort((a, b) => a - b);
    if (next.length === selected.length && next.every((id) => selected.includes(id))) return;
    setUndo(selected); onChange(next);
  };
  const gesture = useAvailabilityGesture({ enabled: !results && !disabled, selected, onChange: apply, onEditingChange,
    position: (x, y, clamped) => {
      const bounds = gesture.surface.current?.getBoundingClientRect();
      if (!bounds || !rows.length || !dates.length) return null;
      const width = (bounds.width - 56) / dates.length;
      let column = Math.floor((x - bounds.left - 56) / width), row = Math.floor((y - bounds.top) / 44);
      if (clamped) { column = Math.max(0, Math.min(dates.length - 1, column)); row = Math.max(0, Math.min(rows.length - 1, row)); }
      else if (column < 0 || column >= dates.length || row < 0 || row >= rows.length || x < (scroll.current?.getBoundingClientRect().left ?? 0) + 56) return null;
      const slot = lookup.get(dates[column].date + "|" + rows[row]);
      return slot || clamped ? { column, row, slotIds: slot?.slotIds ?? [] } : null;
    },
    rectangle: (start, end, original, selecting) => {
      const ids = new Set<number>();
      for (let column = Math.min(start.column, end.column); column <= Math.max(start.column, end.column); column++) {
        for (let row = Math.min(start.row, end.row); row <= Math.max(start.row, end.row); row++) {
          const slot = lookup.get(dates[column].date + "|" + rows[row]);
          slot?.slotIds.forEach((id) => ids.add(id));
        }
      }
      return selecting ? [...new Set([...original, ...ids])] : original.filter((id) => !ids.has(id));
    },
  });
  const active = new Set(gesture.preview ?? selected);
  const participantSelections = poll.participants.map((person) => new Set(person.slotIds));
  const columns = { gridTemplateColumns: `56px repeat(${dates.length}, minmax(88px, 1fr))` };
  return <section className="space-y-3" aria-label={results ? (zh ? "大家的时间热图" : "Group availability heatmap") : (zh ? "我的可用时间" : "My availability")}>
    {!results ? <>
      <div className="flex items-center gap-3"><p className="flex-1 text-xs leading-5 text-muted-foreground">{zh ? "每格 30 分钟 · 点日期选全天，点按或长按拖选。滑动可滚动。" : "30 minutes per cell. Tap a day for all its times, or tap/hold cells to edit. Swipe to scroll."}</p>
        <button type="button" aria-label={zh ? "撤销上次修改" : "Undo last change"} data-testid="time-poll-undo" disabled={!undo || disabled || gesture.preview !== null} onClick={() => { if (undo) { onChange(undo); setUndo(null); } }} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border disabled:opacity-35"><Undo2 className="h-4 w-4" aria-hidden /></button>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground" aria-label={zh ? "选时图例" : "Availability legend"}>
        <span className="flex items-center gap-1"><Check className={`h-3.5 w-3.5 rounded ${styles.selected}`} aria-hidden />{zh ? "已选时段" : "Selected slots"}</span>
        <span className="flex items-center gap-1"><Minus className={`h-3.5 w-3.5 rounded ${styles.partial}`} aria-hidden />{zh ? "部分已选" : "Partially selected"}</span>
        <span className="flex items-center gap-1"><Circle className="h-3.5 w-3.5" aria-hidden />{zh ? "未选时段" : "Unselected slots"}</span>
      </div>
    </> : <p className="text-xs text-muted-foreground">{zh ? "颜色越深，方便的人越多。数字为每个时段的可用人数。" : "Darker cells mean more people are available. Numbers show attendance per slot."}</p>}
    <div ref={scroll} data-testid="time-poll-grid" className="max-h-[60dvh] overflow-auto rounded-xl border bg-background" tabIndex={0} aria-label={zh ? "可滚动时间表" : "Scrollable timetable"}>
      <div style={{ minWidth: 56 + dates.length * 88 }}>
        <div className="sticky top-0 z-20 grid bg-background" style={columns}>
          <div className="sticky left-0 z-30 flex h-14 items-center justify-center border-b bg-background text-xs">{zh ? "时间" : "Time"}</div>
          {dates.map(({ date, label, day, weekday, ids }) => {
            const count = ids.filter((id) => selected.includes(id)).length;
            const all = count === ids.length && count > 0, partial = count > 0 && !all;
            const state = all ? (zh ? "已选中当天全部时段" : "All times selected") : partial ? (zh ? "已选中部分时段" : "Some times selected") : (zh ? "未选中时段" : "No times selected");
            return results ? <div key={date} className="flex h-14 flex-col items-center justify-center gap-0.5 border-b px-1 text-center text-xs font-semibold"><span className="whitespace-nowrap">{day}</span><span className="font-normal">{weekday}</span></div> : <div key={date} className="h-14 border-b p-1">
              <button type="button" data-testid={`time-poll-day-${date}`} aria-label={`${label}, ${state}`} aria-pressed={all} title={state} disabled={disabled || gesture.preview !== null} onClick={() => apply(all ? selected.filter((id) => !ids.includes(id)) : [...selected, ...ids])} className={`flex h-full w-full items-center justify-center gap-1 rounded-lg border px-1 text-xs font-semibold ${all ? styles.selected : partial ? styles.partial : "border-border bg-background"}`}>
                <span><span className="block whitespace-nowrap">{day}</span><span className="block font-normal">{weekday}</span></span>{all ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : partial ? <Minus className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <Circle className="h-3.5 w-3.5 shrink-0" aria-hidden />}
              </button>
            </div>;
          })}
        </div>
        <div ref={gesture.surface} className="grid select-none" style={{ ...columns, WebkitTouchCallout: "none" }} onPointerDown={gesture.onPointerDown} onPointerMove={gesture.onPointerMove} onPointerUp={gesture.onPointerUp} onPointerCancel={gesture.onPointerCancel} onLostPointerCapture={gesture.onLostPointerCapture} onContextMenu={(event) => event.preventDefault()}>
          {rows.map((row) => <div key={row} className="contents">
            <div className="sticky left-0 z-10 flex h-11 items-center justify-center border-b bg-background px-1 text-[10px] tabular-nums">{labels.get(row)}</div>
            {dates.map(({ date, label }) => {
              const slot = lookup.get(date + "|" + row);
              if (!slot) return <div key={date} className="h-11 border-b border-l bg-muted/30" />;
              const count = participantSelections.filter((ids) => slot.slotIds.every((id) => ids.has(id))).length;
              const all = slot.slotIds.every((id) => active.has(id));
              const partial = !all && slot.slotIds.some((id) => active.has(id));
              const name = `${label}, ${slot.label}–${pollClock(slot.end, poll.timeZone)}`;
              return results ? <div key={date} data-testid={`time-poll-result-${slot.id}`} aria-label={`${name}, ${count} ${zh ? "人有空" : "available"}`} className="flex h-11 items-center justify-center border-b border-l text-xs tabular-nums" style={{ backgroundColor: `rgb(13 148 136 / ${count ? 0.14 + 0.42 * count / Math.max(1, poll.summary.participantCount) : 0.04})` }}>{count}</div> : <button key={date} type="button" data-testid={`time-poll-cell-${slot.id}`} aria-label={name} aria-pressed={all ? true : partial ? "mixed" : false} disabled={disabled} onClick={(event) => gesture.onClick(slot.slotIds, event.detail === 0)} className={`flex h-11 items-center justify-center border-b border-l text-sm focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-blue-500 ${all ? styles.selected : partial ? styles.partial : "border-border bg-background"}`}>{all || partial ? <span className="pointer-events-none" aria-hidden>{all ? "✓" : "−"}</span> : null}</button>;
            })}
          </div>)}
        </div>
      </div>
    </div>
    {!results ? <button type="button" disabled={disabled || gesture.preview !== null} onClick={() => { if (selected.length) apply([]); else onChange([]); }} className="min-h-11 text-sm underline underline-offset-4">{zh ? "我没有可用时间" : "I have no available time"}</button> : null}
  </section>;
}
