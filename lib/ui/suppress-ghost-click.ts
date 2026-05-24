"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

/** Duration to ignore `click` after a floating panel mounts under the pointer. */
export const GHOST_CLICK_SUPPRESS_MS = 400;

/**
 * Suppresses synthetic `click` events that land on a popover/toolbar button
 * immediately after the panel mounts at the same screen coordinates as a
 * card tap (pointerup opens detail → click hits Delete).
 */
export function useGhostClickGuard(
  armedKey: string | number | null | undefined,
  delayMs = GHOST_CLICK_SUPPRESS_MS,
) {
  const armedAtRef = useRef(0);

  useLayoutEffect(() => {
    if (armedKey != null) armedAtRef.current = performance.now();
  }, [armedKey]);

  const guardAction = useCallback(
    (handler: () => void) => (ev: React.MouseEvent) => {
      if (performance.now() - armedAtRef.current < delayMs) {
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      handler();
    },
    [delayMs],
  );

  return guardAction;
}

/** Defer opening a detail popover until after the browser emits the tap `click`. */
export function deferAfterTapClick(fn: () => void) {
  requestAnimationFrame(() => {
    requestAnimationFrame(fn);
  });
}
