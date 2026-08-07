import { del } from "@vercel/blob";
import { Prisma } from "@prisma/client";

import { requireV1User } from "@/lib/api/v1/auth";
import { v1Error, v1Success } from "@/lib/api/v1/http";
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
import { currentProfileDto } from "@/lib/api/v1/profile-service";
import { isTrustedUserLifePhotoBlobUrl } from "@/lib/constants/user-life-photo-media";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const PROFILE_MEDIA_WRITE_LIMIT = 12;
const PROFILE_MEDIA_WRITE_WINDOW_MS = 60_000;

function localeFromRequest(request: Request): "en" | "zh-CN" {
  const language = request.headers.get("accept-language")?.toLowerCase() ?? "";
  return language.startsWith("zh") ? "zh-CN" : "en";
}

async function loadCurrentProfileBody(
  tx: Prisma.TransactionClient,
  userId: string,
  locale: "en" | "zh-CN",
) {
  const [profile, blockedCount] = await Promise.all([
    tx.user.findUnique({
      where: { id: userId },
      include: {
        lifePhotos: {
          orderBy: { sortOrder: "asc" },
          select: { id: true, url: true, sortOrder: true },
        },
      },
    }),
    tx.block.count({ where: { blockerId: userId } }),
  ]);
  if (!profile) return null;
  return currentProfileDto(profile, { blockedCount, locale });
}

function mutationResponse(
  request: Request,
  result:
    | { kind: "updated"; status: number; body: Prisma.InputJsonValue; deletedUrl: string | null }
    | { kind: "not_found" }
    | { kind: "conflict" }
    | { kind: "in_progress" }
    | { kind: "replay"; status: number; body: Prisma.JsonValue },
) {
  switch (result.kind) {
    case "updated":
      return v1Success(result.body, { request, status: result.status });
    case "not_found":
      return v1Error(request, {
        code: "NOT_FOUND",
        message: "The profile photo was not found.",
        status: 404,
      });
    case "conflict":
      return v1Error(request, {
        code: "IDEMPOTENCY_CONFLICT",
        message: "This Idempotency-Key was already used for another request.",
        status: 409,
      });
    case "in_progress":
      return v1Error(request, {
        code: "REQUEST_IN_PROGRESS",
        message: "The matching request is still being processed.",
        status: 409,
        retryable: true,
        headers: { "Retry-After": "1" },
      });
    case "replay":
      return v1Success(result.body, {
        request,
        status: result.status,
        headers: { "Idempotency-Replayed": "true" },
      });
  }
}

async function requireMediaWrite(request: Request, userId: string) {
  const key = readIdempotencyKey(request);
  if (!key) {
    return {
      ok: false as const,
      response: v1Error(request, {
        code: "IDEMPOTENCY_KEY_REQUIRED",
        message: "A valid Idempotency-Key header is required.",
        status: 422,
        field: "Idempotency-Key",
      }),
    };
  }

  const rateLimit = await consumeV1RateLimit({
    scope: "native-profile-media-write",
    subject: rateLimitSubject(userId),
    limit: PROFILE_MEDIA_WRITE_LIMIT,
    windowMs: PROFILE_MEDIA_WRITE_WINDOW_MS,
  });
  if (!rateLimit.allowed) {
    return {
      ok: false as const,
      response: v1Error(request, {
        code: "RATE_LIMITED",
        message: "Too many profile photos were changed. Try again shortly.",
        status: 429,
        retryable: true,
        headers: rateLimitHeaders(rateLimit),
      }),
    };
  }

  return { ok: true as const, key };
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ photoId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const write = await requireMediaWrite(request, auth.user.id);
  if (!write.ok) return write.response;
  const { photoId } = await params;

  try {
    const locale = localeFromRequest(request);
    const result = await prisma.$transaction(async (tx) => {
      await tx.apiIdempotencyRecord.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      const claim = await claimIdempotency(tx, {
        scope: "native-profile-life-photo-delete",
        actorId: auth.user.id,
        key: write.key,
        requestHash: hashIdempotencyRequest({ photoId }),
      });
      if (claim.kind !== "owner") return claim;

      const photo = await tx.userLifePhoto.findFirst({
        where: { id: photoId, userId: auth.user.id },
        select: { id: true, url: true },
      });
      if (!photo) {
        await tx.apiIdempotencyRecord.delete({ where: { id: claim.recordId } });
        return { kind: "not_found" } as const;
      }

      await tx.userLifePhoto.delete({ where: { id: photo.id } });
      const remaining = await tx.userLifePhoto.findMany({
        where: { userId: auth.user.id },
        select: { id: true },
        orderBy: { sortOrder: "asc" },
      });
      await Promise.all(
        remaining.map((row, index) =>
          tx.userLifePhoto.update({
            where: { id: row.id },
            data: { sortOrder: index },
          }),
        ),
      );

      const profile = await loadCurrentProfileBody(tx, auth.user.id, locale);
      if (!profile) {
        await tx.apiIdempotencyRecord.delete({ where: { id: claim.recordId } });
        return { kind: "not_found" } as const;
      }
      const body = {
        deletedPhotoId: photo.id,
        profile,
      } as Prisma.InputJsonObject;
      await completeIdempotency(tx, claim, { status: 200, body });
      return {
        kind: "updated",
        status: 200,
        body,
        deletedUrl: photo.url,
      } as const;
    });

    const response = mutationResponse(request, result);
    if (
      result.kind === "updated" &&
      result.deletedUrl &&
      isTrustedUserLifePhotoBlobUrl(auth.user.id, result.deletedUrl)
    ) {
      del(result.deletedUrl).catch(() => {});
    }
    return response;
  } catch (cause) {
    console.error("DELETE /api/v1/me/life-photos/[photoId]", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The life photo could not be removed.",
      status: 500,
      retryable: true,
    });
  }
}
