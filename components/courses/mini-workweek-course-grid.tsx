"use client";

import type { Weekday } from "@prisma/client";
import { useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMinutes, parseTimeToMinutes } from "@/lib/validators/course";
import { cn } from "@/lib/utils";

const WORKDAYS: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI"];
const DAY_SHORT: Record<Weekday, string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};

/** Default new block length on the grid */
export const DEFAULT_SESSION_LENGTH_MIN = 90;
const GRID_VIEW_START = 8 * 60;
const GRID_VIEW_END = 20 * 60;
const SLOT_MINUTES = 30;
const TIME_COL_PX = 38;
/** Shared body height — time column and day columns use the same flex row layout so rows stay aligned */
const GRID_BODY_HEIGHT_PX = 360;
const HEADER_ROW_CLASS = "flex h-7 shrink-0 items-center border-b border-border/50";

const SLOT_ROW_STARTS: number[] = (() => {
  const rows: number[] = [];
  for (let m = GRID_VIEW_START; m < GRID_VIEW_END; m += SLOT_MINUTES) {
    rows.push(m);
  }
  return rows;
})();

/** Match Home week calendar long-press + drag feel. */
const LONG_PRESS_MS = 450;
const POINTER_SLOP_PX = 14;
const SNAP_MINUTES = 15;
const MIN_BLOCK_MINUTES = 30;
/** Last valid minute for `HH:mm` in our parsers (hours 0–23). */
const DAY_LAST_MINUTE = 23 * 60 + 59;

let miniDragSelectLockDepth = 0;
function lockMiniDragSelect() {
  miniDragSelectLockDepth += 1;
  if (miniDragSelectLockDepth === 1) {
    document.body.style.userSelect = "none";
    document.documentElement.style.userSelect = "none";
  }
}
function unlockMiniDragSelect() {
  miniDragSelectLockDepth = Math.max(0, miniDragSelectLockDepth - 1);
  if (miniDragSelectLockDepth === 0) {
    document.body.style.userSelect = "";
    document.documentElement.style.userSelect = "";
  }
}

function snapMiniMinute(m: number): number {
  const s = Math.round(m / SNAP_MINUTES) * SNAP_MINUTES;
  return Math.max(0, Math.min(DAY_LAST_MINUTE, s));
}

export type MiniSessionDraft = {
  weekday: Weekday;
  start: string;
  end: string;
  location: string;
};

function sessionBounds(s: MiniSessionDraft): { start: number; end: number } | null {
  const a = parseTimeToMinutes(s.start);
  const b = parseTimeToMinutes(s.end);
  if (a === null || b === null || b <= a) return null;
  return { start: a, end: b };
}

function clampEndSameDay(startMin: number, endMin: number): number {
  const max = 24 * 60 - 1;
  if (endMin <= startMin) return Math.min(startMin + DEFAULT_SESSION_LENGTH_MIN, max);
  return Math.min(endMin, max);
}

export function isCompleteMiniSession(s: MiniSessionDraft): boolean {
  return sessionBounds(s) !== null;
}

type Props = {
  sessions: MiniSessionDraft[];
  onSessionsChange: (next: MiniSessionDraft[]) => void;
  courseTitle: string;
};

export function MiniWorkweekCourseGrid({ sessions, onSessionsChange, courseTitle }: Props) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [liveBlock, setLiveBlock] = useState<{
    index: number;
    weekday: Weekday;
    startMin: number;
    endMin: number;
  } | null>(null);

  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const dayColElRef = useRef<Partial<Record<Weekday, HTMLDivElement | null>>>({});
  const suppressClickRef = useRef(false);

  const totalMinutes = GRID_VIEW_END - GRID_VIEW_START;
  const bodyHeight = GRID_BODY_HEIGHT_PX;

  const weekendSessions = useMemo(
    () =>
      sessions
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s.weekday === "SAT" || s.weekday === "SUN"),
    [sessions],
  );

  function addAtSlot(weekday: Weekday, slotStartMin: number) {
    const startMin = slotStartMin;
    const endMin = clampEndSameDay(startMin, startMin + DEFAULT_SESSION_LENGTH_MIN);
    const next: MiniSessionDraft = {
      weekday,
      start: formatMinutes(startMin),
      end: formatMinutes(endMin),
      location: "",
    };
    onSessionsChange([...sessions, next]);
    setSelectedIndex(sessions.length);
  }

  function updateSession(index: number, patch: Partial<MiniSessionDraft>) {
    onSessionsChange(
      sessions.map((s, i) => {
        if (i !== index) return s;
        const merged = { ...s, ...patch };
        if (patch.start !== undefined || patch.end !== undefined) {
          const b = sessionBounds(merged);
          if (b && b.end <= b.start) {
            const sm = parseTimeToMinutes(merged.start);
            if (sm !== null) {
              merged.end = formatMinutes(clampEndSameDay(sm, sm + DEFAULT_SESSION_LENGTH_MIN));
            }
          }
        }
        return merged;
      }),
    );
  }

  function removeSession(index: number) {
    onSessionsChange(sessions.filter((_, i) => i !== index));
    setSelectedIndex((cur) => {
      if (cur === null) return null;
      if (cur === index) return null;
      if (cur > index) return cur - 1;
      return cur;
    });
  }

  const selected = selectedIndex !== null ? sessions[selectedIndex] : null;

  function blockDisplay(
    index: number,
    session: MiniSessionDraft,
  ): { weekday: Weekday; start: number; end: number } | null {
    if (liveBlock && liveBlock.index === index) {
      return { weekday: liveBlock.weekday, start: liveBlock.startMin, end: liveBlock.endMin };
    }
    const b = sessionBounds(session);
    if (!b) return null;
    return { weekday: session.weekday, start: b.start, end: b.end };
  }

  function rawMinuteFromClientY(clientY: number, weekday: Weekday): number {
    const el = dayColElRef.current[weekday];
    if (!el) return GRID_VIEW_START + totalMinutes / 2;
    const r = el.getBoundingClientRect();
    if (r.height <= 1) return GRID_VIEW_START;
    const frac = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
    return GRID_VIEW_START + frac * totalMinutes;
  }

  function weekdayFromClientX(clientX: number): Weekday | null {
    for (const d of WORKDAYS) {
      const el = dayColElRef.current[d];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right) return d;
    }
    return null;
  }

  function startGridPointerSession(
    e: React.PointerEvent,
    index: number,
    mode: "move" | "resize-start" | "resize-end",
  ) {
    if (e.pointerType === "mouse" && e.button !== 0) return;

    const row = sessionsRef.current[index];
    if (!row) return;
    const b0 = sessionBounds(row);
    if (!b0) return;

    e.preventDefault();
    e.stopPropagation();

    setSelectedIndex(index);

    const pointerId = e.pointerId;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const captureEl = e.currentTarget as HTMLElement;

    let curWeekday: Weekday = row.weekday;
    let curStart = b0.start;
    let curEnd = b0.end;
    const originDuration = Math.max(MIN_BLOCK_MINUTES, curEnd - curStart);
    const grabOffsetMove =
      mode === "move" ? rawMinuteFromClientY(e.clientY, row.weekday) - curStart : 0;

    const immediateActivate = mode === "resize-start" || mode === "resize-end";
    let activatedForDrag = immediateActivate;
    let longPressTimer: number | null = null;

    const applyLive = () => {
      setLiveBlock({ index, weekday: curWeekday, startMin: curStart, endMin: curEnd });
    };

    if (immediateActivate) {
      lockMiniDragSelect();
      window.getSelection()?.removeAllRanges();
      try {
        captureEl.setPointerCapture(pointerId);
      } catch {
        /* ignore */
      }
      applyLive();
    } else {
      longPressTimer = window.setTimeout(() => {
        longPressTimer = null;
        activatedForDrag = true;
        lockMiniDragSelect();
        window.getSelection()?.removeAllRanges();
        try {
          captureEl.setPointerCapture(pointerId);
        } catch {
          /* ignore */
        }
        applyLive();
      }, LONG_PRESS_MS);
    }

    const clearLongPress = () => {
      if (longPressTimer != null) {
        window.clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };

    const detach = () => {
      document.removeEventListener("pointermove", onDocMove);
      document.removeEventListener("pointerup", onDocUp);
      document.removeEventListener("pointercancel", onDocUp);
      unlockMiniDragSelect();
    };

    const onDocMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (!activatedForDrag) {
        if (
          longPressTimer != null &&
          Math.hypot(ev.clientX - x0, ev.clientY - y0) > POINTER_SLOP_PX
        ) {
          clearLongPress();
          detach();
        }
        return;
      }
      const hit = weekdayFromClientX(ev.clientX);
      if (hit) curWeekday = hit;
      const m = rawMinuteFromClientY(ev.clientY, curWeekday);
      if (mode === "move") {
        let ns = m - grabOffsetMove;
        ns = Math.max(0, Math.min(DAY_LAST_MINUTE - originDuration, ns));
        curStart = ns;
        curEnd = ns + originDuration;
      } else if (mode === "resize-start") {
        let ns = m;
        ns = Math.min(ns, curEnd - MIN_BLOCK_MINUTES);
        ns = Math.max(0, ns);
        curStart = ns;
      } else {
        let ne = m;
        ne = Math.max(ne, curStart + MIN_BLOCK_MINUTES);
        ne = Math.min(DAY_LAST_MINUTE, ne);
        curEnd = ne;
      }
      applyLive();
    };

    const onDocUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      clearLongPress();
      detach();
      if (!activatedForDrag) {
        setLiveBlock(null);
        return;
      }
      try {
        captureEl.releasePointerCapture(pointerId);
      } catch {
        /* ignore */
      }

      let snapStart = curStart;
      let snapEnd = curEnd;
      if (mode === "move") {
        let ns = snapMiniMinute(curStart);
        ns = Math.max(0, Math.min(DAY_LAST_MINUTE - originDuration, ns));
        snapStart = ns;
        snapEnd = ns + originDuration;
      } else if (mode === "resize-start") {
        let ns = snapMiniMinute(curStart);
        ns = Math.min(ns, curEnd - MIN_BLOCK_MINUTES);
        ns = Math.max(0, ns);
        snapStart = ns;
        snapEnd = curEnd;
      } else {
        let ne = snapMiniMinute(curEnd);
        ne = Math.max(ne, curStart + MIN_BLOCK_MINUTES);
        ne = Math.min(DAY_LAST_MINUTE, ne);
        snapEnd = ne;
        snapStart = curStart;
      }
      snapStart = Math.max(0, Math.min(snapStart, snapEnd - MIN_BLOCK_MINUTES));

      const next = sessionsRef.current.map((s, i) => {
        if (i !== index) return s;
        return {
          ...s,
          weekday: curWeekday,
          start: formatMinutes(snapStart),
          end: formatMinutes(snapEnd),
        };
      });
      onSessionsChange(next);
      setLiveBlock(null);
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 280);
    };

    document.addEventListener("pointermove", onDocMove);
    document.addEventListener("pointerup", onDocUp);
    document.addEventListener("pointercancel", onDocUp);
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-snug text-muted-foreground">
        Tap an empty slot for <span className="font-medium text-foreground">1h 30m</span> (adjust below).
        <span className="font-medium text-foreground"> Long-press</span> a block to drag it (another day or
        time); drag the <span className="font-medium text-foreground">top / bottom dot</span> to change length.
        Mon–Fri on the grid — weekend below.
      </p>

      <div className="max-h-[min(420px,70vh)] overflow-y-auto overflow-x-auto rounded-xl border border-border/80 bg-muted/15">
        <div className="flex items-stretch">
          <div
            className="flex shrink-0 flex-col border-r border-border/60 bg-muted/25"
            style={{ width: TIME_COL_PX }}
          >
            <div className={cn(HEADER_ROW_CLASS, "justify-end pr-1")} aria-hidden />
            <div className="flex shrink-0 flex-col" style={{ height: bodyHeight }}>
              {SLOT_ROW_STARTS.map((m) => (
                <div
                  key={m}
                  className="flex min-h-0 flex-1 items-start justify-end border-b border-dashed border-border/20 pr-1 pt-0.5 text-[9px] tabular-nums text-muted-foreground"
                >
                  {m % 60 === 0 ? formatMinutes(m).replace(/^0/, "") : ""}
                </div>
              ))}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 items-stretch">
            {WORKDAYS.map((weekday) => (
              <div
                key={weekday}
                className="relative flex min-w-[52px] flex-1 flex-col border-r border-border/40 last:border-r-0"
              >
                <div className={cn(HEADER_ROW_CLASS, "justify-center text-[10px] font-semibold text-foreground")}>
                  {DAY_SHORT[weekday]}
                </div>

                <div
                  className="relative shrink-0"
                  style={{ height: bodyHeight }}
                  ref={(el) => {
                    dayColElRef.current[weekday] = el;
                  }}
                >
                  <div className="absolute inset-0 flex flex-col">
                    {SLOT_ROW_STARTS.map((slotStart) => (
                      <div key={slotStart} className="relative min-h-0 flex-1 border-b border-dashed border-border/25">
                        <button
                          type="button"
                          aria-label={`Add ${courseTitle} ${DAY_SHORT[weekday]} ${formatMinutes(slotStart)}`}
                          className="absolute inset-0 z-0 transition hover:bg-primary/5"
                          onClick={() => {
                            addAtSlot(weekday, slotStart);
                          }}
                        />
                      </div>
                    ))}
                  </div>

                  {sessions.map((session, index) => {
                    const disp = blockDisplay(index, session);
                    if (!disp || disp.weekday !== weekday) return null;
                    const visStart = Math.max(disp.start, GRID_VIEW_START);
                    const visEnd = Math.min(disp.end, GRID_VIEW_END);
                    if (visEnd <= visStart) return null;
                    const topPct = ((visStart - GRID_VIEW_START) / totalMinutes) * 100;
                    const heightPct = ((visEnd - visStart) / totalMinutes) * 100;
                    const blockHeightPx = Math.max((heightPct / 100) * bodyHeight, 18);
                    const showResizeHandles = blockHeightPx >= 52;
                    const isSel = selectedIndex === index;
                    const dragging = liveBlock?.index === index;
                    const timeLabel = `${formatMinutes(disp.start)}–${formatMinutes(disp.end)}`;
                    return (
                      <div
                        key={`block-${index}`}
                        className={cn(
                          "absolute left-0.5 right-0.5 z-10 flex min-h-0 touch-none select-none flex-col overflow-hidden rounded-md border text-left shadow-sm transition",
                          "border-primary/35 bg-primary/15 hover:bg-primary/20",
                          isSel && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                          dragging && "z-20 scale-[1.02] ring-2 ring-primary/60",
                        )}
                        style={{
                          top: `${topPct}%`,
                          height: `${Math.max(heightPct, (18 / bodyHeight) * 100)}%`,
                        }}
                      >
                        {showResizeHandles ? (
                          <button
                            type="button"
                            className={cn(
                              "relative z-40 flex h-5 w-8 shrink-0 cursor-ns-resize touch-none items-center justify-end self-end rounded-full border-0 bg-transparent p-0 pr-0.5 outline-none",
                              "hover:bg-black/[0.06] focus-visible:ring-2 focus-visible:ring-primary/50 dark:hover:bg-white/[0.08]",
                            )}
                            aria-label={`Adjust start time for ${courseTitle}`}
                            onPointerDown={(e) => startGridPointerSession(e, index, "resize-start")}
                          >
                            <span
                              className="pointer-events-none block h-1.5 w-1.5 rounded-full border-2 border-primary bg-white shadow-sm dark:bg-card"
                              aria-hidden
                            />
                          </button>
                        ) : null}
                        <div
                          role="button"
                          tabIndex={0}
                          className={cn(
                            "relative z-20 min-h-0 flex-1 cursor-grab overflow-hidden px-1 py-0.5 active:cursor-grabbing",
                          )}
                          onKeyDown={(ev) => {
                            if (ev.key === "Enter" || ev.key === " ") {
                              ev.preventDefault();
                              setSelectedIndex(index);
                            }
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (suppressClickRef.current) return;
                            setSelectedIndex(index);
                          }}
                          onPointerDown={(e) => startGridPointerSession(e, index, "move")}
                        >
                          <span className="line-clamp-2 text-[9px] font-semibold leading-tight text-foreground">
                            {courseTitle}
                          </span>
                          <span className="block text-[8px] tabular-nums text-muted-foreground">{timeLabel}</span>
                        </div>
                        {showResizeHandles ? (
                          <button
                            type="button"
                            className={cn(
                              "relative z-40 flex h-5 w-8 shrink-0 cursor-ns-resize touch-none items-center justify-start self-start rounded-full border-0 bg-transparent p-0 pl-0.5 outline-none",
                              "hover:bg-black/[0.06] focus-visible:ring-2 focus-visible:ring-primary/50 dark:hover:bg-white/[0.08]",
                            )}
                            aria-label={`Adjust end time for ${courseTitle}`}
                            onPointerDown={(e) => startGridPointerSession(e, index, "resize-end")}
                          >
                            <span
                              className="pointer-events-none block h-1.5 w-1.5 rounded-full border-2 border-primary bg-white shadow-sm dark:bg-card"
                              aria-hidden
                            />
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {selected && selectedIndex !== null && WORKDAYS.includes(selected.weekday) ? (
        <div className="rounded-xl border border-border/70 bg-card p-3">
          <p className="text-[11px] font-medium text-foreground">Edit time · {DAY_SHORT[selected.weekday]}</p>
          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{courseTitle}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground">Start</label>
              <Input
                type="time"
                className="mt-0.5 h-9 text-[13px]"
                value={selected.start}
                onChange={(e) => updateSession(selectedIndex, { start: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">End</label>
              <Input
                type="time"
                className="mt-0.5 h-9 text-[13px]"
                value={selected.end}
                onChange={(e) => updateSession(selectedIndex, { end: e.target.value })}
              />
            </div>
          </div>
          <Input
            className="mt-2 h-9 text-[13px]"
            placeholder="Location (optional)"
            value={selected.location}
            onChange={(e) => updateSession(selectedIndex, { location: e.target.value })}
          />
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 flex-1 text-[12px] text-destructive"
              onClick={() => removeSession(selectedIndex)}
            >
              Remove
            </Button>
            <Button type="button" variant="secondary" size="sm" className="h-8 flex-1 text-[12px]" onClick={() => setSelectedIndex(null)}>
              Done
            </Button>
          </div>
        </div>
      ) : null}

      {weekendSessions.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-dashed border-border/70 bg-muted/10 p-3">
          <p className="text-[11px] font-medium text-foreground">Weekend</p>
          {weekendSessions.map(({ s, i }) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-[12px]">
              <span className="font-medium">{DAY_SHORT[s.weekday]}</span>
              <Input
                type="time"
                className="h-8 w-[7rem] text-[13px]"
                value={s.start}
                onChange={(e) => updateSession(i, { start: e.target.value })}
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="time"
                className="h-8 w-[7rem] text-[13px]"
                value={s.end}
                onChange={(e) => updateSession(i, { end: e.target.value })}
              />
              <Input
                className="h-8 min-w-[6rem] flex-1 text-[13px]"
                placeholder="Room"
                value={s.location}
                onChange={(e) => updateSession(i, { location: e.target.value })}
              />
              <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-destructive" onClick={() => removeSession(i)}>
                ×
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-[11px]"
          onClick={() => {
            const next: MiniSessionDraft = {
              weekday: "SAT",
              start: "10:00",
              end: formatMinutes(10 * 60 + DEFAULT_SESSION_LENGTH_MIN),
              location: "",
            };
            onSessionsChange([...sessions, next]);
          }}
        >
          + Saturday
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-[11px]"
          onClick={() => {
            const next: MiniSessionDraft = {
              weekday: "SUN",
              start: "10:00",
              end: formatMinutes(10 * 60 + DEFAULT_SESSION_LENGTH_MIN),
              location: "",
            };
            onSessionsChange([...sessions, next]);
          }}
        >
          + Sunday
        </Button>
      </div>
    </div>
  );
}
