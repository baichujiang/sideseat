import { ClassmatePostCategory, ClassmatePostStatus, type Prisma } from "@prisma/client";

import { requireOnboardedUser } from "@/lib/auth/guards";
import { MAX_ACTIVE_CLASSMATE_POSTS_PER_CATEGORY } from "@/lib/constants/app";
import { isAllowedClassmatePostImageUrl } from "@/lib/constants/classmate-post-media";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseBody } from "@/lib/http";
import {
  classmatePostLanguagePayloadHasData,
  classmatePostMealsPayloadHasData,
  classmatePostSportPayloadHasData,
  classmatePostStudyPayloadHasData,
  createClassmatePostSchema,
  languagePayloadSchema,
  mealsPayloadSchema,
  sportPayloadSchema,
  studyPayloadSchema,
} from "@/lib/validators/classmate-posts";

export async function POST(request: Request) {
  try {
    const user = await requireOnboardedUser();
    const body = await request.json().catch(() => null);
    const parsed = parseBody(body, createClassmatePostSchema);
    if (!parsed.ok) {
      return error(parsed.error, 400);
    }

    const values = parsed.data;
    const category = values.category ?? ClassmatePostCategory.OTHER;
    const postBody =
      typeof values.body === "string" && values.body.trim().length > 0
        ? values.body.trim()
        : null;
    const expiresAt = new Date(values.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
      return error("Choose a valid expiry date.", 400);
    }
    if (expiresAt.getTime() < Date.now() - 60_000) {
      return error("Expiry must be in the future.", 400);
    }

    const courseIds = values.courseIds ?? [];

    if (category === ClassmatePostCategory.SHARED_COURSES && courseIds.length > 0) {
      const enrolled = await prisma.userCourse.count({
        where: { userId: user.id, courseId: { in: courseIds } },
      });
      if (enrolled !== courseIds.length) {
        return error("You can only share courses you're enrolled in.", 400);
      }
    }

    const now = new Date();
    const activeInCategory = await prisma.classmatePost.count({
      where: {
        userId: user.id,
        category,
        status: ClassmatePostStatus.ACTIVE,
        expiresAt: { gt: now },
      },
    });
    if (activeInCategory >= MAX_ACTIVE_CLASSMATE_POSTS_PER_CATEGORY) {
      return error(
        `Each Discover category allows at most ${MAX_ACTIVE_CLASSMATE_POSTS_PER_CATEGORY} live posts from you at once. Wait for one to expire (see My posts) or pick a shorter expiry next time.`,
        400,
      );
    }

    const imageUrls = values.imageUrls;
    if (imageUrls?.length) {
      for (const url of imageUrls) {
        if (!isAllowedClassmatePostImageUrl(user.id, url)) {
          return error("Add photos using the in-app uploader only.", 400);
        }
      }
    }

    const post = await prisma.$transaction(async (tx) => {
      const created = await tx.classmatePost.create({
        data: {
          userId: user.id,
          city: values.city ?? "Munich",
          category,
          title: values.title,
          body: postBody,
          expiresAt,
          status: ClassmatePostStatus.ACTIVE,
        },
      });

      if (category === ClassmatePostCategory.SHARED_COURSES && courseIds.length > 0) {
        await tx.classmatePostCourse.createMany({
          data: courseIds.map((courseId) => ({
            postId: created.id,
            courseId,
          })),
        });
      }

      if (category === ClassmatePostCategory.STUDY && values.study) {
        const s = studyPayloadSchema.parse(values.study);
        if (classmatePostStudyPayloadHasData(s)) {
          await tx.classmatePostStudy.create({
            data: {
              postId: created.id,
              purposes: s.purposes,
              timeSlots: s.timeSlots,
              venues: s.venues,
              venueOtherNote: s.venueOtherNote ?? null,
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

      if (imageUrls?.length) {
        await tx.classmatePostImage.createMany({
          data: imageUrls.map((url, sortOrder) => ({
            postId: created.id,
            url,
            sortOrder,
          })),
        });
      }

      return created;
    });

    return ok({ post }, { status: 201 });
  } catch (cause) {
    console.error(cause);
    return error("Unable to create post.");
  }
}
