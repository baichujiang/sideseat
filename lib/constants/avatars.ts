/**
 * Twenty preset avatars, stored in `User.avatarUrl` as a short id like "p07".
 * Each combines a two-color gradient background with a simple centered motif
 * rendered in semi-transparent white, so the result reads clearly on any
 * surface without relying on external images.
 */

export type AvatarMotif = "circle" | "triangle" | "square" | "diamond" | "bars";

export type AvatarPreset = {
  id: string;
  gradient: readonly [string, string];
  motif: AvatarMotif;
};

// 10 paired palettes inspired by the app's warm editorial tones.
const PALETTES: ReadonlyArray<readonly [string, string]> = [
  ["#f4d6a8", "#e08a4e"], // peach
  ["#d9ead1", "#5f9572"], // sage
  ["#f7d5d5", "#c6615f"], // blush
  ["#cfe3ea", "#5c8aa6"], // sky
  ["#ead7b8", "#a87127"], // amber
  ["#e2d6f0", "#7a5fab"], // lilac
  ["#c9e0dd", "#3f7773"], // teal
  ["#eed1cf", "#8a3f3f"], // rose
  ["#efe4c3", "#8f6f2e"], // oat
  ["#c7dfd0", "#2f6b4f"], // emerald
];

const MOTIFS: readonly AvatarMotif[] = ["circle", "triangle", "square", "diamond", "bars"];

export const avatarPresets: readonly AvatarPreset[] = PALETTES.flatMap((gradient, paletteIndex) =>
  [MOTIFS[paletteIndex % MOTIFS.length], MOTIFS[(paletteIndex + 2) % MOTIFS.length]].map(
    (motif, motifIndex) => ({
      id: `p${String(paletteIndex * 2 + motifIndex + 1).padStart(2, "0")}`,
      gradient,
      motif,
    }),
  ),
);

export const DEFAULT_AVATAR_ID = avatarPresets[0].id;

export function getAvatarPreset(id?: string | null): AvatarPreset {
  if (!id) return avatarPresets[0];
  return avatarPresets.find((preset) => preset.id === id) ?? avatarPresets[0];
}

export function isValidAvatarId(value: unknown): value is string {
  return typeof value === "string" && avatarPresets.some((preset) => preset.id === value);
}

export function randomAvatarId(): string {
  const index = Math.floor(Math.random() * avatarPresets.length);
  return avatarPresets[index].id;
}
