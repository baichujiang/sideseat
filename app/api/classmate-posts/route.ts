import { ClassmatePostStatus } from "@prisma/client";

import { requireOnboardedUser } from "@/lib/auth/guards";
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
    const expiresAt = new Date(values.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
      return error("Choose a valid expiry date.", 400);
    }
    if (expiresAt <= new Date()) {
      return error("Expiry must be in the future.", 400);
    }

    const post = await prisma.$transaction(async (tx) => {
      await tx.classmatePost.updateMany({
        where: {
          userId: user.id,
          category: values.category,
          status: ClassmatePostStatus.ACTIVE,
        },
        data: {
          status: ClassmatePostStatus.CLOSED,
        },
      });

      return tx.classmatePost.create({
        data: {
          userId: user.id,
          city: values.city ?? "Munich",
          category: values.category,
          title: values.title,
          body: values.body || null,
          expiresAt,
          status: ClassmatePostStatus.ACTIVE,
        },
      });
    });

    return ok({ post }, { status: 201 });
  } catch (cause) {
    console.error(cause);
    return error("Unable to create post.");
  }
}
