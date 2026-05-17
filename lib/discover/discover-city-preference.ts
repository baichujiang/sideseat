import { cookies } from "next/headers";

import {
  DEFAULT_DISCOVER_SERVED_CITY,
  type DiscoverCityNameKey,
} from "@/lib/discover/discover-city-name-keys";
import { isDiscoverServedCity } from "@/lib/discover/discover-served-cities";

export const DISCOVER_SERVED_CITY_COOKIE = "discover_served_city" as const;

export async function getServerDiscoverServedCity(): Promise<DiscoverCityNameKey> {
  const jar = await cookies();
  const raw = jar.get(DISCOVER_SERVED_CITY_COOKIE)?.value;
  if (raw && isDiscoverServedCity(raw)) {
    return raw;
  }
  return DEFAULT_DISCOVER_SERVED_CITY;
}
