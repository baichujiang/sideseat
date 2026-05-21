/** Zoom for location map previews (lower = wider area). OSM tile + client pin use the same level. */
export const OSM_STATIC_PREVIEW_ZOOM = 15;

const TILE_PX = 256;

/** Web Mercator tile index for a WGS84 point at integer zoom. */
export function osmTileIndex(lat: number, lng: number, zoom: number): { x: number; y: number; z: number } {
  const z = Math.max(0, Math.min(19, Math.floor(zoom)));
  const latRad = (lat * Math.PI) / 180;
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return { x, y, z };
}

export function osmTileUrl(x: number, y: number, z: number): string {
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

/** Continuous Web Mercator pixel at zoom (top-left origin, 256px per tile). */
export function latLngToWorldPixel(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const z = Math.max(0, Math.min(19, Math.floor(zoom)));
  const scale = TILE_PX * 2 ** z;
  const latRad = (lat * Math.PI) / 180;
  const x = ((lng + 180) / 360) * scale;
  const y =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale;
  return { x, y };
}

/** Pixel offset of a point inside its containing tile at zoom. */
export function latLngToTilePixel(
  lat: number,
  lng: number,
  zoom: number,
): { px: number; py: number; z: number } {
  const { x, y, z } = osmTileIndex(lat, lng, zoom);
  const world = latLngToWorldPixel(lat, lng, zoom);
  return {
    px: world.x - x * TILE_PX,
    py: world.y - y * TILE_PX,
    z,
  };
}

/** OSM tile policy: identify the app in User-Agent. */
export const OSM_TILE_USER_AGENT =
  process.env.OSM_TILE_USER_AGENT?.trim() ||
  "Sideseat/1.0 (+https://github.com/sideseat)";
