import {
  OSM_STATIC_PREVIEW_ZOOM,
  OSM_TILE_USER_AGENT,
  osmTileIndex,
  osmTileUrl,
} from "@/lib/maps/osm-tile";

const TILE_PX = 256;

/** 2×2 tile grid (512×512) for sharper previews than a single upscaled tile. */
export const OSM_STITCH_PX = TILE_PX * 2;

async function fetchTileBase64(x: number, y: number, z: number): Promise<string | null> {
  const upstream = await fetch(osmTileUrl(x, y, z), {
    headers: { "User-Agent": OSM_TILE_USER_AGENT },
  });
  if (!upstream.ok) return null;
  return Buffer.from(await upstream.arrayBuffer()).toString("base64");
}

/** Builds an SVG mosaic of four OSM tiles around the point's tile (top-left anchor). */
export async function buildOsmStitchedMapSvg(lat: number, lng: number): Promise<string | null> {
  const { x: tx, y: ty, z } = osmTileIndex(lat, lng, OSM_STATIC_PREVIEW_ZOOM);
  const tiles = await Promise.all([
    fetchTileBase64(tx, ty, z),
    fetchTileBase64(tx + 1, ty, z),
    fetchTileBase64(tx, ty + 1, z),
    fetchTileBase64(tx + 1, ty + 1, z),
  ]);
  if (tiles.some((t) => t == null)) return null;

  const [nw, ne, sw, se] = tiles as [string, string, string, string];
  const images = [
    `<image x="0" y="0" width="${TILE_PX}" height="${TILE_PX}" href="data:image/png;base64,${nw}"/>`,
    `<image x="${TILE_PX}" y="0" width="${TILE_PX}" height="${TILE_PX}" href="data:image/png;base64,${ne}"/>`,
    `<image x="0" y="${TILE_PX}" width="${TILE_PX}" height="${TILE_PX}" href="data:image/png;base64,${sw}"/>`,
    `<image x="${TILE_PX}" y="${TILE_PX}" width="${TILE_PX}" height="${TILE_PX}" href="data:image/png;base64,${se}"/>`,
  ];

  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${OSM_STITCH_PX}" height="${OSM_STITCH_PX}" viewBox="0 0 ${OSM_STITCH_PX} ${OSM_STITCH_PX}">${images.join("")}</svg>`;
}
