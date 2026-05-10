const BODY_CLIP = 600;

/**
 * Plain text for pasting into Xiaohongshu (小红书) notes. There is no stable public
 * web→app deep link; users paste in the app after copy or system share.
 */
export function buildClassmatePostXhsShareText(args: {
  title: string;
  body: string | null;
  pageUrl: string;
}): string {
  const title = args.title.trim() || "SideSeat post";
  const raw = args.body?.trim() ?? "";
  const bodyBlock =
    raw.length === 0
      ? ""
      : `\n\n${raw.length > BODY_CLIP ? `${raw.slice(0, BODY_CLIP)}…` : raw}`;
  return `${title}${bodyBlock}\n\n${args.pageUrl}\n\n— SideSeat · classmate post`;
}
