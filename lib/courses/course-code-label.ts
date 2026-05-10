/**
 * Badge text for course cards: prefer the stored catalog code (any prefix),
 * fall back to legacy INxxxx tokens parsed from free-text titles.
 */
function extractLegacyInCodesFromText(text: string): string[] {
  const upper = text.toUpperCase();
  const matches = upper.match(/\bIN[\s-]?(\d{4})\b/g) ?? [];
  const normalized = matches.map((token) => `IN${token.replace(/[^0-9]/g, "").slice(-4)}`);
  return [...new Set(normalized)];
}

export function courseCodeBadgeLabel(name: string, rawCode: string | null): string {
  const trimmed = rawCode?.trim();
  if (trimmed) return trimmed;
  return extractLegacyInCodesFromText(name).join(" · ");
}

/** Course chat inbox row + thread header: include catalog code when present so users can match the same class. */
export function courseChatHeadline(name: string, rawCode: string | null | undefined): string {
  const code = rawCode?.trim();
  if (code) return `${code} · ${name}`;
  return name;
}
