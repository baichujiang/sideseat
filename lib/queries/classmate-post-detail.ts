import "server-only";

import type { LanguageProficiency, LanguageTag } from "@prisma/client";
import { ClassmatePostCategory, ClassmatePostStatus } from "@prisma/client";

import { DEFAULT_DISCOVER_SERVED_CITY } from "@/lib/discover/discover-city-name-keys";
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

export type ClassmatePostDetailAuthor = {
  id: string;
  username: string;
  nickname: string | null;
  avatarUrl: string | null;
  major: string | null;
  semester: number | null;
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
  school: string | null;
  verifiedStudent: boolean;
  studentVerificationStatus: ClassmatePostDetailAuthor["studentVerificationStatus"];
  userLanguages: Array<{ tag: LanguageTag; proficiency: LanguageProficiency }>;
};

function toAuthor(user: UserAuthorSelect): ClassmatePostDetailAuthor {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    major: user.major,
    semester: user.semester,
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
      _count: { select: { saves: true } },
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

  if (post.userId === viewerId) {
    return {
      ok: true,
      post: {
        id: post.id,
        userId: post.userId,
        city: post.city,
        category: post.category,
        title: post.title,
        body: post.body,
        status: post.status,
        expiresAt: post.expiresAt,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        linkedCourses,
        studyMeta,
        mealsMeta,
        languageMeta,
        sportMeta,
        imageUrls,
        interestedCount: post._count.saves,
      },
      author,
      isAuthor: true,
      viewerCanMessage: false,
    };
  }

  const now = new Date();
  if (post.status !== ClassmatePostStatus.ACTIVE || post.expiresAt <= now) {
    return { ok: false };
  }
  if (post.city !== DEFAULT_DISCOVER_SERVED_CITY) {
    return { ok: false };
  }

  const [moderationBlock, mutualBlock] = await Promise.all([
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

  if (moderationBlock || mutualBlock) {
    return { ok: false };
  }

  return {
    ok: true,
    post: {
      id: post.id,
      userId: post.userId,
      city: post.city,
      category: post.category,
      title: post.title,
      body: post.body,
      status: post.status,
      expiresAt: post.expiresAt,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      linkedCourses,
      studyMeta,
      mealsMeta,
      languageMeta,
      sportMeta,
      imageUrls,
      interestedCount: post._count.saves,
    },
    author,
    isAuthor: false,
    viewerCanMessage: true,
  };
}
