"use client";

import { MapPin } from "lucide-react";
import { useState } from "react";

import { useLocaleContext } from "@/components/i18n/locale-provider";
import type { ChatLocationMapPreviewMode } from "@/lib/maps/static-preview-types";
import { latLngToTilePixel, OSM_STATIC_PREVIEW_ZOOM } from "@/lib/maps/osm-tile";
import { OSM_STITCH_PX } from "@/lib/maps/osm-stitch-preview";
import { cn } from "@/lib/utils";

export function ChatLocationLinkPreview({
  lat,
  lng,
  name,
  previewMode,
}: {
  lat: number;
  lng: number;
  name: string | null;
  /** `google` — marker baked into image; `osm-tile` — show pin overlay on tile. */
  previewMode: ChatLocationMapPreviewMode;
}) {
  const { messages: ui } = useLocaleContext();
  const c = ui.chat;
  const [thumbFailed, setThumbFailed] = useState(false);
  const mapsHref = `https://www.google.com/maps?q=${lat},${lng}`;
  const label = name?.trim() || c.locationShareDefaultLabel;
  const showThumb = !thumbFailed;
  const previewSrc = `/api/maps/static?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`;
  const showPinOverlay = previewMode === "osm-tile" && showThumb;
  const osmTileOffset =
    previewMode === "osm-tile"
      ? latLngToTilePixel(lat, lng, OSM_STATIC_PREVIEW_ZOOM)
      : null;

  return (
    <a
      href={mapsHref}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "block max-w-[min(100vw-4rem,20rem)] overflow-hidden rounded-xl border border-border/70 bg-muted/25 text-left no-underline",
        "outline-none transition-opacity hover:opacity-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
    >
      {showThumb ? (
        <div className="relative h-[104px] w-full overflow-hidden bg-muted/30">
          {/* eslint-disable-next-line @next/next/no-img-element -- proxied map image from same origin */}
          <img
            src={previewSrc}
            alt=""
            loading="lazy"
            className={cn(
              previewMode === "osm-tile"
                ? "absolute max-w-none"
                : "block h-full w-full object-cover",
            )}
            style={
              osmTileOffset
                ? {
                    left: `calc(50% - ${osmTileOffset.px}px)`,
                    top: `calc(50% - ${osmTileOffset.py}px)`,
                    width: OSM_STITCH_PX,
                    height: OSM_STITCH_PX,
                  }
                : undefined
            }
            onError={() => setThumbFailed(true)}
          />
          {showPinOverlay ? (
            <span
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
              aria-hidden
            >
              <MapPin
                className="h-9 w-9 text-red-600 drop-shadow-md"
                strokeWidth={2.25}
                fill="currentColor"
              />
            </span>
          ) : null}
        </div>
      ) : (
        <div className="flex h-[88px] items-center justify-center gap-2 bg-muted/40 px-3">
          <MapPin className="h-7 w-7 shrink-0 text-muted-foreground" strokeWidth={2} aria-hidden />
        </div>
      )}
      <div className="flex items-start gap-2 border-t border-border/60 px-3 py-2.5">
        <MapPin
          className="mt-0.5 h-[18px] w-[18px] shrink-0 opacity-90"
          strokeWidth={2.25}
          aria-hidden
        />
        <div className="min-w-0">
          <p className="text-[15px] font-medium leading-snug">{label}</p>
          <p className="mt-0.5 text-[11px] font-normal text-muted-foreground">
            {c.locationShareOpenInMaps}
          </p>
        </div>
      </div>
    </a>
  );
}
