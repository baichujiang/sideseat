"use client";

import type { PluginListenerHandle } from "@capacitor/core";

import { apiFetch } from "@/lib/auth/api-fetch";
import { getCapacitorPlatform, isCapacitorNative } from "@/lib/capacitor/platform";

export type NativePushPermission = "granted" | "denied" | "prompt" | "unknown";

type ApiOk<T> = { success: true; data: T };
type ApiErr = { success: false; error: string };

async function readJson<T>(res: Response): Promise<T | ApiErr> {
  return (await res.json()) as T | ApiErr;
}

async function loadPushNotifications() {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  return PushNotifications;
}

export async function getNativePushPermission(): Promise<NativePushPermission> {
  if (!isCapacitorNative()) return "unknown";
  try {
    const PushNotifications = await loadPushNotifications();
    const { receive } = await PushNotifications.checkPermissions();
    if (receive === "granted") return "granted";
    if (receive === "denied") return "denied";
    return "prompt";
  } catch {
    return "unknown";
  }
}

export async function requestNativePushPermission(): Promise<NativePushPermission> {
  if (!isCapacitorNative()) return "unknown";
  try {
    const PushNotifications = await loadPushNotifications();
    const { receive } = await PushNotifications.requestPermissions();
    if (receive === "granted") return "granted";
    if (receive === "denied") return "denied";
    return "prompt";
  } catch {
    return "unknown";
  }
}

export async function registerNativePush(): Promise<void> {
  const PushNotifications = await loadPushNotifications();
  await PushNotifications.register();
}

export async function unregisterNativePush(): Promise<void> {
  const PushNotifications = await loadPushNotifications();
  await PushNotifications.unregister();
}

export async function saveNativePushToken(token: string): Promise<boolean> {
  const platform = getCapacitorPlatform();
  if (platform !== "ios" && platform !== "android") return false;

  const res = await apiFetch("/api/push/native-register", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, platform }),
  });
  const out = await readJson<ApiOk<{ saved: boolean }>>(res);
  return "success" in out && out.success;
}

export async function removeNativePushToken(token: string): Promise<void> {
  await apiFetch("/api/push/native-register", {
    method: "DELETE",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
}

/**
 * Subscribes to Capacitor registration events. Call once per native shell session.
 * Returns a cleanup that removes listeners.
 */
export function attachNativePushListeners(handlers: {
  onToken: (token: string) => void | Promise<void>;
  onError?: (message: string) => void;
}): () => void {
  let regHandle: PluginListenerHandle | undefined;
  let errHandle: PluginListenerHandle | undefined;
  let cancelled = false;

  void (async () => {
    try {
      const PushNotifications = await loadPushNotifications();
      if (cancelled) return;
      regHandle = await PushNotifications.addListener("registration", (ev) => {
        void handlers.onToken(ev.value);
      });
      errHandle = await PushNotifications.addListener("registrationError", (ev) => {
        handlers.onError?.(ev.error);
      });
    } catch {
      handlers.onError?.("push_plugin_unavailable");
    }
  })();

  return () => {
    cancelled = true;
    void regHandle?.remove();
    void errHandle?.remove();
  };
}
