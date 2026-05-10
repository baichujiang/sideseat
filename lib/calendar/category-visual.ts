import type { CSSProperties } from "react";

const HEX = /^#([0-9A-Fa-f]{6})$/;

export function isValidCategoryHex(color: string): boolean {
  return HEX.test(color.trim());
}

export function hexToRgb(color: string): { r: number; g: number; b: number } | null {
  const m = color.trim().match(HEX);
  if (!m) return null;
  const n = m[1]!;
  return {
    r: parseInt(n.slice(0, 2), 16),
    g: parseInt(n.slice(2, 4), 16),
    b: parseInt(n.slice(4, 6), 16),
  };
}

export function rgbaFromHex(color: string, alpha: number): string | null {
  const rgb = hexToRgb(color);
  if (!rgb) return null;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
}

/** Inline styles for arbitrary user category color on schedule blocks. */
export function categoryBlockSurfaceStyle(
  hex: string,
  selected: boolean,
  options?: { shortOverlap?: boolean },
): CSSProperties {
  const border = hex.trim();
  const short = Boolean(options?.shortOverlap && !selected);
  const fillAlpha = selected ? 0.32 : short ? 0.08 : 0.14;
  const fill = rgbaFromHex(hex, fillAlpha) ?? "rgba(100,116,139,0.14)";
  return {
    backgroundColor: fill,
    borderColor: border,
    borderWidth: selected ? 2 : 1,
    borderStyle: "solid",
    ...(short
      ? {
          backdropFilter: "blur(10px) saturate(1.12)",
          WebkitBackdropFilter: "blur(10px) saturate(1.12)",
        }
      : {}),
  };
}

export function categoryAccentColor(hex: string): string {
  return hex.trim();
}
