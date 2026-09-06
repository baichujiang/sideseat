import "server-only";

import {
  ClassmatePostCategory,
  ClassmatePostStatus,
  type Prisma,
  type User,
} from "@prisma/client";

import { MAX_ACTIVE_CLASSMATE_POSTS_PER_CATEGORY } from "@/lib/constants/app";
import { isAllowedClassmatePostImageUrl } from "@/lib/constants/classmate-post-media";
import { getSchoolMatchValues } from "@/lib/constants/schools";
import { activeCourseMembershipWhere } from "@/lib/courses/active-membership";
import { DEFAULT_DISCOVER_SERVED_CITY } from "@/lib/discover/discover-served-cities";
import { classmatePostForDiscoverInclude } from "@/lib/discover/prisma-classmate-post-for-discover";
import {
  type ActionPolicySnapshot,
  directConversationPolicySnapshot,
} from "@/lib/v2/action-coordination/capability";
import { projectActionPolicyFields } from "@/lib/v2/action-coordination/action-fields";
import {
  classmatePostLanguagePayloadHasData,
  classmatePostMealsPayloadHasData,
  classmatePostSportPayloadHasData,
  classmatePostStudyPayloadHasData,
  languagePayloadSchema,
  mealsPayloadSchema,
  sportPayloadSchema,
  studyPayloadSchema,
  createClassmatePostSchema,
  updateClassmatePostSchema,
} from "@/lib/validators/classmate-posts";

export type ClassmatePostCreateErrorCode =
  | "INVALID_EXPIRY"
  | "EXPIRY_IN_PAST"
  | "COURSE_NOT_ENROLLED"
  | "COURSE_SELECTION_INVALID"
  | "CREATE_LIMIT"
  | "INVALID_IMAGE"
  | "NOT_FOUND"
  | "AUTHOR_ONLY"
  | "CITY_MISMATCH"
  | "INVALID_STATE";

export class ClassmatePostCreateError extends Error {
  constructor(readonly code: ClassmatePostCreateErrorCode) {
    super(code);
    this.name = "ClassmatePostCreateError";
  }
}

export async function createClassmatePostForUser(
  user: Pick<User, "id" | "school">,
  input: unknown,
  tx: Prisma.TransactionClient,
  policySnapshot: ActionPolicySnapshot = directConversationPolicySnapshot(),
) {
  const values = createClassmatePostSchema.parse(input);
  const category = values.category ?? ClassmatePostCategory.OTHER;
  const expiresAt = new Date(values.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) {
    throw new ClassmatePostCreateError("INVALID_EXPIRY");
  }
  if (expiresAt.getTime() < Date.now() - 60_000) {
    throw new ClassmatePostCreateError("EXPIRY_IN_PAST");
  }

  const policyFields = projectActionPolicyFields({
    policy: policySnapshot.coordinationPolicy,
    category,
    courseIds: values.courseIds ?? [],
    replyPreference: values.replyPreference,
    capacity: values.capacity,
  });
  if (!policyFields.courseSelectionValid) {
    throw new ClassmatePostCreateError("COURSE_SELECTION_INVALID");
  }
  const courseIds = policyFields.courseIds;
  const imageUrls = Array.from(new Set(values.imageUrls ?? []));
  if (imageUrls.some((url) => !isAllowedClassmatePostImageUrl(user.id, url))) {
    throw new ClassmatePostCreateError("INVALID_IMAGE");
  }

  if (
    (category === ClassmatePostCategory.SHARED_COURSES || values.visibility === "COURSEMATES_ONLY") &&
    courseIds.length > 0
  ) {
    const enrolled = await tx.userCourse.count({
      where: {
        userId: user.id,
        courseId: { in: [...courseIds] },
        ...activeCourseMembershipWhere(),
        course: { school: { in: getSchoolMatchValues(user.school) } },
      },
    });
    if (enrolled !== courseIds.length) {
      throw new ClassmatePostCreateError("COURSE_NOT_ENROLLED");
    }
  }

  await tx.$executeRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
  const activeInCategory = await tx.classmatePost.count({
    where: {
      userId: user.id,
      category,
      status: ClassmatePostStatus.ACTIVE,
      expiresAt: { gt: new Date() },
    },
  });
  if (activeInCategory >= MAX_ACTIVE_CLASSMATE_POSTS_PER_CATEGORY) {
    throw new ClassmatePostCreateError("CREATE_LIMIT");
  }

  const postBody = values.body?.trim() || null;
  const created = await tx.classmatePost.create({
    data: {
      userId: user.id,
      city: values.city ?? DEFAULT_DISCOVER_SERVED_CITY,
      category,
      title: values.title,
      body: postBody,
      tags: values.tags,
      visibility: values.visibility,
      replyPreference: policyFields.replyPreference,
      startsAt: values.startsAt ? new Date(values.startsAt) : null,
      endsAt: values.endsAt ? new Date(values.endsAt) : null,
      location: values.location?.trim() || null,
      capacity: policyFields.capacity,
      expiresAt,
      status: ClassmatePostStatus.ACTIVE,
      coordinationPolicy: policySnapshot.coordinationPolicy,
      policySchemaVersion: policySnapshot.policySchemaVersion,
      policyParametersSnapshot: policySnapshot.policyParametersSnapshot,
      experimentKeySnapshot: policySnapshot.experimentKeySnapshot,
      experimentVariantSnapshot: policySnapshot.experimentVariantSnapshot,
      clientCapabilitySnapshot:
        policySnapshot.clientCapabilitySnapshot ?? undefined,
      policySnapshottedAt: policySnapshot.policySnapshottedAt,
    },
  });

  if (
    (category === ClassmatePostCategory.SHARED_COURSES || values.visibility === "COURSEMATES_ONLY") &&
    courseIds.length > 0
  ) {
    await tx.classmatePostCourse.createMany({
      data: courseIds.map((courseId) => ({ postId: created.id, courseId })),
    });
  }
  if (imageUrls.length > 0) {
    await tx.classmatePostImage.createMany({
      data: imageUrls.map((url, sortOrder) => ({
        postId: created.id,
        url,
        sortOrder,
      })),
    });
  }
  if (category === ClassmatePostCategory.STUDY && values.study) {
    const study = studyPayloadSchema.parse(values.study);
    if (classmatePostStudyPayloadHasData(study)) {
      await tx.classmatePostStudy.create({
        data: {
          postId: created.id,
          purposes: study.purposes,
          timeSlots: study.timeSlots,
          venues: study.venues,
          venueOtherNote: study.venueOtherNote ?? null,
        },
      });
    }
  }
  if (category === ClassmatePostCategory.MEALS && values.meals) {
    const meals = mealsPayloadSchema.parse(values.meals);
    if (classmatePostMealsPayloadHasData(meals)) {
      await tx.classmatePostMeals.create({
        data: {
          postId: created.id,
          venueTags: [],
          venueOtherNote: meals.venueOtherNote ?? null,
        },
      });
    }
  }
  if (category === ClassmatePostCategory.LANGUAGE) {
    const language = languagePayloadSchema.parse(values.language);
    if (classmatePostLanguagePayloadHasData(language)) {
      await tx.classmatePostLanguage.create({
        data: {
          postId: created.id,
          offers: language.offers as Prisma.InputJsonValue,
          targets: language.targets,
        },
      });
    }
  }
  if (category === ClassmatePostCategory.SPORTS && values.sport) {
    const sport = sportPayloadSchema.parse(values.sport);
    if (classmatePostSportPayloadHasData(sport)) {
      await tx.classmatePostSport.create({
        data: {
          postId: created.id,
          sportTags: sport.sportTags,
          sportOtherNote: sport.sportOtherNote ?? null,
        },
      });
    }
  }

  return created;
}

export async function updateClassmatePostForUser(
  user: Pick<User, "id" | "school">,
  postId: string,
  input: unknown,
  tx: Prisma.TransactionClient,
) {
  const values = updateClassmatePostSchema.parse(input);
  const expiresAt = new Date(values.expiresAt);
  if (expiresAt.getTime() < Date.now() - 60_000) {
    throw new ClassmatePostCreateError("EXPIRY_IN_PAST");
  }

  await tx.$executeRaw`SELECT id FROM "ClassmatePost" WHERE id = ${postId} FOR UPDATE`;
  const existing = await tx.classmatePost.findUnique({
    where: { id: postId },
    select: {
      userId: true,
      category: true,
      city: true,
      status: true,
      expiresAt: true,
      coordinationPolicy: true,
    },
  });
  if (!existing) throw new ClassmatePostCreateError("NOT_FOUND");
  if (existing.userId !== user.id) throw new ClassmatePostCreateError("AUTHOR_ONLY");
  if (existing.city !== values.city) throw new ClassmatePostCreateError("CITY_MISMATCH");
  if (existing.status !== ClassmatePostStatus.ACTIVE || existing.expiresAt <= new Date()) {
    throw new ClassmatePostCreateError("INVALID_STATE");
  }

  const policyFields = projectActionPolicyFields({
    policy: existing.coordinationPolicy,
    category: existing.category,
    courseIds: values.courseIds ?? [],
    replyPreference: values.replyPreference,
    capacity: values.capacity,
  });
  if (!policyFields.courseSelectionValid) {
    throw new ClassmatePostCreateError("COURSE_SELECTION_INVALID");
  }
  const courseIds = policyFields.courseIds;
  if (existing.category === ClassmatePostCategory.SHARED_COURSES && courseIds.length === 0) {
    throw new ClassmatePostCreateError("COURSE_NOT_ENROLLED");
  }
  if (
    (existing.category === ClassmatePostCategory.SHARED_COURSES ||
      values.visibility === "COURSEMATES_ONLY") &&
    courseIds.length > 0
  ) {
    const enrolled = await tx.userCourse.count({
      where: {
        userId: user.id,
        courseId: { in: [...courseIds] },
        ...activeCourseMembershipWhere(),
        course: { school: { in: getSchoolMatchValues(user.school) } },
      },
    });
    if (enrolled !== courseIds.length) {
      throw new ClassmatePostCreateError("COURSE_NOT_ENROLLED");
    }
  }

  const imageUrls = Array.from(new Set(values.imageUrls ?? []));
  if (imageUrls.some((url) => !isAllowedClassmatePostImageUrl(user.id, url))) {
    throw new ClassmatePostCreateError("INVALID_IMAGE");
  }

  await tx.classmatePost.update({
    where: { id: postId },
    data: {
      title: values.title,
      body: values.body?.trim() || null,
      tags: values.tags,
      visibility: values.visibility,
      replyPreference: policyFields.replyPreference,
      startsAt: values.startsAt ? new Date(values.startsAt) : null,
      endsAt: values.endsAt ? new Date(values.endsAt) : null,
      location: values.location?.trim() || null,
      capacity: policyFields.capacity,
      expiresAt,
    },
  });

  await tx.classmatePostCourse.deleteMany({ where: { postId } });
  if (courseIds.length > 0) {
    await tx.classmatePostCourse.createMany({
      data: courseIds.map((courseId) => ({ postId, courseId })),
    });
  }
  await tx.classmatePostImage.deleteMany({ where: { postId } });
  if (imageUrls.length > 0) {
    await tx.classmatePostImage.createMany({
      data: imageUrls.map((url, sortOrder) => ({ postId, url, sortOrder })),
    });
  }

  const updated = await tx.classmatePost.findUnique({
    where: { id: postId },
    include: classmatePostForDiscoverInclude,
  });
  if (!updated) throw new ClassmatePostCreateError("NOT_FOUND");
  return updated;
}
