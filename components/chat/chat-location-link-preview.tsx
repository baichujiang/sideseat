"use client";

import { MapPin } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

export function ChatLocationLinkPreview({
  lat,
  lng,
  name,
  staticPreviewEnabled,
}: {
  lat: number;
  lng: number;
  name: string | null;
  /** Mirrors server-only env: set when `GOOGLE_MAPS_STATIC_API_KEY` is configured. */
  staticPreviewEnabled: boolean;
}) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const mapsHref = `https://www.google.com/maps?q=${lat},${lng}`;
  const label = name?.trim() || "Shared location";
  const showThumb = staticPreviewEnabled && !thumbFailed;
  const previewSrc = `/api/maps/static?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`;

  if (!staticPreviewEnabled) {
    return (
      <a
        href={mapsHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex max-w-[min(100vw-4rem,20rem)] items-start gap-2 text-left font-medium underline-offset-2 hover:underline"
      >
        <MapPin
          className="mt-0.5 h-[18px] w-[18px] shrink-0 opacity-90"
          strokeWidth={2.25}
          aria-hidden
        />
        <span className="min-w-0">
          {label}
          <span className="mt-0.5 block text-[11px] font-normal opacity-80">Open in Maps</span>
        </span>
      </a>
    );
  }

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
        /* eslint-disable-next-line @next/next/no-img-element -- proxied map tile from same origin */
        <img
          src={previewSrc}
          alt=""
          loading="lazy"
          className="block h-[104px] w-full object-cover"
          onError={() => setThumbFailed(true)}
        />
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
          <p className="mt-0.5 text-[11px] font-normal text-muted-foreground">Open in Maps</p>
        </div>
      </div>
    </a>
  );
}
