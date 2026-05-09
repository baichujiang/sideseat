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
import { canIosShareForInstall, openIosShareForInstall } from "@/lib/pwa/ios-share-for-install";
import { isIosDevice, isStandalonePwa } from "@/lib/pwa/pwa-environment";
import { cn } from "@/lib/utils";

/** Persistent Me-tab entry for install / Add to Home Screen (survives floating bar dismiss). */
export function MePageInstallCard({ compact = false }: { compact?: boolean }) {
  const [, refresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [iosShareBusy, setIosShareBusy] = useState(false);

  useEffect(() => subscribeDeferredInstall(() => refresh((x) => x + 1)), []);

  const onInstall = useCallback(async () => {
    setBusy(true);
    try {
      await runDeferredInstallPrompt();
    } finally {
      setBusy(false);
    }
  }, []);

  const onIosShare = useCallback(async () => {
    if (typeof window === "undefined") return;
    setIosShareBusy(true);
    try {
      await openIosShareForInstall(APP_NAME, window.location.href);
    } finally {
      setIosShareBusy(false);
    }
  }, []);

  if (isStandalonePwa()) return null;

  const deferred = getDeferredInstallPrompt();
  const showInstall = deferred !== null;
  const showIos = !showInstall && isIosDevice();
  const iosCanShare = showIos && canIosShareForInstall();

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
            {iosCanShare ? (
              <Button
                type="button"
                className={cn("h-8 w-full rounded-lg px-3 text-[12px] font-semibold", !compact && "h-9")}
                disabled={iosShareBusy}
                onClick={() => void onIosShare()}
              >
                {iosShareBusy ? "…" : "Add via Share menu"}
              </Button>
            ) : null}
            <p className="text-[11px] leading-snug text-muted-foreground">
              {iosCanShare
                ? "Opens the system Share sheet — choose Add to Home Screen. If it is missing, use the manual steps below."
                : "iOS does not support one-tap install from the web. Use the manual steps below."}
            </p>
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
