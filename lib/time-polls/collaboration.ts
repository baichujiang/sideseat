export type PollOptionKind = "ACTIVITY" | "LOCATION";
export type StoredPollCollaboration = {
  version: 1;
  activity: boolean;
  location: boolean;
  time: boolean;
  activityType: string;
  finalized: boolean;
};

/** Missing configuration leaves every pre-existing plan on its original contract. */
export function readPollCollaboration(value: unknown): StoredPollCollaboration | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (item.version !== 1 || typeof item.activity !== "boolean" || typeof item.location !== "boolean"
    || typeof item.time !== "boolean" || typeof item.activityType !== "string" || typeof item.finalized !== "boolean") return null;
  return { version: 1, activity: item.activity, location: item.location, time: item.time,
    activityType: item.activityType, finalized: item.finalized };
}

export function pollOptionIsOpen(config: StoredPollCollaboration, kind: PollOptionKind) {
  return !config.finalized && (kind === "ACTIVITY" ? config.activity : config.location);
}
