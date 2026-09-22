import type { PlanType } from "@prisma/client";

export type ActionContextSnapshot = {
  version: 1;
  sourceKind: "BUDDY_POST" | "COURSE_ACTION";
  sourceId: string;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  planType: PlanType;
  participantIds: [string, string];
  author: { id: string; displayName: string };
  course: { id: string; code: string | null; name: string } | null;
};

/**
 * Durable privacy tombstone for an Interest whose source relationship is no
 * longer safe to render. Version 2 is the persisted discriminator: unlike the
 * live v1 snapshot it intentionally retains no title, place, course, author,
 * or participant identity.
 */
export type ActionContextTombstoneSnapshot = {
  version: 2;
  kind: "TOMBSTONE";
  sourceKind: "BUDDY_POST" | "COURSE_ACTION";
  sourceId: string;
};

export type ActionOriginSnapshot =
  | Readonly<{ kind: "LIVE"; snapshot: ActionContextSnapshot }>
  | Readonly<{
      kind: "TOMBSTONE";
      snapshot: ActionContextTombstoneSnapshot;
    }>;

const ROOT_KEYS = Object.freeze([
  "author",
  "course",
  "endsAt",
  "location",
  "participantIds",
  "planType",
  "sourceId",
  "sourceKind",
  "startsAt",
  "title",
  "version",
] as const);
const AUTHOR_KEYS = Object.freeze(["displayName", "id"] as const);
const COURSE_KEYS = Object.freeze(["code", "id", "name"] as const);
const PLAN_TYPES = new Set<PlanType>([
  "STUDY",
  "MEAL",
  "SPORTS",
  "LANGUAGE",
  "CUSTOM",
]);
const TOMBSTONE_ROOT_KEYS = Object.freeze([
  "kind",
  "sourceId",
  "sourceKind",
  "version",
] as const);
const RFC_3339_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  return (
    keys.length === expected.length &&
    keys.every((key, index) => key === expected[index])
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableDateTime(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string") return false;
  const match = RFC_3339_DATE_TIME.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[8] === undefined ? 0 : Number(match[8]);
  const offsetMinute =
    match[9] === undefined ? 0 : Number(match[9]);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 23 &&
    offsetMinute <= 59 &&
    Number.isFinite(Date.parse(value))
  );
}

/**
 * Parse the immutable Action origin snapshot using the exact public wire
 * schema. This is deliberately strict: a corrupt snapshot must be quarantined
 * rather than cast into an incomplete API response or Plan draft.
 */
export function parseActionContextSnapshot(
  value: unknown,
): ActionContextSnapshot | null {
  if (!isRecord(value) || !hasExactKeys(value, ROOT_KEYS)) return null;
  if (
    value.version !== 1 ||
    (value.sourceKind !== "BUDDY_POST" &&
      value.sourceKind !== "COURSE_ACTION") ||
    typeof value.sourceId !== "string" ||
    typeof value.title !== "string" ||
    !isNullableDateTime(value.startsAt) ||
    !isNullableDateTime(value.endsAt) ||
    !isNullableString(value.location) ||
    typeof value.planType !== "string" ||
    !PLAN_TYPES.has(value.planType as PlanType)
  ) {
    return null;
  }

  const participantIds = value.participantIds;
  if (
    !Array.isArray(participantIds) ||
    participantIds.length !== 2 ||
    participantIds.some((id) => typeof id !== "string")
  ) {
    return null;
  }

  const author = value.author;
  if (
    !isRecord(author) ||
    !hasExactKeys(author, AUTHOR_KEYS) ||
    typeof author.id !== "string" ||
    typeof author.displayName !== "string"
  ) {
    return null;
  }

  const course = value.course;
  if (
    course !== null &&
    (!isRecord(course) ||
      !hasExactKeys(course, COURSE_KEYS) ||
      typeof course.id !== "string" ||
      !isNullableString(course.code) ||
      typeof course.name !== "string")
  ) {
    return null;
  }

  return value as ActionContextSnapshot;
}

/**
 * Strict persisted union parser used only at privacy-aware Interest boundaries.
 * The existing live-only parser above deliberately keeps its old return
 * contract so Plan and attribution code can never silently accept a tombstone.
 */
export function parseActionOriginSnapshot(
  value: unknown,
): ActionOriginSnapshot | null {
  const live = parseActionContextSnapshot(value);
  if (live) return Object.freeze({ kind: "LIVE", snapshot: live });
  if (!isRecord(value) || !hasExactKeys(value, TOMBSTONE_ROOT_KEYS)) {
    return null;
  }
  if (
    value.version !== 2 ||
    value.kind !== "TOMBSTONE" ||
    (value.sourceKind !== "BUDDY_POST" &&
      value.sourceKind !== "COURSE_ACTION") ||
    typeof value.sourceId !== "string" ||
    value.sourceId.length === 0
  ) {
    return null;
  }
  return Object.freeze({
    kind: "TOMBSTONE",
    snapshot: value as ActionContextTombstoneSnapshot,
  });
}

export function actionContextTombstoneSnapshot(options: {
  sourceKind: ActionContextTombstoneSnapshot["sourceKind"];
  sourceId: string;
}): ActionContextTombstoneSnapshot {
  if (options.sourceId.length === 0) {
    throw new TypeError("A tombstone requires a non-empty source identifier.");
  }
  return Object.freeze({
    version: 2,
    kind: "TOMBSTONE",
    sourceKind: options.sourceKind,
    sourceId: options.sourceId,
  });
}
