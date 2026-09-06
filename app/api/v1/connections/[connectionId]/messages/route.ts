import { Prisma } from "@prisma/client";

import { requireV1User } from "@/lib/api/v1/auth";
import { directMessagePageQuerySchema } from "@/lib/api/v1/chat-schemas";
import { directMessageV1, directMessageV1Include } from "@/lib/api/v1/chat-dto";
import { encodeChatRealtimeCursor } from "@/lib/api/v1/chat-realtime";
import { currentChatRealtimeSequence } from "@/lib/api/v1/chat-realtime-service";
import { parseV1Json, v1Error, v1Success } from "@/lib/api/v1/http";
import {
  claimIdempotency,
  completeIdempotency,
  hashIdempotencyRequest,
  readIdempotencyKey,
} from "@/lib/api/v1/idempotency";
import {
  consumeV1RateLimit,
  rateLimitHeaders,
  rateLimitSubject,
} from "@/lib/api/v1/rate-limit";
import {
  activeDirectConnectionWhere,
  createDirectMessageRecord,
  DirectMessageActionContextUnavailableError,
  InvalidDirectMessageImageError,
  lockFocusedDirectMessageActionContext,
  PeerReplyRequiredError,
  recordFirstFocusedCounterpartResponse,
} from "@/lib/chat/direct-message-service";
import { prisma } from "@/lib/db/prisma";
import { scheduleNewDirectChatMessageNotification } from "@/lib/push/notify-user";
import { pairSafetyLock } from "@/lib/v2/action-coordination/db-locks";
import { directMessageSchema, type DirectMessageInput } from "@/lib/validators/invitation";

const MESSAGE_SEND_LIMIT = 60;
const MESSAGE_SEND_WINDOW_MS = 60_000;

export const dynamic = "force-dynamic";

function validConnectionId(value: string) {
  return /^c[a-z0-9]{20,30}$/i.test(value);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  const { connectionId } = await params;
  if (!validConnectionId(connectionId)) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "The connection identifier is invalid.",
      status: 422,
      field: "connectionId",
    });
  }
  const query = directMessagePageQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!query.success) {
    const issue = query.error.issues[0];
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: issue?.message ?? "The message cursor is invalid.",
      status: 422,
      field: issue?.path.length ? issue.path.join(".") : undefined,
    });
  }

  try {
    const [connection, realtimeSequence] = await Promise.all([
      prisma.connection.findFirst({
        where: activeDirectConnectionWhere(connectionId, auth.user.id),
        select: {
          id: true,
          userAId: true,
          userBId: true,
          replyLimitUnlockedAt: true,
          contactRemarkByA: true,
          contactRemarkByB: true,
          userA: { select: { id: true, username: true, nickname: true, avatarUrl: true } },
          userB: { select: { id: true, username: true, nickname: true, avatarUrl: true } },
        },
      }),
      // Capture before history so concurrent writes appear in history, the stream, or both.
      currentChatRealtimeSequence("DIRECT", connectionId),
    ]);
    if (!connection) {
      return v1Error(request, {
        code: "NOT_FOUND",
        message: "The conversation was not found.",
        status: 404,
      });
    }

    const rows = await prisma.message.findMany({
      where: { connectionId },
      include: directMessageV1Include,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(query.data.cursor ? { cursor: { id: query.data.cursor }, skip: 1 } : {}),
      take: query.data.limit + 1,
    });
    const hasMore = rows.length > query.data.limit;
    const pageRows = rows.slice(0, query.data.limit);
    const peer = connection.userAId === auth.user.id ? connection.userB : connection.userA;
    const viewerRemark =
      connection.userAId === auth.user.id
        ? connection.contactRemarkByA
        : connection.contactRemarkByB;

    return v1Success(
      {
        connection: {
          id: connection.id,
          isSelfNotes: connection.userAId === connection.userBId,
          replyLimitUnlocked: connection.replyLimitUnlockedAt !== null,
          displayName: viewerRemark?.trim() || peer.nickname?.trim() || peer.username,
          peer,
        },
        messages: pageRows.reverse().map(directMessageV1),
      },
      {
        request,
        meta: {
          hasMore,
          nextCursor: hasMore ? (pageRows.at(-1)?.id ?? null) : null,
          realtimeCursor: encodeChatRealtimeCursor(
            { kind: "DIRECT", id: connectionId },
            realtimeSequence,
          ),
        },
      },
    );
  } catch (cause) {
    console.error("GET /api/v1/connections/[connectionId]/messages", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Unable to load messages.",
      status: 500,
      retryable: true,
    });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  const { connectionId } = await params;
  if (!validConnectionId(connectionId)) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "The connection identifier is invalid.",
      status: 422,
      field: "connectionId",
    });
  }
  const idempotencyKey = readIdempotencyKey(request);
  if (!idempotencyKey) {
    return v1Error(request, {
      code: "IDEMPOTENCY_KEY_REQUIRED",
      message: "A valid Idempotency-Key header is required.",
      status: 422,
      field: "Idempotency-Key",
    });
  }
  const parsed = await parseV1Json(request, directMessageSchema);
  if (!parsed.ok) return parsed.response;
  const values = parsed.data as DirectMessageInput;

  try {
    const rateLimit = await consumeV1RateLimit({
      scope: "native-direct-message-send",
      subject: rateLimitSubject(auth.user.id),
      limit: MESSAGE_SEND_LIMIT,
      windowMs: MESSAGE_SEND_WINDOW_MS,
    });
    if (!rateLimit.allowed) {
      return v1Error(request, {
        code: "RATE_LIMITED",
        message: "Too many messages were sent. Try again shortly.",
        status: 429,
        retryable: true,
        headers: rateLimitHeaders(rateLimit),
      });
    }

    const requestHash = hashIdempotencyRequest(values);
    const result = await prisma.$transaction(async (tx) => {
      // Resolve the pair without row locks, acquire the pair lock, then
      // revalidate. Focused messages lock Context before the writer locks the
      // Connection; generic messages deliberately skip Context attribution.
      const pairSnapshot = await tx.connection.findUnique({
        where: { id: connectionId },
        select: { userAId: true, userBId: true },
      });
      if (
        !pairSnapshot ||
        (pairSnapshot.userAId !== auth.user.id &&
          pairSnapshot.userBId !== auth.user.id)
      ) {
        return { kind: "not_found" } as const;
      }
      if (pairSnapshot.userAId !== pairSnapshot.userBId) {
        await pairSafetyLock(
          tx,
          pairSnapshot.userAId,
          pairSnapshot.userBId,
        );
      }
      const connection = await tx.connection.findFirst({
        where: activeDirectConnectionWhere(connectionId, auth.user.id),
        select: { id: true, userAId: true, userBId: true },
      });
      if (!connection) return { kind: "not_found" } as const;

      await tx.apiIdempotencyRecord.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      const claim = await claimIdempotency(tx, {
        scope: `native-direct-message:${connectionId}`,
        actorId: auth.user.id,
        key: idempotencyKey,
        requestHash,
      });
      if (claim.kind !== "owner") return claim;

      const focusedContext = values.actionContextId
        ? await lockFocusedDirectMessageActionContext(tx, {
            actionContextId: values.actionContextId,
            connectionId,
            actorId: auth.user.id,
            participantIds: [connection.userAId, connection.userBId],
          })
        : null;

      const created = await createDirectMessageRecord(tx, {
        connectionId,
        senderId: auth.user.id,
        input: values,
      });
      if (focusedContext) {
        await recordFirstFocusedCounterpartResponse(tx, {
          context: focusedContext,
          actorId: auth.user.id,
          connectionId,
          occurredAt: created.message.createdAt,
        });
      }
      const hydrated = await tx.message.findUniqueOrThrow({
        where: { id: created.message.id },
        include: directMessageV1Include,
      });
      const body = directMessageV1(hydrated);
      await completeIdempotency(tx, claim, {
        status: 201,
        body: body as Prisma.InputJsonValue,
      });
      return { kind: "created", body, bodyPreview: created.bodyPreview } as const;
    });

    if (result.kind === "not_found") {
      return v1Error(request, {
        code: "NOT_FOUND",
        message: "The conversation was not found.",
        status: 404,
      });
    }
    if (result.kind === "conflict") {
      return v1Error(request, {
        code: "IDEMPOTENCY_CONFLICT",
        message: "This Idempotency-Key was already used for another request.",
        status: 409,
      });
    }
    if (result.kind === "in_progress") {
      return v1Error(request, {
        code: "REQUEST_IN_PROGRESS",
        message: "The matching request is still being processed.",
        status: 409,
        retryable: true,
        headers: { "Retry-After": "1" },
      });
    }
    if (result.kind === "replay") {
      return v1Success(result.body, {
        request,
        status: result.status,
        headers: { "Idempotency-Replayed": "true" },
      });
    }

    scheduleNewDirectChatMessageNotification({
      connectionId,
      senderId: auth.user.id,
      bodyPreview: result.bodyPreview,
    });
    return v1Success(result.body, { request, status: 201 });
  } catch (cause) {
    if (cause instanceof InvalidDirectMessageImageError) {
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message: "The image URL is invalid.",
        status: 422,
        field: "imageUrl",
      });
    }
    if (cause instanceof DirectMessageActionContextUnavailableError) {
      return v1Error(request, {
        code: "FEATURE_UNAVAILABLE",
        message: cause.message,
        status: 409,
        retryable: false,
        field: "actionContextId",
      });
    }
    if (cause instanceof PeerReplyRequiredError) {
      return v1Error(request, {
        code: "PEER_REPLY_REQUIRED",
        message: cause.message,
        status: 403,
        retryable: false,
      });
    }
    console.error("POST /api/v1/connections/[connectionId]/messages", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Unable to send the message.",
      status: 500,
      retryable: true,
    });
  }
}
