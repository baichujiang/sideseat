import { requireCourseChatMember } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { ok, error } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  try {
    const { courseId } = await params;
    await requireCourseChatMember(courseId);

    const [latest, messageCount] = await Promise.all([
      prisma.courseRoomMessage.findFirst({
        where: { courseId },
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true },
      }),
      prisma.courseRoomMessage.count({ where: { courseId } }),
    ]);

    return ok({
      latestMessageId: latest?.id ?? null,
      latestMessageAt: latest?.createdAt.toISOString() ?? null,
      messageCount,
    });
  } catch (cause) {
    console.error(cause);
    return error("Unable to load latest message.");
  }
}
