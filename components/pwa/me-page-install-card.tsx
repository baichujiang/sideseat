"use client";

import { useCallback, useEffect, useState } from "react";

import { PwaIosInstallSteps } from "@/components/pwa/pwa-ios-install-steps";
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

/** Persistent Me-tab entry for install / Add to Home Screen (survives floating bar dismiss). */
export function MePageInstallCard({ compact = false }: { compact?: boolean }) {
  const [, refresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [iosShareBusy, setIosShareBusy] = useState(false);
  const [iosLinkCopied, setIosLinkCopied] = useState(false);

  useEffect(() => subscribeDeferredInstall(() => refresh((x) => x + 1)), []);

  useEffect(() => {
    if (!iosLinkCopied) return;
    const t = window.setTimeout(() => setIosLinkCopied(false), 4500);
    return () => window.clearTimeout(t);
  }, [iosLinkCopied]);

  const onInstall = useCallback(async () => {
    setBusy(true);
    try {
      await runDeferredInstallPrompt();
    } finally {
      setBusy(false);
    }
  }, []);

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

  if (isStandalonePwa()) return null;

  const deferred = getDeferredInstallPrompt();
  const showInstall = deferred !== null;
  const showIos = !showInstall && isIosDevice();
  const iosShareLikely = showIos && canIosShareForInstall();

  const pad = compact ? "p-2.5" : "p-3";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-classmates-edge bg-classmates-surface shadow-[0_2px_10px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card",
        pad,
      )}
    >
      <p className="sr-only">Add to Home Screen</p>
      <div className="space-y-2">
        {showInstall ? (
          <>
            <Button
              type="button"
              className={cn("h-8 w-full rounded-lg px-3 text-[12px] font-semibold", !compact && "h-9")}
              disabled={busy}
              onClick={() => void onInstall()}
            >
              {busy ? "…" : `Install ${APP_NAME}`}
            </Button>
            <p className="text-[11px] leading-snug text-muted-foreground">
              If no dialog appears, use your browser menu and choose Install app or Add to Home Screen.
            </p>
          </>
        ) : showIos ? (
          <>
            <Button
              type="button"
              className={cn("h-8 w-full rounded-lg px-3 text-[12px] font-semibold", !compact && "h-9")}
              disabled={iosShareBusy}
              onClick={() => void onIosAddToHomeScreen()}
            >
              {iosShareBusy ? "…" : "Add to Home Screen"}
            </Button>
            <p className="text-[11px] leading-snug text-muted-foreground">
              {iosShareLikely
                ? "Opens the system Share sheet — choose Add to Home Screen. If that fails, we copy the page link so you can paste it in Safari and try again."
                : "Copies this page’s link. Open it in Safari, tap Share (□↑ or …), then Add to Home Screen — or use the steps below."}
            </p>
            {iosLinkCopied ? (
              <p className="text-[11px] font-medium leading-snug text-emerald-700 dark:text-emerald-400">
                Link copied — open in Safari if needed, then Share → Add to Home Screen.
              </p>
            ) : null}
            <details className="rounded-lg border border-border/60 bg-muted/20 px-2 py-1.5 text-[11px] text-foreground">
              <summary className="cursor-pointer list-none font-medium text-classmates-azure outline-none">
                Manual steps (if Share did not work)
              </summary>
              <div className="mt-2 border-t border-border/50 pt-2">
                <PwaIosInstallSteps />
              </div>
            </details>
          </>
        ) : (
          <p className="text-[11px] leading-snug text-muted-foreground">
            Install prompt not available on this browser. Try Chrome or Edge on Android, or Safari on iPhone.
          </p>
        )}
      </div>
    </div>
  );
}
