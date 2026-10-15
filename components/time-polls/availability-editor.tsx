"use client";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pollClock, pollDate, selectedRanges, type SharedTimePoll } from "@/lib/time-polls/browser-types";

export function AvailabilityEditor({ poll, selected, onChange, disabled, zh }: { poll: SharedTimePoll; selected: number[]; onChange: (ids: number[]) => void; disabled: boolean; zh: boolean }) {
  const [day, setDay] = useState(poll.dates[0]);
  const slots = poll.slots.filter((slot) => slot.date === day);
  const [start, setStart] = useState(slots[0]?.id ?? 0);
  const [end, setEnd] = useState(slots[Math.min(3, slots.length - 1)]?.id ?? 0);
  const ranges = selectedRanges(poll, selected);
  const changeDay = (value: string) => {
    const next = poll.slots.filter((slot) => slot.date === value);
    setDay(value); setStart(next[0].id); setEnd(next[Math.min(3, next.length - 1)].id);
  };
  return <section className="space-y-5" aria-label={zh ? "我的可用时间" : "My availability"}>
    <div><h2 className="text-lg font-semibold">{zh ? "哪些时间方便？" : "When are you free?"}</h2><p className="mt-1 text-sm text-muted-foreground">{zh ? "添加一段或多段时间，修改会自动保存。" : "Add one or more time ranges. Changes save automatically."}</p></div>
    <div className="flex gap-2 overflow-x-auto pb-2" aria-label={zh ? "选择日期" : "Choose a date"}>
      {poll.dates.map((date) => <button key={date} type="button" aria-pressed={day === date} onClick={() => changeDay(date)} className={`min-h-12 shrink-0 rounded-xl border px-4 text-sm ${day === date ? "border-stone-800 bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900" : "border-border bg-background"}`}>{pollDate(date, zh)}</button>)}
    </div>
    <fieldset disabled={disabled} className="grid grid-cols-2 gap-3">
      <label className="space-y-2 text-sm"><span>{zh ? "开始" : "From"}</span><select aria-label={zh ? "开始时间" : "Start time"} value={start} onChange={(event) => { const value = Number(event.target.value); setStart(value); if (end < value) setEnd(value); }} className="min-h-12 w-full rounded-xl border bg-background px-3">
        {slots.map((slot) => <option key={slot.id} value={slot.id}>{slot.label}</option>)}
      </select></label>
      <label className="space-y-2 text-sm"><span>{zh ? "结束" : "Until"}</span><select aria-label={zh ? "结束时间" : "End time"} value={end} onChange={(event) => setEnd(Number(event.target.value))} className="min-h-12 w-full rounded-xl border bg-background px-3">
        {slots.map((slot, index) => slot.id >= start ? <option key={slot.id} value={slot.id}>{slots[index + 1]?.label ?? pollClock(slot.end, poll.timeZone)}</option> : null)}
      </select></label>
      <Button type="button" className="col-span-2 min-h-12 gap-2 rounded-xl" onClick={() => onChange([...selected, ...slots.filter((slot) => slot.id >= start && slot.id <= end).map((slot) => slot.id)])}><Plus className="h-4 w-4" aria-hidden />{zh ? "添加这段时间" : "Add this time"}</Button>
    </fieldset>
    <div className="space-y-2" aria-live="polite">
      {ranges.length ? ranges.map((range) => <div key={range.start} className="flex items-center justify-between gap-3 rounded-xl bg-muted px-4 py-2.5 text-sm">
        <span>{pollDate(range.date, zh)} · {pollClock(range.start, poll.timeZone)}–{pollClock(range.end, poll.timeZone)}</span>
        <button type="button" disabled={disabled} aria-label={`${zh ? "移除" : "Remove"} ${pollClock(range.start, poll.timeZone)}–${pollClock(range.end, poll.timeZone)}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-background" onClick={() => onChange(selected.filter((id) => !range.ids.includes(id)))}><X className="h-4 w-4" aria-hidden /></button>
      </div>) : <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{zh ? "还没有选择时间。" : "No times selected yet."}</p>}
    </div>
    <button type="button" disabled={disabled} onClick={() => onChange([])} className="min-h-11 text-sm underline underline-offset-4">{zh ? "我在这些日期都没空" : "I'm unavailable on these dates"}</button>
  </section>;
}
