/**
 * Best-effort “open native app” kicks from **mobile web** (one menu tap: copy + scheme).
 *
 * ## Reality / caveats (do not treat as stable APIs)
 *
 * **WeChat (`weixin://`)**
 * - The `weixin` URL scheme is not documented for arbitrary third-party H5 pages.
 * - Historically, WeChat tightened handling of scheme opens from **outside** the WeChat
 *   in-app browser; many external mobile browsers will **ignore** or block `weixin://`.
 * - Official flows (JS-SDK, Open Platform, encrypted URL schemes for Mini Programs) are
 *   not available to a generic Next.js PWA page. We still try `weixin://` + Android
 *   `intent://…#Intent;scheme=weixin…` because it sometimes surfaces the app, then rely
 *   on clipboard text the user can paste in chat.
 *
 * **小红书 (`xhsdiscover://`)**
 * - Community / reverse-engineered paths (e.g. `xhsdiscover://home/explore`) appear in
 *   vendor H5 and third-party lists; **XHS does not publish a stable public contract** for
 *   “jump from random websites into publish composer with pre-filled note text”.
 * - `snssdk1128://` is **Douyin (TikTok CN)**, not XHS — do not use here.
 * - We open a **reasonable** entry (explore/home) so the user lands in-app; they still
 *   paste from clipboard to publish.
 *
 * **Android `intent://`**
 * - Chrome resolves `intent://…#Intent;scheme=…;package=…;end` to launch the app when
 *   installed; behavior differs in in-app WebViews (WeChat, Instagram, etc.).
 *
 * **iOS**
 * - Custom schemes are often triggered via a **hidden iframe** to avoid navigating the
 *   current tab when no handler is registered.
 */

const WECHAT_ANDROID_PACKAGE = "com.tencent.mm";
const XHS_ANDROID_PACKAGE = "com.xingin.xhs";

/** True for typical phone / tablet UA we try to deep-link (excludes most desktop). */
export function isHandheldMobileUserAgent(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Android/i.test(ua) || /iPhone|iPad|iPod/i.test(ua);
}

/**
 * Synchronous clipboard path that stays within the user-gesture stack (menu click).
 * Use before `await` or `setTimeout` so copy still works when the OS restricts async API.
 */
export function copyPlainTextSyncExecCommand(text: string): boolean {
  if (typeof document === "undefined") return false;
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Sync `execCommand` first (stays in user-gesture stack), then async Clipboard API. */
export async function copyPlainTextForShareGesture(text: string): Promise<boolean> {
  if (copyPlainTextSyncExecCommand(text)) return true;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function isAndroid(): boolean {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}

function isIos(): boolean {
  return typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function openSchemeViaHiddenIframe(schemeUrl: string): void {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "display:none;width:0;height:0;border:0;visibility:hidden";
  iframe.src = schemeUrl;
  document.body.appendChild(iframe);
  window.setTimeout(() => {
    try {
      iframe.remove();
    } catch {
      /* ignore */
    }
  }, 2000);
}

/** Launch WeChat if the OS/browser allows; no return value (best-effort). */
export function kickWeChatAppOpenBestEffort(): void {
  if (typeof window === "undefined") return;

  if (isAndroid()) {
    // intent://… lets Chrome resolve to the WeChat activity when installed.
    const intent = `intent://#Intent;scheme=weixin;package=${WECHAT_ANDROID_PACKAGE};end`;
    window.location.assign(intent);
    return;
  }

  if (isIos()) {
    // Bare `weixin://` is the most commonly cited “open app” pattern; paths like
    // `weixin://dl/…` are undocumented for third-party pages and may change.
    openSchemeViaHiddenIframe("weixin://");
    return;
  }
}

/**
 * Launch 小红书 (home / explore). There is no reliable public scheme to open the
 * **publish** screen with arbitrary text from the web.
 */
export function kickXhsAppOpenBestEffort(): void {
  if (typeof window === "undefined") return;

  if (isAndroid()) {
    const path = "home/explore";
    const intent = `intent://${path}#Intent;scheme=xhsdiscover;package=${XHS_ANDROID_PACKAGE};end`;
    window.location.assign(intent);
    return;
  }

  if (isIos()) {
    openSchemeViaHiddenIframe("xhsdiscover://home/explore");
    return;
  }
}
