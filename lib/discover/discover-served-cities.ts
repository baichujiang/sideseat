import type { DiscoverCityNameKey } from "@/lib/i18n/messages/discover-city-name-keys";

/** Canonical fallback before a client has loaded the runtime city configuration. */
export const DEFAULT_DISCOVER_SERVED_CITY = "Munich" satisfies DiscoverCityNameKey;

/** Metros with live Discover + Courses content. Expand as new cities launch. */
export const DISCOVER_SERVED_CITIES = [DEFAULT_DISCOVER_SERVED_CITY] as const satisfies readonly DiscoverCityNameKey[];

export type DiscoverServedCity = (typeof DISCOVER_SERVED_CITIES)[number];

export function isDiscoverServedCity(value: string): value is DiscoverServedCity {
  return (DISCOVER_SERVED_CITIES as readonly string[]).includes(value);
}
