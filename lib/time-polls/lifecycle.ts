import { fromZonedTime } from "date-fns-tz";

type TimedPoll = {
  phase: string;
  chosenStart: Date | string | null;
  dates: string[];
  timeZone: string;
  endMinute: number;
};

/** Expiry is derived from the existing plan, without changing confirmed facts. */
export function timePollExpiresAt(poll: TimedPoll): Date | null {
  if (poll.phase === "INVITING") return poll.chosenStart ? new Date(poll.chosenStart) : null;
  if (poll.phase !== "COLLECTING" || !poll.dates.length) return null;
  let date = [...poll.dates].sort().at(-1)!;
  if (poll.endMinute === 1440) {
    const next = new Date(`${date}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    date = next.toISOString().slice(0, 10);
  }
  const minute = poll.endMinute % 1440;
  const clock = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  return fromZonedTime(`${date}T${clock}:00`, poll.timeZone);
}

export function timePollPhase(poll: TimedPoll, now = new Date()): string {
  const expiry = timePollExpiresAt(poll);
  return expiry && expiry <= now ? "EXPIRED" : poll.phase;
}
