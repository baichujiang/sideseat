import type { AppMessages } from "@/lib/i18n/messages";
import type { DiscoverCityNameKey } from "@/lib/i18n/messages/discover-city-name-keys";

export function getDiscoverCityDisplayLabel(
  city: string,
  cityNames: AppMessages["discover"]["cityNames"],
): string {
  if (Object.prototype.hasOwnProperty.call(cityNames, city)) {
    return cityNames[city as DiscoverCityNameKey];
  }
  return city;
}
