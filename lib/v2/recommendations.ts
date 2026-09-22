import "server-only";

import { toZonedTime } from "date-fns-tz";
import type {
  ClassmatePostCategory,
  DiscoverActivityCategory,
  SocialIntentTopic,
} from "@prisma/client";

import { activeCourseMembershipWhere } from "@/lib/courses/active-membership";
import { prisma } from "@/lib/db/prisma";
import { loadActiveDiscoverActivitiesForCity } from "@/lib/discover/load-active-discover-activities-for-city";
import { loadActiveDiscoverPostsForCity } from "@/lib/discover/load-active-discover-posts";
import { toNativeDiscoverActivity } from "@/lib/api/v1/native-discover-serializer";
import { toNativeDiscoverPost } from "@/lib/api/v1/discover-service";
import type { SocialWindowInput } from "@/lib/validators/social-preferences";

function postTopic(category: ClassmatePostCategory): SocialIntentTopic {
  switch (category) {
    case "STUDY":
    case "SHARED_COURSES":
      return "STUDY";
    case "MEALS":
      return "FOOD";
    case "SPORTS":
      return "SPORTS";
    case "LANGUAGE":
      return "EXPLORE";
    default:
      return "EXPLORE";
  }
}

function activityTopic(category: DiscoverActivityCategory | null): SocialIntentTopic {
  switch (category) {
    case "STUDY_GROUP":
      return "STUDY";
    case "SPORTS":
      return "SPORTS";
    case "FOOD":
      return "FOOD";
    case "CAMPUS_EVENT":
      return "EVENTS";
    default:
      return "EXPLORE";
  }
}

function fallsInSocialWindow(
  iso: string | null,
  windows: SocialWindowInput[],
  timeZone: string,
) {
  if (!iso || windows.length === 0) return false;
  const local = toZonedTime(new Date(iso), timeZone);
  const weekday = local.getDay() === 0 ? 7 : local.getDay();
  const minutes = local.getHours() * 60 + local.getMinutes();
  return windows.some(
    (window) =>
      window.weekday === weekday &&
      minutes >= window.startMinutes &&
      minutes < window.endMinutes,
  );
}

function freshnessPoints(date: Date, now: Date) {
  const ageDays = Math.max(0, (now.getTime() - date.getTime()) / 86_400_000);
  return Math.max(0, 10 - Math.floor(ageDays));
}

export async function loadActionRecommendations(options: {
  userId: string;
  city: string;
  limit?: number;
}) {
  const now = new Date();
  const [preference, viewer, posts, activities] = await Promise.all([
    prisma.userSocialPreference.findUnique({ where: { userId: options.userId } }),
    prisma.user.findUnique({
      where: { id: options.userId },
      select: {
        userLanguages: { select: { tag: true } },
        courses: {
          where: activeCourseMembershipWhere(now),
          select: { courseId: true },
        },
      },
    }),
    loadActiveDiscoverPostsForCity(options.city, options.userId),
    loadActiveDiscoverActivitiesForCity(options.city, options.userId),
  ]);

  const activePreference = Boolean(preference && preference.activeUntil > now);
  const topics = new Set(activePreference ? preference!.topics : []);
  const windows = (activePreference
    ? preference!.weeklyWindows
    : []) as unknown as SocialWindowInput[];
  const timeZone = preference?.timeZone ?? "Europe/Berlin";
  const languageTags = new Set(viewer?.userLanguages.map((row) => row.tag) ?? []);
  const courseIds = new Set(viewer?.courses.map((row) => row.courseId) ?? []);

  const ranked = [
    ...posts.filter((post) => !post.isOwn).map((post) => {
      const reasonCodes: string[] = [];
      let score = freshnessPoints(post.createdAt, now);
      if (topics.has(postTopic(post.category))) {
        score += 40;
        reasonCodes.push("MATCHES_INTEREST");
      }
      if (post.linkedCourses?.some((course) => courseIds.has(course.id))) {
        score += 30;
        reasonCodes.push("SAME_COURSE");
      }
      if (post.languages.some((language) => languageTags.has(language.tag))) {
        score += 15;
        reasonCodes.push("SHARED_LANGUAGE");
      }
      if (
        fallsInSocialWindow(
          post.startsAt?.toISOString() ?? null,
          windows,
          timeZone,
        )
      ) {
        score += 20;
        reasonCodes.push("FITS_SOCIAL_TIME");
      }
      if (freshnessPoints(post.createdAt, now) >= 7) reasonCodes.push("RECENT");
      return {
        score,
        tie: post.startsAt?.getTime() ?? post.createdAt.getTime(),
        item: {
          kind: "BUDDY_POST" as const,
          reasonCodes: reasonCodes.slice(0, 3),
          post: toNativeDiscoverPost(post),
        },
      };
    }),
    ...activities.filter((activity) => !activity.isOrganizer).map((activity) => {
      const reasonCodes: string[] = [];
      let score = 5;
      if (topics.has(activityTopic(activity.category))) {
        score += 40;
        reasonCodes.push("MATCHES_INTEREST");
      }
      if (fallsInSocialWindow(activity.startAtISO, windows, timeZone)) {
        score += 20;
        reasonCodes.push("FITS_SOCIAL_TIME");
      }
      reasonCodes.push("UPCOMING");
      return {
        score,
        tie: new Date(activity.startAtISO).getTime(),
        item: {
          kind: "ACTIVITY" as const,
          reasonCodes: reasonCodes.slice(0, 3),
          activity: toNativeDiscoverActivity(activity),
        },
      };
    }),
  ]
    .sort((left, right) => right.score - left.score || left.tie - right.tie)
    .slice(0, Math.min(Math.max(options.limit ?? 30, 1), 30))
    .map(({ item }) => item);

  return {
    mode: activePreference ? ("PERSONALIZED" as const) : ("EXPLORE_FALLBACK" as const),
    preferenceActiveUntil: preference?.activeUntil.toISOString() ?? null,
    items: ranked,
  };
}

