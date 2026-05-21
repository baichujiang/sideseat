import { getSessionUser } from "@/lib/auth/session";
import { buildOsmStitchedMapSvg } from "@/lib/maps/osm-stitch-preview";

const STATIC_MAP_BASE = "https://maps.googleapis.com/maps/api/staticmap";

function parseCoord(raw: string | null): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

async function proxyGoogleStaticMap(lat: number, lng: number, key: string): Promise<Response | null> {
  const params = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: "15",
    size: "640x320",
    scale: "2",
    maptype: "roadmap",
    markers: `color:0xea4335|${lat},${lng}`,
    key: key.trim(),
  });

  const upstream = await fetch(`${STATIC_MAP_BASE}?${params.toString()}`);
  if (!upstream.ok) return null;

  const body = await upstream.arrayBuffer();
  const contentType = upstream.headers.get("Content-Type") ?? "image/png";
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=86400",
      "X-Map-Preview-Source": "google",
    },
  });
}

async function proxyOsmStitchedMap(lat: number, lng: number): Promise<Response | null> {
  const svg = await buildOsmStitchedMapSvg(lat, lng);
  if (!svg) return null;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "private, max-age=86400",
      "X-Map-Preview-Source": "osm-stitched",
    },
  });
}

/**
 * Proxies a static map thumbnail (Google Static Maps when configured, else OSM tile).
 * Requires a logged-in session. API keys stay server-side.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const lat = parseCoord(searchParams.get("lat"));
  const lng = parseCoord(searchParams.get("lng"));

  if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return new Response("Invalid coordinates", { status: 400 });
  }

  const googleKey = process.env.GOOGLE_MAPS_STATIC_API_KEY?.trim();
  if (googleKey) {
    const google = await proxyGoogleStaticMap(lat, lng, googleKey);
    if (google) return google;
  }

  const osm = await proxyOsmStitchedMap(lat, lng);
  if (osm) return osm;

  return new Response("Map preview unavailable", { status: 502 });
}
