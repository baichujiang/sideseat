"use client";

import { useEffect, useState } from "react";

import { PwaUpdatePrompt } from "@/components/pwa/pwa-update-prompt";

/**
 * Registers the service worker so Chromium-based browsers can treat the site
 * as installable (Add to Home Screen / Install app). Safari iOS uses the
 * manifest + meta tags only; SW is ignored but harmless.
 */
export function PwaRegister() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
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
  }, []);

  return <PwaUpdatePrompt registration={registration} />;
}
