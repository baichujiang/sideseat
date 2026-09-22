import { ReportStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireOnboardedUser } from "@/lib/auth/guards";
import { activeCourseMembershipWhere } from "@/lib/courses/active-membership";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { getClassmatePostDetailForViewer } from "@/lib/queries/classmate-post-detail";
import { loadNativeDiscoverActivityDetail } from "@/lib/api/v1/discover-service";
import { reportSchema } from "@/lib/validators/invitation";

/**
 * Report submission. The MVP stance is "reports are about messages, not
 * people" — the peer profile no longer exposes a reporter, and the UI
 * always submits a concrete message or post identifier. We still require
 * `reportedUserId` so admins can group reports per user; it's automatically
 * filled from the message when possible (TODO: once no client posts
 * user-level reports, make `reportedUserId` derivable server-side).
 *
 * Mutual exclusivity is enforced across all supported content targets.
 */
export async function POST(request: Request) {
  try {
    const user = await requireOnboardedUser();
    const contentType = request.headers.get("content-type") ?? "";
    const formData = contentType.includes("application/json")
      ? null
      : await request.formData();
    const returnTo = (formData?.get("returnTo") as string | null) ?? null;
    const values = contentType.includes("application/json")
      ? await parseJson(request, reportSchema)
      : reportSchema.parse({
          reportedUserId: formData?.get("reportedUserId"),
          connectionId: formData?.get("connectionId") || undefined,
          invitationId: formData?.get("invitationId") || undefined,
          messageId: formData?.get("messageId") || undefined,
          courseRoomMessageId:
            formData?.get("courseRoomMessageId") || undefined,
          groupChatMessageId:
            formData?.get("groupChatMessageId") || undefined,
          classmatePostId: formData?.get("classmatePostId") || undefined,
          classmatePostCommentId:
            formData?.get("classmatePostCommentId") || undefined,
          discoverActivityCommentId:
            formData?.get("discoverActivityCommentId") || undefined,
          reason: formData?.get("reason"),
          details: formData?.get("details") || "",
        });

    const targetCount = [
      values.messageId,
      values.courseRoomMessageId,
      values.groupChatMessageId,
      values.classmatePostId,
      values.classmatePostCommentId,
      values.discoverActivityCommentId,
    ].filter(Boolean).length;
    if (targetCount > 1) {
      return error("Report can target only one item.", 400);
    }

    // Authorize that the reporter can actually see the target message. We
    // trust the reporter on `reportedUserId` but still verify via the
    // message's owner when a messageId is supplied (keeps `reportedUserId`
    // honest even if the client lies).
    let verifiedMessageId: string | null = null;
    let verifiedCourseRoomMessageId: string | null = null;
    let verifiedGroupChatMessageId: string | null = null;
    let verifiedClassmatePostId: string | null = null;
    let verifiedClassmatePostCommentId: string | null = null;
    let verifiedDiscoverActivityCommentId: string | null = null;
    let reportedUserId = values.reportedUserId;

    if (values.messageId) {
      const msg = await prisma.message.findFirst({
        where: {
          id: values.messageId,
          connection: {
            OR: [{ userAId: user.id }, { userBId: user.id }],
          },
        },
        select: { id: true, senderId: true },
      });
      if (!msg) return error("Message not found.", 404);
      verifiedMessageId = msg.id;
      reportedUserId = msg.senderId;
    } else if (values.courseRoomMessageId) {
      const msg = await prisma.courseRoomMessage.findFirst({
        where: {
          id: values.courseRoomMessageId,
          course: {
            members: {
              some: {
                userId: user.id,
                ...activeCourseMembershipWhere(),
              },
            },
          },
        },
        select: { id: true, senderId: true },
      });
      if (!msg) return error("Message not found.", 404);
      verifiedCourseRoomMessageId = msg.id;
      reportedUserId = msg.senderId;
    } else if (values.groupChatMessageId) {
      const msg = await prisma.groupChatMessage.findFirst({
        where: {
          id: values.groupChatMessageId,
          groupChat: { participants: { some: { userId: user.id } } },
        },
        select: { id: true, senderId: true },
      });
      if (!msg) return error("Message not found.", 404);
      verifiedGroupChatMessageId = msg.id;
      reportedUserId = msg.senderId;
    } else if (values.classmatePostId) {
      const detail = await getClassmatePostDetailForViewer(values.classmatePostId, user.id);
      if (!detail.ok) return error("Post not found.", 404);
      verifiedClassmatePostId = detail.post.id;
      reportedUserId = detail.author.id;
    } else if (values.classmatePostCommentId) {
      const comment = await prisma.classmatePostComment.findUnique({
        where: { id: values.classmatePostCommentId },
        select: { id: true, userId: true, postId: true },
      });
      if (!comment) return error("Question not found.", 404);
      const detail = await getClassmatePostDetailForViewer(comment.postId, user.id);
      if (!detail.ok) return error("Question not found.", 404);
      verifiedClassmatePostCommentId = comment.id;
      reportedUserId = comment.userId;
    } else if (values.discoverActivityCommentId) {
      const comment = await prisma.discoverActivityComment.findUnique({
        where: { id: values.discoverActivityCommentId },
        select: { id: true, userId: true, activityId: true },
      });
      if (!comment) return error("Message not found.", 404);
      const detail = await loadNativeDiscoverActivityDetail({
        activityId: comment.activityId,
        userId: user.id,
      });
      if (!detail) return error("Message not found.", 404);
      verifiedDiscoverActivityCommentId = comment.id;
      reportedUserId = comment.userId;
    }

    if (reportedUserId === user.id) {
      return error("You can't report your own content.", 400);
    }

    const report = await prisma.report.create({
      data: {
        reporterId: user.id,
        reportedUserId,
        connectionId: values.connectionId,
        invitationId: values.invitationId,
        messageId: verifiedMessageId,
        courseRoomMessageId: verifiedCourseRoomMessageId,
        groupChatMessageId: verifiedGroupChatMessageId,
        classmatePostId: verifiedClassmatePostId,
        classmatePostCommentId: verifiedClassmatePostCommentId,
        discoverActivityCommentId: verifiedDiscoverActivityCommentId,
        reason: values.reason,
        status: ReportStatus.OPEN,
        details: values.details || null,
      },
    });

    if (!contentType.includes("application/json")) {
      const destination = returnTo
        ? new URL(
            `${returnTo}${returnTo.includes("?") ? "&" : "?"}reported=1`,
            request.url,
          )
        : new URL("/inbox?reported=1", request.url);

      return NextResponse.redirect(destination);
    }

    return ok(report, { status: 201 });
  } catch (cause) {
    console.error(cause);
    return error("Unable to submit report.");
  }
}
