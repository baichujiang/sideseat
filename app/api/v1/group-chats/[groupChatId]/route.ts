import { Prisma } from "@prisma/client";

import { requireV1User } from "@/lib/api/v1/auth";
import {
  GroupChatManageError,
  patchGroupChatTitle,
} from "@/lib/api/v1/group-chat-manage-service";
import {
  claimIdempotency,
  completeIdempotency,
  hashIdempotencyRequest,
  readIdempotencyKey,
} from "@/lib/api/v1/idempotency";
import { requireV1Cuid } from "@/lib/api/v1/ids";
import { parseV1Json, v1Error, v1Success } from "@/lib/api/v1/http";
import { prisma } from "@/lib/db/prisma";
import { groupChatPatchSchema } from "@/lib/validators/chat-directory";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ groupChatId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  const { groupChatId } = await params;
  const idCheck = requireV1Cuid(request, groupChatId, "groupChatId");
  if (!idCheck.ok) return idCheck.response;

  const key = readIdempotencyKey(request);
  if (!key) {
    return v1Error(request, {
      code: "IDEMPOTENCY_KEY_REQUIRED",
      message: "A valid Idempotency-Key header is required.",
      status: 422,
      field: "Idempotency-Key",
    });
  }

  const parsed = await parseV1Json(request, groupChatPatchSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.apiIdempotencyRecord.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      const claim = await claimIdempotency(tx, {
        scope: `native-group-title:${groupChatId}`,
        actorId: auth.user.id,
        key,
        requestHash: hashIdempotencyRequest(parsed.data),
      });
      if (claim.kind !== "owner") return claim;
      const body = await patchGroupChatTitle({
        userId: auth.user.id,
        groupChatId,
        title: parsed.data.title,
      });
      await completeIdempotency(tx, claim, {
        status: 200,
        body: body as Prisma.InputJsonValue,
      });
      return { kind: "completed" as const, status: 200, body };
    });

    if (result.kind === "conflict") {
      return v1Error(request, {
        code: "IDEMPOTENCY_CONFLICT",
        message: "Idempotency key was reused with a different body.",
        status: 409,
      });
    }
    if (result.kind === "in_progress") {
      return v1Error(request, {
        code: "REQUEST_IN_PROGRESS",
        message: "The same request is still in progress.",
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
    return v1Success(result.body, { request, status: result.status });
  } catch (cause) {
    if (cause instanceof GroupChatManageError) {
      return v1Error(request, {
        code: cause.code === "NOT_FOUND" ? "NOT_FOUND" : "INVALID_REQUEST",
        message: cause.messageText,
        status: cause.code === "NOT_FOUND" ? 404 : 422,
      });
    }
    console.error("PATCH /api/v1/group-chats/[groupChatId]", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The group title could not be updated.",
      status: 500,
      retryable: true,
    });
  }
}
