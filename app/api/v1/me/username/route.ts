import { Prisma } from "@prisma/client";

import { requireV1User } from "@/lib/api/v1/auth";
import {
  claimIdempotency,
  completeIdempotency,
  hashIdempotencyRequest,
  readIdempotencyKey,
} from "@/lib/api/v1/idempotency";
import { parseV1Json, v1Error, v1Success } from "@/lib/api/v1/http";
import { currentProfileDto } from "@/lib/api/v1/profile-service";
import {
  consumeV1RateLimit,
  rateLimitHeaders,
  rateLimitSubject,
} from "@/lib/api/v1/rate-limit";
import { prisma } from "@/lib/db/prisma";
import {
  nextUsernameChangeWindow,
  USERNAME_CHANGE_LIMIT,
  USERNAME_CHANGE_WINDOW_DAYS,
  usernameChangePolicy,
} from "@/lib/profile/username-change-policy";
import { profileUsernameChangeSchema } from "@/lib/validators/profile";

export const dynamic = "force-dynamic";

const USERNAME_WRITE_LIMIT = 8;
const USERNAME_WRITE_WINDOW_MS = 60_000;

function localeFromRequest(request: Request): "en" | "zh-CN" {
  const language = request.headers.get("accept-language")?.toLowerCase() ?? "";
  return language.startsWith("zh") ? "zh-CN" : "en";
}

function retryAfterSeconds(nextAllowedAt: Date) {
  return Math.max(1, Math.ceil((nextAllowedAt.getTime() - Date.now()) / 1000));
}

export async function PATCH(request: Request) {
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

  const parsed = await parseV1Json(request, profileUsernameChangeSchema.strict());
  if (!parsed.ok) return parsed.response;

  try {
    const rateLimit = await consumeV1RateLimit({
      scope: "native-profile-username-write",
      subject: rateLimitSubject(auth.user.id),
      limit: USERNAME_WRITE_LIMIT,
      windowMs: USERNAME_WRITE_WINDOW_MS,
    });
    if (!rateLimit.allowed) {
      return v1Error(request, {
        code: "RATE_LIMITED",
        message: "Too many username changes were attempted. Try again shortly.",
        status: 429,
        retryable: true,
        headers: rateLimitHeaders(rateLimit),
      });
    }

    const locale = localeFromRequest(request);
    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      await tx.apiIdempotencyRecord.deleteMany({ where: { expiresAt: { lt: now } } });
      const claim = await claimIdempotency(tx, {
        scope: "native-profile-username-update",
        actorId: auth.user.id,
        key,
        requestHash: hashIdempotencyRequest(parsed.data),
        now,
      });
      if (claim.kind !== "owner") return claim;

      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${auth.user.id} FOR UPDATE`,
      );

      const current = await tx.user.findUnique({
        where: { id: auth.user.id },
        include: {
          lifePhotos: {
            orderBy: { sortOrder: "asc" },
            select: { id: true, url: true, sortOrder: true },
          },
        },
      });
      if (!current) {
        await tx.apiIdempotencyRecord.delete({ where: { id: claim.recordId } });
        return { kind: "not_found" } as const;
      }

      const username = parsed.data.username;
      if (username !== current.username) {
        const policy = usernameChangePolicy(current, now);
        if (policy.changesRemaining === 0 && policy.nextAllowedAt) {
          await tx.apiIdempotencyRecord.delete({ where: { id: claim.recordId } });
          return { kind: "cooldown", nextAllowedAt: policy.nextAllowedAt } as const;
        }
      }

      if (username !== current.username) {
        const taken = await tx.user.findFirst({
          where: { username, NOT: { id: auth.user.id } },
          select: { id: true },
        });
        if (taken) {
          await tx.apiIdempotencyRecord.delete({ where: { id: claim.recordId } });
          return { kind: "taken" } as const;
        }
      }

      let profile = current;
      if (username !== current.username) {
        try {
          profile = await tx.user.update({
            where: { id: auth.user.id },
            data: {
              username,
              usernameUpdatedAt: now,
              ...nextUsernameChangeWindow(current, now),
            },
            include: {
              lifePhotos: {
                orderBy: { sortOrder: "asc" },
                select: { id: true, url: true, sortOrder: true },
              },
            },
          });
        } catch (cause) {
          if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
            await tx.apiIdempotencyRecord.delete({ where: { id: claim.recordId } });
            return { kind: "taken" } as const;
          }
          throw cause;
        }
      }

      const blockedCount = await tx.block.count({ where: { blockerId: auth.user.id } });
      const body = currentProfileDto(profile, { blockedCount, locale });
      await completeIdempotency(tx, claim, {
        status: 200,
        body: body as Prisma.InputJsonValue,
      });
      return { kind: "updated", body } as const;
    });

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
    if (result.kind === "not_found") {
      return v1Error(request, {
        code: "NOT_FOUND",
        message: "The current profile was not found.",
        status: 404,
      });
    }
    if (result.kind === "taken") {
      return v1Error(request, {
        code: "USERNAME_TAKEN",
        message: "That username is already taken.",
        status: 409,
        field: "username",
      });
    }
    if (result.kind === "cooldown") {
      return v1Error(request, {
        code: "USERNAME_CHANGE_COOLDOWN",
        message: `Username can be changed up to ${USERNAME_CHANGE_LIMIT} times every ${USERNAME_CHANGE_WINDOW_DAYS} days.`,
        status: 429,
        field: "username",
        retryable: true,
        headers: {
          "Retry-After": String(retryAfterSeconds(result.nextAllowedAt)),
          "X-Username-Next-Allowed-At": result.nextAllowedAt.toISOString(),
        },
      });
    }
    return v1Success(result.body, { request });
  } catch (cause) {
    console.error("PATCH /api/v1/me/username", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The username could not be updated.",
      status: 500,
      retryable: true,
    });
  }
}
