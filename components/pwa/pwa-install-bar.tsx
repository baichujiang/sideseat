"use client";

import { Download, Share, SquarePlus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AppPushLayer } from "@/components/ui/app-push-layer";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants/app";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "sideseat_pwa_install_bar_dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    nav.standalone === true
  );
}

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isWebkit = /WebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIos && isWebkit;
}

/**
 * Chromium: uses `beforeinstallprompt` → one tap opens the system install sheet.
 * iOS Safari: no API — one tap opens short instructions (Share → Add to Home Screen).
 */
export function PwaInstallBar({ className }: { className?: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHelpOpen, setIosHelpOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalonePwa()) return;
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* private mode */
    }

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);

    if (isIosSafari()) {
      setVisible(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  const onInstallClick = useCallback(async () => {
    if (!deferred) return;
    setBusy(true);
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } finally {
      setBusy(false);
      setDeferred(null);
      dismiss();
    }
  }, [deferred, dismiss]);

  if (!visible || isStandalonePwa()) {
    return iosHelpOpen ? (
      <IosInstallModal open onClose={() => setIosHelpOpen(false)} />
    ) : null;
  }

  const showChromium = deferred !== null;
  const showIos = !showChromium && isIosSafari();

  if (!showChromium && !showIos) {
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
      <IosInstallModal open={iosHelpOpen} onClose={() => setIosHelpOpen(false)} />
    </>
  );
}

function IosInstallModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AppPushLayer
      open={open}
      onClose={onClose}
      zClassName="z-[60]"
      backdropClassName="bg-black/40 !backdrop-blur-none"
      panelClassName="w-[min(100vw,24rem)] border-0 bg-transparent shadow-none dark:shadow-none"
      ariaLabelledBy="pwa-ios-title"
    >
      <div className="flex h-full min-h-0 flex-col justify-end px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-12 sm:justify-center">
        <div className="w-full rounded-2xl border border-border bg-card p-4 shadow-xl">
          <h2 id="pwa-ios-title" className="text-base font-semibold text-foreground">
            Add to Home Screen
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            On iOS, you add web apps from the system menu—Safari can’t show an install dialog like
            Chrome.
          </p>
          <ol className="mt-3 space-y-3 text-[13px] text-foreground">
            <li className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Share className="h-4 w-4" strokeWidth={2.25} />
              </span>
              <span>
                Tap the <strong className="font-semibold">Share</strong> button in the toolbar
                <span className="text-muted-foreground"> (square with an arrow)</span>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <SquarePlus className="h-4 w-4" strokeWidth={2.25} />
              </span>
              <span>
                Scroll down and choose <strong className="font-semibold">Add to Home Screen</strong>
              </span>
            </li>
          </ol>
          <Button type="button" className="mt-4 w-full rounded-xl" onClick={onClose}>
            Got it
          </Button>
        </div>
      </div>
    </AppPushLayer>
  );
}
