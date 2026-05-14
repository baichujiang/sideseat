import { z } from "zod";

import { requireOnboardedUser } from "@/lib/auth/guards";
import {
  classmatePostForDiscoverInclude,
  prismaClassmatePostToDiscoverRow,
} from "@/lib/discover/prisma-classmate-post-for-discover";
import { prisma } from "@/lib/db/prisma";
import { error, ok } from "@/lib/http";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  take: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export async function GET(request: Request) {
  try {
    const user = await requireOnboardedUser();
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      page: url.searchParams.get("page") ?? undefined,
      take: url.searchParams.get("take") ?? undefined,
    });
    if (!parsed.success) {
      return error(parsed.error.errors[0]?.message ?? "Invalid query.");
    }
    const { page, take } = parsed.data;
    const skip = (page - 1) * take;

    const saves = await prisma.classmatePostSave.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      skip,
      take: take + 1,
      include: {
        classmatePost: {
          include: classmatePostForDiscoverInclude,
        },
      },
    });

    const hasMore = saves.length > take;
    const pageRows = saves.slice(0, take);
    const posts = pageRows.map((s) =>
      prismaClassmatePostToDiscoverRow(s.classmatePost, user.id, { savedByViewer: true }),
    );

    return ok({
      posts,
      page,
      take,
      hasMore,
      nextPage: hasMore ? page + 1 : null,
    });
  } catch (cause) {
    console.error(cause);
    return error("Unable to load saved posts.");
  }
}
