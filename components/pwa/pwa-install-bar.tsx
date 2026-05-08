"use client";

import { Download, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { PwaIosInstallHelpModal } from "@/components/pwa/pwa-ios-install-help";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants/app";
import {
  getDeferredInstallPrompt,
  runDeferredInstallPrompt,
  subscribeDeferredInstall,
} from "@/lib/pwa/deferred-install";
import { isIosSafari, isStandalonePwa } from "@/lib/pwa/pwa-environment";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "sideseat_pwa_install_bar_dismissed";

/**
 * Chromium: uses captured `beforeinstallprompt` → one tap opens the system install sheet.
 * iOS Safari: no API — one tap opens short instructions (Share → Add to Home Screen).
 */
export function PwaInstallBar({ className }: { className?: string }) {
  const [iosHelpOpen, setIosHelpOpen] = useState(false);
  const [, refresh] = useState(0);
  const [barDismissed, setBarDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeDeferredInstall(() => refresh((x) => x + 1)), []);

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

  const deferred = getDeferredInstallPrompt();
  const showChromium = deferred !== null;
  const showIos = !showChromium && isIosSafari();

  if (isStandalonePwa()) return null;

  if (barDismissed) {
    return <PwaIosInstallHelpModal open={iosHelpOpen} onClose={() => setIosHelpOpen(false)} />;
  }

  if (!showChromium && !showIos) {
    return <PwaIosInstallHelpModal open={iosHelpOpen} onClose={() => setIosHelpOpen(false)} />;
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
        <div className="flex items-center gap-2 rounded-2xl border border-border/80 bg-card/95 px-3 py-2.5 shadow-lg backdrop-blur-md supports-[backdrop-filter]:bg-card/90">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
              <Download className="h-4 w-4" strokeWidth={2.25} />
            </span>
            <p className="min-w-0 text-[12px] leading-snug text-foreground">
              {showChromium
                ? `Install ${APP_NAME} for quicker access from your home screen.`
                : "Add a shortcut to your Home Screen to open like an app."}
            </p>
          </div>
          {showChromium ? (
            <Button
              type="button"
              size="sm"
              className="h-9 shrink-0 rounded-xl px-3 text-[12px] font-semibold"
              disabled={busy}
              onClick={() => void onInstallClick()}
            >
              {busy ? "…" : "Install"}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-9 shrink-0 rounded-xl px-3 text-[12px] font-semibold"
              onClick={() => setIosHelpOpen(true)}
            >
              How to add
            </Button>
          )}
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
      <PwaIosInstallHelpModal open={iosHelpOpen} onClose={() => setIosHelpOpen(false)} />
    </>
  );
}
