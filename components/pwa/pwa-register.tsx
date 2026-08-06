"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { PwaUpdatePrompt } from "@/components/pwa/pwa-update-prompt";
import { useCapacitorNative } from "@/hooks/use-capacitor-native";
import { isNativeWebPath } from "@/lib/nav/legacy-web-freeze";
import { registerBeforeInstallPromptCapture } from "@/lib/pwa/deferred-install";

/**
 * Registers the service worker so Chromium-based browsers can treat the site
 * as installable (Add to Home Screen / Install app). Safari iOS uses the
 * manifest + meta tags only; SW is ignored but harmless.
 */
export function PwaRegister() {
  const pathname = usePathname();
  const isNativeApp = useCapacitorNative();
  const isNativeHandoff = isNativeWebPath(pathname);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (isNativeApp || isNativeHandoff) return;
    return registerBeforeInstallPromptCapture();
  }, [isNativeApp, isNativeHandoff]);

  useEffect(() => {
    if (isNativeApp || isNativeHandoff) return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    /** Safari / some environments: no WindowClient.navigate — SW asks page to navigate. */
    const onSwMessage = (event: MessageEvent) => {
      const d = event.data;
      if (!d || d.type !== "NOTIFICATION_NAVIGATE") return;
      const url = typeof d.url === "string" ? d.url : "/home";
      window.location.assign(new URL(url, window.location.origin).href);
    };
    navigator.serviceWorker.addEventListener("message", onSwMessage);

    const onLoad = () => {
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((reg) => {
          setRegistration(reg);
        })
        .catch(() => {
          /* ignore — e.g. localhost http quirks or disabled SW */
        });
    };
    if (document.readyState === "complete") {
      onLoad();
    } else {
      window.addEventListener("load", onLoad, { once: true });
    }

    return () => {
      navigator.serviceWorker.removeEventListener("message", onSwMessage);
    };
  }, [isNativeApp, isNativeHandoff]);

  if (isNativeApp || isNativeHandoff) return null;

  return <PwaUpdatePrompt registration={registration} />;
}
