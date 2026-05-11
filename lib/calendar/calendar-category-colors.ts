const FALLBACK_HEX = "#64748B";

/** Grid dimensions: hue across columns, saturation/lightness down rows. */
export const CALENDAR_COLOR_GRID_COLS = 12;
export const CALENDAR_COLOR_GRID_ROWS = 10;

/**
 * Saturation % and lightness % per row (top = more saturated / mid-light tones,
 * bottom = lower saturation, darker — keeps hues readable while distinct).
 */
const CALENDAR_COLOR_GRID_ROW_SL: readonly Readonly<{ s: number; l: number }>[] = [
  { s: 94, l: 55 },
  { s: 90, l: 47 },
  { s: 86, l: 63 },
  { s: 82, l: 39 },
  { s: 76, l: 58 },
  { s: 70, l: 43 },
  { s: 60, l: 52 },
  { s: 48, l: 45 },
  { s: 38, l: 50 },
  { s: 28, l: 34 },
];

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const light = Math.max(0, Math.min(100, l)) / 100;

  if (sat === 0) {
    const v = Math.round(light * 255);
    return { r: v, g: v, b: v };
  }

  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;

  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hue < 60) {
    rp = c;
    gp = x;
  } else if (hue < 120) {
    rp = x;
    gp = c;
  } else if (hue < 180) {
    gp = c;
    bp = x;
  } else if (hue < 240) {
    gp = x;
    bp = c;
  } else if (hue < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }

  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  };
}

function hslToHex(h: number, s: number, l: number): string {
  const { r, g, b } = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

function buildCalendarCategoryColorGridSwatches(): string[] {
  const out: string[] = [];
  for (let row = 0; row < CALENDAR_COLOR_GRID_ROWS; row++) {
    const { s, l } = CALENDAR_COLOR_GRID_ROW_SL[row]!;
    for (let col = 0; col < CALENDAR_COLOR_GRID_COLS; col++) {
      const hue = (col * 360) / CALENDAR_COLOR_GRID_COLS;
      out.push(hslToHex(hue, s, l));
    }
  }
  return out;
}

/** 12×10 = 120 preset colors for the calendar category color grid (row-major). */
const CALENDAR_COLOR_GRID_SWATCHES: readonly string[] = Object.freeze(
  buildCalendarCategoryColorGridSwatches(),
);

export function calendarCategoryColorGridSwatches(): readonly string[] {
  return CALENDAR_COLOR_GRID_SWATCHES;
}

export function normalizeCalendarCategoryHex(color: string): string {
  const t = color.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(t)) return `#${t.slice(1).toUpperCase()}`;
  const noHash = t.replace(/^#/, "");
  if (/^[0-9A-Fa-f]{6}$/.test(noHash)) return `#${noHash.toUpperCase()}`;
  return FALLBACK_HEX;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = normalizeCalendarCategoryHex(hex).slice(1);
  return {
    r: parseInt(n.slice(0, 2), 16),
    g: parseInt(n.slice(2, 4), 16),
    b: parseInt(n.slice(4, 6), 16),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const to = (v: number) => clamp(v).toString(16).padStart(2, "0").toUpperCase();
  return `#${to(r)}${to(g)}${to(b)}`;
}
