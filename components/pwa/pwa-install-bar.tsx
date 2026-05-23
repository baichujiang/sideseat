"use client";

import { Download, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAppMessages } from "@/hooks/use-app-locale";
import { APP_NAME } from "@/lib/constants/app";
import { formatMessage } from "@/lib/i18n/messages";
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
import { useCapacitorNative } from "@/hooks/use-capacitor-native";
import { isIosDevice, isStandalonePwa } from "@/lib/pwa/pwa-environment";
import { cn } from "@/lib/utils";

const DISMISS_UNTIL_KEY = "sideseat_pwa_install_bar_dismiss_until";
/** After dismiss, stay hidden until this much time passes (localStorage). */
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Minimum wait after install becomes available before the bar can appear. */
const ELIGIBLE_DEBOUNCE_MS = 1_600;
/** If the user never scrolls or changes route, still show after this idle window. */
const MAX_WAIT_WITHOUT_ENGAGEMENT_MS = 26_000;

function readDismissUntil(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DISMISS_UNTIL_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeDismissUntil(ts: number) {
  try {
    localStorage.setItem(DISMISS_UNTIL_KEY, String(ts));
  } catch {
    /* private mode */
  }
}

/**
 * Chromium: captured `beforeinstallprompt` — primary Install button, short fallback copy below.
 * iOS: one “Add to Home Screen” action — tries Web Share (multiple payloads), then copies the page link if Share is unavailable or fails.
 */
export function PwaInstallBar({ className }: { className?: string }) {
  const isNativeApp = useCapacitorNative();
  const i = useAppMessages().meInstall;
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [, refresh] = useState(0);
  const [dismissedUntil, setDismissedUntil] = useState<number | null>(null);
  const [showBar, setShowBar] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [iosShareBusy, setIosShareBusy] = useState(false);
  const [iosLinkCopied, setIosLinkCopied] = useState(false);

  const eligibleSinceRef = useRef<number | null>(null);
  const prevPathRef = useRef<string | null>(null);

  useEffect(() => subscribeDeferredInstall(() => refresh((x) => x + 1)), []);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!iosLinkCopied) return;
    const t = window.setTimeout(() => setIosLinkCopied(false), 4500);
    return () => window.clearTimeout(t);
  }, [iosLinkCopied]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const until = readDismissUntil();
    setDismissedUntil(until);
  }, []);

  useEffect(() => {
    const recheckDismiss = () => {
      const until = readDismissUntil();
      setDismissedUntil(until);
    };
    window.addEventListener("focus", recheckDismiss);
    document.addEventListener("visibilitychange", recheckDismiss);
    return () => {
      window.removeEventListener("focus", recheckDismiss);
      document.removeEventListener("visibilitychange", recheckDismiss);
    };
  }, []);

  useEffect(() => {
    if (prevPathRef.current === null) {
      prevPathRef.current = pathname;
      return;
    }
    if (prevPathRef.current !== pathname) {
      prevPathRef.current = pathname;
      setEngaged(true);
    }
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onScroll = (e: Event) => {
      const t = e.target;
      if (t === document || t === document.documentElement) {
        const y = window.scrollY || document.documentElement.scrollTop;
        if (y > 48) setEngaged(true);
        return;
      }
      if (t instanceof HTMLElement && t.scrollTop > 48) setEngaged(true);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    const shellMain = document.querySelector("[data-app-shell-scroll]");
    shellMain?.addEventListener("scroll", onScroll, { passive: true });
    if (shellMain instanceof HTMLElement && shellMain.scrollTop > 48) setEngaged(true);
    return () => {
      window.removeEventListener("scroll", onScroll);
      shellMain?.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPointer = () => setEngaged(true);
    window.addEventListener("pointerdown", onPointer, { capture: true, once: true });
    return () => window.removeEventListener("pointerdown", onPointer, { capture: true });
  }, []);

  const dismiss = useCallback(() => {
    const until = Date.now() + DISMISS_TTL_MS;
    writeDismissUntil(until);
    setDismissedUntil(until);
    setShowBar(false);
    eligibleSinceRef.current = null;
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

  useEffect(() => {
    if (!mounted) return;

    if (isStandalonePwa()) {
      setShowBar(false);
      eligibleSinceRef.current = null;
      return;
    }

    const now = Date.now();
    if (dismissedUntil !== null && now < dismissedUntil) {
      setShowBar(false);
      eligibleSinceRef.current = null;
      return;
    }

    const deferred = getDeferredInstallPrompt();
    const showChromium = deferred !== null;
    const showIos = !showChromium && isIosDevice();

    if (!showChromium && !showIos) {
      setShowBar(false);
      eligibleSinceRef.current = null;
      return;
    }

    if (eligibleSinceRef.current === null) {
      eligibleSinceRef.current = Date.now();
    }

    const tick = () => {
      const start = eligibleSinceRef.current;
      if (start === null) return;
      const waited = Date.now() - start;
      if (waited < ELIGIBLE_DEBOUNCE_MS) return;
      if (engaged || waited >= MAX_WAIT_WITHOUT_ENGAGEMENT_MS) {
        setShowBar(true);
      }
    };

    tick();
    const id = window.setInterval(tick, 450);
    return () => window.clearInterval(id);
  }, [mounted, dismissedUntil, engaged, refresh]);

  if (!mounted) return null;
  if (isNativeApp || isStandalonePwa()) return null;

  const deferred = getDeferredInstallPrompt();
  const showChromium = deferred !== null;
  const showIos = !showChromium && isIosDevice();
  const iosShareLikely = showIos && canIosShareForInstall();

  if (!showBar || (!showChromium && !showIos)) return null;

  const titleChromium = formatMessage(i.rowInstallApp, { appName: APP_NAME });
  const titleIos = i.rowAddToHome;

  return (
    <div
      className={cn(
        "pointer-events-auto fixed inset-x-0 z-[21] flex justify-center pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]",
        "bottom-[calc(5.75rem+var(--safe-bottom))]",
        className,
      )}
    >
      <div
        className={cn(
          "w-full max-w-md overflow-hidden rounded-xl border border-classmates-edge bg-classmates-surface/98 p-3 shadow-[0_2px_10px_rgba(15,23,42,0.06)] ring-1 ring-black/[0.03] backdrop-blur-md supports-[backdrop-filter]:bg-classmates-surface/95",
          "dark:border-border dark:bg-card/98 dark:shadow-[0_10px_40px_rgba(0,0,0,0.45)] dark:ring-white/[0.06]",
        )}
      >
        <div className="flex gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.65rem] bg-primary/12 text-primary dark:bg-primary/15"
            aria-hidden
          >
            <Download className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 space-y-0.5">
                <p className="text-[15px] font-semibold leading-tight tracking-tight text-foreground">
                  {showChromium ? titleChromium : titleIos}
                </p>
                <p className="line-clamp-1 text-[11px] font-medium leading-snug text-muted-foreground">
                  {showChromium ? i.subtitleDeferred : i.subtitleIos}
                </p>
              </div>
              <button
                type="button"
                onClick={dismiss}
                className="-m-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.65rem] text-muted-foreground transition-colors hover:bg-muted/90 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                aria-label={i.dismissFloatingBarAria}
              >
                <X className="h-4 w-4" strokeWidth={2.25} />
              </button>
            </div>

            {showChromium ? (
              <>
                <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">{i.helpBrowserMenu}</p>
                <Button
                  type="button"
                  className="h-9 w-full rounded-[0.65rem] text-[13px] font-semibold shadow-sm"
                  disabled={busy}
                  onClick={() => void onInstallClick()}
                >
                  {busy ? i.ctaBusy : formatMessage(i.ctaInstallApp, { appName: APP_NAME })}
                </Button>
              </>
            ) : (
              <>
                <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                  {iosShareLikely ? i.iosHelpShareLikely : i.iosHelpCopyFallback}
                </p>
                <Button
                  type="button"
                  className="h-9 w-full rounded-[0.65rem] text-[13px] font-semibold shadow-sm"
                  disabled={iosShareBusy}
                  onClick={() => void onIosAddToHomeScreen()}
                >
                  {iosShareBusy ? i.ctaBusy : i.ctaAddToHome}
                </Button>
                {iosLinkCopied ? (
                  <p className="text-[11px] font-medium leading-snug text-emerald-700 dark:text-emerald-400">
                    {i.linkCopiedFollowUp}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
