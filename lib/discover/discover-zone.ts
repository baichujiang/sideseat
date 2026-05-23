/** Top-level Discover areas: buddy posts vs organized activities. */
export type DiscoverZone = "buddies" | "activities";

const ZONE_PARAM_VALUES: DiscoverZone[] = ["buddies", "activities"];

export function parseDiscoverZone(raw: string | null): DiscoverZone {
  const v = (raw ?? "").toLowerCase();
  return ZONE_PARAM_VALUES.includes(v as DiscoverZone) ? (v as DiscoverZone) : "buddies";
}

export function discoverZoneToParam(zone: DiscoverZone): string {
  return zone;
}
