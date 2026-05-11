const BODY_CLIP_XHS = 600;
const BODY_CLIP_WECHAT = 400;

export const DEFAULT_CLASSMATE_POST_XHS_FOOTER = "— SideSeat · classmate post";
const DEFAULT_WECHAT_FOOTER = "— SideSeat · classmate post";

export function normalizeClassmatePostPath(postPath: string): string {
  return postPath.startsWith("/") ? postPath : `/${postPath}`;
}

/** `origin` should be `window.location.origin` in the browser. */
export function buildClassmatePostPageUrl(postPath: string, origin: string): string {
  const path = normalizeClassmatePostPath(postPath);
  const base = origin.replace(/\/$/, "");
  return `${base}${path}`;
}

function clipBody(raw: string | null, maxChars: number): string {
  const t = raw?.trim() ?? "";
  if (!t) return "";
  return t.length > maxChars ? `${t.slice(0, maxChars)}…` : t;
}

/**
 * Plain text for pasting into Xiaohongshu (小红书) notes. There is no stable public
 * web→app deep link; users paste in the app after copy or system share.
 */
export function buildClassmatePostXhsShareText(args: {
  title: string;
  body: string | null;
  pageUrl: string;
  /** Line after the URL, e.g. list pages use "— SideSeat · my listings". */
  footer?: string;
}): string {
  const title = args.title.trim() || "SideSeat post";
  const raw = args.body?.trim() ?? "";
  const bodyBlock =
    raw.length === 0
      ? ""
      : `\n\n${raw.length > BODY_CLIP_XHS ? `${raw.slice(0, BODY_CLIP_XHS)}…` : raw}`;
  const footer = (args.footer ?? DEFAULT_CLASSMATE_POST_XHS_FOOTER).trim() || DEFAULT_CLASSMATE_POST_XHS_FOOTER;
  return `${title}${bodyBlock}\n\n${args.pageUrl}\n\n${footer}`;
}

/**
 * Compact plain text for WeChat (paste into chat / Notes). No JS-SDK in typical web/PWA.
 */
export function buildClassmatePostWeChatShareText(args: {
  title: string;
  body: string | null;
  pageUrl: string;
  footer?: string;
}): string {
  const title = args.title.trim() || "SideSeat post";
  const excerpt = clipBody(args.body, BODY_CLIP_WECHAT);
  const footer = (args.footer ?? DEFAULT_WECHAT_FOOTER).trim() || DEFAULT_WECHAT_FOOTER;
  const parts = [title];
  if (excerpt) parts.push("", excerpt);
  parts.push("", args.pageUrl);
  parts.push("", footer);
  return parts.join("\n");
}
