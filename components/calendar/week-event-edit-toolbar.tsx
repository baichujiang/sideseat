"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

export type WeekEventEditToolbarLabels = {
  cut: string;
  copy: string;
  duplicate: string;
  delete: string;
  toolbarAriaLabel: string;
};

/**
 * iOS-Calendar–style popover that floats above a **long-press–selected** calendar event.
 *
 * Renders in a portal to `document.body` so it can poke above any clipping ancestor
 * (e.g. the scroll wrapper, sticky header band). It re-measures on every scroll /
 * resize so it stays glued to the event as the week grid pans.
 */
export function WeekEventEditToolbar({
  anchorEl,
  labels,
  onCut,
  onCopy,
  onDuplicate,
  onDelete,
  onDismiss,
}: {
  /** Element the toolbar is anchored to. When null, toolbar renders nothing. */
  anchorEl: HTMLElement | null;
  labels: WeekEventEditToolbarLabels;
  onCut: () => void;
  onCopy: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Called when user taps outside both the anchor and the toolbar. */
  onDismiss: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    /** Horizontal coordinate (window-relative) the caret should point at. */
    caretX: number;
    /** When true, render caret pointing up (toolbar is below anchor). */
    flipBelow: boolean;
  } | null>(null);

  useLayoutEffect(() => {
    if (!anchorEl) {
      setPos(null);
      return;
    }

    const recompute = () => {
      const r = anchorEl.getBoundingClientRect();
      const inner = innerRef.current;
      const tw = inner?.offsetWidth ?? 0;
      const th = inner?.offsetHeight ?? 40;
      const margin = 6;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const gap = 12; // toolbar → anchor gap (includes caret).

      const anchorCx = r.left + r.width / 2;
      let left = anchorCx - tw / 2;
      if (left < margin) left = margin;
      if (left + tw > vw - margin) left = Math.max(margin, vw - margin - tw);

      let top = r.top - th - gap;
      let flipBelow = false;
      if (top < margin) {
        const below = r.bottom + gap;
        if (below + th <= vh - margin) {
          top = below;
          flipBelow = true;
        } else {
          // Neither above nor below fits — pin to top with caret hidden.
          top = margin;
        }
      }

      setPos({ top, left, caretX: anchorCx, flipBelow });
    };

    recompute();

    const ro = new ResizeObserver(recompute);
    ro.observe(anchorEl);
    if (innerRef.current) ro.observe(innerRef.current);

    let raf: number | null = null;
    const onScrollOrResize = () => {
      if (raf != null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        recompute();
      });
    };
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);

    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [anchorEl]);

  useEffect(() => {
    if (!anchorEl) return;
    const onPointer = (ev: PointerEvent) => {
      const t = ev.target;
      if (!(t instanceof Node)) return;
      /** Portaled subtree — prefer `closest` so we still recognize hits if refs lag one frame. */
      if (t instanceof Element && t.closest("[data-week-event-edit-toolbar-root]")) return;
      if (anchorEl.contains(t)) return;
      if (wrapRef.current?.contains(t)) return;
      onDismiss();
    };
    /** Use `capture: true` so we run before any inner pointerdown stops propagation. */
    document.addEventListener("pointerdown", onPointer, true);
    return () => document.removeEventListener("pointerdown", onPointer, true);
  }, [anchorEl, onDismiss]);

  useEffect(() => {
    if (!anchorEl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anchorEl, onDismiss]);

  if (typeof window === "undefined" || !anchorEl) return null;

  /** Caret left (relative to toolbar inner). Clamped so it always stays inside the rounded shell. */
  const caretLeftRel =
    pos != null ? Math.max(14, Math.min(pos.caretX - pos.left, (innerRef.current?.offsetWidth ?? 0) - 14)) : 0;

  const node = (
    <div
      ref={wrapRef}
      data-week-event-edit-toolbar-root
      className="fixed z-[200] select-none"
      style={{
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        visibility: pos ? "visible" : "hidden",
      }}
      role="presentation"
      /** Absorb stray taps so nothing bubbles to the week grid / body listeners behind the toolbar. */
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/*
        Entire chrome (incl. caret triangle) must participate in hit-testing. Previously the outer
        shell used `pointer-events-none` and the inner box inherited it except on the flex row; the
        caret SVG used `pointer-events-none`, so taps “in” the toolbar fell through to the calendar.
        Our document-level outside-dismiss then cleared selection before `click` — actions looked dead.
      */}
      <div
        ref={innerRef}
        className={cn(
          "relative pointer-events-auto",
          /* Pad past the absolutely positioned caret so touches there stay inside this subtree. */
          pos?.flipBelow ? "pt-4" : "pb-4",
        )}
      >
        <div
          role="toolbar"
          aria-label={labels.toolbarAriaLabel}
          className={cn(
            "inline-flex items-stretch overflow-hidden rounded-2xl bg-white shadow-[0_18px_44px_-12px_rgba(15,23,42,0.45)] ring-1 ring-black/[0.06]",
            "dark:bg-zinc-900 dark:ring-white/10",
          )}
        >
          <ToolbarButton onClick={onCut} label={labels.cut} />
          <ToolbarDivider />
          <ToolbarButton onClick={onCopy} label={labels.copy} />
          <ToolbarDivider />
          <ToolbarButton onClick={onDuplicate} label={labels.duplicate} />
          <ToolbarDivider />
          <ToolbarButton onClick={onDelete} label={labels.delete} destructive />
        </div>
        {/* Caret — small triangle pointing toward the anchor. */}
        <Caret leftPx={caretLeftRel} flipBelow={pos?.flipBelow ?? false} />
      </div>
    </div>
  );

  return createPortal(node, document.body);
}

function ToolbarButton({
  label,
  onClick,
  destructive = false,
}: {
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      /* Prevent the outside-dismiss listener from firing on our own pointerdown. */
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
      }}
      className={cn(
        "min-w-[3.25rem] whitespace-nowrap px-3.5 py-2 text-[14px] font-medium leading-tight transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/35",
        destructive
          ? "text-[#E53935] hover:bg-red-50 active:bg-red-100 dark:text-red-400 dark:hover:bg-red-950/40"
          : "text-[#111827] hover:bg-zinc-100 active:bg-zinc-200 dark:text-zinc-100 dark:hover:bg-zinc-800",
      )}
    >
      {label}
    </button>
  );
}

function ToolbarDivider() {
  return (
    <span
      aria-hidden
      className="self-stretch w-px bg-black/[0.08] dark:bg-white/10"
    />
  );
}

function Caret({ leftPx, flipBelow }: { leftPx: number; flipBelow: boolean }) {
  /**
   * SVG caret — uses `currentColor` so it follows the toolbar shell color in
   * both light and dark mode. We center horizontally via `marginLeft: -W/2`
   * (rather than `translateX`) so the optional 180° rotation does not fight
   * the centering transform.
   */
  const W = 16;
  const H = 8;
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      className="pointer-events-auto absolute text-white drop-shadow-[0_2px_1px_rgba(15,23,42,0.06)] dark:text-zinc-900"
      style={{
        left: leftPx,
        marginLeft: -W / 2,
        transform: flipBelow ? "rotate(180deg)" : undefined,
        ...(flipBelow ? { top: -H + 0.5 } : { bottom: -H + 0.5 }),
      }}
    >
      <path d={`M 0 0 L ${W / 2} ${H} L ${W} 0 Z`} fill="currentColor" />
    </svg>
  );
}
