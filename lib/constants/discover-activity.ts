/** Max simultaneous OPEN/FULL activities per organizer (feed-visible supply cap). */
export const MAX_OPEN_DISCOVER_ACTIVITIES_PER_USER = 5;

/** Default event length when creating an activity (server-side). */
export const DISCOVER_ACTIVITY_DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

/** Earliest allowed start relative to creation time. */
export const DISCOVER_ACTIVITY_MIN_START_OFFSET_MS = 60 * 60 * 1000;

export const DISCOVER_ACTIVITY_TITLE_MAX = 120;
export const DISCOVER_ACTIVITY_DESCRIPTION_MAX = 1000;
export const DISCOVER_ACTIVITY_LOCATION_MAX = 120;
export const DISCOVER_ACTIVITY_CAPACITY_MIN = 2;
export const DISCOVER_ACTIVITY_CAPACITY_MAX = 50;
