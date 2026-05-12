import {
  buildClassmatePostPageUrl,
  buildClassmatePostWeChatShareText,
} from "@/lib/discover/classmate-post-share-payload";
import {
  copyPlainTextSyncExecCommand,
  isHandheldMobileUserAgent,
  kickWeChatAppOpenBestEffort,
} from "@/lib/discover/mobile-native-share-kick";

export type ShareClassmatePostToWeChatResult =
  | "navigator"
  | "clipboard"
  | "prompt"
  | "aborted";

/**
 * **Mobile:** copies in the same user gesture (sync execCommand first), then tries
 * `weixin://` / Android intent — see `mobile-native-share-kick.ts` caveats.
 *
 * **Desktop:** Web Share when available, else clipboard, else prompt.
 * WeChat has no stable web→chat bridge without Open Platform / JS-SDK.
 */
export async function shareClassmatePostToWeChat(args: {
  title: string;
  body: string | null;
  /** Absolute path, e.g. `/discover/posts/…` */
  postPath: string;
  footer?: string;
}): Promise<ShareClassmatePostToWeChatResult> {
  const pageUrl = buildClassmatePostPageUrl(args.postPath, window.location.origin);
  const text = buildClassmatePostWeChatShareText({
    title: args.title,
    body: args.body,
    pageUrl,
    footer: args.footer,
  });

  if (isHandheldMobileUserAgent()) {
    const copiedSync = copyPlainTextSyncExecCommand(text);
    kickWeChatAppOpenBestEffort();
    if (copiedSync) {
      void navigator.clipboard.writeText(text).catch(() => {});
      return "clipboard";
    }

    let sharePromise: Promise<void> | undefined;
    if (typeof navigator.share === "function") {
      try {
        sharePromise = navigator.share({
          title: args.title.slice(0, 120),
          text,
          url: pageUrl,
        });
      } catch {
        sharePromise = undefined;
      }
    }
    if (sharePromise) {
      try {
        await sharePromise;
        return "navigator";
      } catch (e) {
        if ((e as { name?: string }).name === "AbortError") return "aborted";
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      return "clipboard";
    } catch {
      window.prompt("Copy for 微信 — select all, then copy:", text);
      return "prompt";
    }
  }

  if (typeof navigator.share === "function") {
    try {
      await navigator.share({
        title: args.title.slice(0, 120),
        text,
        url: pageUrl,
      });
      return "navigator";
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") return "aborted";
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    return "clipboard";
  } catch {
    window.prompt("Copy for 微信 — select all, then copy:", text);
    return "prompt";
  }
}
