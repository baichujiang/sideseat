"use client";

import { useEffect } from "react";

/**
 * Registers the service worker so Chromium-based browsers can treat the site
 * as installable (Add to Home Screen / Install app). Safari iOS uses the
 * manifest + meta tags only; SW is ignored but harmless.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    const onLoad = () => {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        /* ignore — e.g. localhost http quirks or disabled SW */
      });
    };
    if (document.readyState === "complete") {
      onLoad();
    } else {
      window.addEventListener("load", onLoad, { once: true });
    }
  }, []);

  return null;
}
