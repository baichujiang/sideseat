"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

/** Matches ~iOS navigation push timing (ms). */
export const APP_PUSH_TRANSITION_MS = 340;

type AppPushLayerProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Panel/backdrop transition length. Use `0` when `prefers-reduced-motion: reduce` to skip slide animation. */
  transitionDurationMs?: number;
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
  /**
   * When false, Escape does not dismiss this layer (use when another push layer is stacked above
   * so only the top layer handles keyboard back).
   */
  listenForEscape?: boolean;
};

/**
 * Full-viewport overlay with a panel that slides in from the **right** (iOS-style stack push)
 * and slides out to the right on close.
 */
export function AppPushLayer({
  open,
  onClose,
  children,
  transitionDurationMs = APP_PUSH_TRANSITION_MS,
  zClassName = "z-50",
  panelClassName,
  backdropClassName,
  lockBodyScroll = true,
  fullBleed = false,
  ariaLabel,
  ariaLabelledBy,
  listenForEscape = true,
}: AppPushLayerProps) {
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (open) {
      setMounted(true);
      if (transitionDurationMs === 0) {
        setEntered(true);
        return;
      }
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setEntered(true));
      });
      return () => cancelAnimationFrame(id);
    }
    setEntered(false);
  }, [open, transitionDurationMs]);

  useEffect(() => {
    if (!open && mounted) {
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null;
        setMounted(false);
      }, transitionDurationMs + 120);
      return () => {
        if (closeTimerRef.current !== null) {
          window.clearTimeout(closeTimerRef.current);
          closeTimerRef.current = null;
        }
      };
    }
  }, [open, mounted, transitionDurationMs]);

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
    if (!mounted || !listenForEscape) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mounted, listenForEscape]);

  // Prevent "ghost clicks": when the sheet opens from a pointerup handler,
  // the browser may synthesize a click that lands on the newly-rendered backdrop,
  // immediately closing the sheet. Block backdrop clicks for a brief window.
  const backdropClickableRef = useRef(false);
  useEffect(() => {
    if (!open) {
      backdropClickableRef.current = false;
      return;
    }
    backdropClickableRef.current = false;
    // iOS/WebView can deliver the synthetic click later than one frame; keep backdrop
    // inert briefly so sheets opened from touch (e.g. Share availability) don't instantly dismiss.
    const id = window.setTimeout(() => {
      backdropClickableRef.current = true;
    }, 450);
    return () => window.clearTimeout(id);
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

  const dur = `${transitionDurationMs}ms`;

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
        onClick={() => {
          if (backdropClickableRef.current) onClose();
        }}
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
