"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/** Matches ~iOS navigation push timing (ms). */
export const APP_PUSH_TRANSITION_MS = 340;

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
  ariaLabel,
  ariaLabelledBy,
}: AppPushLayerProps) {
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

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
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mounted, onClose]);

  useEffect(() => {
    if (!lockBodyScroll || !mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [lockBodyScroll, mounted]);

  if (!mounted) return null;

  const dur = `${APP_PUSH_TRANSITION_MS}ms`;

  return (
    <div
      className={cn("fixed inset-0", zClassName)}
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
      <div className="pointer-events-none absolute inset-y-0 right-0 flex max-w-full">
        <div
          className={cn(
            "pointer-events-auto flex h-full w-[min(100vw,28rem)] flex-col border-l border-border/60 bg-card shadow-[-12px_0_40px_-16px_rgba(15,23,42,0.22)] dark:shadow-[-12px_0_40px_-12px_rgba(0,0,0,0.5)]",
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
    </div>
  );
}
