"use client";
import { useEffect, useRef, useState, type PointerEvent } from "react";

type Point = { column: number; row: number; id: number };
type Drag = { start: Point; original: number[]; selecting: boolean; value: number[] };

// Keep native scrolling until a deliberate hold. A non-passive DOM listener can
// stop scrolling only after the hold; React's delegated touch listener cannot.
export function useAvailabilityGesture({ enabled, selected, position, rectangle, onChange, onEditingChange }: {
  enabled: boolean; selected: number[];
  position: (x: number, y: number, clamped: boolean) => Point | null;
  rectangle: (start: Point, end: Point, original: number[], selecting: boolean) => number[];
  onChange: (value: number[]) => void; onEditingChange: (editing: boolean) => void;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClickUntil = useRef(0);
  const [preview, setPreview] = useState<number[] | null>(null);
  const current = useRef({ enabled, selected, position, rectangle, onChange, onEditingChange });
  current.current = { enabled, selected, position, rectangle, onChange, onEditingChange };
  const begin = (x: number, y: number) => {
    const c = current.current, start = c.position(x, y, false);
    if (!c.enabled || !start) return false;
    const selecting = !c.selected.includes(start.id);
    const value = c.rectangle(start, start, c.selected, selecting);
    drag.current = { start, original: c.selected, selecting, value };
    setPreview(value); c.onEditingChange(true); return true;
  };
  const move = (x: number, y: number) => {
    const d = drag.current, c = current.current, end = c.position(x, y, true);
    if (!d || !end) return;
    d.value = c.rectangle(d.start, end, d.original, d.selecting); setPreview(d.value);
  };
  const finish = (commit: boolean) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null; setPreview(null); suppressClickUntil.current = performance.now() + 500;
    if (commit && current.current.enabled) current.current.onChange(d.value);
    current.current.onEditingChange(false);
  };
  const actions = useRef({ begin, move, finish });
  actions.current = { begin, move, finish };
  useEffect(() => {
    const element = surface.current;
    if (!element || !enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let touch: { id: number; x: number; y: number } | null = null;
    const clear = () => { clearTimeout(timer); timer = undefined; touch = null; };
    const start = (event: TouchEvent) => {
      clear(); suppressClickUntil.current = 0;
      if (event.touches.length !== 1) { actions.current.finish(false); return; }
      const t = event.touches[0];
      if (!current.current.position(t.clientX, t.clientY, false)) return;
      touch = { id: t.identifier, x: t.clientX, y: t.clientY };
      timer = setTimeout(() => { if (touch) actions.current.begin(touch.x, touch.y); }, 400);
    };
    const moving = (event: TouchEvent) => {
      if (!touch) return;
      if (event.touches.length !== 1) { clear(); actions.current.finish(false); return; }
      const t = Array.from(event.touches).find((item) => item.identifier === touch?.id);
      if (!t) return;
      if (drag.current) {
        if (!event.cancelable) { clear(); actions.current.finish(false); return; }
        event.preventDefault(); actions.current.move(t.clientX, t.clientY);
      } else if (Math.hypot(t.clientX - touch.x, t.clientY - touch.y) > 10) clear();
    };
    const end = (event: TouchEvent) => {
      if (drag.current) {
        if (event.cancelable) event.preventDefault();
        const t = Array.from(event.changedTouches).find((item) => item.identifier === touch?.id);
        if (t) actions.current.move(t.clientX, t.clientY);
        actions.current.finish(true);
      }
      clear();
    };
    const cancel = () => { clear(); actions.current.finish(false); };
    element.addEventListener("touchstart", start, { passive: true });
    element.addEventListener("touchmove", moving, { passive: false });
    element.addEventListener("touchend", end, { passive: false });
    element.addEventListener("touchcancel", cancel);
    return () => {
      cancel(); element.removeEventListener("touchstart", start); element.removeEventListener("touchmove", moving);
      element.removeEventListener("touchend", end); element.removeEventListener("touchcancel", cancel);
    };
  }, [enabled]);
  return { surface, preview,
    onClick: (id: number, keyboard: boolean) => {
      if (current.current.enabled && (keyboard || performance.now() >= suppressClickUntil.current)) {
        const value = current.current.selected;
        current.current.onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);
      }
    },
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "touch" || event.button !== 0) return;
      suppressClickUntil.current = 0;
      if (begin(event.clientX, event.clientY)) { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); }
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => { if (event.pointerType !== "touch" && drag.current) move(event.clientX, event.clientY); },
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => { if (event.pointerType !== "touch") finish(true); },
    onPointerCancel: (event: PointerEvent<HTMLDivElement>) => { if (event.pointerType !== "touch") finish(false); },
    onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => { if (event.pointerType !== "touch") finish(false); },
  };
}
