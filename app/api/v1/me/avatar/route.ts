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
import {
  isTrustedUserAvatarBlobUrl,
  userCustomAvatarBlobPrefix,
} from "@/lib/constants/avatars";
import { prisma } from "@/lib/db/prisma";
import {
  NativeImageUploadError,
  uploadNativeImage,
  validateNativeImageFile,
} from "@/lib/media/native-image-upload";

export const dynamic = "force-dynamic";

const PROFILE_MEDIA_WRITE_LIMIT = 12;
const PROFILE_MEDIA_WRITE_WINDOW_MS = 60_000;

function localeFromRequest(request: Request): "en" | "zh-CN" {
  const language = request.headers.get("accept-language")?.toLowerCase() ?? "";
  return language.startsWith("zh") ? "zh-CN" : "en";
}

function avatarMutationResponse(
  request: Request,
  result:
    | { kind: "updated"; status: number; body: Prisma.InputJsonValue; oldAvatarUrl: string | null; nextAvatarUrl: string }
    | { kind: "conflict" }
    | { kind: "in_progress" }
    | { kind: "replay"; status: number; body: Prisma.JsonValue },
) {
  switch (result.kind) {
    case "updated":
      return v1Success(result.body, { request, status: result.status });
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

export async function POST(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  const key = readIdempotencyKey(request);
  if (!key) {
    return v1Error(request, {
      code: "IDEMPOTENCY_KEY_REQUIRED",
      message: "A valid Idempotency-Key header is required.",
      status: 422,
      field: "Idempotency-Key",
    });
  }

  try {
    const rateLimit = await consumeV1RateLimit({
      scope: "native-profile-media-write",
      subject: rateLimitSubject(auth.user.id),
      limit: PROFILE_MEDIA_WRITE_LIMIT,
      windowMs: PROFILE_MEDIA_WRITE_WINDOW_MS,
    });
    if (!rateLimit.allowed) {
      return v1Error(request, {
        code: "RATE_LIMITED",
        message: "Too many profile photos were uploaded. Try again shortly.",
        status: 429,
        retryable: true,
        headers: rateLimitHeaders(rateLimit),
      });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message: "Choose a JPG, PNG, or WEBP image.",
        status: 422,
        field: "file",
      });
    }

    const image = await validateNativeImageFile(file);
    const locale = localeFromRequest(request);
    const result = await prisma.$transaction(async (tx) => {
      await tx.apiIdempotencyRecord.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      const claim = await claimIdempotency(tx, {
        scope: "native-profile-avatar-upload",
        actorId: auth.user.id,
        key,
        requestHash: hashIdempotencyRequest({
          contentType: image.contentType,
          width: image.width,
          height: image.height,
          byteSize: image.bytes.byteLength,
          bytes: image.bytes.toString("base64"),
        }),
      });
      if (claim.kind !== "owner") return claim;

      const [oldProfile, uploaded] = await Promise.all([
        tx.user.findUnique({
          where: { id: auth.user.id },
          select: { avatarUrl: true },
        }),
        uploadNativeImage({
          image,
          blobPrefix: userCustomAvatarBlobPrefix(auth.user.id),
          logScope: "v1/me/avatar",
        }),
      ]);

      const profile = await tx.user.update({
        where: { id: auth.user.id },
        data: { avatarUrl: uploaded.url },
        include: {
          lifePhotos: {
            orderBy: { sortOrder: "asc" },
            select: { id: true, url: true, sortOrder: true },
          },
        },
      });
      const blockedCount = await tx.block.count({ where: { blockerId: auth.user.id } });
      const body = {
        avatar: uploaded,
        profile: currentProfileDto(profile, { blockedCount, locale }),
      } satisfies Prisma.InputJsonObject;
      await completeIdempotency(tx, claim, {
        status: 201,
        body,
      });
      return {
        kind: "updated",
        status: 201,
        body,
        oldAvatarUrl: oldProfile?.avatarUrl ?? null,
        nextAvatarUrl: uploaded.url,
      } as const;
    });

    const response = avatarMutationResponse(request, result);
    if (
      result.kind === "updated" &&
      result.oldAvatarUrl &&
      result.oldAvatarUrl !== result.nextAvatarUrl &&
      isTrustedUserAvatarBlobUrl(auth.user.id, result.oldAvatarUrl)
    ) {
      del(result.oldAvatarUrl).catch(() => {});
    }
    return response;
  } catch (cause) {
    if (cause instanceof NativeImageUploadError) {
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message: cause.message,
        status: 422,
        field: cause.field,
      });
    }
    console.error("POST /api/v1/me/avatar", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The profile photo could not be uploaded.",
      status: 500,
      retryable: true,
    });
  }
}
