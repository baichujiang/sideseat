"use client";

import { useEffect, useState } from "react";

import { isCapacitorNative } from "@/lib/capacitor/platform";

/** Hydration-safe: false on server/first paint, then true inside Capacitor WebView. */
export function useCapacitorNative(): boolean {
  const [native, setNative] = useState(() => {
    if (typeof window === "undefined") return false;
    return isCapacitorNative();
  });

  useEffect(() => {
    setNative(isCapacitorNative());
  }, []);

  return native;
}
