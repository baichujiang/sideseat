"use client";

import { useCallback, useEffect, useState } from "react";

import { ChevronDown, Smartphone } from "lucide-react";

import { PwaIosInstallSteps } from "@/components/pwa/pwa-ios-install-steps";
import {
  MePageSettingsRowLabel,
  mePageChevronDownClass,
  mePageIconInstallClass,
  mePageIconShellClass,
  mePageRowDetailsSummaryClass,
  mePageRowLeadClass,
} from "@/components/profile/me-settings-row";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants/app";
import { useAppMessages } from "@/hooks/use-app-locale";
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
import { isIosDevice, isStandalonePwa } from "@/lib/pwa/pwa-environment";
import { useCapacitorNative } from "@/hooks/use-capacitor-native";
import { cn } from "@/lib/utils";

/** Persistent Me-tab entry for install / Add to Home Screen (survives floating bar dismiss). */
export function MePageInstallCard({
  compact = false,
  inList = false,
}: {
  compact?: boolean;
  /** Renders as an expandable row inside a divided list (no outer card). */
  inList?: boolean;
}) {
  const isNativeApp = useCapacitorNative();
  const i = useAppMessages().meInstall;
  const [mounted, setMounted] = useState(false);
  const [, refresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [iosShareBusy, setIosShareBusy] = useState(false);
  const [iosLinkCopied, setIosLinkCopied] = useState(false);

  useEffect(() => setMounted(true), []);
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

  if (isNativeApp) return null;

  /** Avoid SSR/client mismatch: `isStandalonePwa()` used to return true without `window`. */
  if (!mounted) {
    if (!inList) return null;
    return (
      <div className="flex animate-pulse items-center gap-3 px-4 py-3.5" aria-hidden>
        <div className={mePageIconShellClass} />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-3.5 w-36 rounded-md bg-muted/50" />
          <div className="h-3 w-44 rounded-md bg-muted/40" />
        </div>
        <div className="h-5 w-5 shrink-0 rounded bg-muted/30" />
      </div>
    );
  }

  if (isStandalonePwa()) return null;

  const deferred = getDeferredInstallPrompt();
  const showInstall = deferred !== null;
  const showIos = !showInstall && isIosDevice();
  const iosShareLikely = showIos && canIosShareForInstall();

  const pad = compact ? "p-2.5" : "p-3";

  const installRowLabel = showInstall
    ? formatMessage(i.rowInstallApp, { appName: APP_NAME })
    : showIos
      ? i.rowAddToHome
      : i.rowGenericInstall;

  const installRowSubtitle = showInstall
    ? i.subtitleDeferred
    : showIos
      ? i.subtitleIos
      : i.subtitleNoPrompt;

  const body = (
    <div className="space-y-2">
      {showInstall ? (
        <>
          <Button
            type="button"
            className={cn("h-8 w-full rounded-lg px-3 text-[12px] font-semibold", !compact && "h-9")}
            disabled={busy}
            onClick={() => void onInstall()}
          >
            {busy ? i.ctaBusy : formatMessage(i.ctaInstallApp, { appName: APP_NAME })}
          </Button>
          <p className="text-[11px] leading-snug text-muted-foreground">{i.helpBrowserMenu}</p>
        </>
      ) : showIos ? (
        <>
          <Button
            type="button"
            className={cn("h-8 w-full rounded-lg px-3 text-[12px] font-semibold", !compact && "h-9")}
            disabled={iosShareBusy}
            onClick={() => void onIosAddToHomeScreen()}
          >
            {iosShareBusy ? i.ctaBusy : i.ctaAddToHome}
          </Button>
          <p className="text-[11px] leading-snug text-muted-foreground">
            {iosShareLikely ? i.iosHelpShareLikely : i.iosHelpCopyFallback}
          </p>
          {iosLinkCopied ? (
            <p className="text-[11px] font-medium leading-snug text-emerald-700 dark:text-emerald-400">
              {i.linkCopiedFollowUp}
            </p>
          ) : null}
          <details className="rounded-lg border border-border/60 bg-muted/20 px-2 py-1.5 text-[11px] text-foreground">
            <summary className="cursor-pointer list-none font-medium text-classmates-azure outline-none">
              {i.manualStepsSummary}
            </summary>
            <div className="mt-2 border-t border-border/50 pt-2">
              <PwaIosInstallSteps />
            </div>
          </details>
        </>
      ) : (
        <p className="text-[11px] leading-snug text-muted-foreground">{i.noPromptBody}</p>
      )}
    </div>
  );

  if (inList) {
    return (
      <details className="group">
        <summary className={mePageRowDetailsSummaryClass}>
          <div className={mePageRowLeadClass}>
            <span className={mePageIconShellClass}>
              <Smartphone className={mePageIconInstallClass} strokeWidth={2} aria-hidden />
            </span>
            <MePageSettingsRowLabel title={installRowLabel} subtitle={installRowSubtitle} />
          </div>
          <ChevronDown className={mePageChevronDownClass} strokeWidth={2} aria-hidden />
        </summary>
        <div className="border-t border-classmates-hairline bg-muted/15 px-3 py-2.5 dark:border-border/60">
          {body}
        </div>
      </details>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-classmates-edge bg-classmates-surface shadow-[0_2px_10px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card",
        pad,
      )}
    >
      <p className="sr-only">{installRowLabel}</p>
      {body}
    </div>
  );
}
