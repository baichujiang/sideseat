"use client";
import { useMemo, useRef, useState } from "react";
import { Check, Circle, Minus, Undo2 } from "lucide-react";
import { useAvailabilityGesture } from "@/components/time-polls/use-availability-gesture";
import styles from "./shared-time-poll.module.css";
import { availabilityCells, pollClock, pollDate, type SharedTimePoll } from "@/lib/time-polls/browser-types";

export function AvailabilityEditor({ poll, selected, onChange, onEditingChange, disabled, zh }: {
  poll: SharedTimePoll; selected: number[]; onChange: (ids: number[]) => void;
  onEditingChange: (editing: boolean) => void; disabled: boolean; zh: boolean;
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
  const dates = poll.dates.map((date) => {
    const slots = poll.slots.filter((slot) => slot.date === date);
    const last = slots.at(-1);
    const endParts = last && new Intl.DateTimeFormat("en-CA", { timeZone: poll.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(last.end));
    const endDate = endParts && ["year", "month", "day"].map((part) => endParts.find((item) => item.type === part)?.value).join("-");
    return { date, label: pollDate(date, zh),
      day: new Intl.DateTimeFormat(zh ? "zh-CN" : "en-GB", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(date + "T12:00:00Z")),
      weekday: new Intl.DateTimeFormat(zh ? "zh-CN" : "en-GB", { timeZone: "UTC", weekday: "short" }).format(new Date(date + "T12:00:00Z")),
      ids: slots.map((slot) => slot.id), endAt: last?.end,
      endLabel: last ? `${endDate !== date ? (zh ? "次日 " : "Next day ") : ""}${pollClock(last.end, poll.timeZone)}` : "—" };
  });
  const endLabels = [...new Set(dates.filter((date) => date.endAt).map((date) => date.endLabel))];
  const commonEnd = endLabels.length === 1 ? endLabels[0] : null;
  const apply = (value: number[]) => {
    const next = [...new Set(value)].sort((a, b) => a - b);
    if (next.length === selected.length && next.every((id) => selected.includes(id))) return;
    setUndo(selected); onChange(next);
  };
  const gesture = useAvailabilityGesture({ enabled: !disabled, selected, onChange: apply, onEditingChange,
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
  const otherSelections = poll.participants.filter((person) => !person.isMe).map((person) => new Set(person.slotIds));
  const displayedParticipants = otherSelections.length + (poll.participants.some((person) => person.isMe) || active.size > 0 ? 1 : 0);
  const columns = { gridTemplateColumns: `56px repeat(${dates.length}, minmax(88px, 1fr))` };
  return <section className="space-y-3" aria-label={zh ? "大家的时间表，直接选择我的空闲" : "Group timetable: select my free time"}>
    <>
      <div className="flex items-center gap-3"><p className="flex-1 text-xs leading-5 text-muted-foreground">{zh ? "点选时间格，可选中或取消" : "Tap cells to select or clear"}</p>
        <button type="button" aria-label={zh ? "撤销上次修改" : "Undo last change"} data-testid="time-poll-undo" disabled={!undo || disabled || gesture.preview !== null} onClick={() => { if (undo) { onChange(undo); setUndo(null); } }} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border disabled:opacity-35"><Undo2 className="h-4 w-4" aria-hidden /></button>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground" aria-label={zh ? "选时图例" : "Availability legend"}>
        <span className="flex items-center gap-1"><Check className={`h-3.5 w-3.5 rounded ${styles.selected}`} aria-hidden />{zh ? "我的空闲" : "My free time"}</span>
        <span className="flex items-center gap-1"><Minus className={`h-3.5 w-3.5 rounded ${styles.partial}`} aria-hidden />{zh ? "部分已选" : "Partially selected"}</span>
        <span>{zh ? "数字为有空人数（含你的选择）" : "Numbers show people available, including you"}</span>
      </div>
    </>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <details><summary className="cursor-pointer py-2">{zh ? "批量选择" : "Select multiple times"}</summary><p className="max-w-sm pb-2 leading-5">{zh ? "长按后拖动可连续选择；点日期可全选当天。" : "Hold and drag to select a range; tap a date to select its whole day."}</p></details>
      <button type="button" disabled={disabled || gesture.preview !== null} onClick={() => { if (selected.length) apply([]); else onChange([]); }} className="min-h-11 text-sm underline underline-offset-4">{zh ? "这些时间都不行" : "None of these times work"}</button>
    </div>
    <div ref={scroll} data-testid="time-poll-grid" className="max-h-[60dvh] overflow-auto rounded-xl border bg-background" tabIndex={0} aria-label={zh ? "可滚动时间表" : "Scrollable timetable"}>
      <div style={{ minWidth: 56 + dates.length * 88 }}>
        <div className="sticky top-0 z-20 grid bg-background" style={columns}>
          <div className="sticky left-0 z-30 flex h-14 items-center justify-center border-b bg-background text-xs">{zh ? "时间" : "Time"}</div>
          {dates.map(({ date, label, day, weekday, ids }) => {
            const count = ids.filter((id) => selected.includes(id)).length;
            const all = count === ids.length && count > 0, partial = count > 0 && !all;
            const state = all ? (zh ? "已选中当天全部时段" : "All times selected") : partial ? (zh ? "已选中部分时段" : "Some times selected") : (zh ? "未选中时段" : "No times selected");
            return <div key={date} className="h-14 border-b p-1">
              <button type="button" data-testid={`time-poll-day-${date}`} aria-label={`${label}, ${state}`} aria-pressed={all} title={state} disabled={disabled || gesture.preview !== null} onClick={() => apply(all ? selected.filter((id) => !ids.includes(id)) : [...selected, ...ids])} className={`flex h-full w-full items-center justify-center gap-1 rounded-lg border px-1 text-xs font-semibold ${all ? styles.selected : partial ? styles.partial : "border-border bg-background"}`}>
                <span><span className="block whitespace-nowrap">{day}</span><span className="block font-normal">{weekday}</span></span>{all ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : partial ? <Minus className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <Circle className="h-3.5 w-3.5 shrink-0" aria-hidden />}
              </button>
            </div>;
          })}
        </div>
        <div className="py-2">
        <div ref={gesture.surface} className="grid select-none" style={{ ...columns, WebkitTouchCallout: "none" }} onPointerDown={gesture.onPointerDown} onPointerMove={gesture.onPointerMove} onPointerUp={gesture.onPointerUp} onPointerCancel={gesture.onPointerCancel} onLostPointerCapture={gesture.onLostPointerCapture} onContextMenu={(event) => event.preventDefault()}>
          {rows.map((row, rowIndex) => <div key={row} className="contents">
            <div className="sticky left-0 z-10 h-11 border-b bg-background text-[10px] tabular-nums">
              <span data-testid={`time-poll-boundary-${rowIndex}`} className="absolute inset-x-0 top-0 -translate-y-1/2 text-center leading-none"><span className="bg-background px-1">{labels.get(row)}</span></span>
              {rowIndex === rows.length - 1 && commonEnd ? <span data-testid="time-poll-final-boundary" className="absolute inset-x-0 bottom-0 translate-y-1/2 text-center leading-none"><span className="bg-background px-1">{commonEnd}</span></span> : null}
            </div>
            {dates.map(({ date, label, endAt, endLabel }) => {
              const slot = lookup.get(date + "|" + row);
              if (!slot) return <div key={date} className="h-11 border-b border-l bg-muted/30" />;
              const all = slot.slotIds.every((id) => active.has(id));
              const partial = !all && slot.slotIds.some((id) => active.has(id));
              const count = otherSelections.filter((ids) => slot.slotIds.every((id) => ids.has(id))).length + Number(all);
              const name = `${label}, ${slot.label}–${pollClock(slot.end, poll.timeZone)}`;
              return <button key={date} type="button" data-testid={`time-poll-cell-${slot.id}`} aria-label={`${name}, ${count} ${zh ? "人有空" : "available"}`} aria-pressed={all ? true : partial ? "mixed" : false} disabled={disabled} onClick={(event) => gesture.onClick(slot.slotIds, event.detail === 0)} className={`relative flex h-11 items-center justify-center gap-1.5 border-b border-l text-sm tabular-nums focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-blue-500 ${all ? styles.mine : partial ? styles.minePartial : "border-border"}`} style={{ backgroundColor: `rgb(13 148 136 / ${count ? 0.14 + 0.42 * count / Math.max(1, displayedParticipants) : 0.04})` }}>
                {all || partial ? <span className={all ? styles.mineMark : styles.partialMark} aria-hidden>{all ? "✓" : "−"}</span> : null}<span aria-hidden>{count}</span>
                {!commonEnd && slot.end === endAt ? <span aria-hidden data-testid={`time-poll-end-${date}`} className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 whitespace-nowrap rounded bg-background px-1 text-[10px] leading-none">{endLabel}</span> : null}
              </button>;
            })}
          </div>)}
        </div>
        </div>
      </div>
    </div>

  </section>;
}
