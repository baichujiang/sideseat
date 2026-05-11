import {
  buildClassmatePostPageUrl,
  buildClassmatePostXhsShareText,
} from "@/lib/discover/classmate-post-share-payload";

export { buildClassmatePostXhsShareText } from "@/lib/discover/classmate-post-share-payload";

export type ShareClassmatePostToXhsResult =
  | "navigator"
  | "clipboard"
  | "prompt"
  | "aborted";

/**
 * Uses Web Share when available, otherwise clipboard, otherwise a prompt fallback.
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
