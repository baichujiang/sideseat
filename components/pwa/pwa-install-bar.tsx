"use client";

import { Download, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants/app";
import {
  getDeferredInstallPrompt,
  runDeferredInstallPrompt,
  subscribeDeferredInstall,
} from "@/lib/pwa/deferred-install";
import {
  canIosShareForInstall,
  copyInstallPageUrl,
  openIosShareForInstall,
} from "@/lib/pwa/ios-share-for-install";
import { isIosDevice, isStandalonePwa } from "@/lib/pwa/pwa-environment";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "sideseat_pwa_install_bar_dismissed";

/**
 * Chromium: captured `beforeinstallprompt` — primary Install button, short fallback copy below.
 * iOS: one “Add to Home Screen” action — tries Web Share (multiple payloads), then copies the page link if Share is unavailable or fails.
 */
export function PwaInstallBar({ className }: { className?: string }) {
  const [mounted, setMounted] = useState(false);
  const [, refresh] = useState(0);
  const [barDismissed, setBarDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [iosShareBusy, setIosShareBusy] = useState(false);
  const [iosLinkCopied, setIosLinkCopied] = useState(false);

  useEffect(() => subscribeDeferredInstall(() => refresh((x) => x + 1)), []);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!iosLinkCopied) return;
    const t = window.setTimeout(() => setIosLinkCopied(false), 4500);
    return () => window.clearTimeout(t);
  }, [iosLinkCopied]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") setBarDismissed(true);
    } catch {
      /* private mode */
    }
  }, []);

  const dismiss = useCallback(() => {
    setBarDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  const onInstallClick = useCallback(async () => {
    setBusy(true);
    try {
      await runDeferredInstallPrompt();
      dismiss();
    } finally {
      setBusy(false);
    }
  }, [dismiss]);

  const onIosAddToHomeScreen = useCallback(async () => {
    if (typeof window === "undefined") return;
    setIosLinkCopied(false);
    setIosShareBusy(true);
    try {
      const url = window.location.href;
      const result = await openIosShareForInstall(APP_NAME, url);
      if (result === "shared" || result === "cancelled") return;
      const ok = await copyInstallPageUrl(url);
      if (ok) setIosLinkCopied(true);
    } finally {
      setIosShareBusy(false);
    }
  }, []);

  // Avoid SSR/CSR branch mismatch on first paint.
  if (!mounted) return null;

  const deferred = getDeferredInstallPrompt();
  const showChromium = deferred !== null;
  const showIos = !showChromium && isIosDevice();
  const iosShareLikely = showIos && canIosShareForInstall();

  if (isStandalonePwa()) return null;

  if (barDismissed || (!showChromium && !showIos)) {
    return null;
  }

  return (
    <>
      <div
        className={cn(
          "pointer-events-auto fixed left-1/2 z-[21] w-full max-w-md -translate-x-1/2 px-3",
          "bottom-[calc(6.5rem+env(safe-area-inset-bottom))]",
          className,
        )}
      >
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/80 bg-card/95 px-3 py-2.5 shadow-lg backdrop-blur-md supports-[backdrop-filter]:bg-card/90">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <Download className="h-4 w-4" strokeWidth={2.25} />
          </span>
          {showChromium ? (
            <div className="flex min-w-0 flex-1 basis-[min(100%,10rem)] flex-col gap-1">
              <Button
                type="button"
                size="sm"
                className="h-9 w-full max-w-[220px] rounded-xl px-3 text-[12px] font-semibold sm:w-auto"
                disabled={busy}
                onClick={() => void onInstallClick()}
              >
                {busy ? "…" : `Install ${APP_NAME}`}
              </Button>
              <p className="text-[11px] leading-snug text-muted-foreground">
                If no dialog appears, use your browser menu → Install app or Add to Home Screen.
              </p>
            </div>
          ) : showIos ? (
            <div className="flex min-w-0 flex-1 basis-[min(100%,10rem)] flex-col gap-1">
              <Button
                type="button"
                size="sm"
                className="h-9 w-full max-w-[220px] rounded-xl px-3 text-[12px] font-semibold sm:w-auto"
                disabled={iosShareBusy}
                onClick={() => void onIosAddToHomeScreen()}
              >
                {iosShareBusy ? "…" : "Add to Home Screen"}
              </Button>
              <p className="text-[11px] leading-snug text-muted-foreground">
                {iosShareLikely
                  ? "Opens Share — pick Add to Home Screen. If that fails, we copy the link so you can open it in Safari and try again."
                  : "Copies this page’s link — open in Safari, then Share (□↑ or …) → Add to Home Screen."}
              </p>
              {iosLinkCopied ? (
                <p className="text-[11px] font-medium leading-snug text-emerald-700 dark:text-emerald-400">
                  Link copied.
                </p>
              ) : null}
            </div>
          ) : null}
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>
      </div>
    </>
  );
}
