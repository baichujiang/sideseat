"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

/** iOS-like: start within this many px of the shell’s left edge (not viewport). */
const EDGE_PX = 28;
/** Minimum rightward travel to count as “go back”. */
const MIN_DX = 72;
/** If vertical movement dominates, treat as scroll — cancel. */
const VERTICAL_DOMINANCE = 1.15;

type EdgeSwipeBackProps = {
  /** Column to measure against (centered `max-w-md` shell). If null, falls back to viewport left. */
  getBounds?: () => DOMRect | null;
};

/**
 * Touch / pen: swipe right from the left edge of the app column → `router.back()`.
 * Capture-phase listeners; does not call `preventDefault` so normal taps still work.
 */
export function EdgeSwipeBack({ getBounds }: EdgeSwipeBackProps) {
  const router = useRouter();
  const sessionRef = useRef<{
    pointerId: number;
    x0: number;
    y0: number;
  } | null>(null);

  const inEdgeZone = useCallback(
    (clientX: number) => {
      const rect = getBounds?.() ?? null;
      if (rect) {
        return clientX >= rect.left && clientX <= rect.left + EDGE_PX;
      }
      return clientX <= EDGE_PX;
    },
    [getBounds],
  );

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      if (e.isPrimary === false) return;
      if (!inEdgeZone(e.clientX)) return;
      sessionRef.current = {
        pointerId: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
      };
    };

    const onMove = (e: PointerEvent) => {
      const s = sessionRef.current;
      if (!s || e.pointerId !== s.pointerId) return;
      const dx = e.clientX - s.x0;
      const dy = e.clientY - s.y0;
      if (dx < -12) {
        sessionRef.current = null;
        return;
      }
      if (Math.abs(dy) > 40 && Math.abs(dy) > Math.abs(dx) * VERTICAL_DOMINANCE) {
        sessionRef.current = null;
      }
    };

    const end = (e: PointerEvent) => {
      const s = sessionRef.current;
      if (!s || e.pointerId !== s.pointerId) return;
      sessionRef.current = null;

      const dx = e.clientX - s.x0;
      const dy = e.clientY - s.y0;
      if (dx < MIN_DX) return;
      if (Math.abs(dy) > dx * 0.85) return;

      router.back();
    };

    window.addEventListener("pointerdown", onDown, { capture: true });
    window.addEventListener("pointermove", onMove, { capture: true });
    window.addEventListener("pointerup", end, { capture: true });
    window.addEventListener("pointercancel", end, { capture: true });

    return () => {
      window.removeEventListener("pointerdown", onDown, { capture: true });
      window.removeEventListener("pointermove", onMove, { capture: true });
      window.removeEventListener("pointerup", end, { capture: true });
      window.removeEventListener("pointercancel", end, { capture: true });
    };
  }, [getBounds, inEdgeZone, router]);

  return null;
}
