"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const UPDATE_CHECK_MS = 60 * 60 * 1000;
const IOS_BUILD_CHECK_MS = 15 * 60 * 1000;
const BUILD_STORAGE_KEY = "sideseat_client_build_id";

function isIosLike(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/**
 * Chromium: new `sw.js` stays in `waiting` until user confirms → SKIP_WAITING + reload.
 * iOS (all WebKit/Chrome shells on iPhone/iPad): poll `/api/client-build` — SW lifecycle
 * is unreliable for “Update now”; deploy id mismatch triggers the same bar + hard reload.
 */
export function PwaUpdatePrompt({ registration }: { registration: ServiceWorkerRegistration | null }) {
  const [show, setShow] = useState(false);
  const reloadOnce = useRef(false);
  const pendingBuildIdRef = useRef<string | null>(null);

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

  useEffect(() => {
    if (!registration) return;

    const showIfWaiting = () => {
      if (registration.waiting) setShow(true);
    };

    showIfWaiting();

    const onUpdateFound = () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          showIfWaiting();
        }
      });
    };

    registration.addEventListener("updatefound", onUpdateFound);
    void registration.update();

    const interval = window.setInterval(() => void registration.update(), UPDATE_CHECK_MS);
    const onFocus = () => void registration.update();
    window.addEventListener("focus", onFocus);

    const onVis = () => {
      if (document.visibilityState === "visible") {
        void registration.update();
        showIfWaiting();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      registration.removeEventListener("updatefound", onUpdateFound);
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [registration]);

  useEffect(() => {
    if (!isIosLike()) return;

    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch("/api/client-build", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { id?: string };
        const id = typeof data.id === "string" ? data.id : "";
        if (!id || id === "development") return;

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
          return;
        }

        if (stored !== id) {
          pendingBuildIdRef.current = id;
          setShow(true);
        }
      } catch {
        /* offline */
      }
    };

    void check();
    const interval = window.setInterval(() => void check(), IOS_BUILD_CHECK_MS);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    const onVis = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  if (!show) return null;

  return (
    <div
      className={cn(
        "pointer-events-auto fixed left-1/2 z-[22] w-full max-w-md -translate-x-1/2 px-3",
        "bottom-[calc(6.5rem+env(safe-area-inset-bottom))]",
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 rounded-2xl border border-border/80 bg-card/95 px-3 py-2.5 shadow-lg backdrop-blur-md supports-[backdrop-filter]:bg-card/90">
        <p className="min-w-0 flex-1 text-[12px] font-medium leading-snug text-foreground">
          A new version is available.
        </p>
        <Button
          type="button"
          size="sm"
          className="h-9 shrink-0 rounded-xl px-3 text-[12px] font-semibold"
          onClick={() => void applyUpdate()}
        >
          Update now
        </Button>
      </div>
    </div>
  );
}
