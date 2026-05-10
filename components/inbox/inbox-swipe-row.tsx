"use client";

import Link from "next/link";
import type { Route } from "next";
import { useCallback, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const ACTION_WIDTH = 76;
const SNAP_OPEN = -(ACTION_WIDTH * 2);
const DRAG_THRESHOLD = 8;

export type InboxSwipeTarget =
  | { type: "direct"; connectionId: string }
  | { type: "course"; courseId: string }
  | { type: "group"; groupChatId: string };

export function InboxSwipeRow({
  href,
  swipeTarget,
  returnTo = "/inbox",
  pinned = false,
  children,
}: {
  href: Route;
  swipeTarget: InboxSwipeTarget;
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

  const pinAction =
    swipeTarget.type === "direct"
      ? `/api/connections/${swipeTarget.connectionId}/pin`
      : swipeTarget.type === "course"
        ? `/api/courses/${swipeTarget.courseId}/inbox-pin`
        : `/api/group-chats/${swipeTarget.groupChatId}/inbox-pin`;
  const removeAction =
    swipeTarget.type === "direct"
      ? `/api/connections/${swipeTarget.connectionId}/end`
      : swipeTarget.type === "course"
        ? `/api/courses/${swipeTarget.courseId}/inbox-hide`
        : `/api/group-chats/${swipeTarget.groupChatId}/inbox-hide`;
  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-y-0 right-0 z-0 flex w-[152px] items-stretch justify-stretch">
        <form action={pinAction} method="post" className="flex w-[76px] shrink-0">
          <input type="hidden" name="returnTo" value={returnTo} />
          <button
            type="submit"
            className="flex flex-1 items-center justify-center bg-[#D97706] px-2 text-center text-[11px] font-semibold uppercase tracking-wide text-white transition-colors hover:bg-[#B45309]"
          >
            {pinned ? "Unpin" : "Pin"}
          </button>
        </form>
        <form action={removeAction} method="post" className="flex w-[76px] shrink-0">
          <input type="hidden" name="returnTo" value={returnTo} />
          <button
            type="submit"
            title={
              swipeTarget.type === "course"
                ? "Remove from Chats list only — you stay enrolled in the course."
                : swipeTarget.type === "group"
                  ? "Remove from Chats list only — you stay in the group."
                  : undefined
            }
            className="flex flex-1 items-center justify-center bg-[#94A3B8] px-2 text-center text-[11px] font-semibold uppercase tracking-wide text-white transition-colors hover:bg-[#64748B]"
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
        className={cn(
          "relative z-[1] touch-pan-y will-change-transform",
          pinned
            ? "bg-[#F5F1EA] dark:bg-amber-950/20"
            : "bg-white dark:bg-card",
        )}
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
          className={cn(
            "flex min-h-0 items-center gap-3 px-3 py-2.5 transition-colors active:bg-muted/40",
            pinned
              ? "[@media(hover:hover)]:hover:bg-black/[0.04] dark:[@media(hover:hover)]:hover:bg-white/[0.05]"
              : "[@media(hover:hover)]:hover:bg-muted/25",
          )}
        >
          {pinned ? <span className="sr-only">Pinned conversation</span> : null}
          {children}
        </Link>
      </div>
    </div>
  );
}
