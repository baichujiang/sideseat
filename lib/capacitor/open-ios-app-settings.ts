import { isCapacitorIos } from "@/lib/capacitor/platform";

/**
 * Opens the iOS Settings page for this app when running in Capacitor.
 * Uses the system settings URL (same as UIApplication.openSettingsURLString).
 * No-op on web/Android; returns whether navigation was attempted.
 */
export function openIosAppSettings(): boolean {
  if (!isCapacitorIos() || typeof window === "undefined") return false;
  try {
    window.location.href = "app-settings:";
    return true;
  } catch {
    return false;
  }
}
