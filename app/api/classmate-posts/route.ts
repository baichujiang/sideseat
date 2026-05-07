import { ClassmatePostStatus } from "@prisma/client";

import { requireOnboardedUser } from "@/lib/auth/guards";
import { MAX_ACTIVE_CLASSMATE_POSTS_PER_CATEGORY } from "@/lib/constants/app";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseBody } from "@/lib/http";
import { createClassmatePostSchema } from "@/lib/validators/classmate-posts";

export async function POST(request: Request) {
  try {
    const user = await requireOnboardedUser();
    const body = await request.json().catch(() => null);
    const parsed = parseBody(body, createClassmatePostSchema);
    if (!parsed.ok) {
      return error(parsed.error, 400);
    }

    const values = parsed.data;
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

    if (values.category === "SHARED_COURSES" && courseIds.length > 0) {
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
        category: values.category,
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

    const post = await prisma.$transaction(async (tx) => {
      const created = await tx.classmatePost.create({
        data: {
          userId: user.id,
          city: values.city ?? "Munich",
          category: values.category,
          title: values.title,
          body: postBody,
          expiresAt,
          status: ClassmatePostStatus.ACTIVE,
        },
      });

      if (values.category === "SHARED_COURSES" && courseIds.length > 0) {
        await tx.classmatePostCourse.createMany({
          data: courseIds.map((courseId) => ({
            postId: created.id,
            courseId,
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
