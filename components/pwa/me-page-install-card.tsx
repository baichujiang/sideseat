"use client";

import { Download } from "lucide-react";
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

/** Persistent Me-tab entry for install / Add to Home Screen (survives floating bar dismiss). */
export function MePageInstallCard() {
  const [, refresh] = useState(0);
  const [iosHelpOpen, setIosHelpOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeDeferredInstall(() => refresh((x) => x + 1)), []);

  const onInstall = useCallback(async () => {
    setBusy(true);
    try {
      await runDeferredInstallPrompt();
    } finally {
      setBusy(false);
    }
  }, []);

  if (isStandalonePwa()) return null;

  const deferred = getDeferredInstallPrompt();
  const showInstall = deferred !== null;
  const showIos = !showInstall && isIosSafari();

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-classmates-edge bg-classmates-surface p-4 shadow-[0_4px_14px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card">
        <div className="flex gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <Download className="h-5 w-5" strokeWidth={2.25} aria-hidden />
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-[14px] font-semibold leading-tight text-foreground">Add to Home Screen</p>
            <p className="text-[12px] leading-snug text-muted-foreground">
              {showInstall
                ? `Install ${APP_NAME} for quick access like an app.`
                : showIos
                  ? "Open from your home screen with one tap."
                  : "If your browser shows Install or Add to Home Screen, you can add this page anytime."}
            </p>
            {showInstall ? (
              <Button
                type="button"
                className="mt-1 h-9 rounded-xl px-4 text-[13px] font-semibold"
                disabled={busy}
                onClick={() => void onInstall()}
              >
                {busy ? "…" : "Install"}
              </Button>
            ) : showIos ? (
              <Button
                type="button"
                variant="secondary"
                className="mt-1 h-9 rounded-xl px-4 text-[13px] font-semibold"
                onClick={() => setIosHelpOpen(true)}
              >
                How to add
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      <PwaIosInstallHelpModal open={iosHelpOpen} onClose={() => setIosHelpOpen(false)} />
    </>
  );
}
