import { requireOnboardedUser } from "@/lib/auth/guards";
import { createCourseRoomMessageRecord } from "@/lib/chat/community-chat-service";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { scheduleNewCourseRoomMessageNotification } from "@/lib/push/notify-user";
import { messageSchema } from "@/lib/validators/invitation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  try {
    const user = await requireOnboardedUser();
    const { courseId } = await params;
    const values = await parseJson(request, messageSchema);

    const result = await createCourseRoomMessageRecord(prisma, {
      courseId,
      senderId: user.id,
      body: values.body,
      replyToId: values.replyToId,
    });
    if (result.kind === "not_found") {
      return error("Course not found or you are not enrolled.", 404);
    }
    if (result.kind === "restricted") {
      return error("Your account cannot send messages right now.", 403);
    }
    scheduleNewCourseRoomMessageNotification({
      courseId,
      courseName: result.notificationTitle ?? "Course chat",
      senderId: user.id,
      bodyPreview: values.body.trim(),
    });

    return ok(result.message, { status: 201 });
  } catch (cause) {
    console.error(cause);
    return error("Unable to send message.");
  }
}
