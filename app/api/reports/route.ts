import { ReportStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { reportSchema } from "@/lib/validators/invitation";

/**
 * Report submission. The MVP stance is "reports are about messages, not
 * people" — the peer profile no longer exposes a reporter, and the UI
 * always submits a `messageId` or `courseRoomMessageId`. We still require
 * `reportedUserId` so admins can group reports per user; it's automatically
 * filled from the message when possible (TODO: once no client posts
 * user-level reports, make `reportedUserId` derivable server-side).
 *
 * Mutual exclusivity is enforced: exactly one of `messageId` /
 * `courseRoomMessageId` can be set per report, otherwise it's treated as a
 * user-level report.
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
          reason: formData?.get("reason"),
          details: formData?.get("details") || "",
        });

    if (values.messageId && values.courseRoomMessageId) {
      return error("Report can target only one message.", 400);
    }

    // Authorize that the reporter can actually see the target message. We
    // trust the reporter on `reportedUserId` but still verify via the
    // message's owner when a messageId is supplied (keeps `reportedUserId`
    // honest even if the client lies).
    let verifiedMessageId: string | null = null;
    let verifiedCourseRoomMessageId: string | null = null;
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
            members: { some: { userId: user.id } },
          },
        },
        select: { id: true, senderId: true },
      });
      if (!msg) return error("Message not found.", 404);
      verifiedCourseRoomMessageId = msg.id;
      reportedUserId = msg.senderId;
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
