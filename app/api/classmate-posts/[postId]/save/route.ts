import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { error, ok } from "@/lib/http";

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ postId: string }> },
) {
  try {
    const user = await requireOnboardedUser();
    const { postId } = await ctx.params;
    const id = postId?.trim() ?? "";
    if (!id) return error("postId is required.");

    const post = await prisma.classmatePost.findUnique({ where: { id }, select: { id: true } });
    if (!post) return error("Post not found.", 404);

    await prisma.classmatePostSave.upsert({
      where: {
        userId_classmatePostId: { userId: user.id, classmatePostId: id },
      },
      create: { userId: user.id, classmatePostId: id },
      update: {},
    });

    return ok({ saved: true }, { status: 201 });
  } catch (cause) {
    console.error(cause);
    return error("Unable to save post.");
  }
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ postId: string }> },
) {
  try {
    const user = await requireOnboardedUser();
    const { postId } = await ctx.params;
    const id = postId?.trim() ?? "";
    if (!id) return error("postId is required.");

    await prisma.classmatePostSave.deleteMany({
      where: { userId: user.id, classmatePostId: id },
    });

    return ok({ saved: false });
  } catch (cause) {
    console.error(cause);
    return error("Unable to remove saved post.");
  }
}
