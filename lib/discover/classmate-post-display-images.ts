/** URLs that should render as real media (non-blank after trim). */
export function isDisplayableClassmatePostImageUrl(url: unknown): url is string {
  return typeof url === "string" && url.trim().length > 0;
}

/** Feed/detail helpers — drops blank entries so no-image posts use the text cover. */
export function displayableClassmatePostImageUrls(
  urls: string[] | null | undefined,
): string[] {
  if (!urls?.length) return [];
  const out: string[] = [];
  for (const raw of urls) {
    const url = raw.trim();
    if (!url) continue;
    out.push(url);
  }
  return out;
}
