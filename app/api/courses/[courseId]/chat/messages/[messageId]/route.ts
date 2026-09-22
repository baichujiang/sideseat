import { requireOnboardedUser } from "@/lib/auth/guards";
import { activeCourseMembershipWhere } from "@/lib/courses/active-membership";
import { prisma } from "@/lib/db/prisma";
import { error, ok } from "@/lib/http";

/**
 * Soft-delete a course-room message. Same rules as 1:1 messages — only the
 * sender can delete their own row, and the row stays so any replies keep
 * rendering as quotes of a deleted message.
 */
export async function DELETE(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ courseId: string; messageId: string }>;
  },
) {
  try {
    const user = await requireOnboardedUser();
    const { courseId, messageId } = await params;

    const membership = await prisma.userCourse.findFirst({
      where: { userId: user.id, courseId, ...activeCourseMembershipWhere() },
      select: { id: true },
    });
    if (!membership) {
      return error("Course not found or you are not enrolled.", 404);
    }

    const message = await prisma.courseRoomMessage.findFirst({
      where: {
        id: messageId,
        courseId,
        senderId: user.id,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!message) {
      return error("Message not found or not yours to delete.", 404);
    }

    await prisma.courseRoomMessage.update({
      where: { id: message.id },
      data: { deletedAt: new Date(), body: "" },
    });

    return ok({ id: message.id });
  } catch (cause) {
    console.error(cause);
    return error("Unable to delete message.");
  }
}
