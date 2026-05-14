import type { Prisma } from "@prisma/client";

import {
  mapPrismaLanguageToDiscoverRow,
  mapPrismaMealsToDiscoverRow,
  mapPrismaSportToDiscoverRow,
  mapPrismaStudyToDiscoverRow,
  mapPrismaClassmatePostImagesToUrls,
  type DiscoverPostRow,
} from "@/lib/discover/discover-post-row";

/** Prisma include for building `DiscoverPostRow` (Discover list, saved posts, My posts). */
export const classmatePostForDiscoverInclude = {
  user: { include: { userLanguages: true } },
  courses: { include: { course: { select: { id: true, code: true, name: true } } } },
  study: true,
  meals: true,
  language: true,
  sport: true,
  images: { select: { url: true, sortOrder: true } },
} satisfies Prisma.ClassmatePostInclude;

export type ClassmatePostForDiscoverPayload = Prisma.ClassmatePostGetPayload<{
  include: typeof classmatePostForDiscoverInclude;
}>;

export function prismaClassmatePostToDiscoverRow(
  post: ClassmatePostForDiscoverPayload,
  viewerUserId: string,
  opts?: { savedByViewer?: boolean },
): DiscoverPostRow {
  const row: DiscoverPostRow = {
    id: post.id,
    category: post.category,
    city: post.city,
    title: post.title,
    body: post.body,
    createdAt: post.createdAt,
    expiresAt: post.expiresAt,
    isOwn: post.userId === viewerUserId,
    userId: post.user.id,
    nickname: post.user.nickname ?? post.user.username,
    gender: post.user.gender,
    avatarUrl: post.user.avatarUrl,
    major: post.user.major,
    semester: post.user.semester,
    school: post.user.school,
    languages: post.user.userLanguages.map((r) => ({
      tag: r.tag,
      proficiency: r.proficiency,
    })),
    verifiedStudent: post.user.verifiedStudent,
    studentVerificationStatus: post.user.studentVerificationStatus,
    linkedCourses: post.courses.map((pc) => ({
      id: pc.course.id,
      code: pc.course.code,
      name: pc.course.name,
    })),
    studyMeta: mapPrismaStudyToDiscoverRow(post.study),
    mealsMeta: mapPrismaMealsToDiscoverRow(post.meals),
    languageMeta: mapPrismaLanguageToDiscoverRow(post.language),
    sportMeta: mapPrismaSportToDiscoverRow(post.sport),
  };
  const imageUrls = mapPrismaClassmatePostImagesToUrls(post.images);
  if (imageUrls?.length) {
    row.imageUrls = imageUrls;
  }
  if (opts?.savedByViewer !== undefined) {
    row.savedByViewer = opts.savedByViewer;
  }
  return row;
}
