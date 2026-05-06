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
