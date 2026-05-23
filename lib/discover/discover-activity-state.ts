import type { DiscoverActivitySignupStatus, DiscoverActivityStatus } from "@prisma/client";

import { normalizeSchoolCode } from "@/lib/constants/schools";

export type DiscoverActivityPhase =
  | "bookable"
  | "full"
  | "closed"
  | "canceled"
  | "expired";

export type DiscoverActivityErrorCode =
  | "AUTH_REQUIRED"
  | "ONBOARDING_REQUIRED"
  | "CROSS_SCHOOL"
  | "SELF_SIGNUP"
  | "NOT_BOOKABLE"
  | "ALREADY_GOING"
  | "NOT_GOING"
  | "ORGANIZER_ONLY"
  | "CREATE_LIMIT"
  | "BLOCKED";

export type DiscoverActivityCore = {
  id: string;
  organizerId: string;
  school: string;
  status: DiscoverActivityStatus;
  startAt: Date;
  capacity: number | null;
};

export type DiscoverActivityViewer = {
  userId: string | null;
  isGuest: boolean;
  school: string | null;
  /** True when viewer has an active block relationship with the organizer. */
  blockedWithOrganizer?: boolean;
};

export type DiscoverActivitySignupContext = DiscoverActivityCore & {
  goingCount: number;
  viewerSignupStatus: DiscoverActivitySignupStatus | null;
};

export function isActivityExpired(activity: Pick<DiscoverActivityCore, "startAt">, now: Date): boolean {
  return activity.startAt.getTime() <= now.getTime();
}

export function schoolsMatch(activitySchool: string, viewerSchool: string | null | undefined): boolean {
  const a = normalizeSchoolCode(activitySchool);
  const b = normalizeSchoolCode(viewerSchool);
  return Boolean(a && b && a === b);
}

export function deriveActivityPhase(
  activity: DiscoverActivityCore,
  now: Date,
): DiscoverActivityPhase {
  if (isActivityExpired(activity, now)) return "expired";
  if (activity.status === "CANCELED") return "canceled";
  if (activity.status === "CLOSED") return "closed";
  if (activity.status === "FULL") return "full";
  return "bookable";
}

export function isVisibleInFeed(activity: DiscoverActivityCore, now: Date): boolean {
  if (isActivityExpired(activity, now)) return false;
  return activity.status === "OPEN" || activity.status === "FULL";
}

export function nextStatusAfterSignup(
  currentStatus: DiscoverActivityStatus,
  goingCount: number,
  capacity: number | null,
): DiscoverActivityStatus {
  if (capacity != null && goingCount >= capacity) return "FULL";
  if (currentStatus === "FULL" && capacity != null && goingCount < capacity) return "OPEN";
  return currentStatus === "FULL" ? "FULL" : "OPEN";
}

export function nextStatusAfterCancel(
  currentStatus: DiscoverActivityStatus,
  goingCount: number,
  capacity: number | null,
): DiscoverActivityStatus {
  if (currentStatus === "FULL" && capacity != null && goingCount < capacity) return "OPEN";
  if (currentStatus === "CANCELED" || currentStatus === "CLOSED") return currentStatus;
  return "OPEN";
}

export function canSignup(
  viewer: DiscoverActivityViewer,
  activity: DiscoverActivitySignupContext,
  now: Date,
): { ok: true } | { ok: false; code: DiscoverActivityErrorCode } {
  if (!viewer.userId) return { ok: false, code: "AUTH_REQUIRED" };
  if (viewer.isGuest) return { ok: false, code: "ONBOARDING_REQUIRED" };
  if (viewer.blockedWithOrganizer) return { ok: false, code: "BLOCKED" };
  if (activity.organizerId === viewer.userId) return { ok: false, code: "SELF_SIGNUP" };
  if (!schoolsMatch(activity.school, viewer.school)) return { ok: false, code: "CROSS_SCHOOL" };

  const phase = deriveActivityPhase(activity, now);
  if (phase !== "bookable") return { ok: false, code: "NOT_BOOKABLE" };

  if (activity.viewerSignupStatus === "GOING") return { ok: false, code: "ALREADY_GOING" };

  if (activity.capacity != null && activity.goingCount >= activity.capacity) {
    return { ok: false, code: "NOT_BOOKABLE" };
  }

  return { ok: true };
}

export function canCancelSignup(
  viewer: DiscoverActivityViewer,
  viewerSignupStatus: DiscoverActivitySignupStatus | null,
): { ok: true } | { ok: false; code: DiscoverActivityErrorCode } {
  if (!viewer.userId) return { ok: false, code: "AUTH_REQUIRED" };
  if (viewer.isGuest) return { ok: false, code: "ONBOARDING_REQUIRED" };
  if (viewerSignupStatus !== "GOING") return { ok: false, code: "NOT_GOING" };
  return { ok: true };
}

export function canClose(
  viewer: DiscoverActivityViewer,
  activity: DiscoverActivityCore,
  now: Date,
): boolean {
  if (!viewer.userId || viewer.userId !== activity.organizerId) return false;
  const phase = deriveActivityPhase(activity, now);
  return phase === "bookable" || phase === "full";
}

export function canCancelActivity(
  viewer: DiscoverActivityViewer,
  activity: DiscoverActivityCore,
  now: Date,
): boolean {
  if (!viewer.userId || viewer.userId !== activity.organizerId) return false;
  const phase = deriveActivityPhase(activity, now);
  return phase !== "expired" && phase !== "canceled";
}

export function canCreateActivity(viewer: DiscoverActivityViewer): {
  ok: true;
} | { ok: false; code: DiscoverActivityErrorCode } {
  if (!viewer.userId) return { ok: false, code: "AUTH_REQUIRED" };
  if (viewer.isGuest) return { ok: false, code: "ONBOARDING_REQUIRED" };
  return { ok: true };
}
