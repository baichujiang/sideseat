import { requireV1User } from "@/lib/api/v1/auth";
import { parseV1Json, v1Error, v1Success } from "@/lib/api/v1/http";
import {
  consumeV1RateLimit,
  rateLimitHeaders,
  rateLimitSubject,
} from "@/lib/api/v1/rate-limit";
import { ensureUserCalendarCategories } from "@/lib/calendar/default-user-calendar-categories";
import { parseNaturalLanguageSchedule } from "@/lib/calendar/parse-natural-language";
import { prisma } from "@/lib/db/prisma";
import { parseNaturalScheduleRequestSchema } from "@/lib/validators/calendar-natural";

export const dynamic = "force-dynamic";

const PARSE_LIMIT = 10;
const PARSE_WINDOW_MS = 60_000;

export async function POST(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  const parsed = await parseV1Json(request, parseNaturalScheduleRequestSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const rateLimit = await consumeV1RateLimit({
      scope: "native-calendar-natural-parse",
      subject: rateLimitSubject(auth.user.id),
      limit: PARSE_LIMIT,
      windowMs: PARSE_WINDOW_MS,
    });
    if (!rateLimit.allowed) {
      return v1Error(request, {
        code: "RATE_LIMITED",
        message: "Too many smart schedule requests were made. Try again shortly.",
        status: 429,
        retryable: true,
        headers: rateLimitHeaders(rateLimit),
      });
    }

    await ensureUserCalendarCategories(prisma, auth.user.id);
    const categories = await prisma.userCalendarCategory.findMany({
      where: { userId: auth.user.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, presetKey: true },
    });
    const result = await parseNaturalLanguageSchedule({
      text: parsed.data.text,
      locale: parsed.data.locale ?? "en",
      categories,
    });

    if (!result.ok) {
      if (result.code === "NOT_CONFIGURED") {
        return v1Error(request, {
          code: "FEATURE_UNAVAILABLE",
          message: "Smart schedule is not available right now.",
          status: 503,
          retryable: true,
        });
      }
      if (result.code === "PARSE_FAILED") {
        return v1Error(request, {
          code: "FEATURE_UNAVAILABLE",
          message: "Smart schedule is temporarily unavailable. Try again shortly.",
          status: 503,
          retryable: true,
        });
      }
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message: result.error,
        status: 422,
        field: "text",
      });
    }

    return v1Success(result.data, { request });
  } catch (cause) {
    console.error("POST /api/v1/calendar/parse-natural", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The schedule could not be parsed.",
      status: 500,
      retryable: true,
    });
  }
}
