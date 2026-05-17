import type { SchoolCode } from "@/lib/constants/schools";
import type { DiscoverCityNameKey } from "@/lib/discover/discover-city-name-keys";

const SCHOOL_CODES_BY_CITY: Partial<Record<DiscoverCityNameKey, SchoolCode[]>> = {
  Munich: ["TUM", "LMU"],
};

/** Schools shown on /courses for the selected Discover metro. */
export function schoolCodesForDiscoverCity(city: DiscoverCityNameKey): SchoolCode[] {
  return SCHOOL_CODES_BY_CITY[city] ?? [];
}
