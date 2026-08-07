import { Prisma } from "@prisma/client";

import { requireV1User } from "@/lib/api/v1/auth";
import { communityMessagePageQuerySchema, groupTextMessageSchema } from "@/lib/api/v1/chat-schemas";
import { encodeChatRealtimeCursor } from "@/lib/api/v1/chat-realtime";
import { currentChatRealtimeSequence } from "@/lib/api/v1/chat-realtime-service";
import { groupMessageV1, groupMessageV1Include } from "@/lib/api/v1/community-chat-dto";
import { parseV1Json, v1Error, v1Success } from "@/lib/api/v1/http";
import {
  claimIdempotency,
  completeIdempotency,
  hashIdempotencyRequest,
  readIdempotencyKey,
} from "@/lib/api/v1/idempotency";
import { consumeV1RateLimit, rateLimitHeaders, rateLimitSubject } from "@/lib/api/v1/rate-limit";
import {
  createGroupChatMessageRecord,
  hiddenCommunityChatSenderIds,
} from "@/lib/chat/community-chat-service";
import { prisma } from "@/lib/db/prisma";
import { groupChatDisplayTitle } from "@/lib/group-chats/title";
import { scheduleNewGroupChatMessageNotification } from "@/lib/push/notify-user";

const SEND_LIMIT = 60;
const SEND_WINDOW_MS = 60_000;

export const dynamic = "force-dynamic";

function validId(value: string) {
  return /^c[a-z0-9]{20,30}$/i.test(value);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ groupChatId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const { groupChatId } = await params;
  if (!validId(groupChatId)) {
    return v1Error(request, { code: "INVALID_REQUEST", message: "The group identifier is invalid.", status: 422, field: "groupChatId" });
  }
  const query = communityMessagePageQuerySchema.safeParse(
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
    const membership = await prisma.groupChatParticipant.findUnique({
      where: { groupChatId_userId: { groupChatId, userId: auth.user.id } },
      include: {
        groupChat: {
          include: {
            participants: {
              include: {
                user: { select: { id: true, username: true, nickname: true, avatarUrl: true } },
              },
              orderBy: { joinedAt: "asc" },
            },
          },
        },
      },
    });
    if (!membership) {
      return v1Error(request, { code: "NOT_FOUND", message: "The group conversation was not found.", status: 404 });
    }
    const realtimeSequence = await currentChatRealtimeSequence("GROUP", groupChatId);
    const hiddenSenderIds = await hiddenCommunityChatSenderIds(prisma, auth.user.id);
    const rows = await prisma.groupChatMessage.findMany({
      where: {
        groupChatId,
        ...(hiddenSenderIds.length ? { senderId: { notIn: hiddenSenderIds } } : {}),
      },
      include: groupMessageV1Include,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(query.data.cursor ? { cursor: { id: query.data.cursor }, skip: 1 } : {}),
      take: query.data.limit + 1,
    });
    const hasMore = rows.length > query.data.limit;
    const pageRows = rows.slice(0, query.data.limit);
    const participants = membership.groupChat.participants.map((participant) => participant.user);
    return v1Success(
      {
        conversation: {
          kind: "GROUP" as const,
          id: membership.groupChat.id,
          title: groupChatDisplayTitle(membership.groupChat.title, participants, auth.user.id),
          customTitle: membership.groupChat.title,
          participants,
          inboxHidden: Boolean(membership.inboxHiddenAt),
        },
        messages: pageRows.reverse().map(groupMessageV1),
      },
      {
        request,
        meta: {
          hasMore,
          nextCursor: hasMore ? (pageRows.at(-1)?.id ?? null) : null,
          realtimeCursor: encodeChatRealtimeCursor(
            { kind: "GROUP", id: groupChatId },
            realtimeSequence,
          ),
        },
      },
    );
  } catch (cause) {
    console.error("GET /api/v1/group-chats/[groupChatId]/messages", cause);
    return v1Error(request, { code: "INTERNAL_ERROR", message: "Unable to load group messages.", status: 500, retryable: true });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ groupChatId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const { groupChatId } = await params;
  if (!validId(groupChatId)) {
    return v1Error(request, { code: "INVALID_REQUEST", message: "The group identifier is invalid.", status: 422, field: "groupChatId" });
  }
  const idempotencyKey = readIdempotencyKey(request);
  if (!idempotencyKey) {
    return v1Error(request, { code: "IDEMPOTENCY_KEY_REQUIRED", message: "A valid Idempotency-Key header is required.", status: 422, field: "Idempotency-Key" });
  }
  const parsed = await parseV1Json(request, groupTextMessageSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const rateLimit = await consumeV1RateLimit({
      scope: "native-group-message-send",
      subject: rateLimitSubject(auth.user.id),
      limit: SEND_LIMIT,
      windowMs: SEND_WINDOW_MS,
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

    const requestHash = hashIdempotencyRequest(parsed.data);
    const result = await prisma.$transaction(async (tx) => {
      const [membership, moderated] = await Promise.all([
        tx.groupChatParticipant.findUnique({
          where: { groupChatId_userId: { groupChatId, userId: auth.user.id } },
          select: { groupChatId: true },
        }),
        tx.moderationBlock.findFirst({
          where: { userId: auth.user.id, isActive: true },
          select: { id: true },
        }),
      ]);
      if (!membership) return { kind: "not_found" } as const;
      if (moderated) return { kind: "restricted" } as const;

      await tx.apiIdempotencyRecord.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      const claim = await claimIdempotency(tx, {
        scope: `native-group-message:${groupChatId}`,
        actorId: auth.user.id,
        key: idempotencyKey,
        requestHash,
      });
      if (claim.kind !== "owner") return claim;

      const created = await createGroupChatMessageRecord(tx, {
        groupChatId,
        senderId: auth.user.id,
        body: parsed.data.body,
        replyToId: parsed.data.replyToId,
      });
      if (created.kind !== "created") return created;
      const hydrated = await tx.groupChatMessage.findUniqueOrThrow({
        where: { id: created.message.id },
        include: groupMessageV1Include,
      });
      const body = groupMessageV1(hydrated);
      await completeIdempotency(tx, claim, { status: 201, body: body as Prisma.InputJsonValue });
      return { kind: "created", body, notificationTitle: created.notificationTitle } as const;
    });

    if (result.kind === "not_found") {
      return v1Error(request, { code: "NOT_FOUND", message: "The group conversation was not found.", status: 404 });
    }
    if (result.kind === "restricted") {
      return v1Error(request, { code: "CONTENT_RESTRICTED", message: "Your account cannot send messages right now.", status: 403 });
    }
    if (result.kind === "conflict") {
      return v1Error(request, { code: "IDEMPOTENCY_CONFLICT", message: "This Idempotency-Key was already used for another request.", status: 409 });
    }
    if (result.kind === "in_progress") {
      return v1Error(request, { code: "REQUEST_IN_PROGRESS", message: "The matching request is still being processed.", status: 409, retryable: true, headers: { "Retry-After": "1" } });
    }
    if (result.kind === "replay") {
      return v1Success(result.body, { request, status: result.status, headers: { "Idempotency-Replayed": "true" } });
    }

    scheduleNewGroupChatMessageNotification({
      groupChatId,
      title: result.notificationTitle,
      senderId: auth.user.id,
      bodyPreview: parsed.data.body,
    });
    return v1Success(result.body, { request, status: 201 });
  } catch (cause) {
    console.error("POST /api/v1/group-chats/[groupChatId]/messages", cause);
    return v1Error(request, { code: "INTERNAL_ERROR", message: "Unable to send the group message.", status: 500, retryable: true });
  }
}
