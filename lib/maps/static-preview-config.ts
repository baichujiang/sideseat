import "server-only";

import type { ChatLocationMapPreviewMode } from "@/lib/maps/static-preview-types";

export function chatLocationMapPreviewMode(): ChatLocationMapPreviewMode {
  return process.env.GOOGLE_MAPS_STATIC_API_KEY?.trim() ? "google" : "osm-tile";
}
