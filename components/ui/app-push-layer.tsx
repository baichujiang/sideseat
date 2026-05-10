"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

/** Matches ~iOS navigation push timing (ms). */
export const APP_PUSH_TRANSITION_MS = 340;

/**
 * Global stack of open push-layer close callbacks.
 * EdgeSwipeBack checks this before navigating — if non-empty, the top layer
 * is closed instead of triggering page navigation.
 */
const layerCloseStack: Array<() => void> = [];

/** Called by EdgeSwipeBack: returns true if a layer was closed, false if navigation should proceed. */
export function dismissTopPushLayer(): boolean {
  if (layerCloseStack.length === 0) return false;
  const top = layerCloseStack[layerCloseStack.length - 1];
  top();
  return true;
}

/**
 * While `open`, registers `onClose` on the same stack as {@link AppPushLayer} so edge-swipe-back
 * dismisses this overlay before navigating away (e.g. bottom sheets that are not `AppPushLayer`).
 */
export function useRegisterDismissOnEdgeSwipe(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const closeFromEdgeGesture = () => {
      onCloseRef.current();
    };
    layerCloseStack.push(closeFromEdgeGesture);
    return () => {
      const idx = layerCloseStack.indexOf(closeFromEdgeGesture);
      if (idx !== -1) layerCloseStack.splice(idx, 1);
    };
  }, [open]);
}

type AppPushLayerProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Root z-index, e.g. `z-50` or `z-[100]` */
  zClassName?: string;
  /** Extra classes on the sliding panel (width, border, etc.) */
  panelClassName?: string;
  /** Backdrop appearance */
  backdropClassName?: string;
  /** Set `false` if the parent already locks body scroll */
  lockBodyScroll?: boolean;
  /**
   * When true, the sliding panel row spans the full viewport (`inset-0`).
   * Use for true full-screen content; the default `right-0` + intrinsic width
   * row collapses when the child is only `w-full` (no fixed width).
   */
  fullBleed?: boolean;
  /** Accessible name for the dialog root */
  ariaLabel?: string;
  /** Element id of the visible title (preferred over `ariaLabel` when set) */
  ariaLabelledBy?: string;
};

/**
 * Full-viewport overlay with a panel that slides in from the **right** (iOS-style stack push)
 * and slides out to the right on close.
 */
export function AppPushLayer({
  open,
  onClose,
  children,
  zClassName = "z-50",
  panelClassName,
  backdropClassName,
  lockBodyScroll = true,
  fullBleed = false,
  ariaLabel,
  ariaLabelledBy,
}: AppPushLayerProps) {
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setEntered(true));
      });
      return () => cancelAnimationFrame(id);
    }
    setEntered(false);
  }, [open]);

  useEffect(() => {
    if (!open && mounted) {
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null;
        setMounted(false);
      }, APP_PUSH_TRANSITION_MS + 120);
      return () => {
        if (closeTimerRef.current !== null) {
          window.clearTimeout(closeTimerRef.current);
          closeTimerRef.current = null;
        }
      };
    }
  }, [open, mounted]);

  const onPanelTransitionEnd = useCallback(
    (e: React.TransitionEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget || e.propertyName !== "transform") return;
      if (!open) {
        if (closeTimerRef.current !== null) {
          window.clearTimeout(closeTimerRef.current);
          closeTimerRef.current = null;
        }
        setMounted(false);
      }
    },
    [open],
  );

  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mounted]);

  // Register in global layer stack so EdgeSwipeBack can dismiss us.
  // Depend only on `open`: parents often pass an inline `onClose` that changes every render; re-running
  // this effect would remove then re-add the layer and briefly leave the stack empty so a swipe
  // falls through to `router.back()` (wrong: feels like switching tabs). Latest `onClose` via ref.
  useEffect(() => {
    if (!open) return;
    const closeFromEdgeGesture = () => {
      onCloseRef.current();
    };
    layerCloseStack.push(closeFromEdgeGesture);
    return () => {
      const idx = layerCloseStack.indexOf(closeFromEdgeGesture);
      if (idx !== -1) layerCloseStack.splice(idx, 1);
    };
  }, [open]);

  useEffect(() => {
    if (!lockBodyScroll || !mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [lockBodyScroll, mounted]);

  if (!mounted || typeof document === "undefined") return null;

  const dur = `${APP_PUSH_TRANSITION_MS}ms`;

  return createPortal(
    <div
      className={cn(
        "fixed inset-x-0 top-0 flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden",
        zClassName,
      )}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-foreground/20 backdrop-blur-[1px] transition-opacity ease-out",
          entered ? "opacity-100" : "opacity-0",
          backdropClassName,
        )}
        style={{ transitionDuration: dur }}
      />
      <div
        className={cn(
          "pointer-events-none absolute flex min-h-0",
          fullBleed
            ? "inset-0 w-full min-w-0 flex-col"
            : "inset-y-0 right-0 max-h-full max-w-full flex-col",
        )}
      >
        <div
          className={cn(
            "pointer-events-auto flex h-full max-h-full min-h-0 flex-col overflow-hidden border-l border-border/60 bg-card shadow-[-12px_0_40px_-16px_rgba(15,23,42,0.22)] dark:shadow-[-12px_0_40px_-12px_rgba(0,0,0,0.5)]",
            fullBleed ? "w-full min-w-0 flex-1" : "w-[min(100vw,28rem)]",
            "transition-transform ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform",
            entered ? "translate-x-0" : "translate-x-full",
            panelClassName,
          )}
          style={{ transitionDuration: dur }}
          onTransitionEnd={onPanelTransitionEnd}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
