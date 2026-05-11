"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAppMessages } from "@/hooks/use-app-locale";
import { cn } from "@/lib/utils";

const UPDATE_CHECK_MS = 60 * 60 * 1000;
const BUILD_POLL_MS = 15 * 60 * 1000;
const SHOW_DEBOUNCE_MS = 450;
const BUILD_STORAGE_KEY = "sideseat_client_build_id";

/**
 * Chromium: new `sw.js` stays in `waiting` until user confirms → SKIP_WAITING + reload.
 * All clients: `/api/client-build` catches deploy fingerprint when SW lifecycle is flaky (esp. iOS).
 * Multiple rapid deploys → one debounced bar pointing at the latest known build id.
 */
export function PwaUpdatePrompt({ registration }: { registration: ServiceWorkerRegistration | null }) {
  const u = useAppMessages().pwaUpdatePrompt;
  const [show, setShow] = useState(false);
  const reloadOnce = useRef(false);
  const pendingBuildIdRef = useRef<string | null>(null);
  /** Browser timers return `number`; Node typings use `Timeout` — use explicit number for `window.setTimeout`. */
  const showDebounceRef = useRef<number | null>(null);

  const applyUpdate = useCallback(() => {
    if (reloadOnce.current) return;
    const reg = registration;
    if (reg?.waiting) {
      reloadOnce.current = true;
      reg.waiting.postMessage({ type: "SKIP_WAITING" });
      const fallback = window.setTimeout(() => {
        window.location.reload();
      }, 5000);
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => {
          window.clearTimeout(fallback);
          window.location.reload();
        },
        { once: true },
      );
      return;
    }
    reloadOnce.current = true;
    if (pendingBuildIdRef.current) {
      try {
        localStorage.setItem(BUILD_STORAGE_KEY, pendingBuildIdRef.current);
      } catch {
        /* private mode */
      }
    }
    window.location.reload();
  }, [registration]);

  const scheduleShow = useCallback(() => {
    if (showDebounceRef.current !== null) {
      window.clearTimeout(showDebounceRef.current);
    }
    showDebounceRef.current = window.setTimeout(() => {
      showDebounceRef.current = null;
      setShow(true);
    }, SHOW_DEBOUNCE_MS);
  }, []);

  const evaluateUpdates = useCallback(
    async (reg: ServiceWorkerRegistration | null) => {
      let wantShow = false;

      if (reg?.waiting) {
        wantShow = true;
      }

      try {
        const res = await fetch("/api/client-build", { cache: "no-store" });
        if (!res.ok) {
          if (wantShow) scheduleShow();
          return;
        }
        const data = (await res.json()) as { id?: string };
        const id = typeof data.id === "string" ? data.id : "";
        if (!id || id === "development") {
          if (wantShow) scheduleShow();
          return;
        }

        let stored: string | null = null;
        try {
          stored = localStorage.getItem(BUILD_STORAGE_KEY);
        } catch {
          /* private mode */
        }

        if (stored === null) {
          try {
            localStorage.setItem(BUILD_STORAGE_KEY, id);
          } catch {
            /* ignore */
          }
        } else if (stored !== id) {
          pendingBuildIdRef.current = id;
          wantShow = true;
        }
      } catch {
        if (wantShow) scheduleShow();
        return;
      }

      if (wantShow) scheduleShow();
    },
    [scheduleShow],
  );

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      await evaluateUpdates(registration);
    };

    const tickWithSwFetch = async () => {
      if (cancelled) return;
      if (registration) {
        try {
          await registration.update();
        } catch {
          /* ignore */
        }
      }
      await evaluateUpdates(registration);
    };

    void tickWithSwFetch();

    const onUpdateFound = () => {
      if (!registration) return;
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          void tick();
        }
      });
    };

    if (registration) {
      registration.addEventListener("updatefound", onUpdateFound);
    }

    const pollBuild = window.setInterval(() => void tick(), BUILD_POLL_MS);
    const pollSw = registration
      ? window.setInterval(() => void tickWithSwFetch(), UPDATE_CHECK_MS)
      : null;

    const onFocus = () => void tickWithSwFetch();
    const onVis = () => {
      if (document.visibilityState === "visible") void tickWithSwFetch();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      if (showDebounceRef.current !== null) {
        window.clearTimeout(showDebounceRef.current);
        showDebounceRef.current = null;
      }
      if (registration) {
        registration.removeEventListener("updatefound", onUpdateFound);
      }
      window.clearInterval(pollBuild);
      if (pollSw !== null) window.clearInterval(pollSw);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [registration, evaluateUpdates]);

  if (!show) return null;

  return (
    <div
      className={cn(
        "pointer-events-auto fixed inset-x-0 z-[22] flex justify-center pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]",
        "bottom-[calc(5.75rem+env(safe-area-inset-bottom))]",
      )}
      role="status"
      aria-live="polite"
    >
      <div
        className={cn(
          "flex w-full max-w-md items-center gap-3 overflow-hidden rounded-xl border border-classmates-edge bg-classmates-surface/98 p-3 shadow-[0_2px_10px_rgba(15,23,42,0.06)] ring-1 ring-black/[0.03] backdrop-blur-md supports-[backdrop-filter]:bg-classmates-surface/95",
          "dark:border-border dark:bg-card/98 dark:shadow-[0_10px_40px_rgba(0,0,0,0.45)] dark:ring-white/[0.06]",
        )}
      >
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.65rem] bg-amber-500/12 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
          aria-hidden
        >
          <RefreshCw className="h-4 w-4" strokeWidth={2.25} />
        </span>
        <p className="min-w-0 flex-1 text-[13px] font-semibold leading-snug tracking-tight text-foreground">{u.message}</p>
        <Button
          type="button"
          variant="default"
          className="h-9 shrink-0 rounded-[0.65rem] px-3.5 text-[13px] font-semibold shadow-sm"
          onClick={() => void applyUpdate()}
        >
          {u.updateNow}
        </Button>
      </div>
    </div>
  );
}
