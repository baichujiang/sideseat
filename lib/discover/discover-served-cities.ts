import {
  DEFAULT_DISCOVER_SERVED_CITY,
  type DiscoverCityNameKey,
} from "@/lib/discover/discover-city-name-keys";

/** Metros with live Discover + Courses content. Expand as new cities launch. */
export const DISCOVER_SERVED_CITIES = [DEFAULT_DISCOVER_SERVED_CITY] as const satisfies readonly DiscoverCityNameKey[];

export type DiscoverServedCity = (typeof DISCOVER_SERVED_CITIES)[number];

export function isDiscoverServedCity(value: string): value is DiscoverServedCity {
  return (DISCOVER_SERVED_CITIES as readonly string[]).includes(value);
}
