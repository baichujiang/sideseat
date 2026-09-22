import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import {
  createNativeDiscoverActivityMessage,
  DiscoverActivityMessageMutationError,
  loadNativeDiscoverActivityMessages,
} from "@/lib/api/v1/discover-activity-message-service";
import {
  discoverMutationResponse,
  limitDiscoverWrite,
  requireDiscoverIdempotencyKey,
} from "@/lib/api/v1/discover-route";
import { loadNativeDiscoverActivityDetail } from "@/lib/api/v1/discover-service";
import { parseV1Json, v1Error, v1Success } from "@/lib/api/v1/http";
import { hashIdempotencyRequest } from "@/lib/api/v1/idempotency";
import { runV1Mutation } from "@/lib/api/v1/mutation";
import { scheduleDiscoverDiscussionNotification } from "@/lib/push/notify-user";

export const dynamic = "force-dynamic";

const cuidSchema = z.string().cuid();
const messageWriteSchema = z.object({
  body: z.string().trim().min(1).max(500),
  parentId: z.string().cuid().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ activityId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const { activityId } = await params;
  if (!cuidSchema.safeParse(activityId).success) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "The activity identifier is invalid.",
      status: 422,
      field: "activityId",
    });
  }

  try {
    const payload = await loadNativeDiscoverActivityMessages({
      userId: auth.user.id,
      activityId,
    });
    if (!payload) {
      return v1Error(request, {
        code: "NOT_FOUND",
        message: "The plan was not found.",
        status: 404,
      });
    }
    return v1Success(payload, { request });
  } catch (cause) {
    console.error(
      "GET /api/v1/discover/activities/[activityId]/messages",
      cause,
    );
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The messages could not be loaded.",
      status: 500,
      retryable: true,
    });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ activityId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const { activityId } = await params;
  if (!cuidSchema.safeParse(activityId).success) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "The activity identifier is invalid.",
      status: 422,
      field: "activityId",
    });
  }
  const idempotency = requireDiscoverIdempotencyKey(request);
  if (!idempotency.ok) return idempotency.response;
  const parsed = await parseV1Json(request, messageWriteSchema);
  if (!parsed.ok) return parsed.response;
  const values = messageWriteSchema.parse(parsed.data);

  try {
    const detail = await loadNativeDiscoverActivityDetail({
      userId: auth.user.id,
      activityId,
    });
    if (!detail) {
      return v1Error(request, {
        code: "NOT_FOUND",
        message: "The plan was not found.",
        status: 404,
      });
    }
    if (values.parentId && !detail.activity.isOrganizer) {
      return v1Error(request, {
        code: "CONTENT_RESTRICTED",
        message: "Only the organizer can reply to a message.",
        status: 403,
      });
    }
    const limited = await limitDiscoverWrite(request, auth.user.id);
    if (limited) return limited;

    let notification: { recipientUserId: string; isReply: boolean } | undefined;
    const result = await runV1Mutation({
      actorId: auth.user.id,
      key: idempotency.key,
      scope: `native-discover-activity-message-create:${activityId}`,
      requestHash: hashIdempotencyRequest({ activityId, ...values }),
      execute: async (tx) => {
        const created = await createNativeDiscoverActivityMessage({
          userId: auth.user.id,
          activityId,
          body: values.body,
          parentId: values.parentId,
          tx,
        });
        notification = created.notification;
        const body = {
          commentId: created.commentId,
          messageId: created.messageId,
          thread: created.thread,
        };
        return { status: 201, body: body as Prisma.InputJsonObject };
      },
    });
    if (result.kind === "completed" && notification) {
      scheduleDiscoverDiscussionNotification({
        ...notification,
        actorId: auth.user.id,
        resource: "activity",
        resourceId: activityId,
        resourceTitle: detail.activity.title,
        bodyPreview: values.body,
      });
    }
    return discoverMutationResponse(request, result);
  } catch (cause) {
    if (
      cause instanceof Prisma.PrismaClientKnownRequestError &&
      cause.code === "P2002"
    ) {
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message: "This message already has an organizer reply.",
        status: 409,
      });
    }
    if (cause instanceof DiscoverActivityMessageMutationError) {
      const status =
        cause.code === "ORGANIZER_ONLY" || cause.code === "FORBIDDEN"
          ? 403
          : cause.code === "ALREADY_ANSWERED" || cause.code === "CLOSED"
            ? 409
            : 404;
      return v1Error(request, {
        code:
          status === 403
            ? "CONTENT_RESTRICTED"
            : status === 404
              ? "NOT_FOUND"
              : "INVALID_REQUEST",
        message:
          cause.code === "ALREADY_ANSWERED"
            ? "This message already has an organizer reply."
            : cause.code === "CLOSED"
              ? "This plan is no longer accepting messages."
              : cause.code === "NOT_FOUND"
                ? "The message was not found."
                : "Only the organizer can reply to a message.",
        status,
      });
    }
    console.error(
      "POST /api/v1/discover/activities/[activityId]/messages",
      cause,
    );
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The message could not be posted.",
      status: 500,
      retryable: true,
    });
  }
}
