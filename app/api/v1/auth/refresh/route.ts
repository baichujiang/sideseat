import { signAccessToken } from "@/lib/auth/access-token";
import { rotateNativeSession } from "@/lib/auth/native-session";
import { nativeRefreshRequestSchema } from "@/lib/api/v1/auth-schemas";
import { parseV1Json, v1Error, v1Success, type V1ErrorCode } from "@/lib/api/v1/http";
import { currentUserV1 } from "@/lib/api/v1/user-dto";
import { isDatabaseUnreachable, warnDatabaseUnreachableThrottled } from "@/lib/db/prisma-errors";

const refreshErrors: Record<
  "invalid" | "expired" | "reused" | "device_mismatch",
  { code: V1ErrorCode; message: string }
> = {
  invalid: { code: "REFRESH_TOKEN_INVALID", message: "The session is invalid." },
  expired: { code: "REFRESH_TOKEN_EXPIRED", message: "The session has expired." },
  reused: { code: "REFRESH_TOKEN_REUSED", message: "The session was revoked for security." },
  device_mismatch: { code: "DEVICE_MISMATCH", message: "The session belongs to another device." },
};

export async function POST(request: Request) {
  const parsed = await parseV1Json(request, nativeRefreshRequestSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const rotated = await rotateNativeSession(parsed.data.refreshToken, parsed.data.device);
    if (!rotated.ok) {
      const mapped = refreshErrors[rotated.reason];
      return v1Error(request, {
        code: mapped.code,
        message: mapped.message,
        status: 401,
      });
    }

    const access = await signAccessToken(rotated.user.id);
    return v1Success(
      {
        user: currentUserV1(rotated.user),
        tokens: {
          accessToken: access.token,
          accessExpiresIn: access.expiresIn,
          refreshToken: rotated.credentials.refreshToken,
          refreshExpiresAt: rotated.credentials.refreshExpiresAt,
        },
      },
      { request },
    );
  } catch (cause) {
    if (isDatabaseUnreachable(cause)) {
      warnDatabaseUnreachableThrottled("POST /api/v1/auth/refresh");
      return v1Error(request, {
        code: "DATABASE_UNAVAILABLE",
        message: "The service is temporarily unavailable.",
        status: 503,
        retryable: true,
      });
    }
    console.error("POST /api/v1/auth/refresh", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Unable to refresh the session.",
      status: 500,
      retryable: true,
    });
  }
}
