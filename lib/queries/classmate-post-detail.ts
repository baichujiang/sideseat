import "server-only";

import type {
  ActionCoordinationPolicy,
  ClassmatePostReplyPreference,
  ClassmatePostVisibility,
  LanguageProficiency,
  LanguageTag,
  Prisma,
} from "@prisma/client";
import {
  ClassmatePostCategory,
  type ClassmatePostClosureReason,
  ClassmatePostStatus,
} from "@prisma/client";

import { isDiscoverServedCity } from "@/lib/discover/discover-served-cities";
import {
  mapPrismaLanguageToDiscoverRow,
  mapPrismaMealsToDiscoverRow,
  mapPrismaSportToDiscoverRow,
  mapPrismaStudyToDiscoverRow,
  mapPrismaClassmatePostImagesToUrls,
  type DiscoverPostRowLanguageMeta,
  type DiscoverPostRowMealsMeta,
  type DiscoverPostRowSportMeta,
  type DiscoverPostRowStudyMeta,
} from "@/lib/discover/discover-post-row";
import { prisma } from "@/lib/db/prisma";
import { activeCourseMembershipWhere } from "@/lib/courses/active-membership";
import { getSchoolMatchValues } from "@/lib/constants/schools";
import {
  buildViewerCourseMatchIndex,
  courseMatchesViewer,
} from "@/lib/discover/viewer-course-match";
import { allowsLegacyDirectConversationForAction } from "@/lib/v2/action-coordination/policy-snapshot";

export type ClassmatePostDetailAuthor = {
  id: string;
  username: string;
  nickname: string | null;
  avatarUrl: string | null;
  major: string | null;
  semester: number | null;
  studentStatus: "CURRENT_STUDENT" | "EXCHANGE_STUDENT" | "ALUMNI" | null;
  graduationYear: number | null;
  school: string | null;
  languages: Array<{ tag: LanguageTag; proficiency: LanguageProficiency }>;
  verifiedStudent: boolean;
  studentVerificationStatus:
    | "UNVERIFIED"
    | "EMAIL_PENDING"
    | "VERIFIED"
    | "MANUAL_REVIEW_REQUIRED"
    | "REJECTED";
};

export type ClassmatePostDetail = {
  id: string;
  userId: string;
  city: string;
  category: ClassmatePostCategory;
  title: string;
  body: string | null;
  status: ClassmatePostStatus;
  closureReason: ClassmatePostClosureReason | null;
  closedAt: Date | null;
  coordinationPolicy?: ActionCoordinationPolicy | null;
  policySchemaVersion?: number | null;
  policyParametersSnapshot?: Prisma.JsonValue | null;
  experimentKeySnapshot?: string | null;
  experimentVariantSnapshot?: "CONTROL" | "TREATMENT" | null;
  clientCapabilitySnapshot?: Prisma.JsonValue | null;
  policySnapshottedAt?: Date | null;
  tags: string[];
  visibility: ClassmatePostVisibility;
  replyPreference: ClassmatePostReplyPreference;
  startsAt: Date | null;
  endsAt: Date | null;
  location: string | null;
  capacity: number | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  linkedCourses: Array<{ id: string; code: string | null; name: string }>;
  studyMeta?: DiscoverPostRowStudyMeta;
  mealsMeta?: DiscoverPostRowMealsMeta;
  languageMeta?: DiscoverPostRowLanguageMeta;
  sportMeta?: DiscoverPostRowSportMeta;
  imageUrls: string[];
  interestedCount: number;
};

export type ClassmatePostDetailView =
  | {
      ok: true;
      post: ClassmatePostDetail;
      author: ClassmatePostDetailAuthor;
      isAuthor: boolean;
      /** False for your own post; true when another user's live post is visible. */
      viewerCanMessage: boolean;
    }
  | { ok: false };

type UserAuthorSelect = {
  id: string;
  username: string;
  nickname: string | null;
  avatarUrl: string | null;
  major: string | null;
  semester: number | null;
  studentStatus: ClassmatePostDetailAuthor["studentStatus"];
  graduationYear: number | null;
  school: string | null;
  verifiedStudent: boolean;
  studentVerificationStatus: ClassmatePostDetailAuthor["studentVerificationStatus"];
  userLanguages: Array<{ tag: LanguageTag; proficiency: LanguageProficiency }>;
};

type DetailViewerSelect = {
  id: string;
  school: string | null;
  verifiedStudent: boolean;
  courses: Array<{ course: { id: string; code: string | null; school: string } }>;
};

function canViewerSeePostDetail(
  post: ClassmatePostDetail,
  author: ClassmatePostDetailAuthor,
  viewer: DetailViewerSelect,
) {
  switch (post.visibility) {
    case "CITY_INTERNATIONALS":
      return true;
    case "VERIFIED_ONLY":
      return viewer.verifiedStudent;
    case "COURSEMATES_ONLY": {
      const viewerCourses = buildViewerCourseMatchIndex(
        viewer.courses
          .map((row) => row.course)
          .filter((course) => getSchoolMatchValues(viewer.school).includes(course.school)),
      );
      return post.linkedCourses.some((course) =>
        courseMatchesViewer(course, viewerCourses),
      );
    }
    case "SCHOOL_ONLY":
    default:
      return Boolean(viewer.school && author.school && viewer.school === author.school);
  }
}

function toAuthor(user: UserAuthorSelect): ClassmatePostDetailAuthor {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    major: user.major,
    semester: user.semester,
    studentStatus: user.studentStatus,
    graduationYear: user.graduationYear,
    school: user.school,
    languages: user.userLanguages.map((r) => ({ tag: r.tag, proficiency: r.proficiency })),
    verifiedStudent: user.verifiedStudent,
    studentVerificationStatus: user.studentVerificationStatus,
  };
}

/**
 * Same visibility rules as Discover post list for non-authors; authors always
 * see their own row (any status / expiry).
 */
export async function getClassmatePostDetailForViewer(
  postId: string,
  viewerId: string,
): Promise<ClassmatePostDetailView> {
  const post = await prisma.classmatePost.findUnique({
    where: { id: postId },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          nickname: true,
          avatarUrl: true,
          major: true,
          semester: true,
          studentStatus: true,
          graduationYear: true,
          school: true,
          verifiedStudent: true,
          studentVerificationStatus: true,
          userLanguages: { select: { tag: true, proficiency: true } },
        },
      },
      courses: { include: { course: { select: { id: true, code: true, name: true } } } },
      study: true,
      meals: true,
      language: true,
      sport: true,
      images: { select: { url: true, sortOrder: true } },
      _count: { select: { interests: { where: { status: "ACTIVE" } } } },
    },
  });

  if (!post) {
    return { ok: false };
  }

  const author = toAuthor(post.user);

  const linkedCourses = post.courses.map((pc) => ({
    id: pc.course.id,
    code: pc.course.code,
    name: pc.course.name,
  }));
  const studyMeta = mapPrismaStudyToDiscoverRow(post.study);
  const mealsMeta = mapPrismaMealsToDiscoverRow(post.meals);
  const languageMeta = mapPrismaLanguageToDiscoverRow(post.language);
  const sportMeta = mapPrismaSportToDiscoverRow(post.sport);
  const imageUrls = mapPrismaClassmatePostImagesToUrls(post.images) ?? [];

  const basePost: ClassmatePostDetail = {
    id: post.id,
    userId: post.userId,
    city: post.city,
    category: post.category,
    title: post.title,
    body: post.body,
    status: post.status,
    closureReason: post.closureReason,
    closedAt: post.closedAt,
    coordinationPolicy: post.coordinationPolicy,
    policySchemaVersion: post.policySchemaVersion,
    policyParametersSnapshot: post.policyParametersSnapshot,
    experimentKeySnapshot: post.experimentKeySnapshot,
    experimentVariantSnapshot: post.experimentVariantSnapshot,
    clientCapabilitySnapshot: post.clientCapabilitySnapshot,
    policySnapshottedAt: post.policySnapshottedAt,
    tags: post.tags,
    visibility: post.visibility,
    replyPreference: post.replyPreference,
    startsAt: post.startsAt,
    endsAt: post.endsAt,
    location: post.location,
    capacity: post.capacity,
    expiresAt: post.expiresAt,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    linkedCourses,
    studyMeta,
    mealsMeta,
    languageMeta,
    sportMeta,
    imageUrls,
    interestedCount: post._count.interests,
  };

  if (post.userId === viewerId) {
    return {
      ok: true,
      post: basePost,
      author,
      isAuthor: true,
      viewerCanMessage: false,
    };
  }

  const now = new Date();
  if (post.status !== ClassmatePostStatus.ACTIVE || post.expiresAt <= now) {
    return { ok: false };
  }
  if (!isDiscoverServedCity(post.city)) {
    return { ok: false };
  }

  const [viewer, moderationBlock, mutualBlock] = await Promise.all([
    prisma.user.findUnique({
      where: { id: viewerId },
      select: {
        id: true,
        school: true,
        verifiedStudent: true,
        courses: {
          where: activeCourseMembershipWhere(now),
          select: { course: { select: { id: true, code: true, school: true } } },
        },
      },
    }),
    prisma.moderationBlock.findFirst({
      where: { userId: post.userId, isActive: true },
      select: { id: true },
    }),
    prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: viewerId, blockedId: post.userId },
          { blockerId: post.userId, blockedId: viewerId },
        ],
      },
      select: { id: true },
    }),
  ]);

  if (!viewer || moderationBlock || mutualBlock || !canViewerSeePostDetail(basePost, author, viewer)) {
    return { ok: false };
  }

  return {
    ok: true,
    post: basePost,
    author,
    isAuthor: false,
    viewerCanMessage: allowsLegacyDirectConversationForAction(basePost),
  };
}
