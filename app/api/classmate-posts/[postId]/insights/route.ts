import { NextResponse } from "next/server";

import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { parseBody } from "@/lib/http";
import { classmatePostInsightBodySchema } from "@/lib/validators/classmate-posts";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ postId: string }> },
) {
  const user = await requireOnboardedUser();
  const { postId } = await ctx.params;
  const raw = await req.json().catch(() => ({}));
  const parsed = parseBody(raw, classmatePostInsightBodySchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const post = await prisma.classmatePost.findUnique({
    where: { id: postId },
    select: { userId: true },
  });
  if (!post) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (post.userId === user.id) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  await prisma.classmatePostInsight.createMany({
    data: [{ postId, actorId: user.id, kind: parsed.data.kind }],
    skipDuplicates: true,
  });

  return NextResponse.json({ ok: true });
}
