import {
  buildClassmatePostPageUrl,
  buildClassmatePostXhsShareText,
} from "@/lib/discover/classmate-post-share-payload";
import {
  copyPlainTextSyncExecCommand,
  isHandheldMobileUserAgent,
  kickXhsAppOpenBestEffort,
} from "@/lib/discover/mobile-native-share-kick";

export { buildClassmatePostXhsShareText } from "@/lib/discover/classmate-post-share-payload";

export type ShareClassmatePostToXhsResult =
  | "navigator"
  | "clipboard"
  | "prompt"
  | "aborted";

/**
 * **Mobile:** copies in the same user gesture, then tries `xhsdiscover://home/explore`
 * (iOS iframe) or Android `intent://…` — see `mobile-native-share-kick.ts` caveats
 * (no public “open composer with text” URL).
 *
 * **Desktop:** Web Share when available, otherwise clipboard, otherwise prompt.
 */
export async function shareClassmatePostToXhs(args: {
  title: string;
  body: string | null;
  /** Absolute path, e.g. `/discover/posts/…` or `/profile/my-posts` */
  postPath: string;
  footer?: string;
}): Promise<ShareClassmatePostToXhsResult> {
  const pageUrl = buildClassmatePostPageUrl(args.postPath, window.location.origin);
  const text = buildClassmatePostXhsShareText({
    title: args.title,
    body: args.body,
    pageUrl,
    footer: args.footer,
  });

  if (isHandheldMobileUserAgent()) {
    // Sync copy + app kick must run before any `await` — otherwise iOS Safari drops
    // user activation and scheme opens / share sheet / prompt can silently do nothing.
    const copiedSync = copyPlainTextSyncExecCommand(text);
    kickXhsAppOpenBestEffort();
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
      window.prompt("Copy for 小红书 — select all, then copy:", text);
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
    window.prompt("Copy for 小红书 — select all, then copy:", text);
    return "prompt";
  }
}
