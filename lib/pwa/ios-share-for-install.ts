/** iOS has no `beforeinstallprompt`; system Share is the closest one-tap path to “Add to Home Screen”. */

function installSharePayloads(appName: string, pageUrl: string): ShareData[] {
  return [
    { url: pageUrl },
    { title: appName, url: pageUrl },
    {
      title: appName,
      text: `Add ${appName} to your Home Screen.`,
      url: pageUrl,
    },
  ];
}

/** True when we can likely open the Share sheet (secure context + share + optional canShare for this URL). */
export function canIosShareForInstall(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  if (typeof window === "undefined") return false;
  const url = window.location.href;
  if (!url) return false;
  if (typeof navigator.canShare !== "function") return true;
  try {
    return installSharePayloads("App", url).some((data) => {
      try {
        return navigator.canShare!(data);
      } catch {
        return false;
      }
    });
  } catch {
    return true;
  }
}

export type IosShareForInstallResult = "shared" | "cancelled" | "unavailable";

export async function openIosShareForInstall(appName: string, pageUrl: string): Promise<IosShareForInstallResult> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return "unavailable";
  }

  const payloads = installSharePayloads(appName, pageUrl);

  for (const data of payloads) {
    if (typeof navigator.canShare === "function") {
      try {
        if (!navigator.canShare(data)) continue;
      } catch {
        continue;
      }
    }
    try {
      await navigator.share(data);
      return "shared";
    } catch (e) {
      const name = e && typeof e === "object" && "name" in e ? String((e as DOMException).name) : "";
      if (name === "AbortError") return "cancelled";
    }
  }

  return "unavailable";
}

/** When Web Share is missing or rejects all payloads — still a one-tap step for the user. */
export async function copyInstallPageUrl(pageUrl: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(pageUrl);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    if (typeof document === "undefined") return false;
    const ta = document.createElement("textarea");
    ta.value = pageUrl;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
