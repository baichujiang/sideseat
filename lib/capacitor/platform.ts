import { Capacitor } from "@capacitor/core";

/** True when running inside a Capacitor native WebView (iOS/Android). */
export function isCapacitorNative(): boolean {
  if (typeof window === "undefined") return false;
  return Capacitor.isNativePlatform();
}

export function getCapacitorPlatform(): "ios" | "android" | "web" {
  return Capacitor.getPlatform() as "ios" | "android" | "web";
}

export function isCapacitorIos(): boolean {
  return isCapacitorNative() && Capacitor.getPlatform() === "ios";
}
