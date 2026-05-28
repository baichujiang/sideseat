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
    let keyboardCleanup: (() => void) | null = null;
    let keyboardHeight = 0;
    let baselineViewportHeight =
      window.visualViewport?.height ?? window.innerHeight;
    root.classList.add("capacitor-native");
    root.dataset.capacitorPlatform = getCapacitorPlatform();
    root.style.setProperty("--keyboard-inset-bottom", "0px");

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

      try {
        const { Keyboard, KeyboardResize } = await import("@capacitor/keyboard");
        await Keyboard.setAccessoryBarVisible({ isVisible: false });
        await Keyboard.setResizeMode({ mode: KeyboardResize.Native });

        const currentViewportHeight = () => window.visualViewport?.height ?? window.innerHeight;
        const updateKeyboardInset = () => {
          if (keyboardHeight <= 0) {
            baselineViewportHeight = Math.max(baselineViewportHeight, currentViewportHeight());
            root.style.setProperty("--keyboard-inset-bottom", "0px");
            root.classList.remove("keyboard-visible");
            return;
          }

          const viewportConsumed = Math.max(0, baselineViewportHeight - currentViewportHeight());
          const fallbackInset = Math.max(0, keyboardHeight - viewportConsumed);
          root.style.setProperty("--keyboard-inset-bottom", `${Math.round(fallbackInset)}px`);
          root.classList.toggle("keyboard-visible", fallbackInset > 0);
        };

        const willShow = await Keyboard.addListener("keyboardWillShow", (info) => {
          keyboardHeight = info.keyboardHeight;
          updateKeyboardInset();
          requestAnimationFrame(updateKeyboardInset);
          window.setTimeout(updateKeyboardInset, 120);
        });
        const didShow = await Keyboard.addListener("keyboardDidShow", (info) => {
          keyboardHeight = info.keyboardHeight;
          updateKeyboardInset();
        });
        const willHide = await Keyboard.addListener("keyboardWillHide", () => {
          keyboardHeight = 0;
          updateKeyboardInset();
        });
        const didHide = await Keyboard.addListener("keyboardDidHide", () => {
          keyboardHeight = 0;
          updateKeyboardInset();
        });
        const onViewportResize = () => updateKeyboardInset();
        window.visualViewport?.addEventListener("resize", onViewportResize);
        window.addEventListener("resize", onViewportResize);

        keyboardCleanup = () => {
          void willShow.remove();
          void didShow.remove();
          void willHide.remove();
          void didHide.remove();
          window.visualViewport?.removeEventListener("resize", onViewportResize);
          window.removeEventListener("resize", onViewportResize);
          keyboardHeight = 0;
          updateKeyboardInset();
        };
      } catch {
        /* Plugin unavailable or not supported on this platform. */
      }

      requestAnimationFrame(() => {
        applySafeAreaFallback(root);
        window.setTimeout(() => applySafeAreaFallback(root), 120);
      });
    })();

    return () => {
      keyboardCleanup?.();
      root.classList.remove("capacitor-native", "capacitor-safe-area-fallback", "keyboard-visible");
      root.style.removeProperty("--keyboard-inset-bottom");
      delete root.dataset.capacitorPlatform;
    };
  }, []);

  return null;
}
