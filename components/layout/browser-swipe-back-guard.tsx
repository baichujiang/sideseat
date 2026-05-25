"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/** Bottom-tab roots — no history trap (nothing in-app to pop). */
const TAB_ROOT_PATHS = new Set([
  "/home",
  "/discover",
  "/inbox",
  "/profile",
]);

const SWIPE_GUARD_STATE_KEY = "sideseat:swipe-guard";

function isTabRoot(pathname: string | null): boolean {
  if (!pathname) return true;
  return TAB_ROOT_PATHS.has(pathname);
}

/**
 * Blocks the mobile browser's native left-edge "back" swipe on drill-in routes.
 *
 * In-app edge swipe-back was removed on purpose; iOS Safari / Chrome can still pop
 * `history` on an edge swipe. We push a guard entry so the first swipe is absorbed
 * instead of leaving the screen. Use the header back button to navigate back.
 */
export function BrowserSwipeBackGuard() {
  const pathname = usePathname();
  const armedRef = useRef(false);

  useEffect(() => {
    if (isTabRoot(pathname)) {
      armedRef.current = false;
      return;
    }

    const arm = () => {
      window.history.pushState({ [SWIPE_GUARD_STATE_KEY]: true }, "", window.location.href);
      armedRef.current = true;
    };

    arm();

    const onPopState = () => {
      if (!armedRef.current) return;
      arm();
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      armedRef.current = false;
    };
  }, [pathname]);

  return null;
}
