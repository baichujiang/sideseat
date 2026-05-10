"use client";

import type { Weekday } from "@prisma/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
  /** View-only: same week grid, no add / drag / edit (use on course detail before tapping Edit). */
  readOnly?: boolean;
};

export function MiniWorkweekCourseGrid({
  sessions,
  onSessionsChange,
  courseTitle,
  readOnly = false,
}: Props) {
  /** Edit panel open for this index (triggered by tap). */
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  /** Drag-ready mode: card deepens, anchors visible (triggered by long-press). */
  const [dragSelectedIndex, setDragSelectedIndex] = useState<number | null>(null);
  /** Toolbar visible for this index (only on initial long-press, dismissed on any interaction). */
  const [toolbarIndex, setToolbarIndex] = useState<number | null>(null);
  const [liveBlock, setLiveBlock] = useState<{
    index: number;
    weekday: Weekday;
    startMin: number;
    endMin: number;
    /** Pointer clientX for smooth horizontal positioning during move drag. */
    dragX?: number;
  } | null>(null);
  /** Clipboard for cut/copy. */
  const [clipboard, setClipboard] = useState<{ session: MiniSessionDraft; isCut: boolean } | null>(null);

  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const dayColElRef = useRef<Partial<Record<Weekday, HTMLDivElement | null>>>({});
  const gridColsElRef = useRef<HTMLDivElement | null>(null);
  const suppressClickRef = useRef(false);
  const blockElRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());
  const [toolbarPos, setToolbarPos] = useState<{ top: number; left: number } | null>(null);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => { setPortalReady(true); }, []);

  const updateToolbarPos = useCallback((idx: number) => {
    const el = blockElRefs.current.get(idx);
    if (!el) { setToolbarPos(null); return; }
    const r = el.getBoundingClientRect();
    setToolbarPos({ top: r.bottom + 6, left: r.left + r.width / 2 });
  }, []);

  useEffect(() => {
    if (toolbarIndex === null) { setToolbarPos(null); return; }
    updateToolbarPos(toolbarIndex);
  }, [toolbarIndex, updateToolbarPos]);

  const totalMinutes = GRID_VIEW_END - GRID_VIEW_START;
  const bodyHeight = GRID_BODY_HEIGHT_PX;


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
    setToolbarIndex(null);
    setDragSelectedIndex(null);
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
    setToolbarIndex(null);
    setDragSelectedIndex(null);
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
    if (readOnly) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;

    const row = sessionsRef.current[index];
    if (!row) return;
    const b0 = sessionBounds(row);
    if (!b0) return;

    const immediateActivate = mode === "resize-start" || mode === "resize-end";

    if (immediateActivate) {
      e.preventDefault();
    }
    e.stopPropagation();

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

    let activatedForDrag = immediateActivate;
    let longPressTimer: number | null = null;
    let didMove = false;
    let curClientX = x0;

    const applyLive = () => {
      setLiveBlock({
        index,
        weekday: curWeekday,
        startMin: curStart,
        endMin: curEnd,
        dragX: mode === "move" ? curClientX : undefined,
      });
    };

    // Prevent browser scroll while dragging on touch devices
    const preventScroll = (ev: TouchEvent) => { ev.preventDefault(); };

    if (immediateActivate) {
      lockMiniDragSelect();
      window.getSelection()?.removeAllRanges();
      try { captureEl.setPointerCapture(pointerId); } catch { /* ignore */ }
      document.addEventListener("touchmove", preventScroll, { passive: false });
      applyLive();
    } else {
      longPressTimer = window.setTimeout(() => {
        longPressTimer = null;
        activatedForDrag = true;
        setSelectedIndex(null);
        setDragSelectedIndex(index);
        setToolbarIndex(index);
        lockMiniDragSelect();
        window.getSelection()?.removeAllRanges();
        try { captureEl.setPointerCapture(pointerId); } catch { /* ignore */ }
        document.addEventListener("touchmove", preventScroll, { passive: false });
        applyLive();
        suppressClickRef.current = true;
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
      document.removeEventListener("touchmove", preventScroll);
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
      if (!didMove && Math.hypot(ev.clientX - x0, ev.clientY - y0) > POINTER_SLOP_PX) {
        didMove = true;
        setToolbarIndex(null);
      }
      curClientX = ev.clientX;
      const hit = weekdayFromClientX(ev.clientX);
      if (hit) curWeekday = hit;
      const m = rawMinuteFromClientY(ev.clientY, curWeekday);
      if (mode === "move") {
        let ns = m - grabOffsetMove;
        ns = Math.max(0, Math.min(DAY_LAST_MINUTE - originDuration, ns));
        ns = snapMiniMinute(ns);
        ns = Math.max(0, Math.min(DAY_LAST_MINUTE - originDuration, ns));
        curStart = ns;
        curEnd = ns + originDuration;
      } else if (mode === "resize-start") {
        let ns = snapMiniMinute(m);
        ns = Math.min(ns, curEnd - MIN_BLOCK_MINUTES);
        ns = Math.max(0, ns);
        curStart = ns;
      } else {
        let ne = snapMiniMinute(m);
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
        // Allow native click to fire → will open edit panel
        return;
      }

      try { captureEl.releasePointerCapture(pointerId); } catch { /* ignore */ }

      if (!didMove) {
        // Long-press without movement: stay in drag-selected state (anchors visible)
        setLiveBlock(null);
        suppressClickRef.current = true;
        window.setTimeout(() => { suppressClickRef.current = false; }, 280);
        return;
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
        return { ...s, weekday: curWeekday, start: formatMinutes(snapStart), end: formatMinutes(snapEnd) };
      });
      onSessionsChange(next);
      setLiveBlock(null);
      suppressClickRef.current = true;
      window.setTimeout(() => { suppressClickRef.current = false; }, 280);
    };

    document.addEventListener("pointermove", onDocMove);
    document.addEventListener("pointerup", onDocUp);
    document.addEventListener("pointercancel", onDocUp);
  }

  return (
    <div className="space-y-3">
      {readOnly ? (
        <p className="text-[11px] leading-snug text-muted-foreground">
          <span className="font-medium text-foreground">Edit</span> to add or change times.
        </p>
      ) : (
        <p className="text-[11px] leading-snug text-muted-foreground">
          <span className="font-medium text-foreground">Tap</span> empty slot → add 1h 30m.{" "}
          <span className="font-medium text-foreground">Tap</span> a block → edit.{" "}
          <span className="font-medium text-foreground">Long-press</span> → select (dots appear) → drag to move or
          resize.
        </p>
      )}

      <div
        className={cn(
          "max-h-[min(420px,70vh)] w-full min-w-0 overflow-y-auto overflow-x-hidden rounded-xl border border-border/80 bg-muted/15 touch-pan-y",
          readOnly && "bg-muted/10",
        )}
      >
        <div className="flex w-full min-w-0 items-stretch">
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

          <div
            className="relative flex min-w-0 flex-1 items-stretch"
            ref={(el) => {
              gridColsElRef.current = el;
            }}
          >
            {WORKDAYS.map((weekday) => (
              <div
                key={weekday}
                className="relative flex min-w-0 flex-1 flex-col border-r border-border/40 last:border-r-0"
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
                        {readOnly ? (
                          <span className="absolute inset-0 z-0" aria-hidden />
                        ) : (
                          <button
                            type="button"
                            aria-label={`Add ${courseTitle} ${DAY_SHORT[weekday]} ${formatMinutes(slotStart)}`}
                            className="absolute inset-0 z-0 transition hover:bg-primary/5"
                            onClick={() => {
                              if (dragSelectedIndex !== null) {
                                setDragSelectedIndex(null);
                                setToolbarIndex(null);
                                return;
                              }
                              addAtSlot(weekday, slotStart);
                            }}
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  {sessions.map((session, index) => {
                    // Skip rendering in column if this block is being smoothly dragged
                    if (liveBlock?.index === index && liveBlock.dragX != null) return null;
                    const disp = blockDisplay(index, session);
                    if (!disp || disp.weekday !== weekday) return null;
                    const visStart = Math.max(disp.start, GRID_VIEW_START);
                    const visEnd = Math.min(disp.end, GRID_VIEW_END);
                    if (visEnd <= visStart) return null;
                    const topPct = ((visStart - GRID_VIEW_START) / totalMinutes) * 100;
                    const heightPct = ((visEnd - visStart) / totalMinutes) * 100;
                    const isEditing = selectedIndex === index;
                    const isDragSelected = dragSelectedIndex === index;
                    const dragging = liveBlock?.index === index;
                    const timeLabel = `${formatMinutes(disp.start)}–${formatMinutes(disp.end)}`;
                    return (
                      <div
                        key={`block-${index}`}
                        ref={(el) => { blockElRefs.current.set(index, el); }}
                        className={cn(
                          "absolute left-0.5 right-0.5 z-10 overflow-visible rounded-sm border shadow-sm",
                          readOnly ? "border-border/50 bg-muted/40" : "border-primary/35 bg-primary/15",
                          !readOnly && isEditing && "z-20 ring-2 ring-primary ring-offset-1 ring-offset-background",
                          !readOnly && isDragSelected && !dragging && "z-20 border-primary/60 bg-primary/30",
                          !readOnly && dragging && "z-30 scale-[1.02] border-primary/60 bg-primary/30 ring-2 ring-primary/60",
                          !readOnly && (dragging ? "transition-none" : "transition-[box-shadow,transform,background-color]"),
                        )}
                        style={{
                          top: `${topPct}%`,
                          height: `${Math.max(heightPct, (18 / bodyHeight) * 100)}%`,
                        }}
                      >
                        {readOnly ? (
                          <div
                            className="absolute inset-0 z-10 select-none overflow-hidden rounded-[inherit] px-1 py-0.5"
                            aria-label={`${courseTitle} ${DAY_SHORT[weekday]} ${timeLabel}`}
                          >
                            <span className="line-clamp-2 text-[9px] font-semibold leading-tight text-foreground">
                              {courseTitle}
                            </span>
                            <span className="block text-[8px] tabular-nums text-muted-foreground">{timeLabel}</span>
                          </div>
                        ) : (
                          <>
                            {/* Body — tap to open edit, long-press to enter drag mode */}
                            <div
                              role="button"
                              tabIndex={0}
                              className={cn(
                                "absolute inset-0 z-10 cursor-grab select-none overflow-hidden rounded-[inherit] px-1 py-0.5 active:cursor-grabbing",
                                isDragSelected && "touch-none",
                              )}
                              onKeyDown={(ev) => {
                                if (ev.key === "Enter" || ev.key === " ") {
                                  ev.preventDefault();
                                  if (isDragSelected) return;
                                  setSelectedIndex(isEditing ? null : index);
                                }
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (suppressClickRef.current) return;
                                setToolbarIndex(null);
                                if (isDragSelected) return;
                                setSelectedIndex(isEditing ? null : index);
                              }}
                              onPointerDown={(e) => startGridPointerSession(e, index, "move")}
                            >
                              <span className="line-clamp-2 text-[9px] font-semibold leading-tight text-foreground">
                                {courseTitle}
                              </span>
                              <span className="block text-[8px] tabular-nums text-muted-foreground">
                                {timeLabel}
                              </span>
                            </div>
                          </>
                        )}

                        {/* Resize handles — only visible in drag-selected mode */}
                        {!readOnly && (isDragSelected || dragging) ? (
                          <>
                            <button
                              type="button"
                              className="absolute right-1 z-50 flex h-6 w-6 cursor-ns-resize touch-none items-center justify-center rounded-full bg-transparent p-0 outline-none"
                              style={{ top: "-4px", transform: "translateY(-50%)" }}
                              aria-label={`Adjust start time for ${courseTitle}`}
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                setToolbarIndex(null);
                                startGridPointerSession(e, index, "resize-start");
                              }}
                            >
                              <span
                                className="pointer-events-none block h-1 w-1 shrink-0 rounded-full bg-[#E53935] shadow-[0_0_0_1px_rgba(255,255,255,0.65)] dark:bg-red-400 dark:shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
                                aria-hidden
                              />
                            </button>
                            <button
                              type="button"
                              className="absolute left-1 z-50 flex h-6 w-6 cursor-ns-resize touch-none items-center justify-center rounded-full bg-transparent p-0 outline-none"
                              style={{ bottom: "-4px", transform: "translateY(50%)" }}
                              aria-label={`Adjust end time for ${courseTitle}`}
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                setToolbarIndex(null);
                                startGridPointerSession(e, index, "resize-end");
                              }}
                            >
                              <span
                                className="pointer-events-none block h-1 w-1 shrink-0 rounded-full bg-[#E53935] shadow-[0_0_0_1px_rgba(255,255,255,0.65)] dark:bg-red-400 dark:shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
                                aria-hidden
                              />
                            </button>
                          </>
                        ) : null}

                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Smooth-dragging block rendered as overlay across all columns */}
            {!readOnly &&
              liveBlock &&
              liveBlock.dragX != null &&
              sessions[liveBlock.index] &&
              (() => {
              const visStart = Math.max(liveBlock.startMin, GRID_VIEW_START);
              const visEnd = Math.min(liveBlock.endMin, GRID_VIEW_END);
              if (visEnd <= visStart) return null;
              const topPct = ((visStart - GRID_VIEW_START) / totalMinutes) * 100;
              const heightPct = ((visEnd - visStart) / totalMinutes) * 100;
              const gridEl = gridColsElRef.current;
              const colWidth = gridEl ? gridEl.offsetWidth / WORKDAYS.length : 52;
              const gridRect = gridEl?.getBoundingClientRect();
              const headerH = 28;
              const relX = gridRect ? liveBlock.dragX! - gridRect.left : 0;
              const leftPx = relX - colWidth / 2;
              const timeLabel = `${formatMinutes(liveBlock.startMin)}\u2013${formatMinutes(liveBlock.endMin)}`;
              return (
                <div
                  key="drag-overlay"
                  className="pointer-events-none absolute z-40 overflow-visible rounded-sm border border-primary/60 bg-primary/30 shadow-lg"
                  style={{
                    top: headerH + (topPct / 100) * bodyHeight,
                    height: Math.max((heightPct / 100) * bodyHeight, 18),
                    left: leftPx,
                    width: colWidth - 4,
                  }}
                >
                  <div className="overflow-hidden px-1 py-0.5">
                    <span className="line-clamp-2 text-[9px] font-semibold leading-tight text-foreground">
                      {courseTitle}
                    </span>
                    <span className="block text-[8px] tabular-nums text-muted-foreground">
                      {timeLabel}
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {!readOnly && selected && selectedIndex !== null && WORKDAYS.includes(selected.weekday) ? (
        <div className="rounded-xl border border-border/70 bg-card p-3">
          {/* Header: title (center) + single Done control (both previously duplicated close) */}
          <div className="flex items-center gap-2">
            <span className="h-7 w-7 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1 text-center">
              <p className="text-[11px] font-medium text-foreground">{DAY_SHORT[selected.weekday]}</p>
              <p className="line-clamp-1 text-[10px] text-muted-foreground">{courseTitle}</p>
            </div>
            <button
              type="button"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10"
              aria-label="Done"
              onClick={() => setSelectedIndex(null)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
          </div>
          {/* Time inputs — compact: default Input chrome is tall/rounded for this narrow sheet */}
          <div className="mt-2.5 mx-auto grid w-full max-w-[13rem] grid-cols-2 gap-x-2 gap-y-0.5">
            <div className="min-w-0">
              <label className="text-[10px] text-muted-foreground">Start</label>
              <Input
                type="time"
                step={300}
                className="mt-0.5 h-8 w-full min-w-0 rounded-lg px-2 py-0 text-xs tabular-nums leading-8 [&::-webkit-datetime-edit-ampm-field]:hidden"
                value={selected.start}
                onChange={(e) => updateSession(selectedIndex, { start: e.target.value })}
              />
            </div>
            <div className="min-w-0">
              <label className="text-[10px] text-muted-foreground">End</label>
              <Input
                type="time"
                step={300}
                className="mt-0.5 h-8 w-full min-w-0 rounded-lg px-2 py-0 text-xs tabular-nums leading-8 [&::-webkit-datetime-edit-ampm-field]:hidden"
                value={selected.end}
                onChange={(e) => updateSession(selectedIndex, { end: e.target.value })}
              />
            </div>
          </div>
          <Input
            className="mt-2 h-8 rounded-lg px-2.5 py-0 text-xs"
            placeholder="Location (optional)"
            value={selected.location}
            onChange={(e) => updateSession(selectedIndex, { location: e.target.value })}
          />
          {/* Delete at bottom */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-3 h-8 w-full text-[12px] text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => removeSession(selectedIndex)}
          >
            Delete
          </Button>
        </div>
      ) : null}


      {/* Toolbar portal — rendered at body level to avoid overflow clipping */}
      {portalReady &&
        !readOnly &&
        toolbarIndex !== null &&
        toolbarPos &&
        sessionsRef.current[toolbarIndex]
        ? createPortal(
            <div
              className="fixed z-[200] flex -translate-x-1/2 items-center gap-0 whitespace-nowrap rounded-lg border border-border/80 bg-popover px-0.5 py-0.5 shadow-xl"
              style={{ top: toolbarPos.top, left: toolbarPos.left }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="rounded-md px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
                onClick={() => {
                  const s = sessionsRef.current[toolbarIndex!];
                  if (s) setClipboard({ session: { ...s }, isCut: true });
                  removeSession(toolbarIndex!);
                  setToolbarIndex(null);
                }}
              >
                Cut
              </button>
              <button
                type="button"
                className="rounded-md px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
                onClick={() => {
                  const s = sessionsRef.current[toolbarIndex!];
                  if (s) setClipboard({ session: { ...s }, isCut: false });
                  setToolbarIndex(null);
                }}
              >
                Copy
              </button>
              <button
                type="button"
                className="rounded-md px-2.5 py-1.5 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/10"
                onClick={() => {
                  removeSession(toolbarIndex!);
                  setToolbarIndex(null);
                }}
              >
                Delete
              </button>
              <button
                type="button"
                className="rounded-md px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
                onClick={() => {
                  const s = sessionsRef.current[toolbarIndex!];
                  if (s) {
                    onSessionsChange([...sessionsRef.current, { ...s }]);
                  }
                  setToolbarIndex(null);
                  setDragSelectedIndex(null);
                }}
              >
                Duplicate
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
