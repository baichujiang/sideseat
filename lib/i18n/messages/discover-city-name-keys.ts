/**
 * Canonical English `ClassmatePost.city` values we localize in the UI.
 * Unknown strings pass through unchanged (display-only layer).
 */
export const DISCOVER_CITY_NAME_KEYS = [
  "Munich",
  "Berlin",
  "Hamburg",
  "Cologne",
  "Frankfurt",
  "Stuttgart",
  "Heidelberg",
  "Leipzig",
  "Dresden",
  "Nuremberg",
  "Düsseldorf",
  "Vienna",
  "Zurich",
  "Amsterdam",
  "London",
  "Paris",
  "Aachen",
  "Karlsruhe",
  "Freiburg",
  "Bonn",
  "Mannheim",
  "Passau",
  "Regensburg",
  "Bremen",
  "Hanover",
  "Münster",
  "Mainz",
  "Kiel",
  "Tübingen",
  "Barcelona",
] as const;

export type DiscoverCityNameKey = (typeof DISCOVER_CITY_NAME_KEYS)[number];
