import { requireOnboardedUser } from "@/lib/auth/guards";
import { MAX_ACTIVE_CLASSMATE_POSTS_PER_CATEGORY } from "@/lib/constants/app";
import { prisma } from "@/lib/db/prisma";
import {
  ClassmatePostCreateError,
  createClassmatePostForUser,
} from "@/lib/discover/create-classmate-post";
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

    const post = await prisma.$transaction((tx) =>
      createClassmatePostForUser(user, parsed.data, tx),
    );

    return ok({ post }, { status: 201 });
  } catch (cause) {
    if (cause instanceof ClassmatePostCreateError) {
      if (cause.code === "INVALID_EXPIRY") return error("Choose a valid expiry date.", 400);
      if (cause.code === "EXPIRY_IN_PAST") return error("Expiry must be in the future.", 400);
      if (cause.code === "COURSE_NOT_ENROLLED") {
        return error("You can only share courses you're enrolled in.", 400);
      }
      if (cause.code === "CREATE_LIMIT") {
        return error(
          `Each Discover category allows at most ${MAX_ACTIVE_CLASSMATE_POSTS_PER_CATEGORY} live posts from you at once. Wait for one to expire (see My posts) or pick a shorter expiry next time.`,
          400,
        );
      }
      if (cause.code === "INVALID_IMAGE") return error("Upload the image again before creating the post.", 400);
    }
    console.error(cause);
    return error("Unable to create post.");
  }
}
