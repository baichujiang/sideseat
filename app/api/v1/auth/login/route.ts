import { ensureAssistantBotConnection } from "@/lib/auth/assistant-bot";
import { findUserForLogin } from "@/lib/auth/lookup-user";
import { createNativeSession } from "@/lib/auth/native-session";
import { verifyPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/access-token";
import { nativeLoginRequestSchema } from "@/lib/api/v1/auth-schemas";
import { parseV1Json, v1Error, v1Success } from "@/lib/api/v1/http";
import { currentUserV1 } from "@/lib/api/v1/user-dto";
import { isDatabaseUnreachable, warnDatabaseUnreachableThrottled } from "@/lib/db/prisma-errors";
import {
  consumeV1RateLimit,
  getV1ClientIp,
  rateLimitHeaders,
  rateLimitSubject,
} from "@/lib/api/v1/rate-limit";

const LOGIN_PAIR_LIMIT = 10;
const LOGIN_IP_LIMIT = 60;
const LOGIN_WINDOW_MS = 15 * 60_000;

export async function POST(request: Request) {
  const parsed = await parseV1Json(request, nativeLoginRequestSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const clientIp = getV1ClientIp(request);
    const normalizedIdentifier = parsed.data.identifier.trim().toLocaleLowerCase("en-US");
    const [pairLimit, ipLimit] = await Promise.all([
      consumeV1RateLimit({
        scope: "native-login-pair",
        subject: rateLimitSubject(`${clientIp}\0${normalizedIdentifier}`),
        limit: LOGIN_PAIR_LIMIT,
        windowMs: LOGIN_WINDOW_MS,
      }),
      consumeV1RateLimit({
        scope: "native-login-ip",
        subject: rateLimitSubject(clientIp),
        limit: LOGIN_IP_LIMIT,
        windowMs: LOGIN_WINDOW_MS,
      }),
    ]);
    const exceeded = !pairLimit.allowed ? pairLimit : !ipLimit.allowed ? ipLimit : null;
    if (exceeded) {
      return v1Error(request, {
        code: "RATE_LIMITED",
        message: "Too many sign-in attempts. Try again later.",
        status: 429,
        retryable: true,
        headers: rateLimitHeaders(exceeded),
      });
    }

    const user = await findUserForLogin(parsed.data.identifier);
    if (!user || !(await verifyPassword(parsed.data.password, user.hashedPassword))) {
      return v1Error(request, {
        code: "INVALID_CREDENTIALS",
        message: "The sign-in details are incorrect.",
        status: 401,
      });
    }
    if (user.isGuest) {
      return v1Error(request, {
        code: "ACCOUNT_UNAVAILABLE",
        message: "Guest sessions cannot sign in to the native app.",
        status: 403,
      });
    }

    await ensureAssistantBotConnection(user.id);
    const [refresh, access] = await Promise.all([
      createNativeSession(user.id, parsed.data.device),
      signAccessToken(user.id),
    ]);

    return v1Success(
      {
        user: currentUserV1(user),
        tokens: {
          accessToken: access.token,
          accessExpiresIn: access.expiresIn,
          refreshToken: refresh.refreshToken,
          refreshExpiresAt: refresh.refreshExpiresAt,
        },
      },
      { request },
    );
  } catch (cause) {
    if (isDatabaseUnreachable(cause)) {
      warnDatabaseUnreachableThrottled("POST /api/v1/auth/login");
      return v1Error(request, {
        code: "DATABASE_UNAVAILABLE",
        message: "The service is temporarily unavailable.",
        status: 503,
        retryable: true,
      });
    }
    console.error("POST /api/v1/auth/login", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Unable to sign in.",
      status: 500,
      retryable: true,
    });
  }
}
