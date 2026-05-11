import { getSessionUser } from "@/lib/auth/session";

const STATIC_MAP_BASE = "https://maps.googleapis.com/maps/api/staticmap";

function parseCoord(raw: string | null): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Proxies Google Static Maps so the API key stays server-side.
 * Requires `GOOGLE_MAPS_STATIC_API_KEY` (restricted to Maps Static API in Cloud Console).
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const key = process.env.GOOGLE_MAPS_STATIC_API_KEY;
  if (!key?.trim()) {
    return new Response("Maps preview not configured", { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const lat = parseCoord(searchParams.get("lat"));
  const lng = parseCoord(searchParams.get("lng"));

  if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return new Response("Invalid coordinates", { status: 400 });
  }

  const params = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: "15",
    size: "320x160",
    scale: "2",
    maptype: "roadmap",
    markers: `color:0xea4335|${lat},${lng}`,
    key: key.trim(),
  });

  const upstream = await fetch(`${STATIC_MAP_BASE}?${params.toString()}`);
  if (!upstream.ok) {
    return new Response("Map preview unavailable", { status: 502 });
  }

  const body = await upstream.arrayBuffer();
  const contentType = upstream.headers.get("Content-Type") ?? "image/png";

  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=86400",
    },
  });
}
