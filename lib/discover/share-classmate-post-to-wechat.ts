import {
  buildClassmatePostPageUrl,
  buildClassmatePostWeChatShareText,
} from "@/lib/discover/classmate-post-share-payload";

export type ShareClassmatePostToWeChatResult =
  | "navigator"
  | "clipboard"
  | "prompt"
  | "aborted";

/**
 * Uses Web Share when available, otherwise clipboard, otherwise a prompt fallback.
 * WeChat in-app has no stable web→chat bridge without Open Platform / JS-SDK.
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
