"use client";

import Link from "next/link";
import type { Route } from "next";
import { useCallback, useRef, useState } from "react";

const ACTION_WIDTH = 76;
const SNAP_OPEN = -(ACTION_WIDTH * 2);
const DRAG_THRESHOLD = 8;

export function InboxSwipeRow({
  href,
  connectionId,
  returnTo = "/inbox",
  pinned = false,
  children,
}: {
  href: Route;
  connectionId: string;
  returnTo?: string;
  pinned?: boolean;
  children: React.ReactNode;
}) {
  const [offset, setOffset] = useState(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const startOffset = useRef(0);
  const tracking = useRef(false);
  const dragged = useRef(false);
  const pointerId = useRef<number | null>(null);

  const snap = useCallback((raw: number) => {
    if (raw < SNAP_OPEN / 2) {
      setOffset(SNAP_OPEN);
    } else {
      setOffset(0);
    }
  }, []);

  // We intentionally do NOT call setPointerCapture on this outer div: on
  // WebKit, parent pointer capture silently swallows the `click` event on the
  // inner <a>, which made the whole DM row un-tappable. Instead we just track
  // the pointer manually; if it drifts far enough horizontally we flip into
  // drag mode and the <a>'s onClick preventDefault blocks navigation.

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    tracking.current = true;
    dragged.current = false;
    pointerId.current = e.pointerId;
    startX.current = e.clientX;
    startY.current = e.clientY;
    startOffset.current = offset;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!tracking.current || pointerId.current !== e.pointerId) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (!dragged.current) {
      // Only start dragging horizontally — if the user is scrolling vertically
      // we bail and let the browser keep scrolling.
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > DRAG_THRESHOLD) {
        tracking.current = false;
        return;
      }
      if (Math.abs(dx) > DRAG_THRESHOLD) {
        dragged.current = true;
      } else {
        return;
      }
    }
    const next = Math.min(0, Math.max(SNAP_OPEN, startOffset.current + dx));
    setOffset(next);
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!tracking.current || pointerId.current !== e.pointerId) return;
    tracking.current = false;
    pointerId.current = null;
    if (dragged.current) {
      const dx = e.clientX - startX.current;
      snap(startOffset.current + dx);
    }
  };

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-y-0 right-0 z-0 flex w-[152px] items-stretch justify-stretch">
        <form
          action={`/api/connections/${connectionId}/pin`}
          method="post"
          className="flex w-[76px] shrink-0"
        >
          <input type="hidden" name="returnTo" value={returnTo} />
          <button
            type="submit"
            className="flex flex-1 items-center justify-center bg-amber-500 px-2 text-center text-[11px] font-semibold uppercase tracking-wide text-white"
          >
            {pinned ? "Unpin" : "Pin"}
          </button>
        </form>
        <form
          action={`/api/connections/${connectionId}/end`}
          method="post"
          className="flex w-[76px] shrink-0"
        >
          <input type="hidden" name="returnTo" value={returnTo} />
          <button
            type="submit"
            className="flex flex-1 items-center justify-center bg-destructive px-2 text-center text-[11px] font-semibold uppercase tracking-wide text-destructive-foreground"
          >
            Delete
          </button>
        </form>
      </div>

      <div
        role="presentation"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{ transform: `translateX(${offset}px)` }}
        className="relative z-[1] touch-pan-y bg-card will-change-transform"
      >
        <Link
          href={href}
          onClick={(e) => {
            // If this interaction turned into a horizontal drag, suppress the
            // synthetic click so we don't navigate on swipe-open.
            if (dragged.current) {
              e.preventDefault();
              dragged.current = false;
            }
          }}
          className="flex min-h-[4.25rem] items-center gap-3.5 px-4 py-3.5 transition-colors active:bg-muted/50 [@media(hover:hover)]:hover:bg-muted/45"
        >
          {children}
        </Link>
      </div>
    </div>
  );
}
