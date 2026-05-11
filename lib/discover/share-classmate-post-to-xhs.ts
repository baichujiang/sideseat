import {
  buildClassmatePostPageUrl,
  buildClassmatePostXhsShareText,
} from "@/lib/discover/classmate-post-share-payload";
import {
  copyPlainTextForShareGesture,
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
  /** Absolute path, e.g. `/discover/posts/…` or `/inbox/my-posts` */
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
    const copied = await copyPlainTextForShareGesture(text);
    kickXhsAppOpenBestEffort();
    if (copied) return "clipboard";
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
    window.prompt("Copy for 小红书 — select all, then copy:", text);
    return "prompt";
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
