export const ACTIVITY_TYPES = [
  "STUDY_SESSION",
  "LUNCH",
  "MEETUP",
  "GO_TO_CLASS",
] as const;

export type ActivityTypeValue = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_TYPE_OPTIONS = [
  { value: "STUDY_SESSION", label: "Study" },
  { value: "LUNCH", label: "Lunch" },
  { value: "MEETUP", label: "Meetup" },
  { value: "GO_TO_CLASS", label: "Go to class" },
] as const;

export const ACTIVITY_TYPE_LABEL: Record<ActivityTypeValue, string> = {
  STUDY_SESSION: "Study session",
  LUNCH: "Lunch",
  MEETUP: "Meetup",
  GO_TO_CLASS: "Go to class",
};

export function calendarTitleForActivity(
  activityType: ActivityTypeValue,
  otherNickname: string | null,
): string {
  const name = otherNickname?.trim() || "classmate";

  switch (activityType) {
    case "LUNCH":
      return `Lunch w/ ${name}`;
    case "MEETUP":
      return `Meetup w/ ${name}`;
    case "GO_TO_CLASS":
      return `Go to class w/ ${name}`;
    case "STUDY_SESSION":
    default:
      return `Study w/ ${name}`;
  }
}
