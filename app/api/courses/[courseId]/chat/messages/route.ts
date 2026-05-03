import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { notifyNewCourseRoomMessage } from "@/lib/push/notify-user";
import { messageSchema } from "@/lib/validators/invitation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  try {
    const user = await requireOnboardedUser();
    const { courseId } = await params;
    const values = await parseJson(request, messageSchema);

    const membership = await prisma.userCourse.findFirst({
      where: { userId: user.id, courseId },
    });

    if (!membership) {
      return error("Course not found or you are not enrolled.", 404);
    }

    const moderated = await prisma.moderationBlock.findFirst({
      where: { userId: user.id, isActive: true },
    });
    if (moderated) {
      return error("Your account cannot send messages right now.", 403);
    }

    let replyToId: string | null = null;
    if (values.replyToId) {
      const target = await prisma.courseRoomMessage.findFirst({
        where: {
          id: values.replyToId,
          courseId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (target) replyToId = target.id;
    }

    const message = await prisma.courseRoomMessage.create({
      data: {
        courseId,
        senderId: user.id,
        body: values.body.trim(),
        replyToId,
      },
    });

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { name: true },
    });
    void notifyNewCourseRoomMessage({
      courseId,
      courseName: course?.name ?? "Course chat",
      senderId: user.id,
      bodyPreview: values.body.trim(),
    }).catch(() => {});

    return ok(message, { status: 201 });
  } catch (cause) {
    console.error(cause);
    return error("Unable to send message.");
  }
}
