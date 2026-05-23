"use client";

import { useEffect } from "react";

import { getCapacitorPlatform, isCapacitorNative } from "@/lib/capacitor/platform";

function measureSafeAreaInsetTop(): number {
  if (typeof document === "undefined") return 0;
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;top:0;left:0;height:0;padding-top:env(safe-area-inset-top);visibility:hidden;pointer-events:none";
  document.body.appendChild(probe);
  const insetTop = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  probe.remove();
  return insetTop;
}

function applySafeAreaFallback(root: HTMLElement) {
  const insetTop = measureSafeAreaInsetTop();
  const vv = window.visualViewport;
  const offsetTop = vv?.offsetTop ?? 0;
  if (insetTop < 20 && offsetTop < 20) {
    root.classList.add("capacitor-safe-area-fallback");
  }
}

/**
 * iOS/Android shell: status bar, splash, and CSS safe-area fallbacks for WKWebView.
 */
export function CapacitorBootstrap() {
  useEffect(() => {
    if (!isCapacitorNative()) return;

    const root = document.documentElement;
    root.classList.add("capacitor-native");
    root.dataset.capacitorPlatform = getCapacitorPlatform();

    void (async () => {
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        await StatusBar.setOverlaysWebView({ overlay: false });
        await StatusBar.setStyle({ style: Style.Light });
      } catch {
        /* Plugin unavailable — CSS fallback below. */
      }

      try {
        const { SplashScreen } = await import("@capacitor/splash-screen");
        await SplashScreen.hide();
      } catch {
        /* optional */
      }

      requestAnimationFrame(() => {
        applySafeAreaFallback(root);
        window.setTimeout(() => applySafeAreaFallback(root), 120);
      });
    })();

    return () => {
      root.classList.remove("capacitor-native", "capacitor-safe-area-fallback");
      delete root.dataset.capacitorPlatform;
    };
  }, []);

  return null;
}
