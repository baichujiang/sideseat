"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

import { dismissTopPushLayer } from "@/components/ui/app-push-layer";
import { isTabRootPath, resolveSwipeBackHref } from "@/lib/nav/swipe-back-target";

const EDGE_PX = 28;
const MIN_DX = 72;
const VERTICAL_DOMINANCE = 1.15;

type EdgeSwipeBackProps = {
  getBounds?: () => DOMRect | null;
};

export function EdgeSwipeBack({ getBounds }: EdgeSwipeBackProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

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

  const goBack = useCallback(() => {
    if (dismissTopPushLayer()) return;

    if (isTabRootPath(pathname) || pathname === "/onboarding") return;

    const href = resolveSwipeBackHref(pathname, searchParams);
    if (href != null) {
      router.replace(href as Route);
      return;
    }

    router.back();
  }, [router, pathname, searchParams]);

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

      goBack();
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
  }, [getBounds, inEdgeZone, goBack]);

  return null;
}
