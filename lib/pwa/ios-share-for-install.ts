/** iOS has no `beforeinstallprompt`; opening the system Share sheet is the closest one-tap affordance. */

export function canIosShareForInstall(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

export type IosShareForInstallResult = "shared" | "cancelled" | "unavailable";

export async function openIosShareForInstall(appName: string, pageUrl: string): Promise<IosShareForInstallResult> {
  if (!canIosShareForInstall()) return "unavailable";
  try {
    await navigator.share({
      title: appName,
      text: `Add ${appName} to your Home Screen from the share menu.`,
      url: pageUrl,
    });
    return "shared";
  } catch (e) {
    const name = e && typeof e === "object" && "name" in e ? String((e as DOMException).name) : "";
    if (name === "AbortError") return "cancelled";
    return "cancelled";
  }
}
