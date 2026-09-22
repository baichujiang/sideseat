import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import { v1Error, v1Success, parseV1Json } from "@/lib/api/v1/http";
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
  USER_LIFE_PHOTO_MAX,
  userLifePhotoBlobPrefix,
} from "@/lib/constants/user-life-photo-media";
import { prisma } from "@/lib/db/prisma";
import {
  NativeImageUploadError,
  uploadNativeImage,
  validateNativeImageFile,
} from "@/lib/media/native-image-upload";

export const dynamic = "force-dynamic";

const PROFILE_MEDIA_WRITE_LIMIT = 12;
const PROFILE_MEDIA_WRITE_WINDOW_MS = 60_000;

const reorderSchema = z
  .object({
    photoIds: z
      .array(z.string().cuid())
      .min(1)
      .max(USER_LIFE_PHOTO_MAX)
      .refine((values) => new Set(values).size === values.length, {
        message: "Photo IDs must be unique.",
      }),
  })
  .strict();

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
    | { kind: "updated"; status: number; body: Prisma.InputJsonValue }
    | { kind: "not_found" }
    | { kind: "invalid"; message: string; field?: string }
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
    case "invalid":
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message: result.message,
        status: 422,
        field: result.field,
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

export async function POST(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const write = await requireMediaWrite(request, auth.user.id);
  if (!write.ok) return write.response;

  try {
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
        scope: "native-profile-life-photo-upload",
        actorId: auth.user.id,
        key: write.key,
        requestHash: hashIdempotencyRequest({
          contentType: image.contentType,
          width: image.width,
          height: image.height,
          byteSize: image.bytes.byteLength,
          bytes: image.bytes.toString("base64"),
        }),
      });
      if (claim.kind !== "owner") return claim;

      const existing = await tx.userLifePhoto.findMany({
        where: { userId: auth.user.id },
        select: { sortOrder: true },
        orderBy: { sortOrder: "asc" },
      });
      if (existing.length >= USER_LIFE_PHOTO_MAX) {
        await tx.apiIdempotencyRecord.delete({ where: { id: claim.recordId } });
        return {
          kind: "invalid",
          message: `You can add at most ${USER_LIFE_PHOTO_MAX} life photos.`,
          field: "file",
        } as const;
      }

      const used = new Set(existing.map((row) => row.sortOrder));
      let sortOrder = 0;
      while (used.has(sortOrder) && sortOrder < USER_LIFE_PHOTO_MAX) sortOrder += 1;
      if (sortOrder >= USER_LIFE_PHOTO_MAX) {
        await tx.apiIdempotencyRecord.delete({ where: { id: claim.recordId } });
        return {
          kind: "invalid",
          message: `You can add at most ${USER_LIFE_PHOTO_MAX} life photos.`,
          field: "file",
        } as const;
      }

      const uploaded = await uploadNativeImage({
        image,
        blobPrefix: userLifePhotoBlobPrefix(auth.user.id),
        logScope: "v1/me/life-photos",
      });
      const photo = await tx.userLifePhoto.create({
        data: { userId: auth.user.id, url: uploaded.url, sortOrder },
        select: { id: true, url: true, sortOrder: true },
      });
      const profile = await loadCurrentProfileBody(tx, auth.user.id, locale);
      if (!profile) {
        await tx.apiIdempotencyRecord.delete({ where: { id: claim.recordId } });
        return { kind: "not_found" } as const;
      }

      const body = { photo, upload: uploaded, profile } as Prisma.InputJsonObject;
      await completeIdempotency(tx, claim, { status: 201, body });
      return { kind: "updated", status: 201, body } as const;
    });

    return mutationResponse(request, result);
  } catch (cause) {
    if (cause instanceof NativeImageUploadError) {
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message: cause.message,
        status: 422,
        field: cause.field,
      });
    }
    console.error("POST /api/v1/me/life-photos", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The life photo could not be uploaded.",
      status: 500,
      retryable: true,
    });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const write = await requireMediaWrite(request, auth.user.id);
  if (!write.ok) return write.response;

  const parsed = await parseV1Json(request, reorderSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const locale = localeFromRequest(request);
    const result = await prisma.$transaction(async (tx) => {
      await tx.apiIdempotencyRecord.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      const claim = await claimIdempotency(tx, {
        scope: "native-profile-life-photo-reorder",
        actorId: auth.user.id,
        key: write.key,
        requestHash: hashIdempotencyRequest(parsed.data),
      });
      if (claim.kind !== "owner") return claim;

      const current = await tx.userLifePhoto.findMany({
        where: { userId: auth.user.id },
        select: { id: true },
        orderBy: { sortOrder: "asc" },
      });
      const currentIds = current.map((photo) => photo.id).sort();
      const requestedIds = [...parsed.data.photoIds].sort();
      if (
        currentIds.length !== requestedIds.length ||
        currentIds.some((id, index) => id !== requestedIds[index])
      ) {
        await tx.apiIdempotencyRecord.delete({ where: { id: claim.recordId } });
        return {
          kind: "invalid",
          message: "Photo order must include every current life photo exactly once.",
          field: "photoIds",
        } as const;
      }

      await Promise.all(
        parsed.data.photoIds.map((photoId, index) =>
          tx.userLifePhoto.update({
            where: { id: photoId },
            data: { sortOrder: index + USER_LIFE_PHOTO_MAX },
          }),
        ),
      );
      await Promise.all(
        parsed.data.photoIds.map((photoId, index) =>
          tx.userLifePhoto.update({
            where: { id: photoId },
            data: { sortOrder: index },
          }),
        ),
      );

      const profile = await loadCurrentProfileBody(tx, auth.user.id, locale);
      if (!profile) {
        await tx.apiIdempotencyRecord.delete({ where: { id: claim.recordId } });
        return { kind: "not_found" } as const;
      }
      const body = { photos: profile.lifePhotos, profile } as Prisma.InputJsonObject;
      await completeIdempotency(tx, claim, { status: 200, body });
      return { kind: "updated", status: 200, body } as const;
    });

    return mutationResponse(request, result);
  } catch (cause) {
    console.error("PATCH /api/v1/me/life-photos", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The life photos could not be reordered.",
      status: 500,
      retryable: true,
    });
  }
}
