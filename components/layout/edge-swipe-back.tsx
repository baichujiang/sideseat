"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { dismissTopPushLayer } from "@/components/ui/app-push-layer";

const EDGE_PX = 28;
const MIN_DX = 72;
const VERTICAL_DOMINANCE = 1.15;

type EdgeSwipeBackProps = {
  getBounds?: () => DOMRect | null;
  /**
   * Pathnames where the left-edge swipe-back is a no-op (this screen has no
   * "parent" to pop to). Matches iOS, where the back gesture is disabled at
   * the root of a navigation stack. Pass the list of bottom-tab routes here
   * (exact-equality match; nested paths under a tab root are still swipe-able).
   */
  noBackPaths?: ReadonlyArray<string>;
};

/**
 * Single source of truth for the iOS-style left-edge back gesture.
 *
 * Resolution order on a completed swipe (left edge, mostly horizontal, dx ≥ {@link MIN_DX}):
 *  1. If a push-layer / sheet is open, dismiss the topmost one via
 *     {@link dismissTopPushLayer} (same as tapping the backdrop / Escape).
 *  2. Else if `pathname` is in `noBackPaths`, no-op. Mirrors iOS at the root
 *     of a navigation stack — there is no parent screen to pop.
 *  3. Else, pop one level via `router.back()` when `window.history.length > 1`.
 *     If the page was opened as a deep link with no prior entry we silently
 *     drop the gesture (again, iOS behaviour at stack root).
 *
 * Only the LEFT edge is monitored. There is no right-edge "forward" gesture
 * in this component; native iOS apps do not provide one. Any forward swipe a
 * user encounters comes from the browser chrome (e.g. iOS Safari history)
 * and is suppressed page-wide via `overscroll-behavior-x: none` in
 * `app/globals.css`.
 */
export function EdgeSwipeBack({ getBounds, noBackPaths }: EdgeSwipeBackProps) {
  const pathname = usePathname();
  const router = useRouter();

  // Stable membership check against the (caller-supplied) tab-root allowlist.
  const isAtTabRoot = useMemo(() => {
    if (!pathname || !noBackPaths || noBackPaths.length === 0) return false;
    return noBackPaths.includes(pathname);
  }, [noBackPaths, pathname]);

  const sessionRef = useRef<{
    pointerId: number;
    x0: number;
    y0: number;
  } | null>(null);

  const inLeftEdgeZone = useCallback(
    (clientX: number) => {
      const rect = getBounds?.() ?? null;
      if (rect) {
        return clientX >= rect.left && clientX <= rect.left + EDGE_PX;
      }
      return clientX <= EDGE_PX;
    },
    [getBounds],
  );

  const performEdgeBackGesture = useCallback(() => {
    if (dismissTopPushLayer()) return;
    if (isAtTabRoot) return;
    if (typeof window !== "undefined" && window.history.length <= 1) return;
    router.back();
  }, [isAtTabRoot, router]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      if (e.isPrimary === false) return;
      if (!inLeftEdgeZone(e.clientX)) return;
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

      performEdgeBackGesture();
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
  }, [inLeftEdgeZone, performEdgeBackGesture]);

  return null;
}
