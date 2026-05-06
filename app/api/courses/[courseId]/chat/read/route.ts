import { requireCourseChatMember } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { ok, error } from "@/lib/http";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  try {
    const { courseId } = await params;
    const { userCourse } = await requireCourseChatMember(courseId);
    const now = new Date();

    await prisma.userCourse.update({
      where: { id: userCourse.id },
      data: { courseChatReadAt: now },
    });

    return ok({ readAt: now.toISOString() });
  } catch (cause) {
    console.error(cause);
    return error("Unable to mark chat as read.");
  }
}
